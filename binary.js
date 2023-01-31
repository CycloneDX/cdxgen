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
// Is there a non-empty local node_modules directory
if (
  !CDXGEN_PLUGINS_DIR &&
  fs.existsSync(
    path.join(
      __dirname,
      "node_modules",
      "@appthreat",
      "cdxgen-plugins-bin",
      "plugins"
    )
  ) &&
  fs.existsSync(
    path.join(
      __dirname,
      "node_modules",
      "@appthreat",
      "cdxgen-plugins-bin",
      "plugins",
      "goversion"
    )
  )
) {
  CDXGEN_PLUGINS_DIR = path.join(
    __dirname,
    "node_modules",
    "@appthreat",
    "cdxgen-plugins-bin",
    "plugins"
  );
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
    "@appthreat",
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
      "cdxgen plugins was not found. Please install with npm install -g @appthreat/cdxgen-plugins-bin"
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

const OS_DISTRO_ALIAS = {
  "ubuntu-4.10": "warty",
  "ubuntu-5.04": "hoary",
  "ubuntu-5.10": "breezy",
  "ubuntu-6.06": "dapper",
  "ubuntu-6.10": "edgy",
  "ubuntu-7.04": "feisty",
  "ubuntu-7.10": "gutsy",
  "ubuntu-8.04": "hardy",
  "ubuntu-8.10": "intrepid",
  "ubuntu-9.04": "jaunty",
  "ubuntu-9.10": "karmic",
  "ubuntu-10.04": "lucid",
  "ubuntu-10.10": "maverick",
  "ubuntu-11.04": "natty",
  "ubuntu-11.10": "oneiric",
  "ubuntu-12.04": "precise",
  "ubuntu-12.10": "quantal",
  "ubuntu-13.04": "raring",
  "ubuntu-13.10": "saucy",
  "ubuntu-14.04": "trusty",
  "ubuntu-14.10": "utopic",
  "ubuntu-15.04": "vivid",
  "ubuntu-15.10": "wily",
  "ubuntu-16.04": "xenial",
  "ubuntu-16.10": "yakkety",
  "ubuntu-17.04": "zesty",
  "ubuntu-17.10": "artful",
  "ubuntu-18.04": "bionic",
  "ubuntu-18.10": "cosmic",
  "ubuntu-19.04": "disco",
  "ubuntu-19.10": "eoan",
  "ubuntu-20.04": "focal",
  "ubuntu-20.10": "groovy",
  "ubuntu-23.04": "lunar",
  "debian-14": "forky",
  "debian-14.5": "forky",
  "debian-13": "trixie",
  "debian-13.5": "trixie",
  "debian-12": "bookworm",
  "debian-12.5": "bookworm",
  "debian-11": "bullseye",
  "debian-11.5": "bullseye",
  "debian-10": "buster",
  "debian-10.5": "buster",
  "debian-9": "stretch",
  "debian-9.5": "stretch",
  "debian-8": "jessie",
  "debian-8.5": "jessie",
  "debian-7": "wheezy",
  "debian-7.5": "wheezy",
  "debian-6": "squeeze",
  "debian-5": "lenny",
  "debian-4": "etch",
  "debian-3.1": "sarge",
  "debian-3": "woody",
  "debian-2.2": "potato",
  "debian-2.1": "slink",
  "debian-2": "hamm",
  "debian-1.3": "bo",
  "debian-1.2": "rex",
  "debian-1.1": "buzz"
};

const getGoBuildInfo = (src) => {
  if (GOVERSION_BIN) {
    let result = spawnSync(GOVERSION_BIN, [src], {
      encoding: "utf-8"
    });
    if (result.status !== 0 || result.error) {
      if (result.stdout || result.stderr) {
        console.error(result.stdout, result.stderr);
      }
      if (DEBUG_MODE) {
        console.log("Falling back to go version command");
      }
      result = spawnSync("go", ["version", "-v", "-m", src], {
        encoding: "utf-8"
      });
      if (result.status !== 0 || result.error) {
        if (result.stdout || result.stderr) {
          console.error(result.stdout, result.stderr);
        }
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
      if (result.stdout || result.stderr) {
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
exports.getCargoAuditableInfo = getCargoAuditableInfo;

const getOSPackages = (src) => {
  const pkgList = [];
  const allTypes = new Set();
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
      if (result.stdout || result.stderr) {
        console.error(result.stdout, result.stderr);
      }
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
            let name = path.basename(comp.name);
            let purlObj = undefined;
            let distro_codename = "";
            if (group === ".") {
              group = "";
            }
            comp.group = group;
            comp.name = name;
            if (group === "") {
              try {
                purlObj = PackageURL.fromString(comp.purl);
                if (purlObj.namespace && purlObj.namespace !== "") {
                  group = purlObj.namespace;
                  comp.group = group;
                  purlObj.namespace = group;
                }
                // Bug fix for mageia and oracle linux
                if (purlObj.type === "none") {
                  purlObj["type"] = "rpm";
                  purlObj["namespace"] = "";
                  comp.group = "";
                  distro_codename = undefined;
                  if (comp.purl && comp.purl.includes(".mga")) {
                    purlObj["namespace"] = "mageia";
                    comp.group = "mageia";
                    purlObj.qualifiers["distro"] = "mageia";
                    distro_codename = "mga";
                  } else if (comp.purl && comp.purl.includes(".el8")) {
                    purlObj.qualifiers["distro"] = "el8";
                  }
                  comp.purl = new PackageURL(
                    purlObj.type,
                    purlObj.namespace,
                    name,
                    purlObj.version,
                    purlObj.qualifiers,
                    purlObj.subpath
                  ).toString();
                  comp["bom-ref"] = comp.purl;
                }
                if (purlObj.type !== "none") {
                  allTypes.add(purlObj.type);
                }
                // Prefix distro codename for ubuntu
                if (purlObj.qualifiers && purlObj.qualifiers.distro) {
                  allTypes.add(purlObj.qualifiers.distro);
                  if (OS_DISTRO_ALIAS[purlObj.qualifiers.distro]) {
                    distro_codename =
                      OS_DISTRO_ALIAS[purlObj.qualifiers.distro];
                  } else if (group === "alpine") {
                    const dtmpA = purlObj.qualifiers.distro.split(".");
                    if (dtmpA && dtmpA.length > 2) {
                      distro_codename = group + "-" + dtmpA[0] + "." + dtmpA[1];
                    }
                  } else if (group === "photon") {
                    const dtmpA = purlObj.qualifiers.distro.split("-");
                    if (dtmpA && dtmpA.length > 1) {
                      distro_codename = dtmpA[0];
                    }
                  } else if (group === "redhat") {
                    const dtmpA = purlObj.qualifiers.distro.split(".");
                    if (dtmpA && dtmpA.length > 1) {
                      distro_codename = dtmpA[0].replace(
                        "redhat",
                        "enterprise_linux"
                      );
                    }
                  }
                  if (distro_codename !== "") {
                    allTypes.add(distro_codename);
                    allTypes.add(purlObj.namespace);
                    purlObj.qualifiers["distro_name"] = distro_codename;
                    comp.purl = new PackageURL(
                      purlObj.type,
                      purlObj.namespace,
                      name,
                      purlObj.version,
                      purlObj.qualifiers,
                      purlObj.subpath
                    ).toString();
                    comp["bom-ref"] = comp.purl;
                  }
                }
              } catch (err) {
                // continue regardless of error
              }
            }
            if (
              comp.licenses &&
              Array.isArray(comp.licenses) &&
              comp.licenses.length
            ) {
              comp.licenses = [comp.licenses[0]];
            }
            const compProperties = comp.properties;
            let srcName = undefined;
            let srcVersion = undefined;
            if (compProperties && Array.isArray(compProperties)) {
              for (const aprop of compProperties) {
                if (aprop.name.endsWith("SrcName")) {
                  srcName = aprop.value;
                }
                if (aprop.name.endsWith("SrcVersion")) {
                  srcVersion = aprop.value;
                }
              }
            }
            delete comp.properties;
            pkgList.push(comp);
            // If there is a source package defined include it as well
            if (srcName && srcVersion && srcName !== comp.name) {
              let newComp = Object.assign({}, comp);
              newComp.name = srcName;
              newComp.version = srcVersion;
              if (purlObj) {
                newComp.purl = new PackageURL(
                  purlObj.type,
                  purlObj.namespace,
                  srcName,
                  srcVersion,
                  purlObj.qualifiers,
                  purlObj.subpath
                ).toString();
              }
              newComp["bom-ref"] = newComp.purl;
              pkgList.push(newComp);
            }
          }
        }
      }
      return { osPackages: pkgList, allTypes: Array.from(allTypes) };
    }
  }
  return { osPackages: pkgList, allTypes: Array.from(allTypes) };
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
