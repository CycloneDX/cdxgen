const { spawnSync } = require("child_process");
const isWin = require("os").platform() === "win32";

// Debug mode flag
const DEBUG_MODE =
  process.env.SCAN_DEBUG_MODE === "debug" ||
  process.env.SHIFTLEFT_LOGGING_LEVEL === "debug" ||
  process.env.NODE_ENV === "development";

let globalNodePath = "";
let result = spawnSync(isWin ? "npm.cmd" : "npm", ["root", "--quiet", "-g"], {
  encoding: "utf-8"
});
if (result) {
  const stdout = result.stdout;
  if (stdout) {
    globalNodePath = Buffer.from(stdout).toString().trim() + "/";
  }
}

const getGoBuildInfo = (src) => {
  try {
    const pluginsLib = require(globalNodePath +
      "@ngcloudsec/cdxgen-plugins-bin");
    return pluginsLib.getGoBuildInfo(src);
  } catch (err) {
    if (DEBUG_MODE) {
      console.log(
        `Missing cdxgen plugins at ${globalNodePath}. Install using npm install -g @ngcloudsec/cdxgen-plugins-bin`
      );
    }
  }
  return undefined;
};
exports.getGoBuildInfo = getGoBuildInfo;

const getOSPackages = (src) => {
  const pkgList = [];
  try {
    const pluginsLib = require(globalNodePath +
      "@ngcloudsec/cdxgen-plugins-bin");
    return pluginsLib.getOSPackages(src);
  } catch (err) {
    console.log(
      `Missing cdxgen plugins at ${globalNodePath}. Install using npm install -g @ngcloudsec/cdxgen-plugins-bin"`,
      err
    );
  }
  return pkgList;
};
exports.getOSPackages = getOSPackages;
