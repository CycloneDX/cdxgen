import connect from "connect";
import http from "node:http";
import bodyParser from "body-parser";
import url, { URL } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createBom, submitBom } from "./index.js";
import { postProcess } from "./postgen.js";
import gitUrlParse from "git-url-parse";

import compression from "compression";

// Timeout milliseconds. Default 10 mins
const TIMEOUT_MS =
  parseInt(process.env.CDXGEN_SERVER_TIMEOUT_MS) || 10 * 60 * 1000;

const app = connect();

app.use(
  bodyParser.json({
    deflate: true,
    limit: "1mb"
  })
);
app.use(compression());

const isGitRepoURL = (url) => {
  const gitRepoRegex = /git@[a-zA-Z0-9.-]+:[\w-]+\/[\w-]+\.git/;
  return gitRepoRegex.test(url);
};

const parseAndSanitizeUrl = (url) => {
  let parsedUrl;
  let sanitizedUrl;

  if (isGitRepoURL(url)) {
    parsedUrl = gitUrlParse(url);
    sanitizedUrl = `${parsedUrl.user}@${parsedUrl.source}:${parsedUrl.owner}${parsedUrl.pathname}`;
  } else {
    parsedUrl = new URL(url);
    sanitizedUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
  }

  return {
    parsedUrl,
    sanitizedUrl
  };
};

const gitClone = (repoUrl, branch = null) => {
  const { parsedUrl, sanitizedRepoUrl } = parseAndSanitizeUrl(repoUrl);

  const tempDir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      path.basename(parsedUrl.pathname.replace(/\.git/g, ""))
    )
  );

  if (branch == null) {
    console.log("Cloning", sanitizedRepoUrl, "to", tempDir);
    const result = spawnSync(
      "git",
      ["clone", repoUrl, "--depth", "1", tempDir],
      {
        encoding: "utf-8",
        shell: false
      }
    );
    if (result.status !== 0 || result.error) {
      console.log(result.error);
    }
  } else {
    console.log("Cloning", repoUrl, "to", tempDir, "with branch", branch);
    const result = spawnSync(
      "git",
      ["clone", repoUrl, "--branch", branch, "--depth", "1", tempDir],
      {
        encoding: "utf-8",
        shell: false
      }
    );
    if (result.status !== 0 || result.error) {
      console.log(result.error);
    }
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
    "project",
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
    "gitBranch"
  ];

  for (const param of queryParams) {
    if (q[param]) {
      options[param] = q[param];
    }
  }

  options.projectType == options.type;
  delete options.type;

  return options;
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

  app.use("/health", async function (_req, res) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "OK" }, null, 2));
  });

  app.use("/sbom", async function (req, res) {
    const q = url.parse(req.url, true).query;
    let cleanup = false;
    const reqOptions = parseQueryString(
      q,
      req.body,
      Object.assign({}, options)
    );
    const filePath = q.path || q.url || req.body.path || req.body.url;
    if (!filePath) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        "{'error': 'true', 'message': 'path or url is required.'}\n"
      );
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    let srcDir = filePath;
    if (filePath.startsWith("http") || filePath.startsWith("git")) {
      srcDir = gitClone(filePath, reqOptions.gitBranch);
      cleanup = true;
    }
    console.log("Generating SBOM for", srcDir);
    let bomNSData = (await createBom(srcDir, reqOptions)) || {};
    if (reqOptions.requiredOnly || reqOptions["filter"] || reqOptions["only"]) {
      bomNSData = postProcess(bomNSData, reqOptions);
    }
    if (bomNSData.bomJson) {
      if (
        typeof bomNSData.bomJson === "string" ||
        bomNSData.bomJson instanceof String
      ) {
        res.write(bomNSData.bomJson);
      } else {
        res.write(JSON.stringify(bomNSData.bomJson, null, 2));
      }
    }
    if (reqOptions.serverUrl && reqOptions.apiKey) {
      console.log("Publishing SBOM to Dependency Track");
      submitBom(reqOptions, bomNSData.bomJson);
    }
    res.end("\n");
    if (cleanup && srcDir && srcDir.startsWith(os.tmpdir()) && fs.rmSync) {
      console.log(`Cleaning up ${srcDir}`);
      fs.rmSync(srcDir, { recursive: true, force: true });
    }
  });
};
export { configureServer, start };
