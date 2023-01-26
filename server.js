const connect = require("connect");
const http = require("http");
const bodyParser = require("body-parser");
const url = require("url");
const { spawnSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const bom = require("./index.js");
const compression = require("compression");

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
  if (q.type) {
    options.projectType = q.type;
  }
  if (q.multiProject && q.multiProject !== "false") {
    options.multiProject = true;
  }
  if (q.requiredOnly && q.requiredOnly !== "false") {
    options.requiredOnly = true;
  }
  if (q.noBabel) {
    options.noBabel = q.noBabel;
  }
  if (q.installDeps) {
    options.installDeps = q.installDeps;
  }
  if (q.project) {
    options.project = q.project;
  }
  if (q.projectName) {
    options.projectName = q.projectName;
  }
  if (q.projectGroup) {
    options.projectGroup = q.projectGroup;
  }
  if (q.projectVersion) {
    options.projectVersion = q.projectVersion;
  }
  return options;
};

const start = async (options) => {
  console.log("Listening on", options.serverHost, options.serverPort);
  http.createServer(app).listen(options.serverPort, options.serverHost);
  app.use("/sbom", async function (req, res) {
    const q = url.parse(req.url, true).query;
    let cleanup = false;
    options = parseQueryString(q, req.body, options);
    let filePath = q.path || q.url || req.body.path || req.body.url;
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
    const bomNSData = (await bom.createBom(srcDir, options)) || {};
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
    res.end("\n");
    if (cleanup && srcDir && srcDir.startsWith(os.tmpdir())) {
      console.log(`Cleaning up ${srcDir}`);
      fs.rmSync(srcDir, { recursive: true, force: true });
    }
  });
};
exports.start = start;
