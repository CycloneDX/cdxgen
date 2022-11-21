const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { PackageURL } = require("packageurl-js");
const isWin = require("os").platform() === "win32";

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

// Retrieve the cdxgen plugins directory
let CDXGEN_PLUGINS_DIR = process.env.CDXGEN_PLUGINS_DIR;
// Is there a non-empty local plugins directory
if (
  !CDXGEN_PLUGINS_DIR &&
  fs.existsSync(path.join(__dirname, "plugins")) &&
  fs.existsSync(path.join(__dirname, "plugins", "goversion"))
) {
  CDXGEN_PLUGINS_DIR = path.join(__dirname, "plugins");
}
if (!CDXGEN_PLUGINS_DIR) {
  let globalNodePath = process.env.GLOBAL_NODE_MODULES_PATH || undefined;
  if (!globalNodePath) {
    let result = spawnSync(
      isWin ? "npm.cmd" : "npm",
      ["root", "--quiet", "-g"],
      {
        encoding: "utf-8"
      }
    );
    if (result) {
      const stdout = result.stdout;
      if (stdout) {
        globalNodePath = Buffer.from(stdout).toString().trim() + "/";
      }
    }
  }
  const globalPlugins = path.join(
    globalNodePath,
    "@ngcloudsec",
    "cdxgen-plugins-bin",
    "plugins"
  );
  if (fs.existsSync(globalPlugins)) {
    CDXGEN_PLUGINS_DIR = globalPlugins;
    if (DEBUG_MODE) {
      console.log("Found global plugins", CDXGEN_PLUGINS_DIR);
    }
  }
}

if (!CDXGEN_PLUGINS_DIR) {
  if (DEBUG_MODE) {
    console.warn(
      "cdxgen plugins was not found. Please install with npm install -g @ngcloudsec/cdxgen-plugins-bin"
    );
  }
  CDXGEN_PLUGINS_DIR = "";
}
let GOVERSION_BIN = null;
if (fs.existsSync(path.join(CDXGEN_PLUGINS_DIR, "goversion"))) {
  GOVERSION_BIN = path.join(
    CDXGEN_PLUGINS_DIR,
    "goversion",
    "goversion-" + platform + "-" + arch + extn
  );
}
let TRIVY_BIN = null;
if (fs.existsSync(path.join(CDXGEN_PLUGINS_DIR, "trivy"))) {
  TRIVY_BIN = path.join(
    CDXGEN_PLUGINS_DIR,
    "trivy",
    "trivy-cdxgen-" + platform + "-" + arch + extn
  );
} else if (process.env.TRIVY_CMD) {
  TRIVY_BIN = process.env.TRIVY_CMD;
}
let CARGO_AUDITABLE_BIN = null;
if (fs.existsSync(path.join(CDXGEN_PLUGINS_DIR, "cargo-auditable"))) {
  CARGO_AUDITABLE_BIN = path.join(
    CDXGEN_PLUGINS_DIR,
    "cargo-auditable",
    "cargo-auditable-cdxgen-" + platform + "-" + arch + extn
  );
} else if (process.env.CARGO_AUDITABLE_CMD) {
  CARGO_AUDITABLE_BIN = process.env.CARGO_AUDITABLE_CMD;
}
let OSQUERY_BIN = null;
if (fs.existsSync(path.join(CDXGEN_PLUGINS_DIR, "osquery"))) {
  OSQUERY_BIN = path.join(
    CDXGEN_PLUGINS_DIR,
    "osquery",
    "osqueryi-" + platform + "-" + arch + extn
  );
} else if (process.env.OSQUERY_CMD) {
  OSQUERY_BIN = process.env.OSQUERY_CMD;
}
const getGoBuildInfo = (src) => {
  if (GOVERSION_BIN) {
    let result = spawnSync(GOVERSION_BIN, [src], {
      encoding: "utf-8"
    });
    if (result.status !== 0 || result.error) {
      console.error(result.stdout, result.stderr);
      if (DEBUG_MODE) {
        console.log("Falling back to go version command");
      }
      result = spawnSync("go", ["version", "-v", "-m", src], {
        encoding: "utf-8"
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

const getCargoAuditableInfo = (src) => {
  if (CARGO_AUDITABLE_BIN) {
    let result = spawnSync(CARGO_AUDITABLE_BIN, [src], {
      encoding: "utf-8"
    });
    if (result.status !== 0 || result.error) {
      console.error(result.stdout, result.stderr);
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
exports.getCargoAuditableInfo = getCargoAuditableInfo;

const getOSPackages = (src) => {
  const pkgList = [];
  if (TRIVY_BIN) {
    let imageType = "image";
    if (fs.existsSync(src)) {
      imageType = "rootfs";
    }
    let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "trivy-cdxgen-"));
    const bomJsonFile = path.join(tempDir, "trivy-bom.json");
    const args = [
      imageType,
      "--skip-update",
      "--offline-scan",
      "--format",
      "cyclonedx",
      "--output",
      bomJsonFile
    ];
    if (!DEBUG_MODE) {
      args.push("-q");
    }
    args.push(src);
    if (DEBUG_MODE) {
      console.log("Executing", TRIVY_BIN, args.join(" "));
    }
    let result = spawnSync(TRIVY_BIN, args, {
      encoding: "utf-8"
    });
    if (result.status !== 0 || result.error) {
      console.error(result.stdout, result.stderr);
    }
    if (fs.existsSync(bomJsonFile)) {
      const tmpBom = JSON.parse(
        fs.readFileSync(bomJsonFile, {
          encoding: "utf-8"
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
            // Retain go components alone from trivy
            if (
              comp.purl.startsWith("pkg:npm") ||
              comp.purl.startsWith("pkg:maven") ||
              comp.purl.startsWith("pkg:pypi") ||
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
            if (group === "") {
              try {
                const purlObj = PackageURL.fromString(comp.purl);
                if (purlObj.namespace && purlObj.namespace !== "") {
                  group = purlObj.namespace;
                }
              } catch (err) {}
            }
            comp.group = group;
            comp.name = name;
            if (
              comp.licenses &&
              Array.isArray(comp.licenses) &&
              comp.licenses.length
            ) {
              comp.licenses = [comp.licenses[0]];
            }
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

const executeOsQuery = (query) => {
  if (OSQUERY_BIN) {
    if (!query.endsWith(";")) {
      query = query + ";";
    }
    const args = ["--json", query];
    if (DEBUG_MODE) {
      console.log("Execuing", OSQUERY_BIN, args.join(" "));
    }
    let result = spawnSync(OSQUERY_BIN, args, {
      encoding: "utf-8"
    });
    if (result.status !== 0 || result.error) {
      if (DEBUG_MODE && result.error) {
        console.error(result.stdout, result.stderr);
      }
    }
    if (result) {
      const stdout = result.stdout;
      if (stdout) {
        const cmdOutput = Buffer.from(stdout).toString();
        if (cmdOutput !== "") {
          return JSON.parse(cmdOutput);
        }
        return undefined;
      }
    }
  }
  return undefined;
};
exports.executeOsQuery = executeOsQuery;
