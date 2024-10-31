import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { arch as _arch, platform as _platform, homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { PackageURL } from "packageurl-js";
import {
  DEBUG_MODE,
  MAX_BUFFER,
  TIMEOUT_MS,
  adjustLicenseInformation,
  dirNameStr,
  findLicenseId,
  isSpdxLicenseExpression,
} from "../helpers/utils.js";

import { URL } from "node:url";

let url = import.meta.url;
if (!url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
const dirName = dirNameStr;

const isWin = _platform() === "win32";

let platform = _platform();
let extn = "";
let pluginsBinSuffix = "";
if (platform === "win32") {
  platform = "windows";
  extn = ".exe";
}

let arch = _arch();
switch (arch) {
  case "x32":
    arch = "386";
    break;
  case "x64":
    arch = "amd64";
    if (platform === "windows") {
      pluginsBinSuffix = "-windows-amd64";
    } else if (platform === "darwin") {
      pluginsBinSuffix = "-darwin-amd64";
    }
    break;
  case "arm64":
    pluginsBinSuffix = "-arm64";
    if (platform === "windows") {
      pluginsBinSuffix = "-windows-arm64";
    } else if (platform === "darwin") {
      pluginsBinSuffix = "-darwin-arm64";
    }
    break;
  case "ppc64":
    arch = "ppc64le";
    pluginsBinSuffix = "-ppc64";
    break;
}

// Retrieve the cdxgen plugins directory
let CDXGEN_PLUGINS_DIR = process.env.CDXGEN_PLUGINS_DIR;
// Is there a non-empty local plugins directory
if (
  !CDXGEN_PLUGINS_DIR &&
  existsSync(join(dirName, "plugins")) &&
  existsSync(join(dirName, "plugins", "trivy"))
) {
  CDXGEN_PLUGINS_DIR = join(dirName, "plugins");
}
// Is there a non-empty local node_modules directory
if (
  !CDXGEN_PLUGINS_DIR &&
  existsSync(
    join(
      dirName,
      "node_modules",
      "@cyclonedx",
      `cdxgen-plugins-bin${pluginsBinSuffix}`,
      "plugins",
    ),
  ) &&
  existsSync(
    join(
      dirName,
      "node_modules",
      "@cyclonedx",
      `cdxgen-plugins-bin${pluginsBinSuffix}`,
      "plugins",
      "trivy",
    ),
  )
) {
  CDXGEN_PLUGINS_DIR = join(
    dirName,
    "node_modules",
    "@cyclonedx",
    `cdxgen-plugins-bin${pluginsBinSuffix}`,
    "plugins",
  );
}

if (!CDXGEN_PLUGINS_DIR) {
  let globalNodePath = process.env.GLOBAL_NODE_MODULES_PATH || undefined;
  if (!globalNodePath) {
    const result = spawnSync(
      isWin ? "npm.cmd" : "npm",
      ["root", "--quiet", "-g"],
      {
        encoding: "utf-8",
      },
    );
    if (result) {
      const stdout = result.stdout;
      if (stdout) {
        globalNodePath = `${Buffer.from(stdout).toString().trim()}/`;
      }
    }
  }
  if (globalNodePath) {
    const globalPlugins = join(
      globalNodePath,
      "@cyclonedx",
      `cdxgen-plugins-bin${pluginsBinSuffix}`,
      "plugins",
    );
    if (existsSync(globalPlugins)) {
      CDXGEN_PLUGINS_DIR = globalPlugins;
      if (DEBUG_MODE) {
        console.log("Found global plugins", CDXGEN_PLUGINS_DIR);
      }
    }
  }
}

if (!CDXGEN_PLUGINS_DIR) {
  if (DEBUG_MODE) {
    console.warn(
      "cdxgen plugins was not found. Please install with npm install -g @cyclonedx/cdxgen-plugins-bin",
    );
  }
  CDXGEN_PLUGINS_DIR = "";
}
let GOVERSION_BIN = null;
if (existsSync(join(CDXGEN_PLUGINS_DIR, "goversion"))) {
  GOVERSION_BIN = join(
    CDXGEN_PLUGINS_DIR,
    "goversion",
    `goversion-${platform}-${arch}${extn}`,
  );
}
let TRIVY_BIN = null;
if (existsSync(join(CDXGEN_PLUGINS_DIR, "trivy"))) {
  TRIVY_BIN = join(
    CDXGEN_PLUGINS_DIR,
    "trivy",
    `trivy-cdxgen-${platform}-${arch}${extn}`,
  );
} else if (process.env.TRIVY_CMD) {
  TRIVY_BIN = process.env.TRIVY_CMD;
}
let CARGO_AUDITABLE_BIN = null;
if (existsSync(join(CDXGEN_PLUGINS_DIR, "cargo-auditable"))) {
  CARGO_AUDITABLE_BIN = join(
    CDXGEN_PLUGINS_DIR,
    "cargo-auditable",
    `cargo-auditable-cdxgen-${platform}-${arch}${extn}`,
  );
} else if (process.env.CARGO_AUDITABLE_CMD) {
  CARGO_AUDITABLE_BIN = process.env.CARGO_AUDITABLE_CMD;
}
let OSQUERY_BIN = null;
if (existsSync(join(CDXGEN_PLUGINS_DIR, "osquery"))) {
  OSQUERY_BIN = join(
    CDXGEN_PLUGINS_DIR,
    "osquery",
    `osqueryi-${platform}-${arch}${extn}`,
  );
  // osqueryi-darwin-amd64.app/Contents/MacOS/osqueryd
  if (platform === "darwin") {
    OSQUERY_BIN = `${OSQUERY_BIN}.app/Contents/MacOS/osqueryd`;
  }
} else if (process.env.OSQUERY_CMD) {
  OSQUERY_BIN = process.env.OSQUERY_CMD;
}
let DOSAI_BIN = null;
if (existsSync(join(CDXGEN_PLUGINS_DIR, "dosai"))) {
  DOSAI_BIN = join(
    CDXGEN_PLUGINS_DIR,
    "dosai",
    `dosai-${platform}-${arch}${extn}`,
  );
} else if (process.env.DOSAI_CMD) {
  DOSAI_BIN = process.env.DOSAI_CMD;
}

// Blint bin
const BLINT_BIN = process.env.BLINT_CMD || "blint";

// sourcekitten
let SOURCEKITTEN_BIN = null;
if (existsSync(join(CDXGEN_PLUGINS_DIR, "sourcekitten"))) {
  SOURCEKITTEN_BIN = join(CDXGEN_PLUGINS_DIR, "sourcekitten", "sourcekitten");
} else if (process.env.SOURCEKITTEN_CMD) {
  SOURCEKITTEN_BIN = process.env.SOURCEKITTEN_CMD;
}

// Keep this list updated every year
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
  "ubuntu-22.04": "jammy",
  "ubuntu-23.04": "lunar",
  "ubuntu-23.10": "mantic",
  "ubuntu-24.04": "noble",
  "debian-14": "forky",
  "debian-14.5": "forky",
  "debian-13": "trixie",
  "debian-13.5": "trixie",
  "debian-12": "bookworm",
  "debian-12.5": "bookworm",
  "debian-12.6": "bookworm",
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
  "debian-1.1": "buzz",
  "red hat enterprise linux": "rhel",
  "red hat enterprise linux 8": "rhel-8",
  "red hat enterprise linux 9": "rhel-9",
};

export function getGoBuildInfo(src) {
  if (GOVERSION_BIN) {
    let result = spawnSync(GOVERSION_BIN, [src], {
      encoding: "utf-8",
    });
    if (result.status !== 0 || result.error || !result.stdout) {
      if (result.stdout || result.stderr) {
        console.error(result.stdout, result.stderr);
      }
      if (DEBUG_MODE) {
        console.log("Falling back to go version command");
      }
      result = spawnSync("go", ["version", "-v", "-m", src], {
        encoding: "utf-8",
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
        return Buffer.from(stdout).toString();
      }
    }
  }
  return undefined;
}

export function getCargoAuditableInfo(src) {
  if (CARGO_AUDITABLE_BIN) {
    const result = spawnSync(CARGO_AUDITABLE_BIN, [src], {
      encoding: "utf-8",
    });
    if (result.status !== 0 || result.error) {
      if (result.stdout || result.stderr) {
        console.error(result.stdout, result.stderr);
      }
    }
    if (result) {
      const stdout = result.stdout;
      if (stdout) {
        return Buffer.from(stdout).toString();
      }
    }
  }
  return undefined;
}

/**
 * Execute sourcekitten plugin with the given arguments
 *
 * @param args {Array} Arguments
 * @returns {undefined|Object} Command output
 */
export function executeSourcekitten(args) {
  if (SOURCEKITTEN_BIN) {
    const result = spawnSync(SOURCEKITTEN_BIN, args, {
      encoding: "utf-8",
      maxBuffer: MAX_BUFFER,
    });
    if (result.status !== 0 || result.error) {
      if (result.stdout || result.stderr) {
        console.error(result.stdout, result.stderr);
      }
    }
    if (result) {
      const stdout = result.stdout;
      if (stdout) {
        return JSON.parse(Buffer.from(stdout).toString());
      }
    }
  }
  return undefined;
}

export function getOSPackages(src) {
  const pkgList = [];
  const dependenciesList = [];
  const allTypes = new Set();
  if (TRIVY_BIN) {
    let imageType = "image";
    const trivyCacheDir = join(homedir(), ".cache", "trivy");
    try {
      mkdirSync(join(trivyCacheDir, "db"), { recursive: true });
      mkdirSync(join(trivyCacheDir, "java-db"), { recursive: true });
    } catch (err) {
      // ignore errors
    }
    if (existsSync(src)) {
      imageType = "rootfs";
    }
    const tempDir = mkdtempSync(join(tmpdir(), "trivy-cdxgen-"));
    const bomJsonFile = join(tempDir, "trivy-bom.json");
    const args = [
      imageType,
      "--skip-db-update",
      "--skip-java-db-update",
      "--offline-scan",
      "--skip-files",
      "**/*.jar,**/*.war,**/*.par,**/*.ear",
      "--no-progress",
      "--exit-code",
      "0",
      "--format",
      "cyclonedx",
      "--cache-dir",
      trivyCacheDir,
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
    const result = spawnSync(TRIVY_BIN, args, {
      encoding: "utf-8",
    });
    if (result.status !== 0 || result.error) {
      if (result.stdout || result.stderr) {
        console.error(result.stdout, result.stderr);
      }
    }
    if (existsSync(bomJsonFile)) {
      let tmpBom = {};
      try {
        tmpBom = JSON.parse(
          readFileSync(bomJsonFile, {
            encoding: "utf-8",
          }),
        );
      } catch (e) {
        // ignore errors
      }
      // Clean up
      if (tempDir?.startsWith(tmpdir())) {
        if (DEBUG_MODE) {
          console.log(`Cleaning up ${tempDir}`);
        }
        if (rmSync) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }
      const osReleaseData = {};
      let osReleaseFile = undefined;
      // Let's try to read the os-release file from various locations
      if (existsSync(join(src, "etc", "os-release"))) {
        osReleaseFile = join(src, "etc", "os-release");
      } else if (existsSync(join(src, "usr", "lib", "os-release"))) {
        osReleaseFile = join(src, "usr", "lib", "os-release");
      }
      if (osReleaseFile) {
        const osReleaseInfo = readFileSync(osReleaseFile, "utf-8");
        if (osReleaseInfo) {
          osReleaseInfo.split("\n").forEach((l) => {
            if (!l.startsWith("#") && l.includes("=")) {
              const tmpA = l.split("=");
              osReleaseData[tmpA[0]] = tmpA[1].replace(/"/g, "");
            }
          });
        }
      }
      if (DEBUG_MODE) {
        console.log(osReleaseData);
      }
      let distro_codename =
        osReleaseData["VERSION_CODENAME"] ||
        osReleaseData["CENTOS_MANTISBT_PROJECT"] ||
        osReleaseData["REDHAT_BUGZILLA_PRODUCT"] ||
        osReleaseData["REDHAT_SUPPORT_PRODUCT"] ||
        "";
      distro_codename = distro_codename.toLowerCase();
      if (distro_codename.includes(" ") && OS_DISTRO_ALIAS[distro_codename]) {
        distro_codename = OS_DISTRO_ALIAS[distro_codename];
      }
      let distro_id = osReleaseData["ID"] || "";
      const distro_id_like = osReleaseData["ID_LIKE"] || "";
      let purl_type = "rpm";
      switch (distro_id) {
        case "debian":
        case "ubuntu":
        case "pop":
          purl_type = "deb";
          break;
        case "alpine":
          purl_type = "apk";
          if (osReleaseData.VERSION_ID) {
            const versionParts = osReleaseData["VERSION_ID"].split(".");
            if (versionParts.length >= 2) {
              distro_codename = `alpine-${versionParts[0]}.${versionParts[1]}`;
            }
          }
          break;
        default:
          if (distro_id_like.includes("debian")) {
            purl_type = "deb";
          } else if (
            distro_id_like.includes("rhel") ||
            distro_id_like.includes("centos") ||
            distro_id_like.includes("fedora")
          ) {
            purl_type = "rpm";
          }
          break;
      }
      if (osReleaseData["VERSION_ID"]) {
        distro_id = `${distro_id}-${osReleaseData["VERSION_ID"]}`;
      }
      const tmpDependencies = {};
      (tmpBom.dependencies || []).forEach((d) => {
        tmpDependencies[d.ref] = d.dependsOn;
      });
      if (tmpBom?.components) {
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
            const origBomRef = comp["bom-ref"];
            // Fix the group
            let group = dirname(comp.name);
            const name = basename(comp.name);
            let purlObj = undefined;
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
                purlObj.qualifiers = purlObj.qualifiers || {};
                if (distro_id?.length) {
                  purlObj.qualifiers["distro"] = distro_id;
                }
                if (distro_codename?.length) {
                  purlObj.qualifiers["distro_name"] = distro_codename;
                }
                // Remove any epoch values
                delete purlObj.qualifiers.epoch;
                // Bug fix for mageia and oracle linux
                // Type is being returned as none for ubuntu as well!
                if (purlObj.type === "none") {
                  purlObj["type"] = purl_type;
                  purlObj["namespace"] = "";
                  comp.group = "";
                  if (comp.purl?.includes(".mga")) {
                    purlObj["namespace"] = "mageia";
                    comp.group = "mageia";
                    purlObj.qualifiers["distro"] = "mageia";
                    distro_codename = "mga";
                  }
                  comp.purl = new PackageURL(
                    purlObj.type,
                    purlObj.namespace,
                    name,
                    purlObj.version,
                    purlObj.qualifiers,
                    purlObj.subpath,
                  ).toString();
                  comp["bom-ref"] = decodeURIComponent(comp.purl);
                }
                if (purlObj.type !== "none") {
                  allTypes.add(purlObj.type);
                }
                // Prefix distro codename for ubuntu
                if (purlObj.qualifiers?.distro) {
                  allTypes.add(purlObj.qualifiers.distro);
                  if (OS_DISTRO_ALIAS[purlObj.qualifiers.distro]) {
                    distro_codename =
                      OS_DISTRO_ALIAS[purlObj.qualifiers.distro];
                  } else if (group === "alpine") {
                    const dtmpA = purlObj.qualifiers.distro.split(".");
                    if (dtmpA && dtmpA.length > 2) {
                      distro_codename = `${dtmpA[0]}.${dtmpA[1]}`;
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
                        "enterprise_linux",
                      );
                    }
                  }
                }
                if (distro_codename !== "") {
                  allTypes.add(distro_codename);
                  allTypes.add(purlObj.namespace);
                  comp.purl = new PackageURL(
                    purlObj.type,
                    purlObj.namespace,
                    name,
                    purlObj.version,
                    purlObj.qualifiers,
                    purlObj.subpath,
                  ).toString();
                  comp["bom-ref"] = decodeURIComponent(comp.purl);
                }
              } catch (err) {
                // continue regardless of error
              }
            }
            if (comp.purl.includes("epoch=")) {
              try {
                purlObj = PackageURL.fromString(comp.purl);
                purlObj.qualifiers = purlObj.qualifiers || {};
                if (distro_id?.length) {
                  purlObj.qualifiers["distro"] = distro_id;
                }
                if (distro_codename?.length) {
                  purlObj.qualifiers["distro_name"] = distro_codename;
                }
                delete purlObj.qualifiers.epoch;
                allTypes.add(purlObj.namespace);
                comp.purl = new PackageURL(
                  purlObj.type,
                  purlObj.namespace,
                  name,
                  purlObj.version,
                  purlObj.qualifiers,
                  purlObj.subpath,
                ).toString();
                comp["bom-ref"] = decodeURIComponent(comp.purl);
              } catch (err) {
                // continue regardless of error
                console.log(err);
              }
            }
            // Fix licenses
            if (
              comp.licenses &&
              Array.isArray(comp.licenses) &&
              comp.licenses.length
            ) {
              const newLicenses = [];
              for (const aLic of comp.licenses) {
                if (aLic.license.name) {
                  if (isSpdxLicenseExpression(aLic.license.name)) {
                    newLicenses.push({ expression: aLic.license.name });
                  } else {
                    const possibleId = findLicenseId(aLic.license.name);
                    if (possibleId !== aLic.license.name) {
                      newLicenses.push({ license: { id: possibleId } });
                    } else {
                      newLicenses.push({
                        license: { name: aLic.license.name },
                      });
                    }
                  }
                } else if (
                  Object.keys(aLic).length &&
                  Object.keys(aLic.license).length
                ) {
                  newLicenses.push(aLic);
                }
              }
              comp.licenses = adjustLicenseInformation(newLicenses);
            }
            // Fix hashes
            if (
              comp.hashes &&
              Array.isArray(comp.hashes) &&
              comp.hashes.length
            ) {
              const hashContent = comp.hashes[0].content;
              if (!hashContent || hashContent.length < 32) {
                delete comp.hashes;
              }
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
            const compDeps = retrieveDependencies(
              tmpDependencies,
              origBomRef,
              comp,
            );
            if (compDeps) {
              dependenciesList.push(compDeps);
            }
            // If there is a source package defined include it as well
            if (srcName && srcVersion && srcName !== comp.name) {
              const newComp = Object.assign({}, comp);
              newComp.name = srcName;
              newComp.version = srcVersion;
              if (purlObj) {
                newComp.purl = new PackageURL(
                  purlObj.type,
                  purlObj.namespace,
                  srcName,
                  srcVersion,
                  purlObj.qualifiers,
                  purlObj.subpath,
                ).toString();
              }
              newComp["bom-ref"] = decodeURIComponent(newComp.purl);
              pkgList.push(newComp);
            }
          }
        }
      }
    }
  }
  return {
    osPackages: pkgList,
    dependenciesList,
    allTypes: Array.from(allTypes),
  };
}

const retrieveDependencies = (tmpDependencies, origBomRef, comp) => {
  try {
    const tmpDependsOn = tmpDependencies[origBomRef] || [];
    const dependsOn = new Set();
    tmpDependsOn.forEach((d) => {
      try {
        const compPurl = PackageURL.fromString(comp.purl);
        const tmpPurl = PackageURL.fromString(d.replace("none", compPurl.type));
        tmpPurl.type = compPurl.type;
        tmpPurl.namespace = compPurl.namespace;
        tmpPurl.qualifiers = tmpPurl.qualifiers || {};
        if (compPurl.qualifiers) {
          if (compPurl.qualifiers.distro_name) {
            tmpPurl.qualifiers.distro_name = compPurl.qualifiers.distro_name;
          }
          if (compPurl.qualifiers.distro) {
            tmpPurl.qualifiers.distro = compPurl.qualifiers.distro;
          }
          delete tmpPurl.qualifiers.epoch;
        }
        dependsOn.add(decodeURIComponent(tmpPurl.toString()));
      } catch (e) {
        // ignore
      }
    });
    return { ref: comp["bom-ref"], dependsOn: Array.from(dependsOn).sort() };
  } catch (e) {
    // ignore
  }
  return undefined;
};

export function executeOsQuery(query) {
  if (OSQUERY_BIN) {
    if (!query.endsWith(";")) {
      query = `${query};`;
    }
    const args = ["--json", query];
    // On darwin, we need to disable the safety check and run cdxgen with sudo
    // https://github.com/osquery/osquery/issues/1382
    if (platform === "darwin") {
      args.push("--allow_unsafe");
      args.push("--disable_logging");
      args.push("--disable_events");
    }
    if (DEBUG_MODE) {
      console.log("Executing", OSQUERY_BIN, args.join(" "));
    }
    const result = spawnSync(OSQUERY_BIN, args, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60 * 1000,
    });
    if (result.status !== 0 || result.error) {
      if (
        DEBUG_MODE &&
        result.stderr &&
        !result.stderr.includes("no such table")
      ) {
        console.error(result.stdout, result.stderr);
      }
    }
    if (result) {
      const stdout = result.stdout;
      if (stdout) {
        const cmdOutput = Buffer.from(stdout).toString();
        if (cmdOutput !== "") {
          try {
            return JSON.parse(cmdOutput);
          } catch (err) {
            // ignore
            if (DEBUG_MODE) {
              console.log("Unable to parse the output from query", query);
              console.log(
                "This could be due to the amount of data returned or the query being invalid for the given platform.",
              );
            }
          }
        }
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Method to execute dosai to create slices for dotnet
 *
 * @param {string} src Source Path
 * @param {string} slicesFile Slices file name
 * @returns boolean
 */
export function getDotnetSlices(src, slicesFile) {
  if (!DOSAI_BIN) {
    return false;
  }
  const args = ["methods", "--path", src, "--o", slicesFile];
  if (DEBUG_MODE) {
    console.log("Executing", DOSAI_BIN, args.join(" "));
  }
  const result = spawnSync(DOSAI_BIN, args, {
    encoding: "utf-8",
    timeout: TIMEOUT_MS,
    cwd: src,
  });
  if (result.status !== 0 || result.error) {
    if (DEBUG_MODE && result.error) {
      if (result.stderr) {
        console.error(result.stdout, result.stderr);
      } else {
        console.log("Check if dosai plugin was installed successfully.");
      }
    }
    return false;
  }
  return true;
}

/**
 * Method to generate binary SBOM using blint
 *
 * @param {string} src Path to binary or its directory
 * @param {string} binaryBomFile Path to binary
 * @param {boolean} deepMode Deep mode flag
 *
 * @return {boolean} Result of the generation
 */
export function getBinaryBom(src, binaryBomFile, deepMode) {
  if (!BLINT_BIN) {
    return false;
  }
  const args = ["sbom", "-i", resolve(src), "-o", binaryBomFile];
  if (deepMode) {
    args.push("--deep");
  }
  if (DEBUG_MODE) {
    console.log("Executing", BLINT_BIN, args.join(" "));
  }
  const cwd = lstatSync(src).isDirectory() ? src : dirname(src);
  const result = spawnSync(BLINT_BIN, args, {
    encoding: "utf-8",
    timeout: TIMEOUT_MS,
    cwd,
  });
  if (result.status !== 0 || result.error) {
    if (result.stderr) {
      console.error(result.stdout, result.stderr);
    } else {
      console.log(
        "Install blint using 'pip install blint' or use the cdxgen container image.",
      );
    }
    return false;
  }
  return true;
}
