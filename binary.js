const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Debug mode flag
const DEBUG_MODE =
  process.env.SCAN_DEBUG_MODE === "debug" ||
  process.env.SHIFTLEFT_LOGGING_LEVEL === "debug" ||
  process.env.NODE_ENV === "development";

let platform = os.platform();
let extn = "";
if (platform == "win32") {
  platform = "windows";
  extn = ".exe";
}

let arch = os.arch();
switch (arch) {
  case "x32":
    arch = "386";
    break;
  case "x64":
    arch = "amd64";
    break;
}

let GOVERSION_BIN = null;
if (fs.existsSync(path.join(__dirname, "plugins", "goversion"))) {
  GOVERSION_BIN = path.join(
    __dirname,
    "plugins",
    "goversion",
    "goversion-" + platform + "-" + arch + extn
  );
}

const getGoBuildInfo = (src) => {
  if (GOVERSION_BIN) {
    let result = spawnSync(GOVERSION_BIN, [src], {
      encoding: "utf-8",
    });
    if (result.status == 1 || result.error) {
      console.error(result.stdout, result.stderr);
      if (DEBUG_MODE) {
        console.log("Falling back to go version command");
      }
      result = spawnSync("go", ["version", "-v", "-m", src], {
        encoding: "utf-8",
      });
      if (result.status == 1 || result.error) {
        console.error(result.stdout, result.stderr);
      }
    }
    if (result) {
      const stdout = result.stdout;
      if (stdout) {
        const cmdOutput = Buffer.from(stdout).toString();
        return cmdOutput;
      }
    }
  }
  return undefined;
};
exports.getGoBuildInfo = getGoBuildInfo;
