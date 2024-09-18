import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import url from "node:url";
import bodyParser from "body-parser";
import connect from "connect";
import { createBom, submitBom } from "../cli/index.js";
import { postProcess } from "../stages/postgen/postgen.js";

import compression from "compression";

// Timeout milliseconds. Default 10 mins
const TIMEOUT_MS =
  Number.parseInt(process.env.CDXGEN_SERVER_TIMEOUT_MS) || 10 * 60 * 1000;

const app = connect();

app.use(
  bodyParser.json({
    deflate: true,
    limit: "1mb",
  }),
);
app.use(compression());

const gitClone = (repoUrl, branch = null) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), path.basename(repoUrl)),
  );

  const gitArgs = ["clone", repoUrl, "--depth", "1", tempDir];
  if (branch) {
    gitArgs.splice(2, 0, "--branch", branch);
  }

  console.log(
    `Cloning Repo${branch ? ` with branch ${branch}` : ""} to ${tempDir}`,
  );

  const result = spawnSync("git", gitArgs, {
    encoding: "utf-8",
    shell: false,
  });
  if (result.status !== 0) {
    console.log(result.stderr);
  }

  return tempDir;
};

const parseQueryString = (q, body, options = {}) => {
  if (body && Object.keys(body).length) {
    options = Object.assign(options, body);
  }

  const queryParams = [
    "type",
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
  ];

  for (const param of queryParams) {
    if (q[param]) {
      let value = q[param];
      // Convert string to boolean
      if (value === "true") {
        value = true;
      } else if (value === "false") {
        value = false;
      }
      options[param] = value;
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
};

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

const start = (options) => {
  console.log("Listening on", options.serverHost, options.serverPort);
  const cdxgenServer = http
    .createServer(app)
    .listen(options.serverPort, options.serverHost);
  configureServer(cdxgenServer);

  app.use("/health", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "OK" }, null, 2));
  });

  app.use("/sbom", async (req, res) => {
    const q = url.parse(req.url, true).query;
    let cleanup = false;
    const reqOptions = parseQueryString(
      q,
      req.body,
      Object.assign({}, options),
    );
    const filePath = q.path || q.url || req.body.path || req.body.url;
    if (!filePath) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: "path or url is required.",
        }),
      );
    }
    let srcDir = filePath;
    if (filePath.startsWith("http") || filePath.startsWith("git")) {
      srcDir = gitClone(filePath, reqOptions.gitBranch);
      cleanup = true;
    }
    console.log("Generating SBOM for", srcDir);
    let bomNSData = (await createBom(srcDir, reqOptions)) || {};
    bomNSData = postProcess(bomNSData, reqOptions);
    if (reqOptions.serverUrl && reqOptions.apiKey) {
      console.log(
        `Publishing SBOM ${reqOptions.projectName} to Dependency Track`,
        reqOptions.serverUrl,
      );
      const response = await submitBom(reqOptions, bomNSData.bomJson);
      const errorMessages = response?.errors;
      if (errorMessages) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: `Unable to submit the SBOM ${reqOptions.projectName} to the Dependency Track server ${reqOptions.serverUrl}`,
            details: errorMessages,
          }),
        );
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
    if (cleanup && srcDir && srcDir.startsWith(os.tmpdir()) && fs.rmSync) {
      console.log(`Cleaning up ${srcDir}`);
      fs.rmSync(srcDir, { recursive: true, force: true });
    }
  });
};
export { configureServer, start };
