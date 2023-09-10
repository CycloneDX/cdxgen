import { globSync } from "glob";
import { homedir, tmpdir, platform, freemem } from "node:os";
import {
  dirname,
  sep as _sep,
  basename,
  extname,
  join,
  resolve,
  delimiter as _delimiter
} from "node:path";
import {
  existsSync,
  readFileSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  copyFileSync,
  constants,
  writeFileSync,
  unlinkSync,
  chmodSync
} from "node:fs";
import got from "got";
import { xml2js } from "xml-js";
import { fileURLToPath } from "node:url";
let url = import.meta.url;
if (!url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
const dirNameStr = import.meta ? dirname(fileURLToPath(url)) : __dirname;

const licenseMapping = JSON.parse(
  readFileSync(join(dirNameStr, "data", "lic-mapping.json"))
);
const vendorAliases = JSON.parse(
  readFileSync(join(dirNameStr, "data", "vendor-alias.json"))
);
const spdxLicenses = JSON.parse(
  readFileSync(join(dirNameStr, "data", "spdx-licenses.json"))
);
const knownLicenses = JSON.parse(
  readFileSync(join(dirNameStr, "data", "known-licenses.json"))
);
const mesonWrapDB = JSON.parse(
  readFileSync(join(dirNameStr, "data", "wrapdb-releases.json"))
);
import { load } from "cheerio";
import { load as _load } from "js-yaml";
import { spawnSync } from "node:child_process";
import propertiesReader from "properties-reader";
import { satisfies, coerce, maxSatisfying, clean, valid } from "semver";
import StreamZip from "node-stream-zip";
import { parseEDNString } from "edn-data";
import { PackageURL } from "packageurl-js";
import { getTreeWithPlugin } from "./piptree.js";
import iconv from "iconv-lite";

const selfPJson = JSON.parse(readFileSync(join(dirNameStr, "package.json")));
const _version = selfPJson.version;

// Refer to contrib/py-modules.py for a script to generate this list
// The script needs to be used once every few months to update this list
const PYTHON_STD_MODULES = JSON.parse(
  readFileSync(join(dirNameStr, "data", "python-stdlib.json"))
);
// Mapping between modules and package names
const PYPI_MODULE_PACKAGE_MAPPING = JSON.parse(
  readFileSync(join(dirNameStr, "data", "pypi-pkg-aliases.json"))
);

// Debug mode flag
export const DEBUG_MODE =
  process.env.CDXGEN_DEBUG_MODE === "debug" ||
  process.env.SCAN_DEBUG_MODE === "debug" ||
  process.env.SHIFTLEFT_LOGGING_LEVEL === "debug" ||
  process.env.NODE_ENV === "development";

// Timeout milliseconds. Default 10 mins
const TIMEOUT_MS = parseInt(process.env.CDXGEN_TIMEOUT_MS) || 10 * 60 * 1000;

// Metadata cache
let metadata_cache = {};

// Whether test scope shall be included for java/maven projects; default, if unset shall be 'true'
export const includeMavenTestScope =
  !process.env.CDX_MAVEN_INCLUDE_TEST_SCOPE ||
  ["true", "1"].includes(process.env.CDX_MAVEN_INCLUDE_TEST_SCOPE);

// Whether license information should be fetched
const fetchLicenses =
  process.env.FETCH_LICENSE &&
  ["true", "1"].includes(process.env.FETCH_LICENSE);

const MAX_LICENSE_ID_LENGTH = 100;

let PYTHON_CMD = "python";
if (process.env.PYTHON_CMD) {
  PYTHON_CMD = process.env.PYTHON_CMD;
}

// Custom user-agent for cdxgen
const cdxgenAgent = got.extend({
  headers: {
    "user-agent": `@CycloneDX/cdxgen ${_version}`
  }
});

/**
 * Method to get files matching a pattern
 *
 * @param {string} dirPath Root directory for search
 * @param {string} pattern Glob pattern (eg: *.gradle)
 */
export const getAllFiles = function (dirPath, pattern) {
  try {
    const ignoreList = [
      "**/.hg/**",
      "**/.git/**",
      "**/venv/**",
      "**/docs/**",
      "**/examples/**",
      "**/site-packages/**"
    ];
    // Only ignore node_modules if the caller is not looking for package.json
    if (!pattern.includes("package.json")) {
      ignoreList.push("**/node_modules/**");
    }
    return globSync(pattern, {
      cwd: dirPath,
      absolute: true,
      nocase: true,
      nodir: true,
      strict: true,
      dot: pattern.startsWith(".") ? true : false,
      follow: false,
      ignore: ignoreList
    });
  } catch (err) {
    if (DEBUG_MODE) {
      console.error(err);
    }
    return [];
  }
};

const toBase64 = (hexString) => {
  return Buffer.from(hexString, "hex").toString("base64");
};

/**
 * Performs a lookup + validation of the license specified in the
 * package. If the license is a valid SPDX license ID, set the 'id'
 * and url of the license object, otherwise, set the 'name' of the license
 * object.
 */
export function getLicenses(pkg, format = "xml") {
  let license = pkg.license && (pkg.license.type || pkg.license);
  if (license) {
    if (!Array.isArray(license)) {
      license = [license];
    }
    return license
      .map((l) => {
        let licenseContent = {};
        if (typeof l === "string" || l instanceof String) {
          if (
            spdxLicenses.some((v) => {
              return l === v;
            })
          ) {
            licenseContent.id = l;
            licenseContent.url = "https://opensource.org/licenses/" + l;
          } else if (l.startsWith("http")) {
            if (!l.includes("opensource.org")) {
              licenseContent.name = "CUSTOM";
            } else {
              const possibleId = l
                .replace("http://www.opensource.org/licenses/", "")
                .toUpperCase();
              spdxLicenses.forEach((v) => {
                if (v.toUpperCase() === possibleId) {
                  licenseContent.id = v;
                }
              });
            }
            if (l.includes("mit-license")) {
              licenseContent.id = "MIT";
            }
            // We always need a name to avoid validation errors
            // Issue: #469
            if (!licenseContent.name && !licenseContent.id) {
              licenseContent.name = "CUSTOM";
            }
            licenseContent.url = l;
          } else {
            licenseContent.name = l;
          }
        } else if (Object.keys(l).length) {
          licenseContent = l;
        } else {
          return [];
        }
        if (!licenseContent.id) {
          addLicenseText(pkg, l, licenseContent, format);
        }
        return licenseContent;
      })
      .map((l) => ({ license: l }));
  }
  return [];
}

/**
 * Tries to find a file containing the license text based on commonly
 * used naming and content types. If a candidate file is found, add
 * the text to the license text object and stop.
 */
export function addLicenseText(pkg, l, licenseContent, format = "xml") {
  const licenseFilenames = [
    "LICENSE",
    "License",
    "license",
    "LICENCE",
    "Licence",
    "licence",
    "NOTICE",
    "Notice",
    "notice"
  ];
  const licenseContentTypes = {
    "text/plain": "",
    "text/txt": ".txt",
    "text/markdown": ".md",
    "text/xml": ".xml"
  };
  /* Loops over different name combinations starting from the license specified
       naming (e.g., 'LICENSE.Apache-2.0') and proceeding towards more generic names. */
  for (const licenseName of [`.${l}`, ""]) {
    for (const licenseFilename of licenseFilenames) {
      for (const [licenseContentType, fileExtension] of Object.entries(
        licenseContentTypes
      )) {
        const licenseFilepath = `${pkg.realPath}/${licenseFilename}${licenseName}${fileExtension}`;
        if (existsSync(licenseFilepath)) {
          licenseContent.text = readLicenseText(
            licenseFilepath,
            licenseContentType,
            format
          );
          return;
        }
      }
    }
  }
}

/**
 * Read the file from the given path to the license text object and includes
 * content-type attribute, if not default. Returns the license text object.
 */
export function readLicenseText(
  licenseFilepath,
  licenseContentType,
  format = "xml"
) {
  const licenseText = readFileSync(licenseFilepath, "utf8");
  if (licenseText) {
    if (format === "xml") {
      const licenseContentText = { "#cdata": licenseText };
      if (licenseContentType !== "text/plain") {
        licenseContentText["@content-type"] = licenseContentType;
      }
      return licenseContentText;
    } else {
      const licenseContentText = { content: licenseText };
      if (licenseContentType !== "text/plain") {
        licenseContentText["contentType"] = licenseContentType;
      }
      return licenseContentText;
    }
  }
  return null;
}

/**
 * Method to retrieve metadata for npm packages by querying npmjs
 *
 * @param {Array} pkgList Package list
 */
export const getNpmMetadata = async function (pkgList) {
  const NPM_URL = "https://registry.npmjs.org/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      let key = p.name;
      if (p.group && p.group !== "") {
        let group = p.group;
        if (!group.startsWith("@")) {
          group = "@" + group;
        }
        key = group + "/" + p.name;
      }
      let body = {};
      if (metadata_cache[key]) {
        body = metadata_cache[key];
      } else {
        const res = await cdxgenAgent.get(NPM_URL + key, {
          responseType: "json"
        });
        body = res.body;
        metadata_cache[key] = body;
      }
      p.description = body.description;
      p.license = body.license;
      if (body.repository && body.repository.url) {
        p.repository = { url: body.repository.url };
      }
      if (body.homepage) {
        p.homepage = { url: body.homepage };
      }
      cdepList.push(p);
    } catch (err) {
      cdepList.push(p);
      if (DEBUG_MODE) {
        console.error(p, "was not found on npm");
      }
    }
  }
  return cdepList;
};

const _getDepPkgList = async function (
  pkgLockFile,
  pkgList,
  depKeys,
  pkg,
  versionCache
) {
  const pkgDependencies = {
    ...(pkg.packages || {}),
    ...(pkg.dependencies || {})
  };
  if (pkg.packages) {
    for (const k in pkg.packages) {
      if (k === "") {
        continue;
      }
      const pl = pkg.packages[k];
      versionCache[k] = pl.version;
      versionCache[k.replaceAll("node_modules/", "")] = pl.version;
    }
  }
  if (pkg && pkgDependencies) {
    const pkgKeys = Object.keys(pkgDependencies);
    for (const k of pkgKeys) {
      // Skip the root package in lockFileVersion 3 and above
      if (k === "") {
        continue;
      }
      const name = k;
      let version = pkgDependencies[name].version;
      if (!version && versionCache[k]) {
        version = versionCache[k];
      }
      if (!version && pkgDependencies["node_modules/" + name]) {
        version = pkgDependencies["node_modules/" + name].version;
      }
      const purl = new PackageURL(
        "npm",
        "",
        name.replaceAll("node_modules/", ""),
        version,
        null,
        null
      );
      const purlString = decodeURIComponent(purl.toString());
      const scope = pkgDependencies[name].dev === true ? "optional" : undefined;
      const apkg = {
        name: name.replaceAll("node_modules/", ""),
        version,
        _integrity: pkgDependencies[name].integrity,
        scope,
        properties: [
          {
            name: "SrcFile",
            value: pkgLockFile
          }
        ],
        evidence: {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: pkgLockFile
              }
            ]
          }
        }
      };
      pkgList.push(apkg);
      if (pkgDependencies[name].dependencies) {
        // Include child dependencies
        const dependencies = pkgDependencies[name].dependencies;
        const pkgDepKeys = Object.keys(dependencies);
        const deplist = [];
        for (const j in pkgDepKeys) {
          const depName = pkgDepKeys[j];
          const depVersion =
            versionCache[depName] || dependencies[depName].version;
          if (!depVersion) {
            continue;
          }
          const deppurl = new PackageURL(
            "npm",
            "",
            depName.replaceAll("node_modules/", ""),
            depVersion,
            null,
            null
          );
          const deppurlString = decodeURIComponent(deppurl.toString());
          deplist.push(deppurlString);
        }
        depKeys[purlString] = (depKeys[purlString] || []).concat(deplist);
        if (pkg.lockfileVersion && pkg.lockfileVersion >= 3) {
          // Do not recurse for lock file v3 and above
        } else {
          await _getDepPkgList(
            pkgLockFile,
            pkgList,
            depKeys,
            pkgDependencies[name],
            versionCache
          );
        }
      } else if (!depKeys[purlString]) {
        depKeys[purlString] = [];
      }
    }
  }
  return pkgList;
};

/**
 * Parse nodejs package json file
 *
 * @param {string} pkgJsonFile package.json file
 */
export const parsePkgJson = async (pkgJsonFile) => {
  const pkgList = [];
  if (existsSync(pkgJsonFile)) {
    try {
      const pkgData = JSON.parse(readFileSync(pkgJsonFile, "utf8"));
      const pkgIdentifier = parsePackageJsonName(pkgData.name);
      const name = pkgIdentifier.fullName || pkgData.name;
      const group = pkgIdentifier.scope || "";
      const purl = new PackageURL(
        "npm",
        group,
        name,
        pkgData.version,
        null,
        null
      ).toString();
      pkgList.push({
        name,
        group,
        version: pkgData.version,
        "bom-ref": decodeURIComponent(purl),
        properties: [
          {
            name: "SrcFile",
            value: pkgJsonFile
          }
        ],
        evidence: {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: pkgJsonFile
              }
            ]
          }
        }
      });
    } catch (err) {
      // continue regardless of error
    }
  }
  if (fetchLicenses && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parsePkgJson`
      );
    }
    return await getNpmMetadata(pkgList);
  }
  return pkgList;
};

/**
 * Parse nodejs package lock file
 *
 * @param {string} pkgLockFile package-lock.json file
 * @param {object} options Command line options
 */
export const parsePkgLock = async (pkgLockFile, options = {}) => {
  let pkgList = [];
  const dependenciesList = [];
  const depKeys = {};
  let rootPkg = {};
  const versionCache = {};
  if (!options) {
    options = {};
  }
  if (existsSync(pkgLockFile)) {
    const lockData = JSON.parse(readFileSync(pkgLockFile, "utf8"));
    rootPkg.name = lockData.name || "";
    // lockfile v2 onwards
    if (lockData.name && lockData.packages && lockData.packages[""]) {
      // Build the initial dependency tree for the root package
      rootPkg = {
        group: options.projectGroup || "",
        name: options.projectName || lockData.name,
        version: options.projectVersion || lockData.version,
        type: "application",
        "bom-ref": decodeURIComponent(
          new PackageURL(
            "npm",
            options.projectGroup || "",
            options.projectName || lockData.name,
            options.projectVersion || lockData.version,
            null,
            null
          ).toString()
        )
      };
    } else if (lockData.lockfileVersion === 1) {
      let dirName = dirname(pkgLockFile);
      const tmpA = dirName.split(_sep);
      dirName = tmpA[tmpA.length - 1];
      // v1 lock file
      rootPkg = {
        group: options.projectGroup || "",
        name: options.projectName || lockData.name || dirName,
        version: options.projectVersion || lockData.version || "",
        type: "npm"
      };
    }
    if (rootPkg && rootPkg.name) {
      const purl = new PackageURL(
        "npm",
        "",
        rootPkg.name,
        rootPkg.version,
        null,
        null
      );
      const purlString = decodeURIComponent(purl.toString());
      rootPkg["bom-ref"] = purlString;
      pkgList.push(rootPkg);
      // npm ls command seems to include both dependencies and devDependencies
      // For tree purposes, including only the dependencies should be enough
      let rootPkgDeps = [];
      if (
        lockData.packages &&
        lockData.packages[""] &&
        lockData.packages[""].dependencies
      ) {
        rootPkgDeps =
          Object.keys(lockData.packages[""].dependencies || {}) || [];
      } else if (lockData.dependencies) {
        rootPkgDeps = Object.keys(lockData.dependencies || {}) || [];
      }
      const deplist = [];
      for (const rd of rootPkgDeps) {
        let resolvedVersion = undefined;
        if (lockData.packages) {
          resolvedVersion = (lockData.packages[`node_modules/${rd}`] || {})
            .version;
        } else if (lockData.dependencies) {
          resolvedVersion = lockData.dependencies[rd].version;
        }
        if (resolvedVersion) {
          const dpurl = decodeURIComponent(
            new PackageURL(
              "npm",
              "",
              rd,
              resolvedVersion,
              null,
              null
            ).toString()
          );
          deplist.push(dpurl);
        }
      }
      dependenciesList.push({
        ref: purlString,
        dependsOn: deplist
      });
    }
    pkgList = await _getDepPkgList(
      pkgLockFile,
      pkgList,
      depKeys,
      lockData,
      versionCache
    );
  }
  for (const dk of Object.keys(depKeys)) {
    dependenciesList.push({
      ref: dk,
      dependsOn: depKeys[dk] || []
    });
  }
  if (fetchLicenses && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parsePkgLock`
      );
    }
    pkgList = await getNpmMetadata(pkgList);
    return { pkgList, dependenciesList };
  }
  return {
    pkgList,
    dependenciesList
  };
};

/**
 * Given a lock file this method would return an Object with the identiy as the key and parsed name and value
 * eg: "@actions/core@^1.2.6", "@actions/core@^1.6.0":
 *        version "1.6.0"
 * would result in two entries
 *
 * @param {string} lockData Yarn Lockfile data
 */
export const yarnLockToIdentMap = function (lockData) {
  const identMap = {};
  let currentIdents = [];
  lockData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (l === "\n" || l.startsWith("#")) {
      return;
    }
    // "@actions/core@^1.2.6", "@actions/core@^1.6.0":
    if (!l.startsWith(" ") && l.trim().length > 0) {
      const tmpA = l.replace(/["']/g, "").split(", ");
      if (tmpA && tmpA.length) {
        for (let s of tmpA) {
          if (!s.startsWith("__")) {
            if (s.endsWith(":")) {
              s = s.substring(0, s.length - 1);
            }
            // Non-strict mode parsing
            const match = s.match(/^(?:(@[^/]+?)\/)?([^/]+?)(?:@(.+))?$/);
            if (!match) {
              continue;
            }
            let [, group, name, range] = match;
            if (group) {
              group = `${group}/`;
            }
            if (range && range.startsWith("npm:")) {
              range = range.replace("npm:", "");
            }
            currentIdents.push(`${group || ""}${name}|${range}`);
          }
        }
      }
    } else if (l.startsWith("  version") && currentIdents.length) {
      const tmpA = l.replace(/["']/g, "").split(" ");
      const version = tmpA[tmpA.length - 1].trim();
      for (const id of currentIdents) {
        identMap[id] = version;
      }
      currentIdents = [];
    }
  });
  return identMap;
};

/**
 * Parse nodejs yarn lock file
 *
 * @param {string} yarnLockFile yarn.lock file
 */
export const parseYarnLock = async function (yarnLockFile) {
  let pkgList = [];
  const dependenciesList = [];
  const depKeys = {};
  if (existsSync(yarnLockFile)) {
    const lockData = readFileSync(yarnLockFile, "utf8");
    let name = "";
    let group = "";
    let version = "";
    let integrity = "";
    let depsMode = false;
    let purlString = "";
    let deplist = [];
    // This would have the keys and the resolved version required to solve the dependency tree
    const identMap = yarnLockToIdentMap(lockData);
    let prefixAtSymbol = false;
    lockData.split("\n").forEach((l) => {
      l = l.replace("\r", "");
      if (l === "\n" || l.startsWith("#")) {
        return;
      }
      if (!l.startsWith(" ")) {
        // Create an entry for the package and reset variables
        if (
          name !== "" &&
          version !== "" &&
          (integrity !== "" || version.includes("local"))
        ) {
          // Create a purl ref for the current package
          purlString = new PackageURL(
            "npm",
            group,
            name,
            version,
            null,
            null
          ).toString();
          pkgList.push({
            group: group || "",
            name: name,
            version: version,
            _integrity: integrity,
            properties: [
              {
                name: "SrcFile",
                value: yarnLockFile
              }
            ],
            evidence: {
              identity: {
                field: "purl",
                confidence: 1,
                methods: [
                  {
                    technique: "manifest-analysis",
                    confidence: 1,
                    value: yarnLockFile
                  }
                ]
              }
            }
          });
          // Reset all the variables
          group = "";
          name = "";
          version = "";
          integrity = "";
        }
        if (purlString && purlString !== "" && !depKeys[purlString]) {
          // Create an entry for dependencies
          dependenciesList.push({
            ref: decodeURIComponent(purlString),
            dependsOn: deplist
          });
          depKeys[purlString] = true;
          deplist = [];
          purlString = "";
          depsMode = false;
        }
        // Collect the group and the name
        l = l.replace(/["']/g, "");
        prefixAtSymbol = l.startsWith("@");
        const tmpA = l.split("@");
        // ignore possible leading empty strings
        if (tmpA[0] === "") {
          tmpA.shift();
        }
        if (tmpA.length >= 2) {
          const fullName = tmpA[0];
          if (fullName.indexOf("/") > -1) {
            const parts = fullName.split("/");
            group = (prefixAtSymbol ? "@" : "") + parts[0];
            name = parts[1];
          } else {
            name = fullName;
          }
        }
      } else if (name !== "" && l.startsWith("  dependencies:")) {
        depsMode = true;
      } else if (depsMode && l.startsWith("    ")) {
        // Given "@actions/http-client" "^1.0.11"
        // We need the resolved version from identMap
        const tmpA = l.trim().replace(/["']/g, "").split(" ");
        if (tmpA && tmpA.length === 2) {
          let dgroupname = tmpA[0];
          if (dgroupname.endsWith(":")) {
            dgroupname = dgroupname.substring(0, dgroupname.length - 1);
          }
          const resolvedVersion = identMap[`${dgroupname}|${tmpA[1]}`];
          const depPurlString = new PackageURL(
            "npm",
            null,
            dgroupname,
            resolvedVersion,
            null,
            null
          ).toString();
          deplist.push(decodeURIComponent(depPurlString));
        }
      } else if (name !== "") {
        if (!l.startsWith("    ")) {
          depsMode = false;
        }
        l = l.trim();
        const parts = l.split(" ");
        if (l.startsWith("version")) {
          version = parts[1].replace(/"/g, "");
        }
        if (l.startsWith("integrity")) {
          integrity = parts[1];
        }
        // checksum used by yarn 2/3 is hex encoded
        if (l.startsWith("checksum")) {
          integrity =
            "sha512-" + Buffer.from(parts[1], "hex").toString("base64");
        }
        if (l.startsWith("resolved")) {
          const tmpB = parts[1].split("#");
          if (tmpB.length > 1) {
            const digest = tmpB[1].replace(/"/g, "");
            integrity = "sha256-" + digest;
          }
        }
      }
    });
  }
  if (fetchLicenses && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parseYarnLock`
      );
    }
    pkgList = await getNpmMetadata(pkgList);
    return {
      pkgList,
      dependenciesList
    };
  }
  return {
    pkgList,
    dependenciesList
  };
};

/**
 * Parse nodejs shrinkwrap deps file
 *
 * @param {string} swFile shrinkwrap-deps.json file
 */
export const parseNodeShrinkwrap = async function (swFile) {
  const pkgList = [];
  if (existsSync(swFile)) {
    const lockData = JSON.parse(readFileSync(swFile, "utf8"));
    const pkgKeys = Object.keys(lockData);
    for (const k in pkgKeys) {
      const fullName = pkgKeys[k];
      const integrity = lockData[fullName];
      const parts = fullName.split("@");
      if (parts && parts.length) {
        let name = "";
        let version = "";
        let group = "";
        if (parts.length === 2) {
          name = parts[0];
          version = parts[1];
        } else if (parts.length === 3) {
          if (parts[0] === "") {
            const gnameparts = parts[1].split("/");
            group = gnameparts[0];
            name = gnameparts[1];
          } else {
            name = parts[0];
          }
          version = parts[2];
        }
        pkgList.push({
          group: group,
          name: name,
          version: version,
          _integrity: integrity,
          properties: [
            {
              name: "SrcFile",
              value: swFile
            }
          ],
          evidence: {
            identity: {
              field: "purl",
              confidence: 1,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 1,
                  value: swFile
                }
              ]
            }
          }
        });
      }
    }
  }
  if (fetchLicenses && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parseNodeShrinkwrap`
      );
    }
    return await getNpmMetadata(pkgList);
  }
  return pkgList;
};

/**
 * Parse nodejs pnpm lock file
 *
 * @param {string} pnpmLock pnpm-lock.yaml file
 */
export const parsePnpmLock = async function (pnpmLock, parentComponent = null) {
  let pkgList = [];
  const dependenciesList = [];
  let ppurl = "";
  if (parentComponent && parentComponent.name) {
    ppurl =
      parentComponent.purl ||
      new PackageURL(
        "npm",
        parentComponent.group,
        parentComponent.name,
        parentComponent.version,
        null,
        null
      ).toString();
  }
  if (existsSync(pnpmLock)) {
    const lockData = readFileSync(pnpmLock, "utf8");
    const yamlObj = _load(lockData);
    if (!yamlObj) {
      return {};
    }
    // This logic matches the pnpm list command to include only direct dependencies
    if (ppurl !== "") {
      const ddeps = yamlObj.dependencies || {};
      const ddeplist = [];
      for (const dk of Object.keys(ddeps)) {
        let version = ddeps[dk];
        if (typeof version === "object" && version.version) {
          version = version.version;
        }
        const dpurl = new PackageURL(
          "npm",
          "",
          dk,
          version,
          null,
          null
        ).toString();
        ddeplist.push(decodeURIComponent(dpurl));
      }
      dependenciesList.push({
        ref: decodeURIComponent(ppurl),
        dependsOn: ddeplist
      });
    }
    let lockfileVersion = yamlObj.lockfileVersion;
    try {
      lockfileVersion = parseInt(lockfileVersion, 10);
    } catch (e) {
      // ignore parse errors
    }
    const packages = yamlObj.packages;
    const pkgKeys = Object.keys(packages);
    for (const k in pkgKeys) {
      // Eg: @babel/code-frame/7.10.1
      // In lockfileVersion 6, /@babel/code-frame@7.18.6
      let fullName = pkgKeys[k].replace("/@", "@");
      // Handle /vite@4.2.1(@types/node@18.15.11) in lockfileVersion 6
      if (lockfileVersion >= 6 && fullName.includes("(")) {
        fullName = fullName.split("(")[0];
      }
      const parts = fullName.split("/");
      const integrity = packages[pkgKeys[k]].resolution.integrity;
      const deps = packages[pkgKeys[k]].dependencies || [];
      const scope = packages[pkgKeys[k]].dev === true ? "optional" : undefined;
      if (parts && parts.length) {
        let name = "";
        let version = "";
        let group = "";
        if (lockfileVersion >= 6 && fullName.includes("@")) {
          const tmpA = parts[parts.length - 1].split("@");
          group = parts[0];
          if (parts.length === 2 && tmpA.length > 1) {
            name = tmpA[0];
            version = tmpA[1];
          } else {
            console.log(parts, fullName);
          }
        } else {
          if (parts.length === 2) {
            name = parts[0];
            version = parts[1];
          } else if (parts.length === 3) {
            group = parts[0];
            name = parts[1];
            version = parts[2];
          }
        }
        // Let's have some warnings till we fully support pnpm 8
        if (!name) {
          console.warn(
            `Unable to extract name and version for string ${pkgKeys[k]}`
          );
          continue;
        }
        if (name.indexOf("file:") !== 0) {
          const purlString = new PackageURL(
            "npm",
            group,
            name,
            version,
            null,
            null
          ).toString();
          const deplist = [];
          for (const dpkgName of Object.keys(deps)) {
            const dpurlString = new PackageURL(
              "npm",
              "",
              dpkgName,
              deps[dpkgName],
              null,
              null
            ).toString();
            deplist.push(decodeURIComponent(dpurlString));
          }
          dependenciesList.push({
            ref: decodeURIComponent(purlString),
            dependsOn: deplist
          });
          pkgList.push({
            group: group,
            name: name,
            version: version,
            scope,
            _integrity: integrity,
            properties: [
              {
                name: "SrcFile",
                value: pnpmLock
              }
            ],
            evidence: {
              identity: {
                field: "purl",
                confidence: 1,
                methods: [
                  {
                    technique: "manifest-analysis",
                    confidence: 1,
                    value: pnpmLock
                  }
                ]
              }
            }
          });
        }
      }
    }
  }
  if (fetchLicenses && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parsePnpmLock`
      );
    }
    pkgList = await getNpmMetadata(pkgList);
    return {
      pkgList,
      dependenciesList
    };
  }
  return {
    pkgList,
    dependenciesList
  };
};

/**
 * Parse bower json file
 *
 * @param {string} bowerJsonFile bower.json file
 */
export const parseBowerJson = async (bowerJsonFile) => {
  const pkgList = [];
  if (existsSync(bowerJsonFile)) {
    try {
      const pkgData = JSON.parse(readFileSync(bowerJsonFile, "utf8"));
      const pkgIdentifier = parsePackageJsonName(pkgData.name);
      pkgList.push({
        name: pkgIdentifier.fullName || pkgData.name,
        group: pkgIdentifier.scope || "",
        version: pkgData.version || "",
        description: pkgData.description || "",
        license: pkgData.license || "",
        properties: [
          {
            name: "SrcFile",
            value: bowerJsonFile
          }
        ],
        evidence: {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: bowerJsonFile
              }
            ]
          }
        }
      });
    } catch (err) {
      // continue regardless of error
    }
  }
  if (fetchLicenses && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parseBowerJson`
      );
    }
    return await getNpmMetadata(pkgList);
  }
  return pkgList;
};

/**
 * Parse minified js file
 *
 * @param {string} minJsFile min.js file
 */
export const parseMinJs = async (minJsFile) => {
  const pkgList = [];
  if (existsSync(minJsFile)) {
    try {
      const rawData = readFileSync(minJsFile, { encoding: "utf-8" });
      const tmpA = rawData.split("\n");
      tmpA.forEach((l) => {
        if ((l.startsWith("/*!") || l.startsWith("  * ")) && l.length < 500) {
          let delimiter = "  * ";
          if (!l.includes(delimiter) && l.includes("/*!")) {
            delimiter = "/*!";
          }
          if (!l.includes(delimiter) && l.includes(" - ")) {
            delimiter = " - ";
          }
          const tmpPV = l.split(delimiter);
          if (!tmpPV || tmpPV.length < 2) {
            return;
          }
          // Eg: jQuery v3.6.0
          const pkgNameVer = tmpPV[1]
            .replace("/*!", "")
            .replace("  * ", "")
            .trim();
          const tmpB = pkgNameVer.includes(" - ")
            ? pkgNameVer.split(" - ")
            : pkgNameVer.split(" ");
          if (tmpB && tmpB.length > 1) {
            // Fix #223 - lowercase parsed package name
            const name = tmpB[0].replace(/ /g, "-").trim().toLowerCase();
            if (
              ["copyright", "author", "licensed"].includes(name.toLowerCase())
            ) {
              return;
            }
            const pkgIdentifier = parsePackageJsonName(name);
            if (pkgIdentifier.fullName != "") {
              pkgList.push({
                name: pkgIdentifier.fullName,
                group: pkgIdentifier.scope || "",
                version: tmpB[1].replace(/^v/, "") || "",
                properties: [
                  {
                    name: "SrcFile",
                    value: minJsFile
                  }
                ],
                evidence: {
                  identity: {
                    field: "purl",
                    confidence: 0.25,
                    methods: [
                      {
                        technique: "filename",
                        confidence: 0.25,
                        value: minJsFile
                      }
                    ]
                  }
                }
              });
            }
            return;
          }
        }
      });
    } catch (err) {
      // continue regardless of error
    }
  }
  if (fetchLicenses && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parseMinJs`
      );
    }
    return await getNpmMetadata(pkgList);
  }
  return pkgList;
};

/**
 * Parse pom file
 *
 * @param {string} pom file to parse
 */
export const parsePom = function (pomFile) {
  const deps = [];
  const xmlData = readFileSync(pomFile);
  const project = xml2js(xmlData, {
    compact: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value"
  }).project;
  if (project && project.dependencies) {
    let dependencies = project.dependencies.dependency;
    // Convert to an array
    if (!dependencies) {
      dependencies = [];
    } else if (dependencies && !Array.isArray(dependencies)) {
      dependencies = [dependencies];
    }
    for (const adep of dependencies) {
      const version = adep.version;
      let versionStr = undefined;
      if (version && version._ && version._.indexOf("$") == -1) {
        versionStr = version._;
        if (includeMavenTestScope || !adep.scope || adep.scope !== "test")
          deps.push({
            group: adep.groupId ? adep.groupId._ : "",
            name: adep.artifactId ? adep.artifactId._ : "",
            version: versionStr,
            qualifiers: { type: "jar" },
            properties: [
              {
                name: "SrcFile",
                value: pomFile
              }
            ],
            evidence: {
              identity: {
                field: "purl",
                confidence: 1,
                methods: [
                  {
                    technique: "manifest-analysis",
                    confidence: 1,
                    value: pomFile
                  }
                ]
              }
            }
          });
      }
    }
  }
  return deps;
};

/**
 * Parse maven tree output
 * @param {string} rawOutput Raw string output
 */
export const parseMavenTree = function (rawOutput) {
  if (!rawOutput) {
    return {};
  }
  const deps = [];
  const dependenciesList = [];
  const keys_cache = {};
  const level_trees = {};
  const tmpA = rawOutput.split("\n");
  let last_level = 0;
  let last_purl = "";
  const stack = [];
  tmpA.forEach((l) => {
    l = l.replace("\r", "");
    if (!includeMavenTestScope && l.trim().endsWith(":test")) {
      return;
    }
    let level = 0;
    const tmpline = l.split(" ");
    if (tmpline && tmpline.length) {
      if (l.includes(" ")) {
        level = l.replace(tmpline[tmpline.length - 1], "").length / 3;
      }
      l = tmpline[tmpline.length - 1];
      const pkgArr = l.split(":");
      if (pkgArr && pkgArr.length > 2) {
        let versionStr = pkgArr[pkgArr.length - 2];
        if (pkgArr.length == 4) {
          versionStr = pkgArr[pkgArr.length - 1];
        }
        const key = pkgArr[0] + "-" + pkgArr[1] + "-" + versionStr;
        if (!keys_cache[key]) {
          keys_cache[key] = key;
          let purlString = new PackageURL(
            "maven",
            pkgArr[0],
            pkgArr[1],
            versionStr,
            { type: pkgArr[2] },
            null
          ).toString();
          purlString = decodeURIComponent(purlString);
          deps.push({
            group: pkgArr[0],
            name: pkgArr[1],
            version: versionStr,
            qualifiers: { type: pkgArr[2] }
          });
          if (!level_trees[purlString]) {
            level_trees[purlString] = [];
          }
          if (level == 0 || last_purl === "") {
            stack.push(purlString);
          } else if (level > last_level) {
            const cnodes = level_trees[last_purl] || [];
            cnodes.push(purlString);
            level_trees[last_purl] = cnodes;
            if (stack[stack.length - 1] !== purlString) {
              stack.push(purlString);
            }
          } else {
            for (let i = level; i <= last_level; i++) {
              stack.pop();
            }
            const last_stack = stack[stack.length - 1];
            const cnodes = level_trees[last_stack] || [];
            cnodes.push(purlString);
            level_trees[last_stack] = cnodes;
            stack.push(purlString);
          }
          last_level = level;
          last_purl = purlString;
        }
      }
    }
  });
  for (const lk of Object.keys(level_trees)) {
    dependenciesList.push({
      ref: lk,
      dependsOn: level_trees[lk]
    });
  }
  return {
    pkgList: deps,
    dependenciesList
  };
};

/**
 * Parse gradle dependencies output
 * @param {string} rawOutput Raw string output
 * @param {string} rootProjectGroup Root project group
 * @param {string} rootProjectName Root project name
 * @param {string} rootProjectVersion Root project version
 */
export const parseGradleDep = function (
  rawOutput,
  rootProjectGroup = "",
  rootProjectName = "root",
  rootProjectVersion = "latest"
) {
  if (typeof rawOutput === "string") {
    // Bug: 249. Get any sub-projects refered here
    const retMap = parseGradleProjects(rawOutput);
    // Issue #289. Work hard to find the root project name
    if (
      !rootProjectName ||
      (rootProjectName === "root" &&
        retMap &&
        retMap.rootProject &&
        retMap.rootProject !== "root")
    ) {
      rootProjectName = retMap.rootProject;
    }
    let match = "";
    // To render dependency tree we need a root project
    const rootProject = {
      group: rootProjectGroup || "",
      name: rootProjectName,
      version: rootProjectVersion,
      type: "maven",
      qualifiers: { type: "jar" }
    };
    const deps = [];
    const dependenciesList = [];
    const keys_cache = {};
    const deps_keys_cache = {};
    let last_level = 0;
    let last_purl = decodeURIComponent(
      new PackageURL(
        "maven",
        rootProject.group,
        rootProject.name,
        rootProject.version,
        rootProject.qualifiers,
        null
      ).toString()
    );
    const first_purl = last_purl;
    let last_project_purl = first_purl;
    const level_trees = {};
    level_trees[last_purl] = [];
    let scope = undefined;
    let profileName = undefined;
    if (retMap && retMap.projects) {
      const subDependsOn = [];
      for (const sd of retMap.projects) {
        subDependsOn.push(
          decodeURIComponent(
            new PackageURL(
              "maven",
              rootProjectGroup,
              sd.replace(":", ""),
              rootProject.version,
              rootProject.qualifiers,
              null
            ).toString()
          )
        );
      }
      level_trees[last_purl] = subDependsOn;
    }
    let stack = [last_purl];
    const depRegex =
      /^.*?--- +(?<groupspecified>[^\s:]+) ?:(?<namespecified>[^\s:]+)(?::(?:{strictly [[]?)?(?<versionspecified>[^,\s:}]+))?(?:})?(?:[^->]* +-> +(?:(?<groupoverride>[^\s:]+):(?<nameoverride>[^\s:]+):)?(?<versionoverride>[^\s:]+))?/gm;
    for (let rline of rawOutput.split("\n")) {
      if (!rline) {
        continue;
      }
      rline = rline.replace("\r", "");
      if (
        (rline.startsWith("+--- ") || rline.startsWith("\\--- ")) &&
        rline.includes("{strictly") &&
        rline.includes("(c)")
      ) {
        continue;
      }
      if (
        rline.trim() === "" ||
        rline.startsWith("+--- ") ||
        rline.startsWith("\\--- ")
      ) {
        last_level = 1;
        last_project_purl = first_purl;
        last_purl = last_project_purl;
        stack = [first_purl];
      }
      if (rline.includes(" - ")) {
        profileName = rline.split(" - ")[0];
        if (profileName.toLowerCase().includes("test")) {
          scope = "optional";
        } else if (profileName.toLowerCase().includes("runtime")) {
          scope = "required";
        } else {
          scope = undefined;
        }
      }
      while ((match = depRegex.exec(rline))) {
        const [
          line,
          groupspecified,
          namespecified,
          versionspecified,
          groupoverride,
          nameoverride,
          versionoverride
        ] = match;
        let group = groupoverride || groupspecified;
        let name = nameoverride || namespecified;
        let version = versionoverride || versionspecified;
        const level = line.split(groupspecified)[0].length / 5;
        if (version !== undefined || group === "project") {
          // Project line has no version
          // For multi sub-module projects such as :module:dummy:starter the regex is producing incorrect values
          if (rline.includes("project ")) {
            const tmpA = rline.split("project ");
            if (tmpA && tmpA.length > 1) {
              group = rootProjectGroup;
              name = tmpA[1].split(" ")[0].replace(/^:/, "");
              version = undefined;
            }
          }
          let purlString = new PackageURL(
            "maven",
            group !== "project" ? group : rootProjectGroup,
            name,
            version !== undefined ? version : rootProjectVersion,
            { type: "jar" },
            null
          ).toString();
          purlString = decodeURIComponent(purlString);
          keys_cache[purlString + "_" + last_purl] = true;
          // Filter duplicates
          if (!deps_keys_cache[purlString]) {
            deps_keys_cache[purlString] = true;
            const adep = {
              group: group !== "project" ? group : rootProjectGroup,
              name: name,
              version: version !== undefined ? version : rootProjectVersion,
              qualifiers: { type: "jar" }
            };
            adep["purl"] = purlString;
            adep["bom-ref"] = purlString;
            if (scope) {
              adep["scope"] = scope;
            }
            if (profileName) {
              adep.properties = [
                {
                  name: "GradleProfileName",
                  value: profileName
                }
              ];
            }
            deps.push(adep);
          }
          if (!level_trees[purlString]) {
            level_trees[purlString] = [];
          }
          if (level == 0) {
            stack = [first_purl];
            stack.push(purlString);
          } else if (last_purl === "") {
            stack.push(purlString);
          } else if (level > last_level) {
            const cnodes = level_trees[last_purl] || [];
            if (!cnodes.includes(purlString)) {
              cnodes.push(purlString);
            }
            level_trees[last_purl] = cnodes;
            if (stack[stack.length - 1] !== purlString) {
              stack.push(purlString);
            }
          } else {
            for (let i = level; i <= last_level; i++) {
              stack.pop();
            }
            const last_stack =
              stack.length > 0 ? stack[stack.length - 1] : last_project_purl;
            const cnodes = level_trees[last_stack] || [];
            if (!cnodes.includes(purlString)) {
              cnodes.push(purlString);
            }
            level_trees[last_stack] = cnodes;
            stack.push(purlString);
          }
          last_level = level;
          last_purl = purlString;
        }
      }
    }
    for (const lk of Object.keys(level_trees)) {
      dependenciesList.push({
        ref: lk,
        dependsOn: level_trees[lk]
      });
    }
    return {
      pkgList: deps,
      dependenciesList
    };
  }
  return {};
};

/**
 * Parse clojure cli dependencies output
 * @param {string} rawOutput Raw string output
 */
export const parseCljDep = function (rawOutput) {
  if (typeof rawOutput === "string") {
    const deps = [];
    const keys_cache = {};
    const tmpA = rawOutput.split("\n");
    tmpA.forEach((l) => {
      l = l.trim();
      if (!l.startsWith("Downloading") || !l.startsWith("X ")) {
        if (l.startsWith(". ")) {
          l = l.replace(". ", "");
        }
        const tmpArr = l.split(" ");
        if (tmpArr.length == 2) {
          let group = dirname(tmpArr[0]);
          if (group === ".") {
            group = "";
          }
          const name = basename(tmpArr[0]);
          const version = tmpArr[1];
          const cacheKey = group + "-" + name + "-" + version;
          if (!keys_cache[cacheKey]) {
            keys_cache[cacheKey] = true;
            deps.push({
              group,
              name,
              version
            });
          }
        }
      }
    });
    return deps;
  }
  return [];
};

/**
 * Parse lein dependency tree output
 * @param {string} rawOutput Raw string output
 */
export const parseLeinDep = function (rawOutput) {
  if (typeof rawOutput === "string") {
    const deps = [];
    const keys_cache = {};
    if (rawOutput.includes("{[") && !rawOutput.startsWith("{[")) {
      rawOutput = "{[" + rawOutput.split("{[")[1];
    }
    const ednData = parseEDNString(rawOutput);
    return parseLeinMap(ednData, keys_cache, deps);
  }
  return [];
};

export const parseLeinMap = function (node, keys_cache, deps) {
  if (node["map"]) {
    for (const n of node["map"]) {
      if (n.length === 2) {
        const rootNode = n[0];
        const psym = rootNode[0].sym;
        const version = rootNode[1];
        let group = dirname(psym);
        if (group === ".") {
          group = "";
        }
        const name = basename(psym);
        const cacheKey = group + "-" + name + "-" + version;
        if (!keys_cache[cacheKey]) {
          keys_cache[cacheKey] = true;
          deps.push({ group, name, version });
        }
        if (n[1]) {
          parseLeinMap(n[1], keys_cache, deps);
        }
      }
    }
  }
  return deps;
};

/**
 * Parse gradle projects output
 *
 * @param {string} rawOutput Raw string output
 */
export const parseGradleProjects = function (rawOutput) {
  let rootProject = "root";
  const projects = new Set();
  if (typeof rawOutput === "string") {
    const tmpA = rawOutput.split("\n");
    tmpA.forEach((l) => {
      l = l.replace("\r", "");
      if (l.startsWith("Root project ")) {
        rootProject = l
          .split("Root project ")[1]
          .split(" ")[0]
          .replace(/'/g, "");
      } else if (l.includes("--- Project")) {
        const tmpB = l.split("Project ");
        if (tmpB && tmpB.length > 1) {
          const projName = tmpB[1].split(" ")[0].replace(/'/g, "");
          // Include all projects including test projects
          if (projName.startsWith(":")) {
            // Handle the case where the project name could have a space. Eg: +--- project :app (*)
            projects.add(projName.split(" ")[0]);
          }
        }
      } else if (l.includes("--- project ")) {
        const tmpB = l.split("--- project ");
        if (tmpB && tmpB.length > 1) {
          const projName = tmpB[1];
          if (projName.startsWith(":")) {
            projects.add(projName.split(" ")[0]);
          }
        }
      }
    });
  }
  return {
    rootProject,
    projects: Array.from(projects)
  };
};

/**
 * Parse gradle properties output
 *
 * @param {string} rawOutput Raw string output
 */
export const parseGradleProperties = function (rawOutput) {
  let rootProject = "root";
  const projects = new Set();
  const metadata = { group: "", version: "latest", properties: [] };
  if (typeof rawOutput === "string") {
    const tmpA = rawOutput.split("\n");
    tmpA.forEach((l) => {
      l = l.replace("\r", "");
      if (l.startsWith("----") || l.startsWith(">") || !l.includes(": ")) {
        return;
      }
      const tmpB = l.split(": ");
      if (tmpB && tmpB.length === 2) {
        if (tmpB[0] === "name") {
          rootProject = tmpB[1].trim();
        } else if (tmpB[0] === "group") {
          metadata[tmpB[0]] = tmpB[1];
        } else if (tmpB[0] === "version") {
          metadata[tmpB[0]] = tmpB[1].trim().replace("unspecified", "latest");
        } else if (["buildFile", "projectDir", "rootDir"].includes(tmpB[0])) {
          metadata.properties.push({ name: tmpB[0], value: tmpB[1].trim() });
        } else if (tmpB[0] === "subprojects") {
          const spStrs = tmpB[1].replace(/[[\]']/g, "").split(", ");
          const tmpprojects = spStrs
            .flatMap((s) => s.replace("project ", ""))
            .filter((s) => ![""].includes(s.trim()));
          tmpprojects.forEach(projects.add, projects);
        }
      }
    });
  }
  return {
    rootProject,
    projects: Array.from(projects),
    metadata
  };
};

/**
 * Execute gradle properties command and return parsed output
 *
 * @param {string} dir Directory to execute the command
 * @param {string} rootPath Root directory
 * @param {string} subProject Sub project name
 */
export const executeGradleProperties = function (dir, rootPath, subProject) {
  const defaultProps = {
    rootProject: subProject,
    projects: [],
    metadata: {
      version: "latest"
    }
  };
  // To optimize performance and reduce errors do not query for properties
  // beyond the first level
  if (subProject && subProject.match(/:/g).length >= 2) {
    return defaultProps;
  }
  let gradlePropertiesArgs = [
    subProject ? `${subProject}:properties` : "properties",
    "-q",
    "--console",
    "plain",
    "--build-cache"
  ];
  const gradleCmd = getGradleCommand(dir, rootPath);
  // common gradle args, used for all tasks
  if (process.env.GRADLE_ARGS) {
    const addArgs = process.env.GRADLE_ARGS.split(" ");
    gradlePropertiesArgs = gradlePropertiesArgs.concat(addArgs);
  }
  // gradle args only for the properties task
  if (process.env.GRADLE_ARGS_PROPERTIES) {
    const addArgs = process.env.GRADLE_ARGS_PROPERTIES.split(" ");
    gradlePropertiesArgs = gradlePropertiesArgs.concat(addArgs);
  }
  console.log(
    "Executing",
    gradleCmd,
    gradlePropertiesArgs.join(" "),
    "in",
    dir
  );
  const result = spawnSync(gradleCmd, gradlePropertiesArgs, {
    cwd: dir,
    encoding: "utf-8"
  });
  if (result.status !== 0 || result.error) {
    if (result.stderr) {
      if (result.stderr.includes("does not exist")) {
        return defaultProps;
      } else {
        console.error(result.stdout, result.stderr);
        console.log(
          "1. Check if the correct version of java and gradle are installed and available in PATH. For example, some project might require Java 11 with gradle 7.\n cdxgen container image bundles Java 20 with gradle 8 which might be incompatible."
        );
      }
      if (result.stderr.includes("not get unknown property")) {
        console.log(
          "2. Check if the SBoM is generated for the correct root project for your application."
        );
      }
    }
  }
  const stdout = result.stdout;
  if (stdout) {
    const cmdOutput = Buffer.from(stdout).toString();
    return parseGradleProperties(cmdOutput);
  }
  return {};
};

/**
 * Parse bazel action graph output
 * @param {string} rawOutput Raw string output
 */
export const parseBazelActionGraph = function (rawOutput) {
  const mavenPrefixRegex = RegExp(
    `^.*v1/https/[^/]*(?:${
      process.env.BAZEL_STRIP_MAVEN_PREFIX || "/maven2/"
    })?(.*)/(.*)/(.*)/(.*.jar)(?:"| \\\\)?$`,
    "g"
  );

  if (typeof rawOutput === "string") {
    const deps = [];
    const keys_cache = {};
    const tmpA = rawOutput.split("\n");
    tmpA.forEach((l) => {
      l = l.replace("\r", "");
      if (
        l.trim().startsWith("arguments") ||
        l.trim().startsWith("bazel-out")
      ) {
        const matches = Array.from(l.matchAll(mavenPrefixRegex));

        if (matches[0] && matches[0][1]) {
          const group = matches[0][1].split("/").join(".");
          const name = matches[0][2];
          const version = matches[0][3];

          const key = `${group}:${name}:${version}`;

          if (!keys_cache[key]) {
            keys_cache[key] = true;
            deps.push({
              group,
              name,
              version,
              qualifiers: { type: "jar" }
            });
          }
        }
      }
    });
    return deps;
  }
  return [];
};

/**
 * Parse bazel skyframe state output
 * @param {string} rawOutput Raw string output
 */
export const parseBazelSkyframe = function (rawOutput) {
  if (typeof rawOutput === "string") {
    const deps = [];
    const keys_cache = {};
    const tmpA = rawOutput.split("\n");
    tmpA.forEach((l) => {
      l = l.replace("\r", "");
      if (l.indexOf("external/maven") >= 0) {
        l = l.replace("arguments: ", "").replace(/"/g, "");
        // Skyframe could have duplicate entries
        if (l.includes("@@maven//")) {
          l = l.split(",")[0];
        }
        const mparts = l.split("external/maven/v1/");
        if (mparts && mparts[mparts.length - 1].endsWith(".jar")) {
          // Example
          // https/jcenter.bintray.com/com/google/guava/failureaccess/1.0.1/failureaccess-1.0.1.jar
          // https/repo1.maven.org/maven2/org/simpleflatmapper/sfm-util/8.2.2/header_sfmutil-8.2.2.jar
          const jarPath = mparts[mparts.length - 1];
          let jarPathParts = jarPath.split("/");
          if (jarPathParts.length) {
            // Remove the protocol, registry url and then file name
            let prefix_slice_count = 2;
            // Bug: #169
            const prefix = process.env.BAZEL_STRIP_MAVEN_PREFIX || "/maven2/";
            if (l.includes(prefix)) {
              prefix_slice_count = prefix.split("/").length;
            }
            jarPathParts = jarPathParts.slice(prefix_slice_count, -1);
            // The last part would be the version
            const version = jarPathParts[jarPathParts.length - 1];
            // Last but one would be the name
            const name = jarPathParts[jarPathParts.length - 2].toLowerCase();
            // Rest would be the group
            const group = jarPathParts.slice(0, -2).join(".").toLowerCase();
            const key = `${group}:${name}:${version}`;
            if (!keys_cache[key]) {
              keys_cache[key] = true;
              deps.push({
                group,
                name,
                version,
                qualifiers: { type: "jar" }
              });
            }
          }
        }
      }
    });
    return deps;
  }
  return [];
};

/**
 * Parse bazel BUILD file
 * @param {string} rawOutput Raw string output
 */
export const parseBazelBuild = function (rawOutput) {
  if (typeof rawOutput === "string") {
    const projs = [];
    const tmpA = rawOutput.split("\n");
    tmpA.forEach((l) => {
      if (l.includes("name =")) {
        const name = l.split("name =")[1].replace(/[","]/g, "").trim();
        if (!name.includes("test")) {
          projs.push(name);
        }
      }
    });
    return projs;
  }
  return [];
};

/**
 * Parse dependencies in Key:Value format
 */
export const parseKVDep = function (rawOutput) {
  if (typeof rawOutput === "string") {
    const deps = [];
    rawOutput.split("\n").forEach((l) => {
      l = l.replace("\r", "");
      const tmpA = l.split(":");
      let group = "";
      let name = "";
      let version = "";
      if (tmpA.length === 3) {
        group = tmpA[0];
        name = tmpA[1];
        version = tmpA[2];
      } else if (tmpA.length === 2) {
        name = tmpA[0];
        version = tmpA[1];
      }
      const purlString = new PackageURL(
        "maven",
        group,
        name,
        version,
        { type: "jar" },
        null
      ).toString();
      deps.push({
        group,
        name,
        version,
        purl: decodeURIComponent(purlString),
        "bom-ref": purlString
      });
    });
    return deps;
  }
  return [];
};

/**
 * Method to find the spdx license id from name
 *
 * @param {string} name License full name
 */
export const findLicenseId = function (name) {
  for (const l of licenseMapping) {
    if (l.names.includes(name)) {
      return l.exp;
    }
  }
  return name && (name.includes("\n") || name.length > MAX_LICENSE_ID_LENGTH)
    ? guessLicenseId(name)
    : name;
};

/**
 * Method to guess the spdx license id from license contents
 *
 * @param {string} name License file contents
 */
export const guessLicenseId = function (content) {
  content = content.replace(/\n/g, " ");
  for (const l of licenseMapping) {
    for (const j in l.names) {
      if (content.toUpperCase().indexOf(l.names[j].toUpperCase()) > -1) {
        return l.exp;
      }
    }
  }
  return undefined;
};

/**
 * Method to retrieve metadata for maven packages by querying maven central
 *
 * @param {Array} pkgList Package list
 */
export const getMvnMetadata = async function (pkgList) {
  const MAVEN_CENTRAL_URL =
    process.env.MAVEN_CENTRAL_URL || "https://repo1.maven.org/maven2/";
  const ANDROID_MAVEN = "https://maven.google.com/";
  const cdepList = [];
  if (!pkgList || !pkgList.length) {
    return pkgList;
  }
  if (DEBUG_MODE && fetchLicenses) {
    console.log(`About to query maven for ${pkgList.length} packages`);
  }
  for (const p of pkgList) {
    // If the package already has key metadata skip querying maven
    if (p.group && p.name && p.version && !fetchLicenses) {
      cdepList.push(p);
      continue;
    }
    let urlPrefix = MAVEN_CENTRAL_URL;
    // Ideally we should try one resolver after the other. But it increases the time taken
    if (p.group.indexOf("android") !== -1) {
      urlPrefix = ANDROID_MAVEN;
    }
    const groupPart = p.group.replace(/\./g, "/");
    // Querying maven requires a valid group name
    if (!groupPart || groupPart === "") {
      cdepList.push(p);
      continue;
    }
    const fullUrl =
      urlPrefix +
      groupPart +
      "/" +
      p.name +
      "/" +
      p.version +
      "/" +
      p.name +
      "-" +
      p.version +
      ".pom";
    try {
      if (DEBUG_MODE) {
        console.log(`Querying ${fullUrl}`);
      }
      const res = await cdxgenAgent.get(fullUrl);
      const bodyJson = xml2js(res.body, {
        compact: true,
        spaces: 4,
        textKey: "_",
        attributesKey: "$",
        commentKey: "value"
      }).project;
      if (bodyJson && bodyJson.licenses && bodyJson.licenses.license) {
        if (Array.isArray(bodyJson.licenses.license)) {
          p.license = bodyJson.licenses.license.map((l) => {
            return findLicenseId(l.name._);
          });
        } else if (Object.keys(bodyJson.licenses.license).length) {
          const l = bodyJson.licenses.license;
          p.license = [findLicenseId(l.name._)];
        }
      }
      p.publisher =
        bodyJson.organization && bodyJson.organization.name
          ? bodyJson.organization.name._
          : "";
      p.description = bodyJson.description ? bodyJson.description._ : "";
      if (bodyJson.scm && bodyJson.scm.url) {
        p.repository = { url: bodyJson.scm.url._ };
      }
      cdepList.push(p);
    } catch (err) {
      if (DEBUG_MODE) {
        console.log(
          "Unable to find metadata for",
          p.group,
          p.name,
          p.version,
          fullUrl
        );
      }
      cdepList.push(p);
    }
  }
  return cdepList;
};

/**
 * Method to parse python requires_dist attribute found in pypi setup.py
 *
 * @param requires_dist string
 */
export const parsePyRequiresDist = function (dist_string) {
  if (!dist_string) {
    return undefined;
  }
  const tmpA = dist_string.split(" ");
  let name = "";
  let version = "";
  if (!tmpA) {
    return undefined;
  } else if (tmpA.length == 1) {
    name = tmpA[0];
  } else if (tmpA.length > 1) {
    name = tmpA[0];
    const tmpVersion = tmpA[1];
    version = tmpVersion.split(",")[0].replace(/[();=&glt><]/g, "");
  }
  return {
    name,
    version
  };
};

/**
 * Method to mimic pip version solver using node-semver
 *
 * @param {Array} versionsList List of version numbers available
 * @param {*} versionSpecifiers pip version specifier
 */
export const guessPypiMatchingVersion = (versionsList, versionSpecifiers) => {
  versionSpecifiers = versionSpecifiers.replace(/,/g, " ").split(";")[0];
  const comparator = (a, b) => {
    let c = coerce(a).compare(coerce(b));
    // if coerced versions are "equal", compare them as strings
    if (c === 0) {
      c = a < b ? -1 : 1;
    }
    return -c;
  };
  // Iterate in the "reverse" order
  for (let rv of versionsList.sort(comparator)) {
    if (satisfies(coerce(rv), versionSpecifiers, true)) {
      return rv;
    }
  }
  // Let's try to clean and have another go
  return maxSatisfying(versionsList, clean(versionSpecifiers, { loose: true }));
};

/**
 * Method to retrieve metadata for python packages by querying pypi
 *
 * @param {Array} pkgList Package list
 * @param {Boolean} fetchDepsInfo Fetch dependencies info from pypi
 */
export const getPyMetadata = async function (pkgList, fetchDepsInfo) {
  if (!fetchLicenses && !fetchDepsInfo) {
    return pkgList;
  }
  const PYPI_URL = "https://pypi.org/pypi/";
  const cdepList = [];
  for (const p of pkgList) {
    if (!p || !p.name) {
      continue;
    }
    try {
      // If the package name has a url or already includes license and version skip it
      if (p.name.includes("https") || (p.license && p.version)) {
        cdepList.push(p);
        continue;
      }
      // Some packages support extra modules
      if (p.name.includes("[")) {
        p.name = p.name.split("[")[0];
      }
      const res = await cdxgenAgent.get(PYPI_URL + p.name + "/json", {
        responseType: "json"
      });
      const body = res.body;
      if (body.info.author && body.info.author.trim() !== "") {
        if (body.info.author_email && body.info.author_email.trim() !== "") {
          p.author = `${body.info.author.trim()} <${body.info.author_email.trim()}>`;
        } else {
          p.author = body.info.author.trim();
        }
      } else if (
        body.info.author_email &&
        body.info.author_email.trim() !== ""
      ) {
        p.author = body.info.author_email.trim();
      }
      p.description = body.info.summary;
      p.license = findLicenseId(body.info.license);
      if (body.info.home_page) {
        if (body.info.home_page.includes("git")) {
          p.repository = { url: body.info.home_page };
        } else {
          p.homepage = { url: body.info.home_page };
        }
      }
      // Use the latest version if none specified
      if (!p.version || !p.version.trim().length) {
        let versionSpecifiers = undefined;
        if (p.properties && p.properties.length) {
          for (const pprop of p.properties) {
            if (pprop.name === "cdx:pypi:versionSpecifiers") {
              versionSpecifiers = pprop.value;
              break;
            }
          }
        } else if (
          p.version &&
          (p.version.includes("*") ||
            p.version.includes("<") ||
            p.version.includes(">") ||
            p.version.includes("!"))
        ) {
          versionSpecifiers = p.version;
        }
        if (versionSpecifiers) {
          p.version = guessPypiMatchingVersion(
            Object.keys(body.releases || {}),
            versionSpecifiers
          );
          // Indicate the confidence with our guess
          p.evidence = {
            identity: {
              field: "version",
              confidence: 0.75,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 0.75,
                  value: `Version specifiers: ${versionSpecifiers}`
                }
              ]
            }
          };
        }
        // If we have reached here, it means we have not solved the version
        // So assume latest
        if (!p.version) {
          p.version = body.info.version;
          // Indicate the low confidence
          p.evidence = {
            identity: {
              field: "version",
              confidence: 0.5,
              methods: [
                {
                  technique: "source-code-analysis",
                  confidence: 0.5,
                  value: `PyPI package: ${p.name}`
                }
              ]
            }
          };
        }
      } else if (p.version !== body.info.version) {
        if (!p.properties) {
          p.properties = [];
        }
        p.properties.push({
          name: "cdx:pypi:latest_version",
          value: body.info.version
        });
      }
      if (body.releases && body.releases[p.version]) {
        const digest = body.releases[p.version][0].digests;
        if (digest["sha256"]) {
          p._integrity = "sha256-" + digest["sha256"];
        } else if (digest["md5"]) {
          p._integrity = "md5-" + digest["md5"];
        }
      }
      cdepList.push(p);
    } catch (err) {
      if (DEBUG_MODE) {
        console.error(p.name, "is not found on PyPI.");
        console.log(
          "If this package is available from PyPI or a registry, its name might be different to the module name. Raise a ticket at https://github.com/CycloneDX/cdxgen/issues so that this could be added to the mapping file pypi-pkg-aliases.json"
        );
        console.log(
          "Alternatively, if this is a package that gets installed directly in your environment and offers a python binding, then track such packages manually."
        );
      }
      if (!p.version) {
        if (DEBUG_MODE) {
          console.log(
            `Assuming the version as latest for the package ${p.name}`
          );
        }
        p.version = "latest";
        // Indicate the low confidence
        p.evidence = {
          identity: {
            field: "version",
            confidence: 0,
            methods: [
              {
                technique: "source-code-analysis",
                confidence: 0,
                value: `Module ${p.name}`
              }
            ]
          }
        };
      }
      cdepList.push(p);
    }
  }
  return cdepList;
};

/**
 * Method to parse bdist_wheel metadata
 *
 * @param {Object} mData bdist_wheel metadata
 */
export const parseBdistMetadata = function (mData) {
  const pkg = {};
  mData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (l.indexOf("Name: ") > -1) {
      pkg.name = l.split("Name: ")[1];
    } else if (l.indexOf("Version: ") > -1) {
      pkg.version = l.split("Version: ")[1];
    } else if (l.indexOf("Summary: ") > -1) {
      pkg.description = l.split("Summary: ")[1];
    } else if (l.indexOf("Home-page: ") > -1) {
      pkg.homepage = { url: l.split("Home-page: ")[1] };
    } else if (l.indexOf("Project-URL: Source Code, ") > -1) {
      pkg.repository = { url: l.split("Project-URL: Source Code, ")[1] };
    } else if (l.indexOf("Author: ") > -1) {
      pkg.publisher = l.split("Author: ")[1];
    }
  });
  return [pkg];
};

/**
 * Method to parse pipfile.lock data
 *
 * @param {Object} lockData JSON data from Pipfile.lock
 */
export const parsePiplockData = async function (lockData) {
  const pkgList = [];
  Object.keys(lockData)
    .filter((i) => i !== "_meta")
    .forEach((k) => {
      const depBlock = lockData[k];
      Object.keys(depBlock).forEach((p) => {
        const pkg = depBlock[p];
        if (Object.prototype.hasOwnProperty.call(pkg, "version")) {
          const versionStr = pkg.version.replace("==", "");
          pkgList.push({ name: p, version: versionStr });
        }
      });
    });
  return await getPyMetadata(pkgList, false);
};

/**
 * Method to parse python pyproject.toml file
 *
 * @param {string} tomlFile Toml file
 */
export const parsePyProjectToml = (tomlFile) => {
  // Do we need a toml npm package at some point?
  const tomlData = readFileSync(tomlFile, { encoding: "utf-8" });
  let pkg = {};
  if (!tomlData) {
    return pkg;
  }
  tomlData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      let key = tmpA[0].trim();
      let value = tmpA[1].trim().replace(/"/g, "");
      switch (key) {
        case "description":
          pkg.description = value;
          break;
        case "name":
          pkg.name = value;
          break;
        case "version":
          if (value.includes("{")) {
            value = "latest";
          }
          pkg.version = value;
          break;
        case "authors":
          try {
            pkg.author = JSON.parse(value)[0];
          } catch (e) {
            pkg.author = value.replace("[", "").replace("]", "");
          }
          break;
        case "homepage":
          pkg.homepage = { url: value };
          break;
        case "repository":
          pkg.repository = { url: value };
          break;
      }
    }
  });
  return pkg;
};

/**
 * Method to parse poetry.lock data
 *
 * @param {Object} lockData JSON data from poetry.lock
 * @param {string} lockFile Lock file name for evidence
 */
export const parsePoetrylockData = async function (lockData, lockFile) {
  const pkgList = [];
  let pkg = null;
  if (!lockData) {
    return pkgList;
  }
  lockData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    let key = null;
    let value = null;
    // Package section starts with this marker
    if (l.indexOf("[[package]]") > -1) {
      if (pkg && pkg.name && pkg.version) {
        pkg.evidence = {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: lockFile
              }
            ]
          }
        };
        pkgList.push(pkg);
      }
      pkg = {};
    }
    if (l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/"/g, "");
      switch (key) {
        case "description":
          pkg.description = value;
          break;
        case "name":
          pkg.name = value;
          break;
        case "version":
          pkg.version = value;
          break;
        case "optional":
          pkg.scope = value == "true" ? "optional" : undefined;
          break;
      }
    }
  });
  return await getPyMetadata(pkgList, false);
};

/**
 * Method to parse requirements.txt data
 *
 * @param {Object} reqData Requirements.txt data
 * @param {Boolean} fetchDepsInfo Fetch dependencies info from pypi
 */
export async function parseReqFile(reqData, fetchDepsInfo) {
  const pkgList = [];
  let compScope = undefined;
  reqData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    l = l.trim();
    if (l.startsWith("Skipping line") || l.startsWith("(add")) {
      return;
    }
    if (l.includes("# Basic requirements")) {
      compScope = "required";
    } else if (l.includes("added by pip freeze")) {
      compScope = undefined;
    }
    if (!l.startsWith("#") && !l.startsWith("-")) {
      if (l.includes(" ")) {
        l = l.split(" ")[0];
      }
      if (l.indexOf("=") > -1) {
        let tmpA = l.split(/(==|<=|~=|>=)/);
        if (tmpA.includes("#")) {
          tmpA = tmpA.split("#")[0];
        }
        let versionStr = tmpA[tmpA.length - 1].trim().replace("*", "0");
        if (versionStr.indexOf(" ") > -1) {
          versionStr = versionStr.split(" ")[0];
        }
        if (versionStr === "0") {
          versionStr = null;
        }
        if (!tmpA[0].includes("=") && !tmpA[0].trim().includes(" ")) {
          const name = tmpA[0].trim().replace(";", "");
          if (!PYTHON_STD_MODULES.includes(name)) {
            pkgList.push({
              name,
              version: versionStr,
              scope: compScope
            });
          }
        }
      } else if (l.includes("<") && l.includes(">")) {
        const tmpA = l.split(">");
        const name = tmpA[0].trim().replace(";", "");
        const versionSpecifiers = l.replace(name, "");
        if (!PYTHON_STD_MODULES.includes(name)) {
          pkgList.push({
            name,
            version: undefined,
            scope: compScope,
            properties: [
              {
                name: "cdx:pypi:versionSpecifiers",
                value: versionSpecifiers
              }
            ]
          });
        }
      } else if (/[>|[|@]/.test(l)) {
        let tmpA = l.split(/(>|\[|@)/);
        if (tmpA.includes("#")) {
          tmpA = tmpA.split("#")[0];
        }
        if (!tmpA[0].trim().includes(" ")) {
          const name = tmpA[0].trim().replace(";", "");
          const versionSpecifiers = l.replace(name, "");
          if (!PYTHON_STD_MODULES.includes(name)) {
            pkgList.push({
              name,
              version: undefined,
              scope: compScope,
              properties: [
                {
                  name: "cdx:pypi:versionSpecifiers",
                  value: versionSpecifiers
                }
              ]
            });
          }
        }
      } else if (l) {
        if (l.includes("#")) {
          l = l.split("#")[0];
        }
        l = l.trim();
        const tmpA = l.split(/(<|>)/);
        if (tmpA && tmpA.length === 3) {
          const name = tmpA[0].trim().replace(";", "");
          const versionSpecifiers = l.replace(name, "");
          if (!PYTHON_STD_MODULES.includes(name)) {
            pkgList.push({
              name,
              version: undefined,
              scope: compScope,
              properties: [
                {
                  name: "cdx:pypi:versionSpecifiers",
                  value: versionSpecifiers
                }
              ]
            });
          }
        } else if (!l.includes(" ")) {
          const name = l.replace(";", "");
          const versionSpecifiers = l.replace(name, "");
          if (!PYTHON_STD_MODULES.includes(name)) {
            pkgList.push({
              name,
              version: null,
              scope: compScope,
              properties: [
                {
                  name: "cdx:pypi:versionSpecifiers",
                  value: versionSpecifiers
                }
              ]
            });
          }
        }
      }
    }
  });
  return await getPyMetadata(pkgList, fetchDepsInfo);
}

/**
 * Method to find python modules by parsing the imports and then checking with PyPI to obtain the latest version
 *
 * @param {string} src directory
 * @param {Array} epkgList Existing package list
 * @returns List of packages
 */
export const getPyModules = async (src, epkgList) => {
  const allImports = {};
  const dependenciesList = [];
  const modList = findAppModules(src, "python", "parsedeps");
  const pyDefaultModules = new Set(PYTHON_STD_MODULES);
  const filteredModList = modList.filter(
    (x) =>
      !pyDefaultModules.has(x.name.toLowerCase()) &&
      !x.name.startsWith("_") &&
      !x.name.startsWith(".")
  );
  let pkgList = filteredModList.map((p) => {
    return {
      name:
        PYPI_MODULE_PACKAGE_MAPPING[p.name.toLowerCase()] ||
        PYPI_MODULE_PACKAGE_MAPPING[p.name.replace(/_/g, "-").toLowerCase()] ||
        p.name.replace(/_/g, "-").toLowerCase(),
      version: p.version && p.version.trim().length ? p.version : undefined,
      scope: "required",
      properties: [
        {
          name: "cdx:pypi:versionSpecifiers",
          value: p.versionSpecifiers
        }
      ]
    };
  });
  pkgList = pkgList.filter(
    (obj, index) => pkgList.findIndex((i) => i.name === obj.name) === index
  );
  if (epkgList && epkgList.length) {
    const pkgMaps = epkgList.map((p) => p.name);
    pkgList = pkgList.filter((p) => !pkgMaps.includes(p.name));
  }
  pkgList = await getPyMetadata(pkgList, true);
  // Populate the imports list after dealiasing
  if (pkgList && pkgList.length) {
    pkgList.forEach((p) => {
      allImports[p.name] = true;
    });
  }
  for (const p of pkgList) {
    if (p.version) {
      dependenciesList.push({
        ref: `pkg:pypi/${p.name.replace(/_/g, "-")}@${p.version}`.toLowerCase(),
        dependsOn: []
      });
    }
  }
  return { allImports, pkgList, dependenciesList };
};

/**
 * Method to parse setup.py data
 *
 * @param {Object} setupPyData Contents of setup.py
 */
export const parseSetupPyFile = async function (setupPyData) {
  let lines = [];
  let requires_found = false;
  let should_break = false;
  setupPyData.split("\n").forEach((l) => {
    l = l.trim();
    if (l.includes("install_requires")) {
      l = l.replace("install_requires=[", "");
      requires_found = true;
    }
    if (l.length && requires_found && !should_break) {
      if (l.includes("]")) {
        should_break = true;
        l = l.replace("],", "").replace("]", "");
      }
      let tmpA = l.replace(/['"]/g, "").split(",");
      tmpA = tmpA.filter((v) => v.length);
      lines = lines.concat(tmpA);
    }
  });
  return await parseReqFile(lines.join("\n"), false);
};

/**
 * Method to construct a github url for the given repo
 * @param {Object} repoMetadata Repo metadata with group and name
 */
export const toGitHubUrl = function (repoMetadata) {
  if (repoMetadata) {
    const group = repoMetadata.group;
    const name = repoMetadata.name;
    let ghUrl = "https://github.com";
    if (group && group !== "." && group != "") {
      ghUrl = ghUrl + "/" + group.replace("github.com/", "");
    }
    ghUrl = ghUrl + "/" + name;
    return ghUrl;
  } else {
    return undefined;
  }
};

/**
 * Method to retrieve repo license by querying github api
 *
 * @param {String} repoUrl Repository url
 * @param {Object} repoMetadata Object containing group and package name strings
 * @return {String} SPDX license id
 */
export const getRepoLicense = async function (repoUrl, repoMetadata) {
  if (!repoUrl) {
    repoUrl = toGitHubUrl(repoMetadata);
  }
  // Perform github lookups
  if (repoUrl.indexOf("github.com") > -1) {
    let apiUrl = repoUrl.replace(
      "https://github.com",
      "https://api.github.com/repos"
    );
    apiUrl += "/license";
    const headers = {};
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = "Bearer " + process.env.GITHUB_TOKEN;
    }
    try {
      const res = await cdxgenAgent.get(apiUrl, {
        responseType: "json",
        headers: headers
      });
      if (res && res.body) {
        const license = res.body.license;
        let licenseId = license.spdx_id;
        const licObj = {
          url: res.body.html_url
        };
        if (license.spdx_id === "NOASSERTION") {
          if (res.body.content) {
            const content = Buffer.from(res.body.content, "base64").toString(
              "ascii"
            );
            licenseId = guessLicenseId(content);
          }
          // If content match fails attempt to find by name
          if (!licenseId && license.name.toLowerCase() !== "other") {
            licenseId = findLicenseId(license.name);
            licObj["name"] = license.name;
          }
        }
        licObj["id"] = licenseId;
        return licObj;
      }
    } catch (err) {
      return undefined;
    }
  } else if (repoMetadata) {
    const group = repoMetadata.group;
    const name = repoMetadata.name;
    if (group && name) {
      for (const akLic of knownLicenses) {
        if (akLic.group === "." && akLic.name === name) {
          return akLic.license;
        } else if (
          group.includes(akLic.group) &&
          (akLic.name === name || akLic.name === "*")
        ) {
          return akLic.license;
        }
      }
    }
  }
  return undefined;
};

/**
 * Method to get go pkg license from go.dev site.
 *
 * @param {Object} repoMetadata Repo metadata
 */
export const getGoPkgLicense = async function (repoMetadata) {
  const group = repoMetadata.group;
  const name = repoMetadata.name;
  let pkgUrlPrefix = "https://pkg.go.dev/";
  if (group && group !== "." && group !== name) {
    pkgUrlPrefix = pkgUrlPrefix + group + "/";
  }
  pkgUrlPrefix = pkgUrlPrefix + name + "?tab=licenses";
  // Check the metadata cache first
  if (metadata_cache[pkgUrlPrefix]) {
    return metadata_cache[pkgUrlPrefix];
  }
  try {
    const res = await cdxgenAgent.get(pkgUrlPrefix);
    if (res && res.body) {
      const $ = load(res.body);
      let licenses = $("#LICENSE > h2").text().trim();
      if (licenses === "") {
        licenses = $("section.License > h2").text().trim();
      }
      const licenseIds = licenses.split(", ");
      const licList = [];
      for (const id of licenseIds) {
        const alicense = {
          id: id
        };
        alicense["url"] = pkgUrlPrefix;
        licList.push(alicense);
      }
      metadata_cache[pkgUrlPrefix] = licList;
      return licList;
    }
  } catch (err) {
    return undefined;
  }
  if (group.indexOf("github.com") > -1) {
    return await getRepoLicense(undefined, repoMetadata);
  }
  return undefined;
};

export const getGoPkgComponent = async function (group, name, version, hash) {
  let pkg = {};
  let license = undefined;
  if (fetchLicenses) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch go package license information for ${group}:${name}`
      );
    }
    license = await getGoPkgLicense({
      group: group,
      name: name
    });
  }
  pkg = {
    group: group,
    name: name,
    version: version,
    _integrity: hash,
    license: license
  };
  return pkg;
};

export const parseGoModData = async function (goModData, gosumMap) {
  const pkgComponentsList = [];
  let isModReplacement = false;

  if (!goModData) {
    return pkgComponentsList;
  }

  const pkgs = goModData.split("\n");
  for (let l of pkgs) {
    // Skip go.mod file headers, whitespace, and/or comments
    if (
      l.startsWith("module ") ||
      l.startsWith("go ") ||
      l.includes(")") ||
      l.trim() === "" ||
      l.trim().startsWith("//")
    ) {
      continue;
    }

    // Handle required modules separately from replacement modules to ensure accuracy when parsing component data.
    if (l.includes("require (")) {
      isModReplacement = false;
      continue;
    } else if (l.includes("replace (")) {
      isModReplacement = true;
      continue;
    } else if (l.includes("replace ")) {
      // If this is an inline replacement, drop the word replace
      // (eg; "replace google.golang.org/grpc => google.golang.org/grpc v1.21.0" becomes " google.golang.org/grpc => google.golang.org/grpc v1.21.0")
      l = l.replace("replace", "");
      isModReplacement = true;
    }

    const tmpA = l.trim().split(" ");

    if (!isModReplacement) {
      // Add group, name and version component properties for required modules
      const version = tmpA[1];
      const gosumHash = gosumMap[`${tmpA[0]}/${version}`];
      // The hash for this version was not found in go.sum, so skip as it is most likely being replaced.
      if (gosumHash === undefined) {
        continue;
      }
      const component = await getGoPkgComponent(
        "",
        tmpA[0],
        version,
        gosumHash
      );
      pkgComponentsList.push(component);
    } else {
      // Add group, name and version component properties for replacement modules
      const version = tmpA[3];

      const gosumHash = gosumMap[`${tmpA[2]}/${version}`];
      // The hash for this version was not found in go.sum, so skip.
      if (gosumHash === undefined) {
        continue;
      }
      const component = await getGoPkgComponent(
        "",
        tmpA[2],
        version,
        gosumHash
      );
      pkgComponentsList.push(component);
    }
  }
  // Clear the cache
  metadata_cache = {};
  return pkgComponentsList;
};

/**
 * Parse go list output
 *
 * @param {string} rawOutput Output from go list invocation
 * @returns List of packages
 */
export const parseGoListDep = async function (rawOutput, gosumMap) {
  if (typeof rawOutput === "string") {
    const deps = [];
    const keys_cache = {};
    const pkgs = rawOutput.split("\n");
    for (const l of pkgs) {
      const verArr = l.trim().replace(new RegExp("[\"']", "g"), "").split(" ");

      if (verArr && verArr.length === 5) {
        const key = verArr[0] + "-" + verArr[1];
        // Filter duplicates
        if (!keys_cache[key]) {
          keys_cache[key] = key;
          const version = verArr[1];
          const gosumHash = gosumMap[`${verArr[0]}/${version}`];
          const component = await getGoPkgComponent(
            "",
            verArr[0],
            version,
            gosumHash
          );
          if (verArr[2] === "false") {
            component.scope = "required";
          } else if (verArr[2] === "true") {
            component.scope = "optional";
          }
          component.properties = [
            {
              name: "SrcGoMod",
              value: verArr[3] || ""
            },
            {
              name: "ModuleGoVersion",
              value: verArr[4] || ""
            }
          ];
          deps.push(component);
        }
      }
    }
    return deps;
  }
  return [];
};

/**
 * Parse go mod why output
 * @param {string} rawOutput Output from go mod why
 * @returns package name or none
 */
export const parseGoModWhy = function (rawOutput) {
  if (typeof rawOutput === "string") {
    let pkg_name = undefined;
    const tmpA = rawOutput.split("\n");
    tmpA.forEach((l) => {
      if (l && !l.startsWith("#") && !l.startsWith("(")) {
        pkg_name = l.trim();
      }
    });
    return pkg_name;
  }
  return undefined;
};

export const parseGosumData = async function (gosumData) {
  const pkgList = [];
  if (!gosumData) {
    return pkgList;
  }
  const pkgs = gosumData.split("\n");
  for (const l of pkgs) {
    let m = l.replace("\r", "");
    // look for lines containing go.mod
    if (m.indexOf("go.mod") > -1) {
      const tmpA = m.split(" ");
      const name = tmpA[0];
      const version = tmpA[1].replace("/go.mod", "");
      const hash = tmpA[tmpA.length - 1].replace("h1:", "sha256-");
      let license = undefined;
      if (fetchLicenses) {
        if (DEBUG_MODE) {
          console.log(
            `About to fetch go package license information for ${name}`
          );
        }
        license = await getGoPkgLicense({
          group: "",
          name: name
        });
      }
      pkgList.push({
        group: "",
        name: name,
        version: version,
        _integrity: hash,
        license: license
      });
    }
  }
  return pkgList;
};

export const parseGopkgData = async function (gopkgData) {
  const pkgList = [];
  if (!gopkgData) {
    return pkgList;
  }
  let pkg = null;
  const pkgs = gopkgData.split("\n");
  for (const l of pkgs) {
    let key = null;
    let value = null;
    if (l.indexOf("[[projects]]") > -1) {
      if (pkg) {
        pkgList.push(pkg);
      }
      pkg = {};
    }
    if (l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/"/g, "");
      let digestStr = undefined;
      switch (key) {
        case "digest":
          digestStr = value.replace("1:", "");
          pkg._integrity = "sha256-" + toBase64(digestStr);
          break;
        case "name":
          pkg.group = "";
          pkg.name = value;
          if (fetchLicenses) {
            pkg.license = await getGoPkgLicense({
              group: pkg.group,
              name: pkg.name
            });
          }
          break;
        case "version":
          pkg.version = value;
          break;
        case "revision":
          if (!pkg.version) {
            pkg.version = value;
          }
      }
    }
  }
  return pkgList;
};

export const parseGoVersionData = async function (buildInfoData) {
  const pkgList = [];
  if (!buildInfoData) {
    return pkgList;
  }
  const pkgs = buildInfoData.split("\n");
  for (const i in pkgs) {
    const l = pkgs[i].trim().replace(/\t/g, " ");
    if (!l.startsWith("dep")) {
      continue;
    }
    const tmpA = l.split(" ");
    if (!tmpA || tmpA.length < 3) {
      continue;
    }
    const name = tmpA[1].trim();
    let hash = "";
    if (tmpA.length == 4) {
      hash = tmpA[tmpA.length - 1].replace("h1:", "sha256-");
    }
    const component = await getGoPkgComponent("", name, tmpA[2].trim(), hash);
    pkgList.push(component);
  }
  return pkgList;
};

/**
 * Method to query rubygems api for gems details
 *
 * @param {*} pkgList List of packages with metadata
 */
export const getRubyGemsMetadata = async function (pkgList) {
  const RUBYGEMS_URL = "https://rubygems.org/api/v1/versions/";
  const rdepList = [];
  for (const p of pkgList) {
    try {
      if (DEBUG_MODE) {
        console.log(`Querying rubygems.org for ${p.name}`);
      }
      const res = await cdxgenAgent.get(RUBYGEMS_URL + p.name + ".json", {
        responseType: "json"
      });
      let body = res.body;
      if (body && body.length) {
        body = body[0];
      }
      p.description = body.description || body.summary || "";
      if (body.licenses) {
        p.license = body.licenses;
      }
      if (body.metadata) {
        if (body.metadata.source_code_uri) {
          p.repository = { url: body.metadata.source_code_uri };
        }
        if (body.metadata.bug_tracker_uri) {
          p.homepage = { url: body.metadata.bug_tracker_uri };
        }
      }
      if (body.sha) {
        p._integrity = "sha256-" + body.sha;
      }
      // Use the latest version if none specified
      if (!p.version) {
        p.version = body.number;
      }
      rdepList.push(p);
    } catch (err) {
      rdepList.push(p);
      if (DEBUG_MODE) {
        console.error(p, err);
      }
    }
  }
  return rdepList;
};

/**
 * Method to parse Gemspec
 *
 * @param {*} gemspecData Gemspec data
 */
export const parseGemspecData = async function (gemspecData) {
  let pkgList = [];
  const pkg = {};
  if (!gemspecData) {
    return pkgList;
  }
  gemspecData.split("\n").forEach((l) => {
    l = l.trim();
    if (l.includes(".name = ")) {
      pkg.name = l
        .split(".name = ")[1]
        .replace(".freeze", "")
        .replace(/"/g, "");
    } else if (l.includes(".version = ")) {
      pkg.version = l
        .split(".version = ")[1]
        .replace(".freeze", "")
        .replace(/"/g, "");
    } else if (l.includes(".description = ")) {
      pkg.description = l
        .split(".description = ")[1]
        .replace(".freeze", "")
        .replace(/"/g, "");
    }
  });
  pkgList = [pkg];
  if (fetchLicenses) {
    return await getRubyGemsMetadata(pkgList);
  } else {
    return pkgList;
  }
};

/**
 * Method to parse Gemfile.lock
 *
 * @param {*} gemLockData Gemfile.lock data
 */
export const parseGemfileLockData = async function (gemLockData) {
  const pkgList = [];
  const pkgnames = {};
  if (!gemLockData) {
    return pkgList;
  }
  let specsFound = false;
  gemLockData.split("\n").forEach((l) => {
    l = l.trim();
    l = l.replace("\r", "");
    if (specsFound) {
      const tmpA = l.split(" ");
      if (tmpA && tmpA.length == 2) {
        const name = tmpA[0];
        if (!pkgnames[name]) {
          let version = tmpA[1].split(", ")[0];
          version = version.replace(/[(>=<)~ ]/g, "");
          pkgList.push({
            name,
            version
          });
          pkgnames[name] = true;
        }
      }
    }
    if (l === "specs:") {
      specsFound = true;
    }
    if (
      l === "PLATFORMS" ||
      l === "DEPENDENCIES" ||
      l === "RUBY VERSION" ||
      l === "BUNDLED WITH"
    ) {
      specsFound = false;
    }
  });
  if (fetchLicenses) {
    return await getRubyGemsMetadata(pkgList);
  } else {
    return pkgList;
  }
};

/**
 * Method to retrieve metadata for rust packages by querying crates
 *
 * @param {Array} pkgList Package list
 */
export const getCratesMetadata = async function (pkgList) {
  const CRATES_URL = "https://crates.io/api/v1/crates/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      if (DEBUG_MODE) {
        console.log(`Querying crates.io for ${p.name}`);
      }
      const res = await cdxgenAgent.get(CRATES_URL + p.name, {
        responseType: "json"
      });
      const body = res.body.crate;
      p.description = body.description;
      if (res.body.versions) {
        const licenseString = res.body.versions[0].license;
        p.license = licenseString.split("/");
      }
      if (body.repository) {
        p.repository = { url: body.repository };
      }
      if (body.homepage) {
        p.homepage = { url: body.homepage };
      }
      // Use the latest version if none specified
      if (!p.version) {
        p.version = body.newest_version;
      }
      cdepList.push(p);
    } catch (err) {
      cdepList.push(p);
    }
  }
  return cdepList;
};

/**
 * Method to retrieve metadata for dart packages by querying pub.dev
 *
 * @param {Array} pkgList Package list
 */
export const getDartMetadata = async function (pkgList) {
  const PUB_DEV_URL = process.env.PUB_DEV_URL || "https://pub.dev";
  const PUB_PACKAGES_URL = PUB_DEV_URL + "/api/packages/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      if (DEBUG_MODE) {
        console.log(`Querying ${PUB_DEV_URL} for ${p.name}`);
      }
      const res = await cdxgenAgent.get(PUB_PACKAGES_URL + p.name, {
        responseType: "json",
        headers: {
          Accept: "application/vnd.pub.v2+json"
        }
      });
      if (res && res.body) {
        const versions = res.body.versions;
        for (const v of versions) {
          if (p.version === v.version) {
            const pubspec = v.pubspec;
            p.description = pubspec.description;
            if (pubspec.repository) {
              p.repository = { url: pubspec.repository };
            }
            if (pubspec.homepage) {
              p.homepage = { url: pubspec.homepage };
            }
            p.license = `${PUB_DEV_URL}/packages/${p.name}/license`;
            cdepList.push(p);
            break;
          }
        }
      }
    } catch (err) {
      cdepList.push(p);
    }
  }
  return cdepList;
};

export const parseCargoTomlData = async function (cargoData) {
  const pkgList = [];
  if (!cargoData) {
    return pkgList;
  }
  let pkg = null;
  let dependencyMode = false;
  let packageMode = false;
  cargoData.split("\n").forEach((l) => {
    let key = null;
    let value = null;
    l = l.replace("\r", "");
    if (l.indexOf("[package]") > -1) {
      packageMode = true;
      if (pkg) {
        pkgList.push(pkg);
      }
      pkg = {};
    }
    if (l.startsWith("[dependencies]")) {
      dependencyMode = true;
      packageMode = false;
    }
    if (l.startsWith("[") && !l.startsWith("[dependencies]") && !packageMode) {
      dependencyMode = false;
      packageMode = false;
    }
    if (packageMode && l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/"/g, "");
      switch (key) {
        case "checksum":
          pkg._integrity = "sha384-" + value;
          break;
        case "name":
          pkg.group = dirname(value);
          if (pkg.group === ".") {
            pkg.group = "";
          }
          pkg.name = basename(value);
          break;
        case "version":
          pkg.version = value;
          break;
      }
    } else if (dependencyMode && l.indexOf("=") > -1) {
      if (pkg) {
        pkgList.push(pkg);
      }
      pkg = undefined;
      const tmpA = l.split(" = ");
      let tmpB = undefined;
      let name = tmpA[0];
      let version = undefined;
      if (l.indexOf("version =") > -1) {
        tmpB = l.split(" { version = ");
        if (tmpB && tmpB.length > 1) {
          version = tmpB[1].split(",")[0];
        }
      } else if (l.includes("git =")) {
        tmpB = l.split(" { git = ");
        if (tmpB && tmpB.length > 1) {
          version = "git+" + tmpB[1].split(" }")[0];
        }
      } else if (l.indexOf("path =") == -1 && tmpA.length > 1) {
        version = tmpA[1];
      }
      if (name && version) {
        name = name.replace(new RegExp("[\"']", "g"), "");
        version = version.replace(new RegExp("[\"']", "g"), "");
        pkgList.push({ name, version });
      }
    }
  });
  if (pkg) {
    pkgList.push(pkg);
  }
  if (fetchLicenses) {
    return await getCratesMetadata(pkgList);
  } else {
    return pkgList;
  }
};

export const parseCargoData = async function (cargoData) {
  const pkgList = [];
  if (!cargoData) {
    return pkgList;
  }
  let pkg = null;
  cargoData.split("\n").forEach((l) => {
    let key = null;
    let value = null;
    l = l.replace("\r", "");
    // Ignore version = 3 found at the top of newer lock files
    if (!pkg && l.startsWith("version =")) {
      return;
    }
    if (l.indexOf("[[package]]") > -1) {
      if (pkg) {
        pkgList.push(pkg);
      }
      pkg = {};
    }
    if (l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/"/g, "");
      switch (key) {
        case "checksum":
          pkg._integrity = "sha384-" + value;
          break;
        case "name":
          pkg.group = dirname(value);
          if (pkg.group === ".") {
            pkg.group = "";
          }
          pkg.name = basename(value);
          break;
        case "version":
          pkg.version = value;
          break;
      }
    }
  });
  if (fetchLicenses) {
    return await getCratesMetadata(pkgList);
  } else {
    return pkgList;
  }
};

export const parseCargoAuditableData = async function (cargoData) {
  const pkgList = [];
  if (!cargoData) {
    return pkgList;
  }
  cargoData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    const tmpA = l.split("\t");
    if (tmpA && tmpA.length > 2) {
      let group = dirname(tmpA[0].trim());
      const name = basename(tmpA[0].trim());
      if (group === ".") {
        group = "";
      }
      const version = tmpA[1];
      pkgList.push({
        group,
        name,
        version
      });
    }
  });
  if (fetchLicenses) {
    return await getCratesMetadata(pkgList);
  } else {
    return pkgList;
  }
};

export const parsePubLockData = async function (pubLockData) {
  const pkgList = [];
  if (!pubLockData) {
    return pkgList;
  }
  let pkg = null;
  pubLockData.split("\n").forEach((l) => {
    let key = null;
    let value = null;
    l = l.replace("\r", "");
    if (!pkg && (l.startsWith("sdks:") || !l.startsWith("  "))) {
      return;
    }
    if (l.startsWith("  ") && !l.startsWith("    ")) {
      pkg = {
        name: l.trim().replace(":", "")
      };
    }
    if (l.startsWith("    ")) {
      const tmpA = l.split(":");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/"/g, "");
      switch (key) {
        case "version":
          pkg.version = value;
          if (pkg.name) {
            pkgList.push(pkg);
          }
          pkg = {};
          break;
      }
    }
  });
  if (fetchLicenses) {
    return await getDartMetadata(pkgList);
  } else {
    return pkgList;
  }
};

export const parsePubYamlData = function (pubYamlData) {
  const pkgList = [];
  let yamlObj = undefined;
  try {
    yamlObj = _load(pubYamlData);
  } catch (err) {
    // continue regardless of error
  }
  if (!yamlObj) {
    return pkgList;
  }
  pkgList.push({
    name: yamlObj.name,
    description: yamlObj.description,
    version: yamlObj.version,
    homepage: { url: yamlObj.homepage }
  });
  return pkgList;
};

export const parseHelmYamlData = function (helmData) {
  const pkgList = [];
  let yamlObj = undefined;
  try {
    yamlObj = _load(helmData);
  } catch (err) {
    // continue regardless of error
  }
  if (!yamlObj) {
    return pkgList;
  }
  if (yamlObj.name && yamlObj.version) {
    const pkg = {
      name: yamlObj.name,
      description: yamlObj.description || "",
      version: yamlObj.version
    };
    if (yamlObj.home) {
      pkg["homepage"] = { url: yamlObj.home };
    }
    pkgList.push(pkg);
  }
  if (yamlObj.dependencies) {
    for (const hd of yamlObj.dependencies) {
      const pkg = {
        name: hd.name,
        version: hd.version // This could have * so not precise
      };
      if (hd.repository) {
        pkg["repository"] = { url: hd.repository };
      }
      pkgList.push(pkg);
    }
  }
  if (yamlObj.entries) {
    for (const he of Object.keys(yamlObj.entries)) {
      for (const key of Object.keys(yamlObj.entries[he])) {
        const hd = yamlObj.entries[he][key];
        if (hd.name && hd.version) {
          const pkg = {
            name: hd.name,
            version: hd.version,
            description: hd.description || ""
          };
          if (hd.sources && Array.isArray(hd.sources) && hd.sources.length) {
            pkg["repository"] = { url: hd.sources[0] };
            if (hd.home && hd.home !== hd.sources[0]) {
              pkg["homepage"] = { url: hd.home };
            }
          }
          if (hd.home && !pkg["homepage"]) {
            pkg["homepage"] = { url: hd.home };
          }
          if (hd.digest) {
            pkg._integrity = "sha256-" + hd.digest;
          }

          pkgList.push(pkg);
        }
      }
    }
  }
  return pkgList;
};

export const recurseImageNameLookup = (keyValueObj, pkgList, imgList) => {
  if (typeof keyValueObj === "string" || keyValueObj instanceof String) {
    return imgList;
  }
  if (Array.isArray(keyValueObj)) {
    for (const ele of keyValueObj) {
      if (typeof ele !== "string") {
        recurseImageNameLookup(ele, pkgList, imgList);
      }
    }
  } else if (Object.keys(keyValueObj).length) {
    let imageLike =
      keyValueObj.image ||
      keyValueObj.repository ||
      keyValueObj.dockerImage ||
      keyValueObj.mavenImage ||
      keyValueObj.gradleImage ||
      keyValueObj.packImage ||
      keyValueObj.koImage ||
      keyValueObj.kanikoImage;
    if (keyValueObj.name && keyValueObj.name.includes("/")) {
      imageLike = keyValueObj.name;
    }
    if (
      imageLike &&
      typeof imageLike === "string" &&
      !imgList.includes(imageLike)
    ) {
      if (imageLike.includes("VERSION")) {
        imageLike = imageLike
          .replace(":${VERSION:-", ":")
          .replace(":${VERSION:", ":")
          .replace(":%VERSION%", ":latest")
          .replace("}", "");
      }
      pkgList.push({ image: imageLike });
      pkgList.push({ service: keyValueObj.name || imageLike });
      imgList.push(imageLike);
    }
    for (const key of Object.keys(keyValueObj)) {
      // Skip unwanted blocks to improve performance
      if (["schema", "openAPIV3Schema", "names", "status"].includes(key)) {
        continue;
      }
      const valueObj = keyValueObj[key];
      if (!valueObj) {
        continue;
      }
      if (Object.keys(valueObj).length && typeof valueObj !== "string") {
        recurseImageNameLookup(valueObj, pkgList, imgList);
      }
      if (Array.isArray(valueObj)) {
        for (const ele of valueObj) {
          if (typeof ele !== "string") {
            recurseImageNameLookup(ele, pkgList, imgList);
          }
        }
      }
    }
  }
  return imgList;
};

export const parseContainerSpecData = function (dcData) {
  const pkgList = [];
  const imgList = [];
  if (!dcData.includes("image") && !dcData.includes("kind")) {
    return pkgList;
  }
  let dcDataList = [dcData];
  if (dcData.includes("---")) {
    dcDataList = dcData.split("---");
  }
  for (const dcData of dcDataList) {
    let yamlObj = undefined;
    try {
      yamlObj = _load(dcData);
    } catch (err) {
      // ignore errors
    }
    if (!yamlObj) {
      continue;
    }
    if (yamlObj.services) {
      for (const serv of Object.keys(yamlObj.services)) {
        pkgList.push({
          service: serv
        });
        const aservice = yamlObj.services[serv];
        // Track locally built images
        if (aservice.build) {
          if (Object.keys(aservice.build).length && aservice.build.dockerfile) {
            pkgList.push({
              ociSpec: aservice.build.dockerfile
            });
          } else {
            if (aservice.build === "." || aservice.build === "./") {
              pkgList.push({
                ociSpec: "Dockerfile"
              });
            } else {
              pkgList.push({
                ociSpec: aservice.build
              });
            }
          }
        } else if (aservice.image && !imgList.includes(aservice.image)) {
          let imgFullName = aservice.image;
          if (imgFullName.includes(":${VERSION:")) {
            imgFullName = imgFullName
              .replace(":${VERSION:-", ":")
              .replace(":${VERSION:", ":")
              .replace("}", "");
          }
          pkgList.push({
            image: imgFullName
          });
          imgList.push(imgFullName);
        }
      }
    }
    // Tekton tasks and kustomize have spec. Skaffold has build
    const recurseBlock = yamlObj.spec || yamlObj.build || yamlObj.images;
    if (recurseBlock) {
      recurseImageNameLookup(recurseBlock, pkgList, imgList);
    }
  }
  return pkgList;
};

export const identifyFlow = function (processingObj) {
  let flow = "unknown";
  if (processingObj.sinkId) {
    const sinkId = processingObj.sinkId.toLowerCase();
    if (sinkId.endsWith("write")) {
      flow = "inbound";
    } else if (sinkId.endsWith("read")) {
      flow = "outbound";
    } else if (sinkId.includes("http") || sinkId.includes("grpc")) {
      flow = "bi-directional";
    }
  }
  return flow;
};

const convertProcessing = function (processing_list) {
  const data_list = [];
  for (const p of processing_list) {
    data_list.push({
      classification: p.sourceId || p.sinkId,
      flow: identifyFlow(p)
    });
  }
  return data_list;
};

export const parsePrivadoFile = function (f) {
  const pData = readFileSync(f, { encoding: "utf-8" });
  const servlist = [];
  if (!pData) {
    return servlist;
  }
  const jsonData = JSON.parse(pData);
  const aservice = {
    "x-trust-boundary": false,
    properties: [],
    data: [],
    endpoints: []
  };
  if (jsonData.repoName) {
    aservice.name = jsonData.repoName;
    aservice.properties = [
      {
        name: "SrcFile",
        value: f
      }
    ];
    // Capture git metadata info
    if (jsonData.gitMetadata) {
      aservice.version = jsonData.gitMetadata.commitId || "";
      aservice.properties.push({
        name: "privadoCoreVersion",
        value: jsonData.privadoCoreVersion || ""
      });
      aservice.properties.push({
        name: "privadoCLIVersion",
        value: jsonData.privadoCLIVersion || ""
      });
      aservice.properties.push({
        name: "localScanPath",
        value: jsonData.localScanPath || ""
      });
    }
    // Capture processing
    if (jsonData.processing && jsonData.processing.length) {
      aservice.data = aservice.data.concat(
        convertProcessing(jsonData.processing)
      );
    }
    // Capture sink processing
    if (jsonData.sinkProcessing && jsonData.sinkProcessing.length) {
      aservice.data = aservice.data.concat(
        convertProcessing(jsonData.sinkProcessing)
      );
    }
    // Find endpoints
    if (jsonData.collections) {
      const endpoints = [];
      for (const c of jsonData.collections) {
        for (const occ of c.collections) {
          for (const e of occ.occurrences) {
            if (e.endPoint) {
              endpoints.push(e.endPoint);
            }
          }
        }
      }
      aservice.endpoints = endpoints;
    }
    // Capture violations
    if (jsonData.violations) {
      for (const v of jsonData.violations) {
        aservice.properties.push({
          name: "privado_violations",
          value: v.policyId
        });
      }
    }
    // If there are third party libraries detected, then there are cross boundary calls happening
    if (
      jsonData.dataFlow &&
      jsonData.dataFlow.third_parties &&
      jsonData.dataFlow.third_parties.length
    ) {
      aservice["x-trust-boundary"] = true;
    }
    servlist.push(aservice);
  }
  return servlist;
};

export const parseOpenapiSpecData = function (oaData) {
  const servlist = [];
  if (!oaData) {
    return servlist;
  }
  try {
    if (oaData.startsWith("openapi:")) {
      oaData = _load(oaData);
    } else {
      oaData = JSON.parse(oaData);
    }
  } catch (e) {
    console.error(e);
    return servlist;
  }
  const name = oaData.info.title.replace(/ /g, "-");
  const version = oaData.info.version || "latest";
  const aservice = {
    "bom-ref": `urn:service:${name}:${version}`,
    name,
    description: oaData.description || "",
    version
  };
  let serverName = [];
  if (oaData.servers && oaData.servers.length && oaData.servers[0].url) {
    serverName = oaData.servers[0].url;
    if (!serverName.startsWith("http") || !serverName.includes("//")) {
      serverName = "http://" + serverName;
    }
  }
  if (oaData.paths) {
    const endpoints = [];
    for (const route of Object.keys(oaData.paths)) {
      let sep = "";
      if (!route.startsWith("/")) {
        sep = "/";
      }
      endpoints.push(`${serverName}${sep}${route}`);
    }
    aservice.endpoints = endpoints;
  }
  let authenticated = false;
  if (oaData.components && oaData.components.securitySchemes) {
    authenticated = true;
  }
  aservice.authenticated = authenticated;
  servlist.push(aservice);
  return servlist;
};

export const parseCabalData = function (cabalData) {
  const pkgList = [];
  if (!cabalData) {
    return pkgList;
  }
  cabalData.split("\n").forEach((l) => {
    if (!l.includes(" ==")) {
      return;
    }
    l = l.replace("\r", "");
    if (l.includes(" ==")) {
      const tmpA = l.split(" ==");
      const name = tmpA[0]
        .replace("constraints: ", "")
        .replace("any.", "")
        .trim();
      const version = tmpA[1].replace(",", "").trim();
      if (name && version) {
        pkgList.push({
          name,
          version
        });
      }
    }
  });
  return pkgList;
};

export const parseMixLockData = function (mixData) {
  const pkgList = [];
  if (!mixData) {
    return pkgList;
  }
  mixData.split("\n").forEach((l) => {
    if (!l.includes(":hex")) {
      return;
    }
    l = l.replace("\r", "");
    if (l.includes(":hex")) {
      const tmpA = l.split(",");
      if (tmpA.length > 3) {
        const name = tmpA[1].replace(":", "").trim();
        const version = tmpA[2].trim().replace(/"/g, "");
        if (name && version) {
          pkgList.push({
            name,
            version
          });
        }
      }
    }
  });
  return pkgList;
};

export const parseGitHubWorkflowData = function (ghwData) {
  const pkgList = [];
  const keys_cache = {};
  if (!ghwData) {
    return pkgList;
  }
  const yamlObj = _load(ghwData);
  if (!yamlObj) {
    return pkgList;
  }
  for (const jobName of Object.keys(yamlObj.jobs)) {
    if (yamlObj.jobs[jobName].steps) {
      for (const step of yamlObj.jobs[jobName].steps) {
        if (step.uses) {
          const tmpA = step.uses.split("@");
          if (tmpA.length === 2) {
            const groupName = tmpA[0];
            let name = groupName;
            let group = "";
            const version = tmpA[1];
            const tmpB = groupName.split("/");
            if (tmpB.length == 2) {
              name = tmpB[1];
              group = tmpB[0];
            }
            const key = group + "-" + name + "-" + version;
            if (!keys_cache[key] && name && version) {
              keys_cache[key] = key;
              pkgList.push({
                group,
                name,
                version
              });
            }
          }
        }
      }
    }
  }
  return pkgList;
};

export const parseCloudBuildData = function (cbwData) {
  const pkgList = [];
  const keys_cache = {};
  if (!cbwData) {
    return pkgList;
  }
  const yamlObj = _load(cbwData);
  if (!yamlObj) {
    return pkgList;
  }
  if (yamlObj.steps) {
    for (const step of yamlObj.steps) {
      if (step.name) {
        const tmpA = step.name.split(":");
        if (tmpA.length === 2) {
          let group = dirname(tmpA[0]);
          const name = basename(tmpA[0]);
          if (group === ".") {
            group = "";
          }
          const version = tmpA[1];
          const key = group + "-" + name + "-" + version;
          if (!keys_cache[key] && name && version) {
            keys_cache[key] = key;
            pkgList.push({
              group,
              name,
              version
            });
          }
        }
      }
    }
  }
  return pkgList;
};

export const parseConanLockData = function (conanLockData) {
  const pkgList = [];
  if (!conanLockData) {
    return pkgList;
  }
  const graphLock = JSON.parse(conanLockData);
  if (!graphLock || !graphLock.graph_lock || !graphLock.graph_lock.nodes) {
    return pkgList;
  }
  const nodes = graphLock.graph_lock.nodes;
  for (const nk of Object.keys(nodes)) {
    if (nodes[nk].ref) {
      const tmpA = nodes[nk].ref.split("/");
      if (tmpA.length === 2) {
        pkgList.push({ name: tmpA[0], version: tmpA[1] });
      }
    }
  }
  return pkgList;
};

export const parseConanData = function (conanData) {
  const pkgList = [];
  if (!conanData) {
    return pkgList;
  }
  conanData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (!l.includes("/")) {
      return;
    }
    if (l.includes("/")) {
      const tmpA = l.split("/");
      if (tmpA.length === 2) {
        pkgList.push({ name: tmpA[0], version: tmpA[1] });
      }
    }
  });
  return pkgList;
};

export const parseLeiningenData = function (leinData) {
  const pkgList = [];
  if (!leinData) {
    return pkgList;
  }
  const tmpArr = leinData.split("(defproject");
  if (tmpArr.length > 1) {
    leinData = "(defproject" + tmpArr[1];
  }
  const ednData = parseEDNString(leinData);
  for (const k of Object.keys(ednData)) {
    if (k === "list") {
      ednData[k].forEach((jk) => {
        if (Array.isArray(jk)) {
          jk.forEach((pobjl) => {
            if (Array.isArray(pobjl) && pobjl.length > 1) {
              const psym = pobjl[0].sym;
              if (psym) {
                let group = dirname(psym) || "";
                if (group === ".") {
                  group = "";
                }
                const name = basename(psym);
                pkgList.push({ group, name, version: pobjl[1] });
              }
            }
          });
        }
      });
    }
  }
  return pkgList;
};

export const parseEdnData = function (rawEdnData) {
  const pkgList = [];
  if (!rawEdnData) {
    return pkgList;
  }
  const ednData = parseEDNString(rawEdnData);
  const pkgCache = {};
  for (const k of Object.keys(ednData)) {
    if (k === "map") {
      ednData[k].forEach((jk) => {
        if (Array.isArray(jk)) {
          if (Array.isArray(jk)) {
            if (jk.length > 1) {
              if (jk[0].key === "deps") {
                const deps = jk[1].map;
                if (deps) {
                  deps.forEach((d) => {
                    if (Array.isArray(d)) {
                      let psym = "";
                      d.forEach((e) => {
                        if (e.sym) {
                          psym = e.sym;
                        }
                        if (e["map"]) {
                          if (e["map"][0].length > 1) {
                            const version = e["map"][0][1];
                            let group = dirname(psym) || "";
                            if (group === ".") {
                              group = "";
                            }
                            const name = basename(psym);
                            const cacheKey = group + "-" + name + "-" + version;
                            if (!pkgCache[cacheKey]) {
                              pkgList.push({ group, name, version });
                              pkgCache[cacheKey] = true;
                            }
                          }
                        }
                      });
                    }
                  });
                }
              }
            }
          }
        }
      });
    }
  }
  return pkgList;
};

export const parseNupkg = async function (nupkgFile) {
  let nuspecData = await readZipEntry(nupkgFile, ".nuspec");
  if (!nuspecData) {
    return [];
  }
  if (nuspecData.charCodeAt(0) === 65533) {
    nuspecData = await readZipEntry(nupkgFile, ".nuspec", "ucs2");
  }
  return await parseNuspecData(nupkgFile, nuspecData);
};

export const parseNuspecData = async function (nupkgFile, nuspecData) {
  const pkgList = [];
  const pkg = { group: "" };
  let npkg = undefined;
  try {
    npkg = xml2js(nuspecData, {
      compact: true,
      alwaysArray: false,
      spaces: 4,
      textKey: "_",
      attributesKey: "$",
      commentKey: "value"
    }).package;
  } catch (e) {
    // If we are parsing with invalid encoding, unicode replacement character is used
    if (nuspecData.charCodeAt(0) === 65533) {
      console.log(`Unable to parse ${nupkgFile} in utf-8 mode`);
    } else {
      console.log(
        "Unable to parse this package. Tried utf-8 and ucs2 encoding."
      );
    }
  }
  if (!npkg) {
    return pkgList;
  }
  const m = npkg.metadata;
  pkg.name = m.id._;
  pkg.version = m.version._;
  pkg.description = m.description._;
  pkg.properties = [
    {
      name: "SrcFile",
      value: nupkgFile
    }
  ];
  pkg.evidence = {
    identity: {
      field: "purl",
      confidence: 1,
      methods: [
        {
          technique: "binary-analysis",
          confidence: 1,
          value: nupkgFile
        }
      ]
    }
  };
  pkgList.push(pkg);
  if (fetchLicenses) {
    return await getNugetMetadata(pkgList);
  } else {
    return pkgList;
  }
};

export const parseCsPkgData = async function (pkgData) {
  const pkgList = [];
  if (!pkgData) {
    return pkgList;
  }
  let packages = xml2js(pkgData, {
    compact: true,
    alwaysArray: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value"
  }).packages;
  if (packages.length == 0) {
    return pkgList;
  }
  packages = packages[0].package;
  for (const i in packages) {
    const p = packages[i].$;
    const pkg = { group: "" };
    pkg.name = p.id;
    pkg.version = p.version;
    pkgList.push(pkg);
  }
  if (fetchLicenses) {
    return await getNugetMetadata(pkgList);
  } else {
    return pkgList;
  }
};

export const parseCsProjData = async function (csProjData) {
  const pkgList = [];
  if (!csProjData) {
    return pkgList;
  }
  const projects = xml2js(csProjData, {
    compact: true,
    alwaysArray: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value"
  }).Project;
  if (projects.length == 0) {
    return pkgList;
  }
  const project = projects[0];
  if (project.ItemGroup && project.ItemGroup.length) {
    for (const i in project.ItemGroup) {
      const item = project.ItemGroup[i];
      // .net core use PackageReference
      for (const j in item.PackageReference) {
        const pref = item.PackageReference[j].$;
        const pkg = { group: "" };
        if (!pref.Include || pref.Include.includes(".csproj")) {
          continue;
        }
        pkg.name = pref.Include;
        pkg.version = pref.Version;
        pkgList.push(pkg);
      }
      // .net framework use Reference
      for (const j in item.Reference) {
        const pref = item.Reference[j].$;
        const pkg = { group: "" };
        if (!pref.Include || pref.Include.includes(".csproj")) {
          continue;
        }
        const incParts = pref.Include.split(",");
        pkg.name = incParts[0];
        if (incParts.length > 1 && incParts[1].includes("Version")) {
          pkg.version = incParts[1].replace("Version=", "").trim();
        }
        pkgList.push(pkg);
      }
    }
  }
  if (fetchLicenses) {
    return await getNugetMetadata(pkgList);
  } else {
    return pkgList;
  }
};

export const parseCsProjAssetsData = async function (csProjData) {
  // extract name, operator, version from .NET package representation
  // like "NLog >= 4.5.0"
  function extractNameOperatorVersion(inputStr) {
    const extractNameOperatorVersion = /([\w.]+)\s*([><=!]+)\s*([\d.]+)/
    const match = inputStr.match(extractNameOperatorVersion);

    if (match) {
      return {
        name: match[1],
        operator: match[2],
        version: match[3],
      };
    } else {
      return null;
    }
  }

  const pkgList = [];
  let dependenciesList = [];
  let rootPkg = {};

  if (!csProjData){
    return pkgList, dependenciesList
  }

  csProjData = JSON.parse(csProjData);
  rootPkg =
    {
      group: "",
      name: csProjData.project.restore.projectName,
      version: csProjData.project.version || "latest",
      type: "application",
      "bom-ref": decodeURIComponent(
        new PackageURL(
          "nuget",
          "",
          csProjData.project.restore.projectName,
          csProjData.project.version || "latest",
          null,
          null
        ).toString()
      )
    }
  const purlString = decodeURIComponent(rootPkg["bom-ref"].toString());
  pkgList.push(rootPkg);
  let rootPkgDeps = new Set();

  // create root pkg deps
  if (csProjData.targets && csProjData.projectFileDependencyGroups) {
    for (const frameworkTarget in csProjData.projectFileDependencyGroups) {
      for (const dependencyName of csProjData.projectFileDependencyGroups[frameworkTarget]) {
        const nameOperatorVersion = extractNameOperatorVersion(dependencyName)
        const targetNameVersion = `${nameOperatorVersion.name}/${nameOperatorVersion.version}`

        // skip if the dep is not in the targets for whatever reason
        if (!csProjData.targets[frameworkTarget][targetNameVersion]) {
          continue;
        }

        const dpurl = decodeURIComponent(
          new PackageURL(
            "nuget",
            "",
            nameOperatorVersion.name,
            nameOperatorVersion.version,
            null,
            null
          ).toString()
        );
        rootPkgDeps.add(dpurl);
      }
    }

    dependenciesList.push({
      ref: purlString,
      dependsOn: Array.from(rootPkgDeps)
    })
  }

  if (
    csProjData.libraries &&
    csProjData.targets
  ) {
    const lib = csProjData.libraries;
    for (const framework in csProjData.targets) {
      for (const rootDep of Object.keys(csProjData.targets[framework])) {
        // if (rootDep.startsWith("runtime")){
        //   continue;
        // }
        const depList = new Set();
        const [name, version] = rootDep.split("/");
        const dpurl = decodeURIComponent(
          new PackageURL(
            "nuget",
            "",
            name,
            version,
            null,
            null
          ).toString()
        );
        let pkg = {
            group: "",
            name: name,
            // .NET ecosystem has no distinction between dev and prod dependencies
            // like other ecosystems do, so we set scope to required for all packages
            scope: "required",
            version: version,
            description: "",
            type: csProjData.targets[framework][rootDep].type,
            "bom-ref": dpurl,
          }
        if (lib[rootDep]) {
          if (lib[rootDep].sha512){
            pkg["_integrity"] = "sha512-" + lib[rootDep].sha512;
          }
          else if (lib[rootDep].sha256){
            pkg["_integrity"] = "sha256-" + lib[rootDep].sha256;
          }
        }
        pkgList.push(pkg);

        const dependencies = csProjData.targets[framework][rootDep].dependencies;
        if (dependencies) {
          for (const p of Object.keys(dependencies)) {
            const ipurl = decodeURIComponent(
              new PackageURL(
                "nuget",
                "",
                p,
                dependencies[p],
                null,
                null
              ).toString()
            );
            depList.add(ipurl);
            pkgList.push(
              {
                group: "",
                name: p,
                version: dependencies[p],
                description: "",
                "bom-ref": ipurl
              }
            )
          }
        }
        dependenciesList.push({
          ref: dpurl,
          dependsOn: Array.from(depList)
        });
      }
    }
  }
  if (fetchLicenses) {
    return await getNugetMetadata(pkgList);
  } else {
    return {
      pkgList,
      dependenciesList
    }
  }
}

export const parseCsPkgLockData = async function (csLockData) {
  const pkgList = [];
  let pkg = null;
  if (!csLockData) {
    return pkgList;
  }
  const assetData = JSON.parse(csLockData);
  if (!assetData || !assetData.dependencies) {
    return pkgList;
  }
  for (const aversion of Object.keys(assetData.dependencies)) {
    for (const alib of Object.keys(assetData.dependencies[aversion])) {
      const libData = assetData.dependencies[aversion][alib];
      pkg = {
        group: "",
        name: alib,
        version: libData.resolved
      };
      pkgList.push(pkg);
    }
  }
  if (fetchLicenses) {
    return await getNugetMetadata(pkgList);
  } else {
    return pkgList;
  }
};

/**
 * Method to retrieve metadata for nuget packages
 *
 * @param {Array} pkgList Package list
 */
export const getNugetMetadata = async function (pkgList) {
  const NUGET_URL = "https://api.nuget.org/v3/registration3/";
  const cdepList = [];
  for (const p of pkgList) {
    let cacheKey = undefined;
    try {
      if (
        (p.group && p.group.toLowerCase() === "system") ||
        p.name.toLowerCase().startsWith("system")
      ) {
        p.license = "http://go.microsoft.com/fwlink/?LinkId=329770";
      } else if (
        (p.group && p.group.toLowerCase() === "microsoft") ||
        p.name.toLowerCase().startsWith("microsoft")
      ) {
        p.license =
          "http://www.microsoft.com/web/webpi/eula/net_library_eula_enu.htm";
      } else if (
        (p.group && p.group.toLowerCase() === "nuget") ||
        p.name.toLowerCase().startsWith("nuget")
      ) {
        p.license = "Apache-2.0";
      } else {
        // If there is a version, we can safely use the cache to retrieve the license
        // See: https://github.com/CycloneDX/cdxgen/issues/352
        const twoPartName = p.name.split(".").slice(0, 2).join(".");
        cacheKey = `${p.group}|${twoPartName}`;
        let body = metadata_cache[cacheKey];
        if (body && body.error) {
          cdepList.push(p);
          continue;
        }
        if (!body) {
          if (DEBUG_MODE) {
            console.log(`Querying nuget for ${p.name}`);
          }
          const res = await cdxgenAgent.get(
            NUGET_URL +
              p.group.toLowerCase() +
              (p.group !== "" ? "." : "") +
              p.name.toLowerCase() +
              "/index.json",
            { responseType: "json" }
          );
          const items = res.body.items;
          if (!items || !items[0] || !items[0].items) {
            continue;
          }
          const firstItem = items[0];
          // Work backwards to find the body for the matching version
          body = firstItem.items[firstItem.items.length - 1];
          if (p.version) {
            const newBody = firstItem.items
              .reverse()
              .filter(
                (i) => i.catalogEntry && i.catalogEntry.version === p.version
              );
            if (newBody && newBody.length) {
              body = newBody[0];
            }
          }
          metadata_cache[cacheKey] = body;
        }
        // Set the latest version in case it is missing
        if (!p.version && body.catalogEntry.version) {
          p.version = body.catalogEntry.version;
        }
        p.description = body.catalogEntry.description;
        if (body.catalogEntry.authors) {
          p.author = body.catalogEntry.authors.trim();
        }
        if (
          body.catalogEntry.licenseExpression &&
          body.catalogEntry.licenseExpression !== ""
        ) {
          p.license = findLicenseId(body.catalogEntry.licenseExpression);
        } else if (body.catalogEntry.licenseUrl) {
          p.license = findLicenseId(body.catalogEntry.licenseUrl);
        }
        if (body.catalogEntry.projectUrl) {
          p.repository = { url: body.catalogEntry.projectUrl };
          p.homepage = {
            url:
              "https://www.nuget.org/packages/" +
              p.group +
              (p.group !== "" ? "." : "") +
              p.name +
              "/" +
              p.version +
              "/"
          };
        }
      }
      cdepList.push(p);
    } catch (err) {
      if (cacheKey) {
        metadata_cache[cacheKey] = { error: err.code };
      }
      cdepList.push(p);
    }
  }
  return cdepList;
};

/**
 * Parse composer lock file
 *
 * @param {string} pkgLockFile composer.lock file
 */
export const parseComposerLock = function (pkgLockFile) {
  const pkgList = [];
  if (existsSync(pkgLockFile)) {
    let lockData = {};
    try {
      lockData = JSON.parse(readFileSync(pkgLockFile, "utf8"));
    } catch (e) {
      console.error("Invalid composer.lock file:", pkgLockFile);
      return [];
    }
    if (lockData) {
      const packages = {};
      if (lockData["packages"]) {
        packages["required"] = lockData["packages"];
      }
      if (lockData["packages-dev"]) {
        packages["optional"] = lockData["packages-dev"];
      }
      for (const compScope in packages) {
        for (const i in packages[compScope]) {
          const pkg = packages[compScope][i];
          // Be extra cautious. Potential fix for #236
          if (!pkg || !pkg.name || !pkg.version) {
            continue;
          }
          let group = dirname(pkg.name);
          if (group === ".") {
            group = "";
          }
          const name = basename(pkg.name);
          pkgList.push({
            group: group,
            name: name,
            // Remove leading v from version to work around bug
            //  https://github.com/OSSIndex/vulns/issues/231
            // @TODO: remove workaround when DependencyTrack v4.4 is released,
            //  which has it's own workaround. Or when the 231 bug is fixed.
            version: pkg.version.replace(/^v/, ""),
            repository: pkg.source,
            license: pkg.license,
            description: pkg.description,
            scope: compScope,
            properties: [
              {
                name: "SrcFile",
                value: pkgLockFile
              }
            ],
            evidence: {
              identity: {
                field: "purl",
                confidence: 1,
                methods: [
                  {
                    technique: "manifest-analysis",
                    confidence: 1,
                    value: pkgLockFile
                  }
                ]
              }
            }
          });
        }
      }
    }
  }
  return pkgList;
};

export const parseSbtTree = (sbtTreeFile) => {
  const pkgList = [];
  const dependenciesList = [];
  const keys_cache = {};
  const level_trees = {};
  const tmpA = readFileSync(sbtTreeFile, "utf-8").split("\n");
  let last_level = 0;
  let last_purl = "";
  let stack = [];
  let first_purl = "";
  tmpA.forEach((l) => {
    l = l.replace("\r", "");
    // Ignore evicted packages and packages with multiple version matches indicated with a comma
    // | +-org.scala-lang:scala3-library_3:3.1.3 (evicted by: 3.3.0)
    // | | | | | | +-org.eclipse.platform:org.eclipse.equinox.common:[3.15.100,4.0...
    // | | | | | | | +-org.eclipse.platform:org.eclipse.equinox.common:3.17.100 (ev..
    if (l.includes("(evicted") || l.includes(",")) {
      return;
    }
    let level = 0;
    let isLibrary = false;
    if (l.startsWith("  ")) {
      level = l.split("|").length;
    }
    // This will skip blank lines such as "| | | | | | | "
    if (level > 0 && !l.includes("+-")) {
      return;
    }
    if (l.endsWith("[S]")) {
      isLibrary = true;
    }
    const tmpB = l.split("+-");
    const pkgLine = tmpB[tmpB.length - 1].split(" ")[0];
    if (!pkgLine.includes(":")) {
      return;
    }
    const pkgParts = pkgLine.split(":");
    let group = "";
    let name = "";
    let version = "";
    if (pkgParts.length === 3) {
      group = pkgParts[0];
      name = pkgParts[1];
      version = pkgParts[2];
    } else if (pkgParts.length === 2) {
      // unlikely for scala
      name = pkgParts[0];
      version = pkgParts[1];
    }
    const purlString = new PackageURL(
      "maven",
      group,
      name,
      version,
      { type: "jar" },
      null
    ).toString();
    // Filter duplicates
    if (!keys_cache[purlString]) {
      const adep = {
        group,
        name,
        version,
        purl: decodeURIComponent(purlString),
        "bom-ref": purlString,
        evidence: {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: sbtTreeFile
              }
            ]
          }
        }
      };
      if (isLibrary) {
        adep["type"] = "library";
      }
      pkgList.push(adep);
      keys_cache[purlString] = true;
    }
    // From here the logic is similar to parsing gradle tree
    if (!level_trees[purlString]) {
      level_trees[purlString] = [];
    }
    if (level == 0) {
      first_purl = purlString;
      stack = [first_purl];
      stack.push(purlString);
    } else if (last_purl === "") {
      stack.push(purlString);
    } else if (level > last_level) {
      const cnodes = level_trees[last_purl] || [];
      if (!cnodes.includes(purlString)) {
        cnodes.push(purlString);
      }
      level_trees[last_purl] = cnodes;
      if (stack[stack.length - 1] !== purlString) {
        stack.push(purlString);
      }
    } else {
      for (let i = level; i <= last_level; i++) {
        stack.pop();
      }
      const last_stack =
        stack.length > 0 ? stack[stack.length - 1] : first_purl;
      const cnodes = level_trees[last_stack] || [];
      if (!cnodes.includes(purlString)) {
        cnodes.push(purlString);
      }
      level_trees[last_stack] = cnodes;
      stack.push(purlString);
    }
    last_level = level;
    last_purl = purlString;
  });
  for (const lk of Object.keys(level_trees)) {
    dependenciesList.push({
      ref: lk,
      dependsOn: level_trees[lk]
    });
  }
  return { pkgList, dependenciesList };
};

/**
 * Parse sbt lock file
 *
 * @param {string} pkgLockFile build.sbt.lock file
 */
export const parseSbtLock = function (pkgLockFile) {
  const pkgList = [];
  if (existsSync(pkgLockFile)) {
    const lockData = JSON.parse(readFileSync(pkgLockFile, "utf8"));
    if (lockData && lockData.dependencies) {
      for (const pkg of lockData.dependencies) {
        const artifacts = pkg.artifacts || undefined;
        let integrity = "";
        if (artifacts && artifacts.length) {
          integrity = artifacts[0].hash.replace("sha1:", "sha1-");
        }
        let compScope = undefined;
        if (pkg.configurations) {
          if (pkg.configurations.includes("runtime")) {
            compScope = "required";
          } else {
            compScope = "optional";
          }
        }
        pkgList.push({
          group: pkg.org,
          name: pkg.name,
          version: pkg.version,
          _integrity: integrity,
          scope: compScope,
          properties: [
            {
              name: "SrcFile",
              value: pkgLockFile
            }
          ],
          evidence: {
            identity: {
              field: "purl",
              confidence: 1,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 1,
                  value: pkgLockFile
                }
              ]
            }
          }
        });
      }
    }
  }
  return pkgList;
};

const convertStdoutToList = (result) => {
  if (result.status !== 0 || result.error) {
    return undefined;
  }
  const stdout = result.stdout;
  if (stdout) {
    const cmdOutput = Buffer.from(stdout).toString();
    return cmdOutput
      .trim()
      .toLowerCase()
      .split("\n")
      .filter((p) => p.length > 2 && p.includes("."))
      .sort();
  }
  return undefined;
};

/**
 * Method to execute dpkg --listfiles to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export const executeDpkgList = (pkgName) => {
  const result = spawnSync("dpkg", ["--listfiles", "--no-pager", pkgName], {
    encoding: "utf-8"
  });
  return convertStdoutToList(result);
};

/**
 * Method to execute dnf repoquery to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export const executeRpmList = (pkgName) => {
  let result = spawnSync("dnf", ["repoquery", "-l", pkgName], {
    encoding: "utf-8"
  });
  // Fallback to rpm
  if (result.status !== 0 || result.error) {
    result = spawnSync("rpm", ["-ql", pkgName], {
      encoding: "utf-8"
    });
  }
  return convertStdoutToList(result);
};

/**
 * Method to execute apk -L info to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export const executeApkList = (pkgName) => {
  const result = spawnSync("apk", ["-L", "info", pkgName], {
    encoding: "utf-8"
  });
  return convertStdoutToList(result);
};

/**
 * Method to execute alpm -Ql to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export const executeAlpmList = (pkgName) => {
  const result = spawnSync("pacman", ["-Ql", pkgName], {
    encoding: "utf-8"
  });
  return convertStdoutToList(result);
};

/**
 * Method to execute equery files to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export const executeEqueryList = (pkgName) => {
  const result = spawnSync("equery", ["files", pkgName], {
    encoding: "utf-8"
  });
  return convertStdoutToList(result);
};

/**
 * Convert OS query results
 *
 * @param {string} Query category
 * @param {Object} queryObj Query Object from the queries.json configuration
 * @param {Array} results Query Results
 * @param {Boolean} enhance Optionally enhance results by invoking additional package manager commands
 */
export const convertOSQueryResults = function (
  queryCategory,
  queryObj,
  results,
  enhance = false
) {
  const pkgList = [];
  if (results && results.length) {
    for (const res of results) {
      const version =
        res.version ||
        res.hotfix_id ||
        res.hardware_version ||
        res.port ||
        res.pid ||
        res.subject_key_id ||
        res.interface ||
        res.instance_id;
      let name =
        res.name ||
        res.device_id ||
        res.hotfix_id ||
        res.uuid ||
        res.serial ||
        res.pid ||
        res.address ||
        res.ami_id ||
        res.interface ||
        res.client_app_id;
      let group = "";
      const subpath = res.path || res.admindir || res.source;
      let publisher =
        res.publisher ||
        res.maintainer ||
        res.creator ||
        res.manufacturer ||
        res.provider ||
        "";
      if (publisher === "null") {
        publisher = "";
      }
      let scope = undefined;
      const compScope = res.priority;
      if (["required", "optional", "excluded"].includes(compScope)) {
        scope = compScope;
      }
      const description =
        res.description ||
        res.summary ||
        res.arguments ||
        res.device ||
        res.codename ||
        res.section ||
        res.status ||
        res.identifier ||
        res.components ||
        "";
      // Re-use the name from query obj
      if (!name && results.length === 1 && queryObj.name) {
        name = queryObj.name;
      }
      let qualifiers = undefined;
      if (res.identifying_number && res.identifying_number.length) {
        qualifiers = {
          tag_id: res.identifying_number.replace("{", "").replace("}", "")
        };
      }
      if (name) {
        name = name
          .replace(/ /g, "+")
          .replace(/[:%]/g, "-")
          .replace(/^[@{]/g, "")
          .replace(/[}]$/g, "");
        group = group
          .replace(/ /g, "+")
          .replace(/[:%]/g, "-")
          .replace(/^[@{]/g, "")
          .replace(/[}]$/g, "");
        const purl = new PackageURL(
          queryObj.purlType || "swid",
          group,
          name,
          version || "",
          qualifiers,
          subpath
        ).toString();
        const props = [{ name: "cdx:osquery:category", value: queryCategory }];
        let providesList = undefined;
        if (enhance) {
          switch (queryObj.purlType) {
            case "deb":
              providesList = executeDpkgList(name);
              break;
            case "rpm":
              providesList = executeRpmList(name);
              break;
            case "apk":
              providesList = executeApkList(name);
              break;
            case "ebuild":
              providesList = executeEqueryList(name);
              break;
            case "alpm":
              providesList = executeAlpmList(name);
              break;
            default:
              break;
          }
        }
        if (providesList) {
          props.push({ name: "PkgProvides", value: providesList.join(", ") });
        }
        const apkg = {
          name,
          group,
          version: version || "",
          description,
          publisher,
          "bom-ref": decodeURIComponent(purl),
          purl,
          scope,
          type: queryObj.componentType
        };
        for (const k of Object.keys(res).filter(
          (p) => !["name", "version", "description", "publisher"].includes(p)
        )) {
          if (res[k] && res[k] !== "null") {
            props.push({
              name: k,
              value: res[k]
            });
          }
        }
        apkg.properties = props;
        pkgList.push(apkg);
      }
    }
  }
  return pkgList;
};

export const _swiftDepPkgList = (
  pkgList,
  dependenciesList,
  depKeys,
  jsonData
) => {
  if (jsonData && jsonData.dependencies) {
    for (const adep of jsonData.dependencies) {
      const urlOrPath = adep.url || adep.path;
      const apkg = {
        group: adep.identity || "",
        name: adep.name,
        version: adep.version
      };
      const purl = new PackageURL(
        "swift",
        apkg.group,
        apkg.name,
        apkg.version,
        null,
        null
      );
      const purlString = decodeURIComponent(purl.toString());
      if (urlOrPath) {
        if (urlOrPath.startsWith("http")) {
          apkg.repository = { url: urlOrPath };
          if (apkg.path) {
            apkg.properties = [
              {
                name: "SrcPath",
                value: apkg.path
              }
            ];
          }
        } else {
          apkg.properties = [
            {
              name: "SrcPath",
              value: urlOrPath
            }
          ];
        }
      }
      pkgList.push(apkg);
      // Handle the immediate dependencies before recursing
      if (adep.dependencies && adep.dependencies.length) {
        const deplist = [];
        for (const cdep of adep.dependencies) {
          const deppurl = new PackageURL(
            "swift",
            cdep.identity || "",
            cdep.name,
            cdep.version,
            null,
            null
          );
          const deppurlString = decodeURIComponent(deppurl.toString());
          deplist.push(deppurlString);
        }
        if (!depKeys[purlString]) {
          dependenciesList.push({
            ref: purlString,
            dependsOn: deplist
          });
          depKeys[purlString] = true;
        }
        if (adep.dependencies && adep.dependencies.length) {
          _swiftDepPkgList(pkgList, dependenciesList, depKeys, adep);
        }
      } else {
        if (!depKeys[purlString]) {
          dependenciesList.push({
            ref: purlString,
            dependsOn: []
          });
          depKeys[purlString] = true;
        }
      }
    }
  }
  return { pkgList, dependenciesList };
};

/**
 * Parse swift dependency tree output
 * @param {string} rawOutput Swift dependencies json output
 * @param {string} pkgFile Package.swift file
 */
export const parseSwiftJsonTree = (rawOutput, pkgFile) => {
  if (!rawOutput) {
    return {};
  }
  const pkgList = [];
  const dependenciesList = [];
  const depKeys = {};
  let rootPkg = {};
  let jsonData = {};
  try {
    jsonData = JSON.parse(rawOutput);
    if (jsonData && jsonData.name) {
      rootPkg = {
        group: jsonData.identity || "",
        name: jsonData.name,
        version: jsonData.version
      };
      const urlOrPath = jsonData.url || jsonData.path;
      if (urlOrPath) {
        if (urlOrPath.startsWith("http")) {
          rootPkg.repository = { url: urlOrPath };
        } else {
          rootPkg.properties = [
            {
              name: "SrcPath",
              value: urlOrPath
            },
            {
              name: "SrcFile",
              value: pkgFile
            }
          ];
        }
      }
      const purl = new PackageURL(
        "swift",
        rootPkg.group,
        rootPkg.name,
        rootPkg.version,
        null,
        null
      );
      const purlString = decodeURIComponent(purl.toString());
      rootPkg["bom-ref"] = purlString;
      pkgList.push(rootPkg);
      const deplist = [];
      for (const rd of jsonData.dependencies) {
        const deppurl = new PackageURL(
          "swift",
          rd.identity || "",
          rd.name,
          rd.version,
          null,
          null
        );
        const deppurlString = decodeURIComponent(deppurl.toString());
        deplist.push(deppurlString);
      }
      dependenciesList.push({
        ref: purlString,
        dependsOn: deplist
      });
      _swiftDepPkgList(pkgList, dependenciesList, depKeys, jsonData);
    }
  } catch (e) {
    if (DEBUG_MODE) {
      console.log(e);
    }
    return {};
  }
  return {
    pkgList,
    dependenciesList
  };
};

/**
 * Parse swift package resolved file
 * @param {string} resolvedFile Package.resolved file
 */
export const parseSwiftResolved = (resolvedFile) => {
  const pkgList = [];
  if (existsSync(resolvedFile)) {
    try {
      const pkgData = JSON.parse(readFileSync(resolvedFile, "utf8"));
      let resolvedList = [];
      if (pkgData.pins) {
        resolvedList = pkgData.pins;
      } else if (pkgData.object && pkgData.object.pins) {
        resolvedList = pkgData.object.pins;
      }
      for (const adep of resolvedList) {
        const apkg = {
          name: adep.package || adep.identity,
          group: "",
          version: adep.state.version || adep.state.revision,
          properties: [
            {
              name: "SrcFile",
              value: resolvedFile
            }
          ],
          evidence: {
            identity: {
              field: "purl",
              confidence: 1,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 1,
                  value: resolvedFile
                }
              ]
            }
          }
        };
        const repLocation = adep.location || adep.repositoryURL;
        if (repLocation) {
          apkg.repository = { url: repLocation };
        }
        pkgList.push(apkg);
      }
    } catch (err) {
      // continue regardless of error
    }
  }
  return pkgList;
};

/**
 * Collect maven dependencies
 *
 * @param {string} mavenCmd Maven command to use
 * @param {string} basePath Path to the maven project
 * @param {boolean} cleanup Remove temporary directories
 * @param {boolean} includeCacheDir Include maven and gradle cache directories
 */
export const collectMvnDependencies = function (
  mavenCmd,
  basePath,
  cleanup = true,
  includeCacheDir = false
) {
  let jarNSMapping = {};
  const MAVEN_CACHE_DIR =
    process.env.MAVEN_CACHE_DIR || join(homedir(), ".m2", "repository");
  const tempDir = mkdtempSync(join(tmpdir(), "mvn-deps-"));
  const copyArgs = [
    "dependency:copy-dependencies",
    `-DoutputDirectory=${tempDir}`,
    "-U",
    "-Dmdep.copyPom=true",
    "-Dmdep.useRepositoryLayout=true",
    "-Dmdep.includeScope=compile",
    "-Dmdep.prependGroupId=" + (process.env.MAVEN_PREPEND_GROUP || "false"),
    "-Dmdep.stripVersion=" + (process.env.MAVEN_STRIP_VERSION || "false")
  ];
  if (basePath && basePath !== MAVEN_CACHE_DIR) {
    console.log(
      `Executing '${mavenCmd} dependency:copy-dependencies ${copyArgs.join(
        " "
      )}' in ${basePath}`
    );
    const result = spawnSync(mavenCmd, copyArgs, {
      cwd: basePath,
      encoding: "utf-8"
    });
    if (result.status !== 0 || result.error) {
      console.error(result.stdout, result.stderr);
      console.log(
        "Resolve the above maven error. You can try the following remediation tips:\n"
      );
      console.log(
        "1. Check if the correct version of maven is installed and available in the PATH."
      );
      console.log(
        "2. Perform 'mvn compile package' before invoking this command. Fix any errors found during this invocation."
      );
      console.log(
        "3. Ensure the temporary directory is available and has sufficient disk space to copy all the artifacts."
      );
    } else {
      jarNSMapping = collectJarNS(tempDir);
    }
  }
  if (includeCacheDir || basePath === MAVEN_CACHE_DIR) {
    // slow operation
    jarNSMapping = collectJarNS(MAVEN_CACHE_DIR);
  }

  // Clean up
  if (cleanup && tempDir && tempDir.startsWith(tmpdir()) && rmSync) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return jarNSMapping;
};

export const collectGradleDependencies = (
  gradleCmd,
  basePath,
  cleanup = true, // eslint-disable-line no-unused-vars
  includeCacheDir = false // eslint-disable-line no-unused-vars
) => {
  // HELP WANTED: We need an init script that mimics maven copy-dependencies that only collects the project specific jars and poms
  // Construct gradle cache directory
  let GRADLE_CACHE_DIR =
    process.env.GRADLE_CACHE_DIR ||
    join(homedir(), ".gradle", "caches", "modules-2", "files-2.1");
  if (process.env.GRADLE_USER_HOME) {
    GRADLE_CACHE_DIR = join(
      process.env.GRADLE_USER_HOME,
      "caches",
      "modules-2",
      "files-2.1"
    );
  }
  if (DEBUG_MODE) {
    console.log("Collecting jars from", GRADLE_CACHE_DIR);
    console.log(
      "To improve performance, ensure only the project dependencies are present in this cache location."
    );
  }
  const pomPathMap = {};
  const pomFiles = getAllFiles(GRADLE_CACHE_DIR, "**/*.pom");
  for (const apom of pomFiles) {
    pomPathMap[basename(apom)] = apom;
  }
  const jarNSMapping = collectJarNS(GRADLE_CACHE_DIR, pomPathMap);
  return jarNSMapping;
};

/**
 * Method to collect class names from all jars in a directory
 *
 * @param {string} jarPath Path containing jars
 * @param {object} pomPathMap Map containing jar to pom names. Required to successful parse gradle cache.
 *
 * @return object containing jar name and class list
 */
export const collectJarNS = function (jarPath, pomPathMap = {}) {
  const jarNSMapping = {};
  console.log(
    `About to identify class names for all jars in the path ${jarPath}`
  );
  // Execute jar tvf to get class names
  const jarFiles = getAllFiles(jarPath, "**/*.jar");
  if (jarFiles && jarFiles.length) {
    for (const jf of jarFiles) {
      const jarname = jf;
      let pomname =
        pomPathMap[basename(jf).replace(".jar", ".pom")] ||
        jarname.replace(".jar", ".pom");
      let pomData = undefined;
      let purl = undefined;
      // In some cases, the pom name might be slightly different to the jar name
      if (!existsSync(pomname)) {
        const pomSearch = getAllFiles(dirname(jf), "*.pom");
        if (pomSearch && pomSearch.length === 1) {
          pomname = pomSearch[0];
        }
      }
      if (existsSync(pomname)) {
        pomData = parsePomXml(readFileSync(pomname, "utf-8"));
        if (pomData) {
          const purlObj = new PackageURL(
            "maven",
            pomData.groupId || "",
            pomData.artifactId,
            pomData.version,
            { type: "jar" },
            null
          );
          purl = purlObj.toString();
        }
      } else if (jf.includes(join(".m2", "repository"))) {
        // Let's try our best to construct a purl for .m2 cache entries of the form
        // .m2/repository/org/apache/logging/log4j/log4j-web/3.0.0-SNAPSHOT/log4j-web-3.0.0-SNAPSHOT.jar
        const tmpA = jf.split(join(".m2", "repository", ""));
        if (tmpA && tmpA.length) {
          let tmpJarPath = tmpA[tmpA.length - 1];
          // This would yield log4j-web-3.0.0-SNAPSHOT.jar
          const jarFileName = basename(tmpJarPath).replace(".jar", "");
          let tmpDirParts = dirname(tmpJarPath).split(_sep);
          // Retrieve the version
          let jarVersion = tmpDirParts.pop();
          if (jarVersion === "plugins") {
            jarVersion = tmpDirParts.pop();
            if (jarVersion === "eclipse") {
              jarVersion = tmpDirParts.pop();
            }
          }
          // The result would form the group name
          let jarGroupName = tmpDirParts.join(".").replace(/^\./, "");
          let qualifierType = "jar";
          // Support for p2 bundles and plugins
          // See https://github.com/CycloneDX/cyclonedx-maven-plugin/issues/137
          // See https://github.com/CycloneDX/cdxgen/pull/510#issuecomment-1702551615
          if (jarGroupName.startsWith("p2.osgi.bundle")) {
            jarGroupName = "p2.osgi.bundle";
            qualifierType = "osgi-bundle";
          } else if (jarGroupName.startsWith("p2.eclipse.plugin")) {
            jarGroupName = "p2.eclipse.plugin";
            qualifierType = "eclipse-plugin";
          } else if (jarGroupName.startsWith("p2.binary")) {
            jarGroupName = "p2.binary";
            qualifierType = "eclipse-executable";
          } else if (jarGroupName.startsWith("p2.org.eclipse.update.feature")) {
            jarGroupName = "p2.org.eclipse.update.feature";
            qualifierType = "eclipse-feature";
          }
          const purlObj = new PackageURL(
            "maven",
            jarGroupName,
            jarFileName.replace(`-${jarVersion}`, ""),
            jarVersion,
            { type: qualifierType },
            null
          );
          purl = purlObj.toString();
        }
      } else if (jf.includes(join(".gradle", "caches"))) {
        // Let's try our best to construct a purl for gradle cache entries of the form
        // .gradle/caches/modules-2/files-2.1/org.xmlresolver/xmlresolver/4.2.0/f4dbdaa83d636dcac91c9003ffa7fb173173fe8d/xmlresolver-4.2.0-data.jar
        const tmpA = jf.split(join("files-2.1", ""));
        if (tmpA && tmpA.length) {
          let tmpJarPath = tmpA[tmpA.length - 1];
          // This would yield xmlresolver-4.2.0-data.jar
          const jarFileName = basename(tmpJarPath).replace(".jar", "");
          let tmpDirParts = dirname(tmpJarPath).split(_sep);
          // This would remove the hash from the end of the directory name
          tmpDirParts.pop();
          // Retrieve the version
          const jarVersion = tmpDirParts.pop();
          // The result would form the group name
          const jarGroupName = tmpDirParts.join(".").replace(/^\./, "");
          const purlObj = new PackageURL(
            "maven",
            jarGroupName,
            jarFileName.replace(`-${jarVersion}`, ""),
            jarVersion,
            { type: "jar" },
            null
          );
          purl = purlObj.toString();
        }
      }
      if (DEBUG_MODE) {
        console.log(`Executing 'jar tf ${jf}'`);
      }
      const jarResult = spawnSync("jar", ["-tf", jf], { encoding: "utf-8" });
      const consolelines = (jarResult.stdout || "").split("\n");
      const nsList = consolelines
        .filter((l) => {
          return (
            l.includes(".class") &&
            !l.includes("-INF") &&
            !l.includes("module-info")
          );
        })
        .map((e) => {
          return e.replace(".class", "").replace(/\/$/, "").replace(/\//g, ".");
        });
      jarNSMapping[purl || jf] = {
        jarFile: jf,
        pom: pomData,
        namespaces: nsList
      };
    }
    if (!jarNSMapping) {
      console.log(`Unable to determine class names for the jars in ${jarPath}`);
    }
  } else {
    console.log(`${jarPath} did not contain any jars.`);
  }
  return jarNSMapping;
};

export const convertJarNSToPackages = (jarNSMapping) => {
  let pkgList = [];
  for (const purl of Object.keys(jarNSMapping)) {
    let { jarFile, pom, namespaces } = jarNSMapping[purl];
    if (!pom) {
      pom = {};
    }
    let purlObj = undefined;
    try {
      purlObj = PackageURL.fromString(purl);
    } catch (e) {
      // ignore
      purlObj = {};
    }
    const name = pom.artifactId || purlObj.name;
    if (!name) {
      console.warn(
        `Unable to identify the metadata for ${purl}. This will be skipped.`
      );
      continue;
    }
    const apackage = {
      name,
      group: pom.groupId || purlObj.namespace || "",
      version: pom.version || purlObj.version,
      description: (pom.description || "").trim(),
      purl,
      "bom-ref": purl,
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "filename",
              confidence: 1,
              value: jarFile
            }
          ]
        }
      },
      properties: [
        {
          name: "SrcFile",
          value: jarFile
        },
        {
          name: "Namespaces",
          value: namespaces.join("\n")
        }
      ]
    };
    if (pom.url) {
      apackage["homepage"] = { url: pom.url };
    }
    if (pom.scm) {
      apackage["repository"] = { url: pom.scm };
    }
    pkgList.push(apackage);
  }
  return pkgList;
};

export const parsePomXml = function (pomXmlData) {
  if (!pomXmlData) {
    return undefined;
  }
  const project = xml2js(pomXmlData, {
    compact: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value"
  }).project;
  if (project) {
    let version = project.version ? project.version._ : undefined;
    if (!version && project.parent) {
      version = project.parent.version._;
    }
    let groupId = project.groupId ? project.groupId._ : undefined;
    if (!groupId && project.parent) {
      groupId = project.parent.groupId._;
    }
    return {
      artifactId: project.artifactId ? project.artifactId._ : "",
      groupId,
      version,
      description: project.description ? project.description._ : "",
      url: project.url ? project.url._ : "",
      scm: project.scm && project.scm.url ? project.scm.url._ : ""
    };
  }
  return undefined;
};

export const parseJarManifest = function (jarMetadata) {
  const metadata = {};
  if (!jarMetadata) {
    return metadata;
  }
  jarMetadata.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (l.includes(": ")) {
      const tmpA = l.split(": ");
      if (tmpA && tmpA.length === 2) {
        metadata[tmpA[0]] = tmpA[1].replace("\r", "");
      }
    }
  });
  return metadata;
};

export const encodeForPurl = (s) => {
  return s && !s.includes("%40")
    ? encodeURIComponent(s).replace(/%3A/g, ":").replace(/%2F/g, "/")
    : s;
};

/**
 * Method to extract a war or ear file
 *
 * @param {string} jarFile Path to jar file
 * @param {string} tempDir Temporary directory to use for extraction
 *
 * @return pkgList Package list
 */
export const extractJarArchive = function (jarFile, tempDir) {
  const pkgList = [];
  let jarFiles = [];
  const fname = basename(jarFile);
  let pomname = undefined;
  // If there is a pom file in the same directory, try to use it
  let manifestname = join(dirname(jarFile), "META-INF", "MANIFEST.MF");
  // Issue 439: Current implementation checks for existance of a .pom file, but .pom file is not used.
  // Instead code expects to find META-INF/MANIFEST.MF in the same folder as a .jar file.
  // For now check for presence of both .pom and MANIFEST.MF files.
  if (jarFile.endsWith(".jar")) {
    pomname = jarFile.replace(".jar", ".pom");
  }
  if (
    pomname &&
    existsSync(pomname) &&
    manifestname &&
    existsSync(manifestname)
  ) {
    tempDir = dirname(jarFile);
  } else if (!existsSync(join(tempDir, fname))) {
    // Only copy if the file doesn't exist
    copyFileSync(jarFile, join(tempDir, fname), constants.COPYFILE_FICLONE);
  }
  if (jarFile.endsWith(".war") || jarFile.endsWith(".hpi")) {
    const jarResult = spawnSync("jar", ["-xf", join(tempDir, fname)], {
      encoding: "utf-8",
      cwd: tempDir
    });
    if (jarResult.status !== 0) {
      console.error(jarResult.stdout, jarResult.stderr);
      console.log(
        "Check if JRE is installed and the jar command is available in the PATH."
      );
      return pkgList;
    }
    jarFiles = getAllFiles(join(tempDir, "WEB-INF", "lib"), "**/*.jar");
    if (jarFile.endsWith(".hpi")) {
      jarFiles.push(jarFile);
    }
  } else {
    jarFiles = [join(tempDir, fname)];
  }
  if (jarFiles && jarFiles.length) {
    for (const jf of jarFiles) {
      pomname = jf.replace(".jar", ".pom");
      const jarname = basename(jf);
      // Ignore test jars
      if (
        jarname.endsWith("-tests.jar") ||
        jarname.endsWith("-test-sources.jar")
      ) {
        continue;
      }
      const manifestDir = join(tempDir, "META-INF");
      const manifestFile = join(manifestDir, "MANIFEST.MF");
      let jarResult = {
        status: 1
      };
      if (existsSync(pomname)) {
        jarResult = { status: 0 };
      } else {
        jarResult = spawnSync("jar", ["-xf", jf], {
          encoding: "utf-8",
          cwd: tempDir
        });
      }
      if (jarResult.status !== 0) {
        console.error(jarResult.stdout, jarResult.stderr);
      } else {
        if (existsSync(manifestFile)) {
          const jarMetadata = parseJarManifest(
            readFileSync(manifestFile, {
              encoding: "utf-8"
            })
          );
          let group =
            jarMetadata["Extension-Name"] ||
            jarMetadata["Implementation-Vendor-Id"] ||
            jarMetadata["Bundle-SymbolicName"] ||
            jarMetadata["Bundle-Vendor"] ||
            jarMetadata["Automatic-Module-Name"] ||
            "";
          let version =
            jarMetadata["Bundle-Version"] ||
            jarMetadata["Implementation-Version"] ||
            jarMetadata["Specification-Version"];
          if (version && version.includes(" ")) {
            version = version.split(" ")[0];
          }
          let name = "";
          // Prefer jar filename to construct name and version
          if (!name || !version || name === "" || version === "") {
            const tmpA = jarname.split("-");
            if (tmpA && tmpA.length > 1) {
              const lastPart = tmpA[tmpA.length - 1];
              if (!version || version === "") {
                version = lastPart.replace(".jar", "");
              }
              if (!name || name === "") {
                name = jarname.replace("-" + lastPart, "") || "";
              }
            } else {
              name = jarname.replace(".jar", "");
            }
          }
          if (
            !name.length &&
            jarMetadata["Bundle-Name"] &&
            !jarMetadata["Bundle-Name"].includes(" ")
          ) {
            name = jarMetadata["Bundle-Name"];
          } else if (
            !name.length &&
            jarMetadata["Implementation-Title"] &&
            !jarMetadata["Implementation-Title"].includes(" ")
          ) {
            name = jarMetadata["Implementation-Title"];
          }
          // Sometimes the group might already contain the name
          // Eg: group: org.checkerframework.checker.qual name: checker-qual
          if (name && group && !group.startsWith("javax")) {
            if (group.includes("." + name.toLowerCase().replace(/-/g, "."))) {
              group = group.replace(
                new RegExp("." + name.toLowerCase().replace(/-/g, ".") + "$"),
                ""
              );
            } else if (group.includes("." + name.toLowerCase())) {
              group = group.replace(
                new RegExp("." + name.toLowerCase() + "$"),
                ""
              );
            }
          }
          // Patch the group string
          for (const aprefix in vendorAliases) {
            if (name && name.startsWith(aprefix)) {
              group = vendorAliases[aprefix];
              break;
            }
          }
          if (name && version) {
            // If group and name are the same we only need the name
            if (group == name) {
              group = "";
            }
            pkgList.push({
              group: group === "." ? "" : encodeForPurl(group || "") || "",
              name: name ? encodeForPurl(name) : "",
              version,
              evidence: {
                identity: {
                  field: "purl",
                  confidence: 0.5,
                  methods: [
                    {
                      technique: "filename",
                      confidence: 0.5,
                      value: jarname
                    }
                  ]
                }
              },
              properties: [
                {
                  name: "SrcFile",
                  value: jarname
                }
              ]
            });
          } else {
            if (DEBUG_MODE) {
              console.log(`Ignored jar ${jarname}`, jarMetadata, name, version);
            }
          }
        }
        try {
          if (rmSync && existsSync(join(tempDir, "META-INF"))) {
            // Clean up META-INF
            rmSync(join(tempDir, "META-INF"), {
              recursive: true,
              force: true
            });
          }
        } catch (err) {
          // ignore cleanup errors
        }
      }
    } // for
  } // if
  return pkgList;
};

/**
 * Determine the version of SBT used in compilation of this project.
 * By default it looks into a standard SBT location i.e.
 * <path-project>/project/build.properties
 * Returns `null` if the version cannot be determined.
 *
 * @param {string} projectPath Path to the SBT project
 */
export const determineSbtVersion = function (projectPath) {
  const buildPropFile = join(projectPath, "project", "build.properties");
  if (existsSync(buildPropFile)) {
    const properties = propertiesReader(buildPropFile);
    const property = properties.get("sbt.version");
    if (property != null && valid(property)) {
      return property;
    }
  }
  return null;
};

/**
 * Adds a new plugin to the SBT project by amending its plugins list.
 * Only recommended for SBT < 1.2.0 or otherwise use `addPluginSbtFile`
 * parameter.
 * The change manipulates the existing plugins' file by creating a copy of it
 * and returning a path where it is moved to.
 * Once the SBT task is complete one must always call `cleanupPlugin` to remove
 * the modifications made in place.
 *
 * @param {string} projectPath Path to the SBT project
 * @param {string} plugin Name of the plugin to add
 */
export const addPlugin = function (projectPath, plugin) {
  const pluginsFile = sbtPluginsPath(projectPath);
  let originalPluginsFile = null;
  if (existsSync(pluginsFile)) {
    originalPluginsFile = pluginsFile + ".cdxgen";
    copyFileSync(pluginsFile, originalPluginsFile, constants.COPYFILE_FICLONE);
  }

  writeFileSync(pluginsFile, plugin, { flag: "a" });
  return originalPluginsFile;
};

/**
 * Cleans up modifications to the project's plugins' file made by the
 * `addPlugin` function.
 *
 * @param {string} projectPath Path to the SBT project
 * @param {string} originalPluginsFile Location of the original plugins file, if any
 */
export const cleanupPlugin = function (projectPath, originalPluginsFile) {
  const pluginsFile = sbtPluginsPath(projectPath);
  if (existsSync(pluginsFile)) {
    if (!originalPluginsFile) {
      // just remove the file, it was never there
      unlinkSync(pluginsFile);
      return !existsSync(pluginsFile);
    } else {
      // Bring back the original file
      copyFileSync(
        originalPluginsFile,
        pluginsFile,
        constants.COPYFILE_FICLONE
      );
      unlinkSync(originalPluginsFile);
      return true;
    }
  } else {
    return false;
  }
};

/**
 * Returns a default location of the plugins file.
 *
 * @param {string} projectPath Path to the SBT project
 */
export const sbtPluginsPath = function (projectPath) {
  return join(projectPath, "project", "plugins.sbt");
};

/**
 * Method to read a single file entry from a zip file
 *
 * @param {string} zipFile Zip file to read
 * @param {string} filePattern File pattern
 * @param {string} contentEncoding Encoding. Defaults to utf-8
 *
 * @returns File contents
 */
export const readZipEntry = async function (
  zipFile,
  filePattern,
  contentEncoding = "utf-8"
) {
  let retData = undefined;
  try {
    const zip = new StreamZip.async({ file: zipFile });
    const entriesCount = await zip.entriesCount;
    if (!entriesCount) {
      return undefined;
    }
    const entries = await zip.entries();
    for (const entry of Object.values(entries)) {
      if (entry.isDirectory) {
        continue;
      }
      if (entry.name.endsWith(filePattern)) {
        const fileData = await zip.entryData(entry.name);
        retData = iconv.decode(Buffer.from(fileData), contentEncoding);
        break;
      }
    }
    zip.close();
  } catch (e) {
    console.log(e);
  }
  return retData;
};

/**
 * Method to return the gradle command to use.
 *
 * @param {string} srcPath Path to look for gradlew wrapper
 * @param {string} rootPath Root directory to look for gradlew wrapper
 */
export const getGradleCommand = (srcPath, rootPath) => {
  let gradleCmd = "gradle";

  let findGradleFile = "gradlew";
  if (platform() == "win32") {
    findGradleFile = "gradlew.bat";
  }

  if (existsSync(join(srcPath, findGradleFile))) {
    // Use local gradle wrapper if available
    // Enable execute permission
    try {
      chmodSync(join(srcPath, findGradleFile), 0o775);
    } catch (e) {
      // continue regardless of error
    }
    gradleCmd = resolve(join(srcPath, findGradleFile));
  } else if (rootPath && existsSync(join(rootPath, findGradleFile))) {
    // Check if the root directory has a wrapper script
    try {
      chmodSync(join(rootPath, findGradleFile), 0o775);
    } catch (e) {
      // continue regardless of error
    }
    gradleCmd = resolve(join(rootPath, findGradleFile));
  } else if (process.env.GRADLE_CMD) {
    gradleCmd = process.env.GRADLE_CMD;
  } else if (process.env.GRADLE_HOME) {
    gradleCmd = join(process.env.GRADLE_HOME, "bin", "gradle");
  }
  return gradleCmd;
};

/**
 * Method to return the maven command to use.
 *
 * @param {string} srcPath Path to look for maven wrapper
 * @param {string} rootPath Root directory to look for maven wrapper
 */
export const getMavenCommand = (srcPath, rootPath) => {
  let mavenCmd = "mvn";

  let findMavenFile = "mvnw";
  if (platform() == "win32") {
    findMavenFile = "mvnw.bat";
    if (
      !existsSync(join(srcPath, findMavenFile)) &&
      existsSync(join(srcPath, "mvnw.cmd"))
    ) {
      findMavenFile = "mvnw.cmd";
    }
  }

  if (existsSync(join(srcPath, findMavenFile))) {
    // Use local maven wrapper if available
    // Enable execute permission
    try {
      chmodSync(join(srcPath, findMavenFile), 0o775);
    } catch (e) {
      // continue regardless of error
    }
    mavenCmd = resolve(join(srcPath, findMavenFile));
  } else if (rootPath && existsSync(join(rootPath, findMavenFile))) {
    // Check if the root directory has a wrapper script
    try {
      chmodSync(join(rootPath, findMavenFile), 0o775);
    } catch (e) {
      // continue regardless of error
    }
    mavenCmd = resolve(join(rootPath, findMavenFile));
  } else if (process.env.MVN_CMD || process.env.MAVEN_CMD) {
    mavenCmd = process.env.MVN_CMD || process.env.MAVEN_CMD;
  } else if (process.env.MAVEN_HOME) {
    mavenCmd = join(process.env.MAVEN_HOME, "bin", "mvn");
  }
  return mavenCmd;
};

/**
 * Retrieves the atom command by referring to various environment variables
 */
export const getAtomCommand = () => {
  if (process.env.ATOM_CMD) {
    return process.env.ATOM_CMD;
  }
  if (process.env.ATOM_HOME) {
    return join(process.env.ATOM_HOME, "bin", "atom");
  }
  const NODE_CMD = process.env.NODE_CMD || "node";
  const localAtom = join(
    dirNameStr,
    "node_modules",
    "@appthreat",
    "atom",
    "index.js"
  );
  if (existsSync(localAtom)) {
    return `${NODE_CMD} ${localAtom}`;
  }
  return "atom";
};

export const executeAtom = (src, args) => {
  let cwd =
    existsSync(src) && lstatSync(src).isDirectory() ? src : dirname(src);
  let ATOM_BIN = getAtomCommand();
  if (ATOM_BIN.includes(" ")) {
    const tmpA = ATOM_BIN.split(" ");
    if (tmpA && tmpA.length > 1) {
      ATOM_BIN = tmpA[0];
      args.unshift(tmpA[1]);
    }
  }
  const freeMemoryGB = Math.floor(freemem() / 1024 / 1024 / 1024);
  if (DEBUG_MODE) {
    console.log("Executing", ATOM_BIN, args.join(" "));
  }
  const env = {
    ...process.env,
    JAVA_OPTS: `-Xms${freeMemoryGB}G -Xmx${freeMemoryGB}G`
  };
  env.PATH = `${env.PATH}${_delimiter}${join(
    dirNameStr,
    "node_modules",
    ".bin"
  )}`;
  const result = spawnSync(ATOM_BIN, args, {
    cwd,
    encoding: "utf-8",
    timeout: TIMEOUT_MS,
    env
  });
  if (result.stderr) {
    if (
      result.stderr.includes(
        "has been compiled by a more recent version of the Java Runtime"
      ) ||
      result.stderr.includes("Error: Could not create the Java Virtual Machine")
    ) {
      console.log(
        "Atom requires Java 17 or above. Please install a suitable version and re-run cdxgen to improve the SBoM accuracy.\nAlternatively, use the cdxgen container image."
      );
      console.log(`Current JAVA_HOME: ${env["JAVA_HOME"]}`);
    } else if (result.stderr.includes("astgen")) {
      console.warn(
        "WARN: Unable to locate astgen command. Install atom globally using sudo npm install -g @appthreat/atom to resolve this issue."
      );
    }
  }
  if (DEBUG_MODE) {
    if (result.stdout) {
      console.log(result.stdout);
    }
    if (result.stderr) {
      console.log(result.stderr);
    }
  }
  return !result.error;
};

/**
 * Find the imported modules in the application with atom parsedeps command
 *
 * @param {string} src
 * @param {string} language
 * @param {string} methodology
 * @param {string} slicesFile
 * @returns List of imported modules
 */
export const findAppModules = function (
  src,
  language,
  methodology = "usages",
  slicesFile = undefined
) {
  const tempDir = mkdtempSync(join(tmpdir(), "atom-deps-"));
  const atomFile = join(tempDir, "app.atom");
  if (!slicesFile) {
    slicesFile = join(tempDir, "slices.json");
  }
  let retList = [];
  const args = [
    methodology,
    "-l",
    language,
    "-o",
    resolve(atomFile),
    "--slice-outfile",
    resolve(slicesFile),
    resolve(src)
  ];
  executeAtom(src, args);
  if (existsSync(slicesFile)) {
    const slicesData = JSON.parse(readFileSync(slicesFile), "utf8");
    if (slicesData && Object.keys(slicesData) && slicesData.modules) {
      retList = slicesData.modules;
    } else {
      retList = slicesData;
    }
  }
  // Clean up
  if (tempDir && tempDir.startsWith(tmpdir()) && rmSync) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return retList;
};

const flattenDeps = (dependenciesMap, pkgList, reqOrSetupFile, t) => {
  const tRef = `pkg:pypi/${t.name.replace(/_/g, "-").toLowerCase()}@${
    t.version
  }`;
  const dependsOn = [];
  for (const d of t.dependencies) {
    const pkgRef = `pkg:pypi/${d.name.replace(/_/g, "-").toLowerCase()}@${
      d.version
    }`;
    dependsOn.push(pkgRef);
    if (!dependenciesMap[pkgRef]) {
      dependenciesMap[pkgRef] = [];
    }
    pkgList.push({
      name: d.name,
      version: d.version,
      properties: [
        {
          name: "SrcFile",
          value: reqOrSetupFile
        }
      ],
      evidence: {
        identity: {
          field: "purl",
          confidence: 1,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 1,
              value: reqOrSetupFile
            }
          ]
        }
      }
    });
    // Recurse and flatten
    if (d.dependencies && d.dependencies) {
      flattenDeps(dependenciesMap, pkgList, reqOrSetupFile, d);
    }
  }
  dependenciesMap[tRef] = (dependenciesMap[tRef] || [])
    .concat(dependsOn)
    .sort();
};

/**
 * Execute pip freeze by creating a virtual env in a temp directory and construct the dependency tree
 *
 * @param {string} basePath Base path
 * @param {string} reqOrSetupFile Requirements or setup.py file
 * @param {string} tempVenvDir Temp venv dir
 * @returns List of packages from the virtual env
 */
export const getPipFrozenTree = (basePath, reqOrSetupFile, tempVenvDir) => {
  const pkgList = [];
  const rootList = [];
  const dependenciesList = [];
  let result = undefined;
  const env = {
    ...process.env
  };
  /**
   * Let's start with an attempt to create a new temporary virtual environment in case we aren't in one
   *
   * By checking the environment variable "VIRTUAL_ENV" we decide whether to create an env or not
   */
  if (
    !process.env.VIRTUAL_ENV &&
    reqOrSetupFile &&
    !reqOrSetupFile.endsWith("poetry.lock")
  ) {
    result = spawnSync(PYTHON_CMD, ["-m", "venv", tempVenvDir], {
      encoding: "utf-8"
    });
    if (result.status !== 0 || result.error) {
      if (DEBUG_MODE) {
        console.log("Virtual env creation has failed");
        if (!result.stderr) {
          console.log(
            "Ensure the virtualenv package is installed using pip. `python -m pip install virtualenv`"
          );
        }
      }
    } else {
      if (DEBUG_MODE) {
        console.log(join("Using virtual environment in ", tempVenvDir));
      }
      env.VIRTUAL_ENV = tempVenvDir;
      env.PATH = `${join(
        tempVenvDir,
        platform() === "win32" ? "Scripts" : "bin"
      )}${_delimiter}${process.env.PATH || ""}`;
    }
  }
  /**
   * We now have a virtual environment so we can attempt to install the project and perform
   * pip freeze to collect the packages that got installed.
   * Note that we did not create a virtual environment for poetry because poetry will do this when we run the install.
   * This step is accurate but not reproducible since the resulting list could differ based on various factors
   * such as the version of python, pip, os, pypi.org availability (and weather?)
   */
  // Bug #388. Perform pip install in all virtualenv to make the experience consistent
  if (reqOrSetupFile) {
    if (reqOrSetupFile.endsWith("poetry.lock")) {
      let poetryConfigArgs = [
        "config",
        "virtualenvs.options.no-setuptools",
        "true",
        "--local"
      ];
      result = spawnSync("poetry", poetryConfigArgs, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS
      });
      let poetryInstallArgs = ["install", "-n", "--no-root"];
      // Attempt to perform poetry install
      result = spawnSync("poetry", poetryInstallArgs, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS
      });
      if (result.status !== 0 || result.error) {
        if (result.stderr && result.stderr.includes("No module named poetry")) {
          poetryInstallArgs = ["install", "-n", "--no-root"];
          // Attempt to perform poetry install
          result = spawnSync("poetry", poetryInstallArgs, {
            cwd: basePath,
            encoding: "utf-8",
            timeout: TIMEOUT_MS,
            env
          });
          if (result.status !== 0 || result.error) {
            if (DEBUG_MODE && result.stderr) {
              console.log(result.stderr);
            }
            console.log("poetry install has failed.");
            console.log(
              "1. Install the poetry command using python -m pip install poetry."
            );
            console.log(
              "2. Check the version of python supported by the project. Poetry is strict about the version used."
            );
            console.log(
              "3. Setup and activate the poetry virtual environment and re-run cdxgen."
            );
          }
        } else {
          console.log(
            "Poetry install has failed. Setup and activate the poetry virtual environment and re-run cdxgen."
          );
        }
      } else {
        let poetryEnvArgs = ["env info", "--path"];
        result = spawnSync("poetry", poetryEnvArgs, {
          cwd: basePath,
          encoding: "utf-8",
          timeout: TIMEOUT_MS,
          env
        });
        tempVenvDir = result.stdout.replaceAll(/[\r\n]+/g, "");
        if (tempVenvDir && tempVenvDir.length) {
          env.VIRTUAL_ENV = tempVenvDir;
          env.PATH = `${join(
            tempVenvDir,
            platform() === "win32" ? "Scripts" : "bin"
          )}${_delimiter}${process.env.PATH || ""}`;
        }
      }
    } else {
      const pipInstallArgs = [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check"
      ];
      // Requirements.txt could be called with any name so best to check for not setup.py and not pyproject.toml
      if (
        !reqOrSetupFile.endsWith("setup.py") &&
        !reqOrSetupFile.endsWith("pyproject.toml")
      ) {
        pipInstallArgs.push("-r");
        pipInstallArgs.push(resolve(reqOrSetupFile));
      } else {
        pipInstallArgs.push(resolve(basePath));
      }
      // Attempt to perform pip install
      result = spawnSync(PYTHON_CMD, pipInstallArgs, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS,
        env
      });
      if (result.status !== 0 || result.error) {
        let versionRelatedError = false;
        if (
          result.stderr &&
          (result.stderr.includes(
            "Could not find a version that satisfies the requirement"
          ) ||
            result.stderr.includes("No matching distribution found for"))
        ) {
          versionRelatedError = true;
          console.log(
            "The version or the version specifiers used for a dependency is invalid. Resolve the below error to improve SBoM accuracy."
          );
          console.log(result.stderr);
        }
        if (!versionRelatedError && DEBUG_MODE) {
          console.log("args used:", pipInstallArgs);
          console.log(result.stdout, result.stderr);
          console.log(
            "Possible build errors detected. The resulting list in the SBoM would therefore be incomplete.\nTry installing any missing build tools or development libraries to improve the accuracy."
          );
          if (platform() === "win32") {
            console.log(
              "- Install the appropriate compilers and build tools on Windows by following this documentation - https://wiki.python.org/moin/WindowsCompilers"
            );
          } else {
            console.log(
              "- For example, you may have to install gcc, gcc-c++ compiler, make tools and additional development libraries using apt-get or yum package manager."
            );
          }
          console.log(
            "- Certain projects would only build with specific versions of python and OS. Data science and ML related projects might require a conda/anaconda distribution."
          );
          console.log("- Check if any git submodules have to be initialized.");
        }
      }
    }
  }
  // Bug #375. Attempt pip freeze on existing and new virtual environments
  if (env.VIRTUAL_ENV && env.VIRTUAL_ENV.length) {
    /**
     * At this point, the previous attempt to do a pip install might have failed and we might have an unclean virtual environment with an incomplete list
     * The position taken by cdxgen is "Some SBoM is better than no SBoM", so we proceed to collecting the dependencies that got installed with pip freeze
     */
    if (DEBUG_MODE) {
      console.log(
        "About to construct the pip dependency tree. Please wait ..."
      );
    }
    const tree = getTreeWithPlugin(env, PYTHON_CMD, basePath);
    if (DEBUG_MODE && !tree.length) {
      console.log(
        "Dependency tree generation has failed. Please check for any errors or version incompatibilities reported in the logs."
      );
    }
    const dependenciesMap = {};
    for (const t of tree) {
      if (!t.version.length) {
        // Don't leave out any local dependencies
        if (t.dependencies.length) {
          flattenDeps(dependenciesMap, pkgList, reqOrSetupFile, t);
        }
        continue;
      }
      const name = t.name.replace(/_/g, "-").toLowerCase();
      const version = t.version;
      let exclude = ["pip", "setuptools", "wheel"];
      if (!exclude.includes(name)) {
        pkgList.push({
          name,
          version,
          evidence: {
            identity: {
              field: "purl",
              confidence: 1,
              methods: [
                {
                  technique: "instrumentation",
                  confidence: 1,
                  value: env.VIRTUAL_ENV
                }
              ]
            }
          }
        });
        rootList.push({
          name,
          version
        });
        flattenDeps(dependenciesMap, pkgList, reqOrSetupFile, t);
      }
    } // end for
    for (const k of Object.keys(dependenciesMap)) {
      dependenciesList.push({ ref: k, dependsOn: dependenciesMap[k] });
    }
  } else {
    if (DEBUG_MODE) {
      console.log(
        "NOTE: Setup and activate a python virtual environment for this project prior to invoking cdxgen to improve SBoM accuracy."
      );
    }
  }
  return {
    pkgList,
    rootList,
    dependenciesList
  };
};

// taken from a very old package https://github.com/keithamus/parse-packagejson-name/blob/master/index.js
export const parsePackageJsonName = (name) => {
  const nameRegExp = /^(?:@([^/]+)\/)?(([^.]+)(?:\.(.*))?)$/;
  const returnObject = {
    scope: null,
    fullName: "",
    projectName: "",
    moduleName: ""
  };
  const match = (typeof name === "object" ? name.name || "" : name || "").match(
    nameRegExp
  );
  if (match) {
    returnObject.scope =
      (match[1] && name.includes("@") ? "@" + match[1] : match[1]) || null;
    returnObject.fullName = match[2] || match[0];
    returnObject.projectName = match[3] === match[2] ? null : match[3];
    returnObject.moduleName = match[4] || match[2] || null;
  }
  return returnObject;
};

/**
 * Method to add occurrence evidence for components based on import statements. Currently useful for js
 *
 * @param {array} pkgList List of package
 * @param {object} allImports Import statements object with package name as key and an object with file and location details
 */
export const addEvidenceForImports = (pkgList, allImports) => {
  const impPkgs = Object.keys(allImports);
  for (const pkg of pkgList) {
    const { group, name } = pkg;
    let aliases =
      group && group.length
        ? [name, `${group}/${name}`, `@${group}/${name}`]
        : [name];
    for (const alias of aliases) {
      if (impPkgs.includes(alias)) {
        const evidences = allImports[alias];
        if (evidences) {
          pkg.scope = "required";
          let importedModules = new Set();
          for (const evidence of evidences) {
            if (evidence && Object.keys(evidence).length && evidence.fileName) {
              pkg.evidence = pkg.evidence || {};
              pkg.evidence.occurrences = pkg.evidence.occurrences || [];
              pkg.evidence.occurrences.push({
                location: `${evidence.fileName}${
                  evidence.lineNumber ? "#" + evidence.lineNumber : ""
                }`
              });
              importedModules.add(evidence.importedAs);
              for (const importedSm of evidence.importedModules || []) {
                if (!importedSm) {
                  continue;
                }
                // Store both the short and long form of the imported sub modules
                importedModules.add(importedSm);
                importedModules.add(`${evidence.importedAs}/${importedSm}`);
              }
            }
          }
          importedModules = Array.from(importedModules);
          if (importedModules.length) {
            pkg.properties = pkg.properties || [];
            pkg.properties.push({
              name: "ImportedModules",
              value: importedModules.join(",")
            });
          }
        }
        break;
      }
    }
  }
  return pkgList;
};

export const componentSorter = (a, b) => {
  if (a && b) {
    for (const k of ["bom-ref", "purl", "name"]) {
      if (a[k] && b[k]) {
        return a[k].localeCompare(b[k]);
      }
    }
  }
  return a.localeCompare(b);
};

export const parseCmakeDotFile = (dotFile, pkgType, options = {}) => {
  const dotGraphData = readFileSync(dotFile, "utf-8");
  const pkgList = [];
  const dependenciesMap = {};
  const pkgBomRefMap = {};
  let parentComponent = {};
  dotGraphData.split("\n").forEach((l) => {
    l = l.replace("\r", "").trim();
    if (l === "\n" || l.startsWith("#")) {
      return;
    }
    let name = "";
    let group = "";
    let version = "";
    let path = undefined;
    if (l.startsWith("digraph")) {
      const tmpA = l.split(" ");
      if (tmpA && tmpA.length > 1) {
        name = tmpA[1].replace(/"/g, "");
      }
    } else if (l.startsWith('"node')) {
      // Direct dependencies are represented as nodes
      if (l.includes("label =")) {
        const tmpA = l.split('label = "');
        if (tmpA && tmpA.length > 1) {
          name = tmpA[1].split('"')[0];
        }
        if (name.includes("\\n")) {
          name = name.split("\\n")[0];
        } else if (name.includes(_sep)) {
          path = name;
          name = basename(name);
        }
      } else if (l.includes("// ")) {
        // Indirect dependencies are represented with comments
        const tmpA = l.split("// ");
        if (tmpA && tmpA.length) {
          const relationship = tmpA[1];
          if (relationship.includes("->")) {
            let tmpB = relationship.split(" -> ");
            if (tmpB && tmpB.length === 2) {
              if (tmpB[0].includes(_sep)) {
                tmpB[0] = basename(tmpB[0]);
              }
              if (tmpB[1].includes(_sep)) {
                tmpB[1] = basename(tmpB[1]);
              }
              const ref = pkgBomRefMap[tmpB[0]];
              const depends = pkgBomRefMap[tmpB[1]];
              if (ref && depends) {
                if (!dependenciesMap[ref]) {
                  dependenciesMap[ref] = new Set();
                }
                dependenciesMap[ref].add(depends);
              }
            }
          }
        }
      }
    }
    if (!Object.keys(parentComponent).length) {
      parentComponent = {
        group: options.projectGroup || "",
        name: options.projectName || name,
        version: options.projectVersion || "",
        type: "application"
      };
      parentComponent["purl"] = new PackageURL(
        pkgType,
        parentComponent.group,
        parentComponent.name,
        parentComponent.version,
        null,
        path
      ).toString();
      parentComponent["bom-ref"] = decodeURIComponent(parentComponent["purl"]);
    } else if (name) {
      const apkg = {
        name: name,
        type: pkgType,
        purl: new PackageURL(
          pkgType,
          group,
          name,
          version,
          null,
          path
        ).toString()
      };
      apkg["bom-ref"] = decodeURIComponent(apkg["purl"]);
      pkgList.push(apkg);
      pkgBomRefMap[name] = apkg["bom-ref"];
    }
  });
  const dependenciesList = [];
  for (const pk of Object.keys(dependenciesMap)) {
    const dependsOn = Array.from(dependenciesMap[pk] || []);
    dependenciesList.push({
      ref: pk,
      dependsOn
    });
  }
  return {
    parentComponent,
    pkgList,
    dependenciesList
  };
};

export const parseCmakeLikeFile = (cmakeListFile, pkgType, options = {}) => {
  let cmakeListData = readFileSync(cmakeListFile, "utf-8");
  const pkgList = [];
  const pkgAddedMap = {};
  const versionSpecifiersMap = {};
  const versionsMap = {};
  let parentComponent = {};
  cmakeListData = cmakeListData
    .replace(/^ {2}/g, "")
    .replace(/\(\r\n/g, "(")
    .replace(/\(\n/g, "(")
    .replace(/,\r\n/g, ",")
    .replace(/,\n/g, ",");
  cmakeListData.split("\n").forEach((l) => {
    l = l.replace("\r", "").trim();
    if (l === "\n" || l.startsWith("#")) {
      return;
    }
    let group = "";
    let path = undefined;
    let name_list = [];
    if (l.startsWith("project(") && !Object.keys(parentComponent).length) {
      const tmpA = l.split("project(");
      if (tmpA && tmpA.length) {
        const tmpB = tmpA[1]
          .trim()
          .replace(/["']/g, "")
          .replace(/[ ]/g, ",")
          .split(")")[0]
          .split(",")
          .filter((v) => v.length > 1);
        const parentName = tmpB[0];
        let parentVersion = undefined;
        // In case of meson.build we can find the version number after the word version
        // thanks to our replaces and splits
        const versionIndex = tmpB.findIndex((v) => v === "version");
        if (versionIndex > -1 && tmpB.length > versionIndex) {
          parentVersion = tmpB[versionIndex + 1];
        }
        if (parentName && parentName.length) {
          parentComponent = {
            group: options.projectGroup || "",
            name: parentName,
            version: parentVersion || options.projectVersion || "",
            type: "application"
          };
          parentComponent["purl"] = new PackageURL(
            pkgType,
            parentComponent.group,
            parentComponent.name,
            parentComponent.version,
            null,
            path
          ).toString();
          parentComponent["bom-ref"] = decodeURIComponent(
            parentComponent["purl"]
          );
        }
      }
    } else if (l.startsWith("find_")) {
      let tmpA = [];
      for (const fm of [
        "find_package(",
        "find_library(",
        "find_dependency(",
        "find_file(",
        "FetchContent_MakeAvailable("
      ]) {
        if (l.startsWith(fm)) {
          tmpA = l.split(fm);
          break;
        }
      }
      if (tmpA && tmpA.length > 1) {
        let tmpB = tmpA[1].split(")")[0].split(" ");
        tmpB = tmpB.filter(
          (v) =>
            ![
              "REQUIRED",
              "COMPONENTS",
              "QUIET",
              "NAMES",
              "PATHS",
              "ENV",
              "NO_MODULE",
              "NO_DEFAULT_PATH"
            ].includes(v) &&
            !v.includes("$") &&
            !v.includes("LIB") &&
            !v.startsWith("CMAKE_") &&
            v.length
        );
        // find_package(Catch2)
        // find_package(GTest REQUIRED)
        // find_package(Boost 1.79 COMPONENTS date_time)
        // find_library(PTHREADPOOL_LIB pthreadpool REQUIRED)
        if (tmpB) {
          let working_name = undefined;
          if (l.startsWith("find_library")) {
            name_list.push(tmpB[1]);
            working_name = tmpB[1];
          } else {
            name_list.push(tmpB[0]);
            working_name = tmpB[0];
          }
          if (l.startsWith("find_package") && tmpB.length > 1) {
            versionsMap[working_name] = tmpB[1];
          } else {
            for (const n of tmpB) {
              if (n.match(/^\d/)) {
                continue;
              }
              if (n.includes(_sep)) {
                if (
                  n.includes(".so") ||
                  n.includes(".a") ||
                  n.includes(".dll")
                ) {
                  name_list.push(basename(n));
                }
              } else {
                name_list.push(n);
              }
            }
          }
        }
      }
    } else if (l.includes("dependency(")) {
      let tmpA = l.split("dependency(");
      if (tmpA && tmpA.length) {
        if (!l.includes("_dependency") && !l.includes(".dependency")) {
          tmpA = tmpA[tmpA.length - 1]
            .split(", ")
            .map((v) => v.replace(/['" )]/g, ""));
          if (tmpA.length) {
            name_list.push(tmpA[0]);
            if (tmpA.length > 2 && tmpA[1].startsWith("version")) {
              const tmpB = tmpA[1].split("version:");
              if (tmpB && tmpB.length === 2) {
                if (tmpB[1].includes(">") || tmpB[1].includes("<")) {
                  // We have a version specifier
                  versionSpecifiersMap[tmpA[0]] = tmpB[1];
                } else {
                  // We have a valid version
                  versionsMap[tmpA[0]] = tmpB[1];
                }
              }
            }
          }
        }
      }
    }
    for (let n of name_list) {
      let props = [];
      let confidence = 0;
      if (n && n.length > 1 && !pkgAddedMap[n]) {
        n = n.replace(/"/g, "");
        for (const wrapkey of Object.keys(mesonWrapDB)) {
          const awrap = mesonWrapDB[wrapkey];
          if (
            awrap.PkgProvides.includes(n) ||
            awrap.PkgProvides.includes(n.toLowerCase())
          ) {
            // Use the new name
            n = wrapkey;
            for (const eprop of Object.keys(awrap)) {
              props.push({
                name: eprop,
                value: Array.isArray(awrap[eprop])
                  ? awrap[eprop].join(", ")
                  : awrap[eprop]
              });
            }
            // Our confidence has improved from 0 since there is a matching wrap so we know the correct name
            // and url. We lack the version details.
            confidence = 0.5;
            break;
          }
        }
        if (versionSpecifiersMap[n]) {
          props.push({
            name: "cdx:conan:versionSpecifiers",
            value: versionSpecifiersMap[n]
          });
        }
        const apkg = {
          name: n,
          version: versionsMap[n] || "",
          type: pkgType,
          purl: new PackageURL(
            pkgType,
            group,
            n,
            versionsMap[n] || "",
            null,
            path
          ).toString(),
          evidence: {
            identity: {
              field: "purl",
              confidence,
              methods: [
                {
                  technique: "source-code-analysis",
                  confidence: 0,
                  value: `Filename ${cmakeListFile}`
                }
              ]
            }
          },
          properties: props
        };
        apkg["bom-ref"] = decodeURIComponent(apkg["purl"]);
        pkgList.push(apkg);
        pkgAddedMap[n] = true;
      }
    }
  });
  return {
    parentComponent,
    pkgList
  };
};

export const getOSPackageForFile = (afile, osPkgsList) => {
  for (const ospkg of osPkgsList) {
    for (const props of ospkg.properties || []) {
      if (
        props.name === "PkgProvides" &&
        props.value.includes(afile.toLowerCase())
      ) {
        // dev packages are libraries
        ospkg.type = "library";
        // Set the evidence to indicate how we identified this package from the header or .so file
        ospkg.evidence = {
          identity: {
            field: "purl",
            confidence: 0,
            methods: [
              {
                technique: "filename",
                confidence: 0.8,
                value: `PkgProvides ${afile}`
              }
            ]
          }
        };
        return ospkg;
      }
    }
  }
  return undefined;
};

/**
 * Method to find c/c++ modules by collecting usages with atom
 *
 * @param {string} src directory
 * @param {object} options Command line options
 * @param {array} osPkgsList Array of OS pacakges represented as components
 * @param {array} epkgList Existing packages list
 */
export const getCppModules = (src, options, osPkgsList, epkgList) => {
  let pkgType = "conan";
  const pkgList = [];
  const pkgAddedMap = {};
  let sliceData = {};
  const epkgMap = {};
  (epkgList || []).forEach((p) => {
    epkgMap[p.name] = p;
  });
  if (options.usagesSlicesFile && existsSync(options.usagesSlicesFile)) {
    sliceData = JSON.parse(readFileSync(options.usagesSlicesFile));
    if (DEBUG_MODE) {
      console.log("Re-use existing slices file", options.usagesSlicesFile);
    }
  } else {
    sliceData = findAppModules(src, "c", "usages", options.usagesSlicesFile);
  }
  const usageData = parseCUsageSlice(sliceData);
  for (const afile of Object.keys(usageData)) {
    let fileName = basename(afile);
    let extn = extname(fileName);
    // To avoid false positives, we focus only on header files and not source code.
    // However, some sources could belong to external libraries without an associated .h file
    // File a bug if you can create a public example for this scenario
    if ([".c", ".cpp", ".cc"].includes(extn)) {
      continue;
    }
    let group = "";
    let version = "";
    // We need to resolve the name to an os package here
    let name = fileName.replace(extn, "");
    let apkg = getOSPackageForFile(afile, osPkgsList) ||
      epkgMap[name] || {
        name,
        group: "",
        version: "",
        type: pkgType
      };
    let isExternal = false;
    // If this is a relative file, there is a good chance we can reuse the project group
    if (!afile.startsWith(_sep)) {
      group = options.projectGroup || "";
    } else {
      isExternal = true;
    }
    if (!apkg.purl) {
      apkg.purl = new PackageURL(
        pkgType,
        group,
        name,
        version,
        null,
        afile
      ).toString();
      apkg.evidence = {
        identity: {
          field: "purl",
          confidence: 0,
          methods: [
            {
              technique: "source-code-analysis",
              confidence: 0,
              value: `Filename ${afile}`
            }
          ]
        }
      };
      apkg["bom-ref"] = decodeURIComponent(apkg["purl"]);
    }
    if (usageData[afile]) {
      const usymbols = Array.from(usageData[afile]).filter(
        (v) => !v.startsWith("<operator")
      );
      if (!apkg["properties"]) {
        apkg["properties"] = [
          { name: "ImportedSymbols", value: usymbols.join(", ") },
          { name: "isExternal", value: "" + isExternal }
        ];
      }
      const newProps = [];
      let symbolsPropertyFound = false;
      for (const prop of apkg["properties"]) {
        if (prop.name === "ImportedSymbols") {
          symbolsPropertyFound = true;
          let existingSymbols = prop.value.split(", ");
          existingSymbols = existingSymbols.concat(usymbols);
          prop.value = Array.from(new Set(existingSymbols)).sort().join(", ");
        }
        newProps.push(prop);
      }
      if (!symbolsPropertyFound) {
        apkg["properties"].push({
          name: "ImportedSymbols",
          value: usymbols.join(", ")
        });
      }
      apkg["properties"] = newProps;
    }
    pkgList.push(apkg);
    pkgAddedMap[name] = true;
  }
  return pkgList;
};

export const parseCUsageSlice = (sliceData) => {
  if (!sliceData) {
    return undefined;
  }
  const usageData = {};
  try {
    const objectSlices = sliceData.objectSlices || [];
    for (const slice of objectSlices) {
      if (!slice.fileName || slice.fileName.startsWith("<includes")) {
        continue;
      }
      const slFileName = slice.fileName;
      let headerFileMode = slFileName.match(new RegExp(".(h|hh|hpp)$")) != null;
      const slLineNumber = slice.lineNumber;
      const allLines = usageData[slFileName] || new Set();
      for (const ausage of slice.usages) {
        if (ausage?.targetObj?.isExternal === true) {
          let lineNumberToUse = headerFileMode
            ? slLineNumber
            : ausage.targetObj.lineNumber;
          allLines.add(ausage.targetObj.resolvedMethod + "|" + lineNumberToUse);
        }
        if (ausage?.definedBy?.isExternal === true) {
          let lineNumberToUse = headerFileMode
            ? slLineNumber
            : ausage.definedBy.lineNumber;
          allLines.add(ausage.definedBy.resolvedMethod + "|" + lineNumberToUse);
        }
        let calls = ausage?.invokedCalls || [];
        calls = calls.concat(ausage?.argToCalls || []);
        for (const acall of calls) {
          let lineNumberToUse = headerFileMode
            ? slLineNumber
            : acall.lineNumber;
          if (acall.isExternal === true) {
            allLines.add(acall.resolvedMethod + "|" + lineNumberToUse);
          }
        }
      }
      if (Array.from(allLines).length) {
        usageData[slFileName] = allLines;
      }
    }
  } catch (err) {
    // ignore
  }
  return usageData;
};
