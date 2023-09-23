import connect from "connect";
import http from "node:http";
import bodyParser from "body-parser";
import url from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createBom, submitBom } from "./index.js";
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

const gitClone = (repoUrl) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), path.basename(repoUrl))
  );
  console.log("Cloning", repoUrl, "to", tempDir);
  const result = spawnSync("git", ["clone", repoUrl, "--depth", "1", tempDir], {
    encoding: "utf-8",
    shell: false
  });
  if (result.status !== 0 || result.error) {
    console.log(result.error);
  }
  return tempDir;
};

const parseQueryString = (q, body, options = {}) => {
  if (body && Object.keys(body).length) {
    options = Object.assign(options, body);
  }

  const queryParams = [
    'type', 'multiProject', 'requiredOnly', 'noBabel', 'installDeps',
    'project', 'projectName', 'projectGroup', 'projectVersion',
    'serverUrl', 'apiKey', 'parentUUID'
  ];

  for (const param of queryParams) {
    if (q[param]) {
      options[param] = q[param];
    }
  }

  options.projectType == options.type
  delete options.type

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
  app.use("/sbom", async function (req, res) {
    const q = url.parse(req.url, true).query;
    let cleanup = false;
    options = parseQueryString(q, req.body, options);
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
      srcDir = gitClone(filePath);
      cleanup = true;
    }
    console.log("Generating SBoM for", srcDir);
    const bomNSData = (await createBom(srcDir, options)) || {};
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
    if (options.serverUrl && options.apiKey) {
      console.log("Publishing SBoM to Dependency Track");
      submitBom(options, bomNSData.bomJson)
    }
    res.end("\n");
    if (cleanup && srcDir && srcDir.startsWith(os.tmpdir()) && fs.rmSync) {
      console.log(`Cleaning up ${srcDir}`);
      fs.rmSync(srcDir, { recursive: true, force: true });
    }
  });
};
export { configureServer, start };
