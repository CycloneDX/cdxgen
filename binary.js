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
let TRIVY_BIN = null;
if (fs.existsSync(path.join(__dirname, "plugins", "trivy"))) {
  TRIVY_BIN = path.join(
    __dirname,
    "plugins",
    "trivy",
    "trivy-cdxgen-" + platform + "-" + arch + extn
  );
}
const getGoBuildInfo = (src) => {
  if (GOVERSION_BIN) {
    let result = spawnSync(GOVERSION_BIN, [src], {
      encoding: "utf-8",
    });
    if (result.status !== 0 || result.error) {
      console.error(result.stdout, result.stderr);
      if (DEBUG_MODE) {
        console.log("Falling back to go version command");
      }
      result = spawnSync("go", ["version", "-v", "-m", src], {
        encoding: "utf-8",
      });
      if (result.status !== 0 || result.error) {
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

const getOSPackages = (src) => {
  const pkgList = [];
  if (TRIVY_BIN) {
    let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "trivy-cdxgen-"));
    const bomJsonFile = path.join(tempDir, "trivy-bom.json");
    const args = [
      "rootfs",
      "--skip-update",
      "--offline-scan",
      "--format",
      "cyclonedx",
      "--output",
      bomJsonFile,
    ];
    if (!DEBUG_MODE) {
      args.push("-q");
    }
    args.push(src);
    if (DEBUG_MODE) {
      console.log("Executing", TRIVY_BIN, args.join(" "));
    }
    let result = spawnSync(TRIVY_BIN, args, {
      encoding: "utf-8",
    });
    if (result.status !== 0 || result.error) {
      console.error(result.stdout, result.stderr);
    }
    if (fs.existsSync(bomJsonFile)) {
      const tmpBom = JSON.parse(
        fs.readFileSync(bomJsonFile, {
          encoding: "utf-8",
        })
      );
      // Clean up
      if (tempDir && tempDir.startsWith(os.tmpdir())) {
        if (DEBUG_MODE) {
          console.log(`Cleaning up ${tempDir}`);
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      if (tmpBom && tmpBom.components) {
        for (const comp of tmpBom.components) {
          delete comp.properties;
          if (comp.purl) {
            if (
              comp.purl.startsWith("pkg:npm") ||
              comp.purl.startsWith("pkg:pypi") ||
              comp.purl.startsWith("pkg:maven") ||
              comp.purl.startsWith("pkg:cargo") ||
              comp.purl.startsWith("pkg:composer") ||
              comp.purl.startsWith("pkg:gem") ||
              comp.purl.startsWith("pkg:nuget") ||
              comp.purl.startsWith("pkg:pub") ||
              comp.purl.startsWith("pkg:hackage") ||
              comp.purl.startsWith("pkg:hex") ||
              comp.purl.startsWith("pkg:conan") ||
              comp.purl.startsWith("pkg:clojars") ||
              comp.purl.startsWith("pkg:github")
            ) {
              continue;
            }
            // Fix the group
            let group = path.dirname(comp.name);
            const name = path.basename(comp.name);
            if (group === ".") {
              group = "";
            }
            comp.group = group;
            comp.name = name;
            pkgList.push(comp);
          }
        }
      }
      return pkgList;
    }
  }
  return pkgList;
};
exports.getOSPackages = getOSPackages;
