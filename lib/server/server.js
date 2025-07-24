import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

import bodyParser from "body-parser";
import compression from "compression";
import connect from "connect";

import { createBom, submitBom } from "../cli/index.js";
import {
  getTmpDir,
  hasDangerousUnicode,
  isSecureMode,
  isValidDriveRoot,
  isWin,
  safeSpawnSync,
} from "../helpers/utils.js";
import { postProcess } from "../stages/postgen/postgen.js";

// Timeout milliseconds. Default 10 mins
const TIMEOUT_MS =
  Number.parseInt(process.env.CDXGEN_SERVER_TIMEOUT_MS) || 10 * 60 * 1000;

const ALLOWED_PARAMS = [
  "type",
  "excludeType",
  "multiProject",
  "requiredOnly",
  "noBabel",
  "installDeps",
  "projectId",
  "projectName",
  "projectGroup",
  "projectVersion",
  "parentUUID",
  "serverUrl",
  "apiKey",
  "specVersion",
  "filter",
  "only",
  "autoCompositions",
  "gitBranch",
  "lifecycle",
  "deep",
  "profile",
  "exclude",
  "includeFormulation",
  "includeCrypto",
  "standard",
  "minConfidence",
  "technique",
  "tlpClassification",
];

const app = connect();

app.use(
  bodyParser.json({
    deflate: true,
    limit: "1mb",
  }),
);
app.use(compression());

/**
 * Checks the given hostname against the allowed list.
 *
 * @param {string} hostname Host name to check
 * @returns {boolean} true if the hostname in its entirety is allowed. false otherwise.
 */
export function isAllowedHost(hostname) {
  if (!process.env.CDXGEN_SERVER_ALLOWED_HOSTS) {
    return true;
  }
  // Guard against dangerous Unicode characters
  if (hasDangerousUnicode(hostname)) {
    return false;
  }
  return (process.env.CDXGEN_SERVER_ALLOWED_HOSTS || "")
    .split(",")
    .includes(hostname);
}

/**
 * Checks the given path string to belong to a drive in Windows.
 *
 * @param {string} p Path string to check
 * @returns {boolean} true if the windows path belongs to a drive. false otherwise (device names)
 */
export function isAllowedWinPath(p) {
  if (typeof p !== "string") {
    return false;
  }
  if (p === "") {
    return true;
  }
  // Guard against dangerous Unicode characters
  if (hasDangerousUnicode(p)) {
    return false;
  }
  try {
    const normalized = path.normalize(p);
    // Check the entire normalized path for dangerous patterns
    if (hasDangerousUnicode(normalized)) {
      return false;
    }
    const { root } = path.parse(normalized);
    // Both Relative paths and invalid windows device names are resulting in an empty root
    // To keep things simple, we don't accept relative paths for Windows server-mode users at all

    // Invocations with unix-style paths result in "\\" as the root on windows
    // path.parse(path.normalize("/foo/bar"))
    // { root: '\\', dir: '\\foo', base: 'bar', ext: '', name: 'bar' }
    if (root === "\\") {
      return true;
    }
    // Check for device/UNC paths - these should always return false
    if (root.startsWith("\\\\")) {
      return false;
    }
    // Strict validation for drive letter format
    return isValidDriveRoot(root);
  } catch (_err) {
    return false;
  }
}

/**
 * Checks the given path against the allowed list.
 *
 * @param {string} p Path string to check
 * @returns {boolean} true if the path is present in the allowed paths. false otherwise.
 */
export function isAllowedPath(p) {
  if (typeof p !== "string") {
    return false;
  }
  // Guard against dangerous Unicode characters
  if (hasDangerousUnicode(p)) {
    return false;
  }
  if (!process.env.CDXGEN_SERVER_ALLOWED_PATHS) {
    return true;
  }
  // Handle CVE-2025-27210 without relying entirely on node blocklists
  if (isWin && !isAllowedWinPath(p)) {
    return false;
  }
  return (process.env.CDXGEN_SERVER_ALLOWED_PATHS || "")
    .split(",")
    .some((ap) => p.startsWith(ap));
}

function gitClone(repoUrl, branch = null) {
  const tempDir = fs.mkdtempSync(
    path.join(getTmpDir(), path.basename(repoUrl)),
  );

  const gitArgs = [
    "-c",
    "alias.clone=",
    "clone",
    repoUrl,
    "--depth",
    "1",
    tempDir,
  ];
  if (branch) {
    const cloneIndex = gitArgs.indexOf("clone");
    gitArgs.splice(cloneIndex + 1, 0, "--branch", branch);
  }
  console.log(
    `Cloning Repo${branch ? ` with branch ${branch}` : ""} to ${tempDir}`,
  );
  // See issue #1956
  const env = isSecureMode
    ? { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_NOGLOBAL: "1" }
    : { ...process.env };
  const result = safeSpawnSync("git", gitArgs, {
    encoding: "utf-8",
    shell: false,
    env,
  });
  if (result.status !== 0) {
    console.log(result.stderr);
  }

  return tempDir;
}

function sanitizeStr(s) {
  return s ? s.replace(/[\r\n]/g, "") : s;
}

/**
 * Method to safely parse value passed via the query string or body.
 *
 * @param {string|number|Array<string|number>} raw
 * @returns {string|number|boolean|Array<string|number|boolean>}
 * @throws {TypeError} if raw (or any array element) isn’t string or number
 */
export function parseValue(raw) {
  // handle arrays
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const t = typeof item;
      if (t === "string") {
        if (item === "true") return true;
        if (item === "false") return false;
        return sanitizeStr(item);
      }
      if (t === "number") {
        return item;
      }
      throw new TypeError(`Invalid array element type: ${t}.`);
    });
  }

  // handle single values
  const t = typeof raw;
  if (t === "string") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    return sanitizeStr(raw);
  }
  if (t === "number") {
    return raw;
  }
  if (t === "boolean") {
    return raw;
  }
  throw new TypeError(`Invalid value type: ${t}.`);
}

export function parseQueryString(q, body = {}, options = {}) {
  // Priority is query params followed by body
  for (const param of ALLOWED_PARAMS) {
    const raw = q[param] ?? body[param];
    if (raw !== undefined) {
      options[param] = parseValue(raw);
    }
  }
  options.projectType = options.type?.split(",");
  delete options.type;
  if (options.lifecycle === "pre-build") {
    options.installDeps = false;
  }
  if (options.profile) {
    applyProfileOptions(options);
  }
  return options;
}

const applyProfileOptions = (options) => {
  switch (options.profile) {
    case "appsec":
      options.deep = true;
      break;
    case "research":
      options.deep = true;
      options.evidence = true;
      options.includeCrypto = true;
      break;
    default:
      break;
  }
};

const configureServer = (cdxgenServer) => {
  cdxgenServer.headersTimeout = TIMEOUT_MS;
  cdxgenServer.requestTimeout = TIMEOUT_MS;
  cdxgenServer.timeout = 0;
  cdxgenServer.keepAliveTimeout = 0;
};

const ALL_INTERFACES = new Set(["0.0.0.0", "::", "::/128", "::/0"]);

const start = (options) => {
  console.log(
    "Listening on",
    options.serverHost,
    options.serverPort,
    "without authentication!",
  );
  if (ALL_INTERFACES.has(options.serverHost)) {
    console.log("Exposing cdxgen server on all IP address is a security risk!");
    if (isSecureMode) {
      process.exit(1);
    }
  }
  if (+options.serverPort < 1024) {
    console.log(
      "Running cdxgen server with a privileged port is a security risk!",
    );
    if (isSecureMode) {
      process.exit(1);
    }
  }
  if (
    process.getuid &&
    process.getuid() === 0 &&
    process.env?.CDXGEN_IN_CONTAINER !== "true"
  ) {
    console.log("Running cdxgen server as root is a security risk!");
    if (isSecureMode) {
      process.exit(1);
    }
  }
  if (!process.env.CDXGEN_SERVER_ALLOWED_HOSTS) {
    console.log(
      "No allowlist for hosts has been specified. This is a security risk that could expose the system to SSRF vulnerabilities!",
    );
    if (isSecureMode) {
      process.exit(1);
    }
  }
  const cdxgenServer = http
    .createServer(app)
    .listen(options.serverPort, options.serverHost);
  configureServer(cdxgenServer);

  app.use("/health", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "OK" }, null, 2));
  });

  app.use("/sbom", async (req, res) => {
    // Limit to only GET and POST requests
    if (req.method && !["GET", "POST"].includes(req.method.toUpperCase())) {
      res.writeHead(405, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: "Method Not Allowed",
        }),
      );
    }
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const q = Object.fromEntries(requestUrl.searchParams.entries());
    let cleanup = false;
    let reqOptions = {};
    try {
      reqOptions = parseQueryString(
        q,
        req.body,
        Object.assign(Object.create(null), options),
      );
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: e.toString(),
          details:
            "Options can only be of string, number, and array type. No object values are allowed.",
        }),
      );
    }
    const filePath = q.path || q.url || req.body.path || req.body.url;
    if (!filePath) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: "Path or URL is required.",
        }),
      );
    }
    let srcDir = filePath;
    if (filePath.startsWith("http") || filePath.startsWith("git")) {
      // Validate the hostnames
      const gitUrlObj = new URL(filePath);
      if (!isAllowedHost(gitUrlObj.hostname)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: "Host Not Allowed",
            details: "The Git URL host is not allowed as per the allowlist.",
          }),
        );
      }
      srcDir = gitClone(filePath, reqOptions.gitBranch);
      cleanup = true;
    } else {
      if (
        !isAllowedPath(path.resolve(srcDir)) ||
        (isWin && !isAllowedWinPath(srcDir))
      ) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: "Path Not Allowed",
            details: "Path is not allowed as per the allowlist.",
          }),
        );
      }
    }
    if (srcDir !== path.resolve(srcDir)) {
      console.log(
        `Invoke the API with an absolute path '${path.resolve(srcDir)}' to reduce security risks.`,
      );
      if (isSecureMode) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: "Absolute path needed",
            details: "Relative paths are not supported in secure mode.",
          }),
        );
      }
    }
    console.log("Generating SBOM for", srcDir);
    let bomNSData = (await createBom(srcDir, reqOptions)) || {};
    bomNSData = postProcess(bomNSData, reqOptions);
    if (reqOptions.serverUrl && reqOptions.apiKey) {
      if (!isAllowedHost(reqOptions.serverUrl)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: "Host Not Allowed",
            details: "The URL host is not allowed as per the allowlist.",
          }),
        );
      }
      if (isSecureMode && !reqOptions.serverUrl?.startsWith("https://")) {
        console.log(
          "Dependency Track API server is used with a non-https url, which poses a security risk.",
        );
      }
      console.log(
        `Publishing SBOM ${reqOptions.projectName} to Dependency Track`,
        reqOptions.serverUrl,
      );
      try {
        await submitBom(reqOptions, bomNSData.bomJson);
      } catch (error) {
        const errorMessages = error.response?.body?.errors;
        if (errorMessages) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              error: "Unable to submit the SBOM to the Dependency-Track server",
              details: errorMessages,
            }),
          );
        }
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    if (bomNSData.bomJson) {
      if (
        typeof bomNSData.bomJson === "string" ||
        bomNSData.bomJson instanceof String
      ) {
        res.write(bomNSData.bomJson);
      } else {
        res.write(JSON.stringify(bomNSData.bomJson, null, null));
      }
    }
    res.end("\n");
    if (cleanup && srcDir && srcDir.startsWith(getTmpDir()) && fs.rmSync) {
      console.log(`Cleaning up ${srcDir}`);
      fs.rmSync(srcDir, { recursive: true, force: true });
    }
  });
};
export { configureServer, start };
