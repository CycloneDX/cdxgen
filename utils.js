import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants,
  chmodSync,
  copyFileSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import {
  delimiter as _delimiter,
  sep as _sep,
  basename,
  dirname,
  extname,
  join,
  resolve,
} from "node:path";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import Arborist from "@npmcli/arborist";
import { load } from "cheerio";
import { parseEDNString } from "edn-data";
import { globSync } from "glob";
import got from "got";
import iconv from "iconv-lite";
import { load as _load } from "js-yaml";
import StreamZip from "node-stream-zip";
import { PackageURL } from "packageurl-js";
import propertiesReader from "properties-reader";
import {
  clean,
  coerce,
  compare,
  maxSatisfying,
  parse,
  satisfies,
  valid,
} from "semver";
import { xml2js } from "xml-js";
import { getTreeWithPlugin } from "./piptree.js";

let url = import.meta.url;
if (!url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
export const dirNameStr = import.meta ? dirname(fileURLToPath(url)) : __dirname;
export const isWin = platform() === "win32";
export const isMac = platform() === "darwin";
export let ATOM_DB = join(homedir(), ".local", "share", ".atomdb");
if (isWin) {
  ATOM_DB = join(homedir(), "AppData", "Local", ".atomdb");
} else if (isMac) {
  ATOM_DB = join(homedir(), "Library", "Application Support", ".atomdb");
}

const licenseMapping = JSON.parse(
  readFileSync(join(dirNameStr, "data", "lic-mapping.json"), "utf-8"),
);
const vendorAliases = JSON.parse(
  readFileSync(join(dirNameStr, "data", "vendor-alias.json"), "utf-8"),
);
const spdxLicenses = JSON.parse(
  readFileSync(join(dirNameStr, "data", "spdx-licenses.json"), "utf-8"),
);
const knownLicenses = JSON.parse(
  readFileSync(join(dirNameStr, "data", "known-licenses.json"), "utf-8"),
);
const mesonWrapDB = JSON.parse(
  readFileSync(join(dirNameStr, "data", "wrapdb-releases.json"), "utf-8"),
);
export const frameworksList = JSON.parse(
  readFileSync(join(dirNameStr, "data", "frameworks-list.json"), "utf-8"),
);
const selfPJson = JSON.parse(
  readFileSync(join(dirNameStr, "package.json"), "utf-8"),
);
const _version = selfPJson.version;

// Refer to contrib/py-modules.py for a script to generate this list
// The script needs to be used once every few months to update this list
const PYTHON_STD_MODULES = JSON.parse(
  readFileSync(join(dirNameStr, "data", "python-stdlib.json"), "utf-8"),
);
// Mapping between modules and package names
const PYPI_MODULE_PACKAGE_MAPPING = JSON.parse(
  readFileSync(join(dirNameStr, "data", "pypi-pkg-aliases.json"), "utf-8"),
);

// Debug mode flag
export const DEBUG_MODE =
  process.env.CDXGEN_DEBUG_MODE === "debug" ||
  process.env.SCAN_DEBUG_MODE === "debug" ||
  process.env.SHIFTLEFT_LOGGING_LEVEL === "debug" ||
  process.env.NODE_ENV === "development";

// Timeout milliseconds. Default 20 mins
export const TIMEOUT_MS =
  Number.parseInt(process.env.CDXGEN_TIMEOUT_MS) || 20 * 60 * 1000;

// Max buffer for stdout and stderr. Defaults to 100MB
export const MAX_BUFFER =
  Number.parseInt(process.env.CDXGEN_MAX_BUFFER) || 100 * 1024 * 1024;

// Metadata cache
export let metadata_cache = {};
// Speed up lookup namespaces for a given jar
const jarNSMapping_cache = {};

// Whether test scope shall be included for java/maven projects; default, if unset shall be 'true'
export const includeMavenTestScope =
  !process.env.CDX_MAVEN_INCLUDE_TEST_SCOPE ||
  ["true", "1"].includes(process.env.CDX_MAVEN_INCLUDE_TEST_SCOPE);

// Whether license information should be fetched
export const FETCH_LICENSE =
  process.env.FETCH_LICENSE &&
  ["true", "1"].includes(process.env.FETCH_LICENSE);

// Whether search.maven.org will be used to identify jars without maven metadata; default, if unset shall be 'true'
export const SEARCH_MAVEN_ORG =
  !process.env.SEARCH_MAVEN_ORG ||
  ["true", "1"].includes(process.env.SEARCH_MAVEN_ORG);

// circuit breaker for search maven.org
let search_maven_org_errors = 0;
const MAX_SEARCH_MAVEN_ORG_ERRORS = 1;

// circuit breaker for get repo license
let get_repo_license_errors = 0;
const MAX_GET_REPO_LICENSE_ERRORS = 5;

const MAX_LICENSE_ID_LENGTH = 100;

export let JAVA_CMD = "java";
if (process.env.JAVA_CMD) {
  JAVA_CMD = process.env.JAVA_CMD;
} else if (
  process.env.JAVA_HOME &&
  existsSync(process.env.JAVA_HOME) &&
  existsSync(join(process.env.JAVA_HOME, "bin", "java"))
) {
  JAVA_CMD = join(process.env.JAVA_HOME, "bin", "java");
}
export let PYTHON_CMD = "python";
if (process.env.PYTHON_CMD) {
  PYTHON_CMD = process.env.PYTHON_CMD;
} else if (process.env.CONDA_PYTHON_EXE) {
  PYTHON_CMD = process.env.CONDA_PYTHON_EXE;
}
export let DOTNET_CMD = "dotnet";
if (process.env.DOTNET_CMD) {
  DOTNET_CMD = process.env.DOTNET_CMD;
}
export let NODE_CMD = "node";
if (process.env.NODE_CMD) {
  NODE_CMD = process.env.NODE_CMD;
}
export let NPM_CMD = "npm";
if (process.env.NPM_CMD) {
  NPM_CMD = process.env.NPM_CMD;
}
export let YARN_CMD = "yarn";
if (process.env.YARN_CMD) {
  YARN_CMD = process.env.YARN_CMD;
}
export let GCC_CMD = "gcc";
if (process.env.GCC_CMD) {
  GCC_CMD = process.env.GCC_CMD;
}
export let RUSTC_CMD = "rustc";
if (process.env.RUSTC_CMD) {
  RUSTC_CMD = process.env.RUSTC_CMD;
}
export let GO_CMD = "go";
if (process.env.GO_CMD) {
  GO_CMD = process.env.GO_CMD;
}
export let CARGO_CMD = "cargo";
if (process.env.CARGO_CMD) {
  CARGO_CMD = process.env.CARGO_CMD;
}

// Clojure CLI
export let CLJ_CMD = "clj";
if (process.env.CLJ_CMD) {
  CLJ_CMD = process.env.CLJ_CMD;
}

export let LEIN_CMD = "lein";
if (process.env.LEIN_CMD) {
  LEIN_CMD = process.env.LEIN_CMD;
}

export let SWIFT_CMD = "swift";
if (process.env.SWIFT_CMD) {
  SWIFT_CMD = process.env.SWIFT_CMD;
}

// Custom user-agent for cdxgen
export const cdxgenAgent = got.extend({
  headers: {
    "user-agent": `@CycloneDX/cdxgen ${_version}`,
  },
});

/**
 * Method to get files matching a pattern
 *
 * @param {string} dirPath Root directory for search
 * @param {string} pattern Glob pattern (eg: *.gradle)
 */
export function getAllFiles(dirPath, pattern, options = {}) {
  let ignoreList = [
    "**/.hg/**",
    "**/.git/**",
    "**/venv/**",
    "**/docs/**",
    "**/examples/**",
    "**/site-packages/**",
  ];
  // Only ignore node_modules if the caller is not looking for package.json
  if (!pattern.includes("package.json")) {
    ignoreList.push("**/node_modules/**");
  }
  if (options?.exclude && Array.isArray(options.exclude)) {
    ignoreList = ignoreList.concat(options.exclude);
  }
  return getAllFilesWithIgnore(dirPath, pattern, ignoreList);
}

/**
 * Method to get files matching a pattern
 *
 * @param {string} dirPath Root directory for search
 * @param {string} pattern Glob pattern (eg: *.gradle)
 * @param {Array} ignoreList Directory patterns to ignore
 */
export function getAllFilesWithIgnore(dirPath, pattern, ignoreList) {
  try {
    return globSync(pattern, {
      cwd: dirPath,
      absolute: true,
      nocase: true,
      nodir: true,
      dot: pattern.startsWith(".") ? true : false,
      follow: false,
      ignore: ignoreList,
    });
  } catch (err) {
    if (DEBUG_MODE) {
      console.error(err);
    }
    return [];
  }
}

/**
 * Method to encode hex string to base64 string
 *
 * @param {string} hex string
 * @returns {string} base64 encoded string
 */
function toBase64(hexString) {
  return Buffer.from(hexString, "hex").toString("base64");
}

/**
 * Return the current timestamp in YYYY-MM-DDTHH:MM:SSZ format.
 *
 * @returns {string} ISO formatted timestamp, without milliseconds.
 */
export function getTimestamp() {
  return `${new Date().toISOString().split(".")[0]}Z`;
}

/**
 * Method to determine if a license is a valid SPDX license expression
 *
 * @param {string} license License string
 * @returns {boolean} true if the license is a valid SPDX license expression
 * @see https://spdx.dev/learn/handling-license-info/
 **/
export function isSpdxLicenseExpression(license) {
  if (!license) {
    return false;
  }

  if (/[(\s]+/g.test(license)) {
    return true;
  }

  if (license.endsWith("+")) {
    return true; // GPL-2.0+ means GPL-2.0 or any later version, at the licensee’s option.
  }

  return false;
}

/**
 * Convert the array of licenses to a CycloneDX 1.5 compliant license array.
 * This should return an array containing:
 * - one or more SPDX license if no expression is present
 * - the first license expression if at least one is present
 *
 * @param {Array} licenses Array of licenses
 * @returns {Array} CycloneDX 1.5 compliant license array
 */
export function adjustLicenseInformation(licenses) {
  if (!licenses || !Array.isArray(licenses)) {
    return [];
  }

  const expressions = licenses.filter((f) => {
    return f.expression;
  });
  if (expressions.length >= 1) {
    if (expressions.length > 1) {
      console.warn("multiple license expressions found", expressions);
    }
    return [{ expression: expressions[0].expression }];
  }
  return licenses.map((l) => {
    if (typeof l.license === "object") {
      return l;
    }
    return { license: l };
  });
}

/**
 * Performs a lookup + validation of the license specified in the
 * package. If the license is a valid SPDX license ID, set the 'id'
 * and url of the license object, otherwise, set the 'name' of the license
 * object.
 */
export function getLicenses(pkg) {
  let license = pkg.license && (pkg.license.type || pkg.license);
  if (license) {
    if (!Array.isArray(license)) {
      license = [license];
    }
    return adjustLicenseInformation(
      license.map((l) => {
        let licenseContent = {};
        if (typeof l === "string" || l instanceof String) {
          if (
            spdxLicenses.some((v) => {
              return l === v;
            })
          ) {
            licenseContent.id = l;
            licenseContent.url = `https://opensource.org/licenses/${l}`;
          } else if (l.startsWith("http")) {
            const knownLicense = getKnownLicense(l, pkg);
            if (knownLicense) {
              licenseContent.id = knownLicense.id;
              licenseContent.name = knownLicense.name;
            }
            // We always need a name to avoid validation errors
            // Issue: #469
            if (!licenseContent.name && !licenseContent.id) {
              licenseContent.name = "CUSTOM";
            }
            licenseContent.url = l;
          } else if (isSpdxLicenseExpression(l)) {
            licenseContent.expression = l;
          } else {
            licenseContent.name = l;
          }
        } else if (Object.keys(l).length) {
          licenseContent = l;
        } else {
          return undefined;
        }
        if (!licenseContent.id) {
          addLicenseText(pkg, l, licenseContent);
        }
        return licenseContent;
      }),
    );
  }
  const knownLicense = getKnownLicense(undefined, pkg);
  if (knownLicense) {
    return [{ license: knownLicense }];
  }
  return undefined;
}

/**
 * Method to retrieve known license by known-licenses.json
 *
 * @param {String} licenseUrl Repository url
 * @param {String} pkg Bom ref
 * @return {Object} Objetct with SPDX license id or license name
 */
export function getKnownLicense(licenseUrl, pkg) {
  if (licenseUrl?.includes("opensource.org")) {
    const possibleId = licenseUrl
      .toLowerCase()
      .replace("https://", "http://")
      .replace("http://www.opensource.org/licenses/", "");
    for (const spdxLicense of spdxLicenses) {
      if (spdxLicense.toLowerCase() === possibleId) {
        return { id: spdxLicense };
      }
    }
  } else if (licenseUrl?.includes("apache.org")) {
    const possibleId = licenseUrl
      .toLowerCase()
      .replace("https://", "http://")
      .replace("http://www.apache.org/licenses/license-", "apache-")
      .replace(".txt", "");
    for (const spdxLicense of spdxLicenses) {
      if (spdxLicense.toLowerCase() === possibleId) {
        return { id: spdxLicense };
      }
    }
  }
  for (const akLicGroup of knownLicenses) {
    if (
      akLicGroup.packageNamespace === "*" ||
      pkg.purl?.startsWith(akLicGroup.packageNamespace)
    ) {
      for (const akLic of akLicGroup.knownLicenses) {
        if (akLic.group && akLic.name) {
          if (akLic.group === "." && akLic.name === pkg.name) {
            return { id: akLic.license, name: akLic.licenseName };
          }
          if (
            pkg.group?.includes(akLic.group) &&
            (akLic.name === pkg.name || akLic.name === "*")
          ) {
            return { id: akLic.license, name: akLic.licenseName };
          }
        }
        if (
          akLic.urlIncludes &&
          licenseUrl &&
          licenseUrl.includes(akLic.urlIncludes)
        ) {
          return { id: akLic.license, name: akLic.licenseName };
        }
        if (
          akLic.urlEndswith &&
          licenseUrl &&
          licenseUrl.endsWith(akLic.urlEndswith)
        ) {
          return { id: akLic.license, name: akLic.licenseName };
        }
      }
    }
  }
  return undefined;
}

/**
 * Tries to find a file containing the license text based on commonly
 * used naming and content types. If a candidate file is found, add
 * the text to the license text object and stop.
 */
export function addLicenseText(pkg, l, licenseContent) {
  const licenseFilenames = [
    "LICENSE",
    "License",
    "license",
    "LICENCE",
    "Licence",
    "licence",
    "NOTICE",
    "Notice",
    "notice",
  ];
  const licenseContentTypes = {
    "text/plain": "",
    "text/txt": ".txt",
    "text/markdown": ".md",
    "text/xml": ".xml",
  };
  /* Loops over different name combinations starting from the license specified
       naming (e.g., 'LICENSE.Apache-2.0') and proceeding towards more generic names. */
  for (const licenseName of [`.${l}`, ""]) {
    for (const licenseFilename of licenseFilenames) {
      for (const [licenseContentType, fileExtension] of Object.entries(
        licenseContentTypes,
      )) {
        const licenseFilepath = `${pkg.realPath}/${licenseFilename}${licenseName}${fileExtension}`;
        if (existsSync(licenseFilepath)) {
          licenseContent.text = readLicenseText(
            licenseFilepath,
            licenseContentType,
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
export function readLicenseText(licenseFilepath, licenseContentType) {
  const licenseText = readFileSync(licenseFilepath, "utf8");
  if (licenseText) {
    const licenseContentText = { content: licenseText };
    if (licenseContentType !== "text/plain") {
      licenseContentText["contentType"] = licenseContentType;
    }
    return licenseContentText;
  }
  return null;
}

export async function getSwiftPackageMetadata(pkgList) {
  const cdepList = [];
  for (const p of pkgList) {
    if (p.repository?.url) {
      if (p.repository.url.includes("://github.com/")) {
        try {
          p.license = await getRepoLicense(p.repository.url, undefined);
        } catch (e) {
          console.error("error fetching repo license from", p.repository.url);
        }
      } else {
        if (DEBUG_MODE) {
          console.log(
            p.repository.url,
            "is currently not supported to fetch for licenses",
          );
        }
      }
    } else {
      if (DEBUG_MODE) {
        console.warn("no repository url found for", p.name);
      }
    }
    cdepList.push(p);
  }
  return cdepList;
}

/**
 * Method to retrieve metadata for npm packages by querying npmjs
 *
 * @param {Array} pkgList Package list
 */
export async function getNpmMetadata(pkgList) {
  const NPM_URL = "https://registry.npmjs.org/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      let key = p.name;
      if (p.group && p.group !== "") {
        let group = p.group;
        if (!group.startsWith("@")) {
          group = `@${group}`;
        }
        key = `${group}/${p.name}`;
      }
      let body = {};
      if (metadata_cache[key]) {
        body = metadata_cache[key];
      } else {
        const res = await cdxgenAgent.get(NPM_URL + key, {
          responseType: "json",
        });
        body = res.body;
        metadata_cache[key] = body;
      }
      p.description =
        body.versions?.[p.version]?.description || body.description;
      p.license =
        body.versions?.[p.version]?.license ||
        body.license ||
        (await getRepoLicense(body.repository?.url, undefined));
      if (body.repository?.url) {
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
}

/**
 * Parse nodejs package json file
 *
 * @param {string} pkgJsonFile package.json file
 * @param {boolean} simple Return a simpler representation of the component by skipping extended attributes and license fetch.
 */
export async function parsePkgJson(pkgJsonFile, simple = false) {
  const pkgList = [];
  if (existsSync(pkgJsonFile)) {
    try {
      const pkgData = JSON.parse(readFileSync(pkgJsonFile, "utf8"));
      const pkgIdentifier = parsePackageJsonName(pkgData.name);
      const name = pkgIdentifier.fullName || pkgData.name;
      if (DEBUG_MODE && !name && !pkgJsonFile.includes("node_modules")) {
        console.log(
          `${pkgJsonFile} doesn't contain the package name. Consider using the 'npm init' command to create a valid package.json file for this project.`,
        );
        return pkgList;
      }
      const group = pkgIdentifier.scope || "";
      const purl = new PackageURL(
        "npm",
        group,
        name,
        pkgData.version,
        null,
        null,
      ).toString();
      const author = pkgData.author;
      const authorString =
        author instanceof Object
          ? `${author.name}${author.email ? ` <${author.email}>` : ""}${
              author.url ? ` (${author.url})` : ""
            }`
          : author;
      const apkg = {
        name,
        group,
        version: pkgData.version,
        description: pkgData.description,
        purl: purl,
        "bom-ref": decodeURIComponent(purl),
        author: authorString,
        license: pkgData.license,
      };
      if (pkgData.homepage) {
        apkg.homepage = { url: pkgData.homepage };
      }
      if (pkgData.repository?.url) {
        apkg.repository = { url: pkgData.repository.url };
      }
      if (!simple) {
        apkg.properties = [
          {
            name: "SrcFile",
            value: pkgJsonFile,
          },
        ];
        apkg.evidence = {
          identity: {
            field: "purl",
            confidence: 0.7,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 0.7,
                value: pkgJsonFile,
              },
            ],
          },
        };
      }
      pkgList.push(apkg);
    } catch (err) {
      // continue regardless of error
    }
  }
  if (!simple && FETCH_LICENSE && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parsePkgJson`,
      );
    }
    return await getNpmMetadata(pkgList);
  }
  return pkgList;
}

/**
 * Parse nodejs package lock file
 *
 * @param {string} pkgLockFile package-lock.json file
 * @param {object} options Command line options
 */
export async function parsePkgLock(pkgLockFile, options = {}) {
  let pkgList = [];
  let dependenciesList = [];
  if (!options) {
    options = {};
  }

  if (!existsSync(pkgLockFile)) {
    return {
      pkgList,
      dependenciesList,
    };
  }

  const parseArboristNode = (
    node,
    rootNode,
    parentRef = null,
    visited = new Set(),
    options = {},
  ) => {
    if (visited.has(node)) {
      return { pkgList: [], dependenciesList: [] };
    }
    visited.add(node);
    let pkgList = [];
    let dependenciesList = [];

    // Create the package entry
    const srcFilePath = node.path.includes(`${_sep}node_modules`)
      ? node.path.split(`${_sep}node_modules`)[0]
      : node.path;
    const scope = node.dev === true ? "optional" : undefined;
    const integrity = node.integrity ? node.integrity : undefined;

    let pkg = {};
    let purlString = "";
    const author = node.package.author;
    const authorString =
      author instanceof Object
        ? `${author.name}${author.email ? ` <${author.email}>` : ""}${
            author.url ? ` (${author.url})` : ""
          }`
        : author;
    if (node === rootNode) {
      purlString = new PackageURL(
        "npm",
        options.projectGroup || "",
        options.projectName || node.packageName,
        options.projectVersion || node.version,
        null,
        null,
      )
        .toString()
        .replace(/%2F/g, "/");
      pkg = {
        author: authorString,
        group: options.projectGroup || "",
        name: options.projectName || node.packageName,
        version: options.projectVersion || node.version,
        type: "application",
        purl: purlString,
        "bom-ref": decodeURIComponent(purlString),
      };
    } else {
      purlString = new PackageURL(
        "npm",
        "",
        node.packageName,
        node.version,
        null,
        null,
      )
        .toString()
        .replace(/%2F/g, "/");
      const pkgLockFile = join(
        srcFilePath.replace("/", _sep),
        "package-lock.json",
      );
      pkg = {
        group: "",
        name: node.packageName,
        version: node.version,
        author: authorString,
        scope: scope,
        _integrity: integrity,
        properties: [
          {
            name: "SrcFile",
            value: pkgLockFile,
          },
        ],
        evidence: {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: pkgLockFile,
              },
            ],
          },
        },
        type: parentRef ? "npm" : "application",
        purl: purlString,
        "bom-ref": decodeURIComponent(purlString),
      };
      if (node.resolved) {
        pkg.properties.push({
          name: "ResolvedUrl",
          value: node.resolved,
        });
      }
      if (node.location) {
        pkg.properties.push({
          name: "LocalNodeModulesPath",
          value: node.location,
        });
      }
    }
    const packageLicense = node.package.license;
    if (packageLicense) {
      // License will be overridden if FETCH_LICENSE is enabled
      pkg.license = packageLicense;
    }
    pkgList.push(pkg);

    // retrieve workspace node pkglists
    const workspaceDependsOn = [];
    if (node.fsChildren && node.fsChildren.size > 0) {
      for (const workspaceNode of node.fsChildren) {
        const {
          pkgList: childPkgList,
          dependenciesList: childDependenciesList,
        } = parseArboristNode(workspaceNode, rootNode, purlString, visited);
        pkgList = pkgList.concat(childPkgList);
        dependenciesList = dependenciesList.concat(childDependenciesList);
        const depWorkspacePurlString = decodeURIComponent(
          new PackageURL(
            "npm",
            "",
            workspaceNode.name,
            workspaceNode.version,
            null,
            null,
          )
            .toString()
            .replace(/%2F/g, "/"),
        );
        if (decodeURIComponent(purlString) !== depWorkspacePurlString) {
          workspaceDependsOn.push(depWorkspacePurlString);
        }
      }
    }

    // this handles the case when a node has ["dependencies"] key in a package-lock.json
    // for a node. We exclude the root node because it's already been handled
    const childrenDependsOn = [];
    if (node !== rootNode) {
      for (const child of node.children) {
        const childNode = child[1];
        const {
          pkgList: childPkgList,
          dependenciesList: childDependenciesList,
        } = parseArboristNode(
          childNode,
          rootNode,
          decodeURIComponent(purlString),
          visited,
        );
        pkgList = pkgList.concat(childPkgList);
        dependenciesList = dependenciesList.concat(childDependenciesList);
        const depChildString = decodeURIComponent(
          new PackageURL(
            "npm",
            "",
            childNode.name,
            childNode.version,
            null,
            null,
          )
            .toString()
            .replace(/%2F/g, "/"),
        );
        if (decodeURIComponent(purlString) !== depChildString) {
          childrenDependsOn.push(depChildString);
        }
      }
    }

    // this handles the case when a node has a ["requires"] key
    const pkgDependsOn = [];
    for (const edge of node.edgesOut.values()) {
      let targetVersion;
      let targetName;
      let foundMatch = false;
      // if the edge doesn't have an integrity, it's likely a peer dependency
      // which isn't installed
      // Bug #795. At times, npm loses the integrity node completely and such packages are getting missed out
      // To keep things safe, we include these packages.
      let edgeToIntegrityOrLocation = edge.to ? edge.to.integrity : undefined;
      // Fallback to location based lookups when integrity is missing
      if (!edgeToIntegrityOrLocation && edge.to && edge.to.location) {
        edgeToIntegrityOrLocation = edge.to.location;
      }
      if (!edgeToIntegrityOrLocation) {
        // This hack is required to fix the package name
        targetName = edge.name.replace(/-cjs$/, "");
        foundMatch = false;
      } else {
        // the edges don't actually contain a version, so we need to search the root node
        // children to find the correct version. we check the node children first, then
        // we check the root node children
        for (const child of node.children) {
          if (edgeToIntegrityOrLocation) {
            if (
              child[1].integrity === edgeToIntegrityOrLocation ||
              child[1].location === edgeToIntegrityOrLocation
            ) {
              targetName = child[0].replace(/node_modules\//g, "");
              // The package name could be different from the targetName retrieved
              // Eg: "string-width-cjs": "npm:string-width@^4.2.0",
              if (child[1].packageName && child[1].packageName !== targetName) {
                targetName = child[1].packageName;
              }
              targetVersion = child[1].version;
              foundMatch = true;
              break;
            }
          }
        }
      }
      if (!foundMatch) {
        for (const child of rootNode.children) {
          if (
            edgeToIntegrityOrLocation &&
            (child[1].integrity === edgeToIntegrityOrLocation ||
              child[1].location === edgeToIntegrityOrLocation)
          ) {
            targetName = child[0].replace(/node_modules\//g, "");
            targetVersion = child[1].version;
            // The package name could be different from the targetName retrieved
            // "string-width-cjs": "npm:string-width@^4.2.0",
            if (child[1].packageName && child[1].packageName !== targetName) {
              targetName = child[1].packageName;
            }
            break;
          }
        }
      }

      // if we can't find the version of the edge, continue
      // it may be an optional peer dependency
      if (!targetVersion || !targetName) {
        continue;
      }
      const depPurlString = decodeURIComponent(
        new PackageURL("npm", "", targetName, targetVersion, null, null)
          .toString()
          .replace(/%2F/g, "/"),
      );
      if (decodeURIComponent(purlString) !== depPurlString) {
        pkgDependsOn.push(depPurlString);
      }
      if (edge.to == null) {
        continue;
      }
      const { pkgList: childPkgList, dependenciesList: childDependenciesList } =
        parseArboristNode(
          edge.to,
          rootNode,
          decodeURIComponent(purlString),
          visited,
        );
      pkgList = pkgList.concat(childPkgList);
      dependenciesList = dependenciesList.concat(childDependenciesList);
    }
    dependenciesList.push({
      ref: decodeURIComponent(purlString),
      dependsOn: workspaceDependsOn
        .concat(childrenDependsOn)
        .concat(pkgDependsOn),
    });

    return { pkgList, dependenciesList };
  };

  let arb = new Arborist({
    path: path.dirname(pkgLockFile),
    // legacyPeerDeps=false enables npm >v3 package dependency resolution
    legacyPeerDeps: false,
  });
  let tree = undefined;
  try {
    tree = await arb.loadVirtual();
  } catch (e) {
    console.log(
      `Unable to parse ${pkgLockFile} without legacy peer dependencies. Retrying ...`,
    );
    try {
      arb = new Arborist({
        path: path.dirname(pkgLockFile),
        legacyPeerDeps: true,
      });
      tree = await arb.loadVirtual();
    } catch (e) {
      console.log(
        `Unable to parse ${pkgLockFile} in legacy and non-legacy mode. The resulting SBOM would be incomplete.`,
      );
      return { pkgList, dependenciesList };
    }
  }
  if (!tree) {
    return { pkgList, dependenciesList };
  }
  ({ pkgList, dependenciesList } = parseArboristNode(
    tree,
    tree,
    null,
    new Set(),
    options,
  ));

  if (FETCH_LICENSE && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parsePkgLock`,
      );
    }
    pkgList = await getNpmMetadata(pkgList);
    return { pkgList, dependenciesList };
  }
  return {
    pkgList,
    dependenciesList,
  };
}

/**
 * Given a lock file this method would return an Object with the identiy as the key and parsed name and value
 * eg: "@actions/core@^1.2.6", "@actions/core@^1.6.0":
 *        version "1.6.0"
 * would result in two entries
 *
 * @param {string} lockData Yarn Lockfile data
 */
export function yarnLockToIdentMap(lockData) {
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
      if (tmpA?.length) {
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
            // "lru-cache@npm:^6.0.0":
            // "string-width-cjs@npm:string-width@^4.2.0":
            // Here range can be
            // - npm:^6.0.0
            // - npm:@types/ioredis@^4.28.10
            // - npm:strip-ansi@^6.0.1
            // See test cases with yarn3.lock and yarn6.lock
            if (range?.startsWith("npm:")) {
              if (range.includes("@")) {
                range = range.split("@").slice(-1)[0];
              } else {
                range = range.replace("npm:", "");
              }
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
}

function _parseYarnLine(l) {
  let name = "";
  let group = "";
  const prefixAtSymbol = l.startsWith("@");
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
  return { group, name };
}

/**
 * Parse nodejs yarn lock file
 *
 * @param {string} yarnLockFile yarn.lock file
 */
export async function parseYarnLock(yarnLockFile) {
  let pkgList = [];
  const dependenciesList = [];
  const depKeys = {};
  if (existsSync(yarnLockFile)) {
    const lockData = readFileSync(yarnLockFile, "utf8");
    let name = "";
    let name_aliases = [];
    let group = "";
    let version = "";
    let integrity = "";
    let depsMode = false;
    let purlString = "";
    let deplist = [];
    const pkgAddedMap = {};
    // This would have the keys and the resolved version required to solve the dependency tree
    const identMap = yarnLockToIdentMap(lockData);
    lockData.split("\n").forEach((l) => {
      l = l.replace("\r", "");
      if (l.startsWith("#")) {
        return;
      }
      if (!l.startsWith(" ") || l.trim() === "") {
        // Create an entry for the package and reset variables
        if (
          name !== "" &&
          version !== "" &&
          (integrity !== "" ||
            version.includes("local") ||
            (integrity === "" && (depsMode || l.trim() === "")))
        ) {
          name_aliases.push({ group, name });
          // FIXME: What should we do about the dependencies for such aliases
          for (const ang of name_aliases) {
            group = ang.group;
            name = ang.name;
            // Create a purl ref for the current package
            purlString = new PackageURL(
              "npm",
              group,
              name,
              version,
              null,
              null,
            ).toString();
            // Trim duplicates
            if (!pkgAddedMap[purlString]) {
              pkgAddedMap[purlString] = true;
              pkgList.push({
                group: group || "",
                name: name,
                version: version,
                _integrity: integrity,
                purl: purlString,
                "bom-ref": decodeURIComponent(purlString),
                properties: [
                  {
                    name: "SrcFile",
                    value: yarnLockFile,
                  },
                ],
                evidence: {
                  identity: {
                    field: "purl",
                    confidence: 1,
                    methods: [
                      {
                        technique: "manifest-analysis",
                        confidence: 1,
                        value: yarnLockFile,
                      },
                    ],
                  },
                },
              });
            }
          }
          // Reset all the variables
          group = "";
          name = "";
          name_aliases = [];
          version = "";
          integrity = "";
        }
        if (purlString && purlString !== "" && !depKeys[purlString]) {
          // Create an entry for dependencies
          dependenciesList.push({
            ref: decodeURIComponent(purlString),
            dependsOn: deplist,
          });
          depKeys[purlString] = true;
          deplist = [];
          purlString = "";
          depsMode = false;
        }
        // Collect the group and the name
        l = l.replace(/["']/g, "");
        // Deals with lines including aliases
        // Eg: string-width-cjs@npm:string-width@^4.2.0, string-width@npm:^1.0.2 || 2 || 3 || 4, string-width@npm:^4.1.0, string-width@npm:^4.2.0, string-width@npm:^4.2.3
        const fragments = l.split(", ");
        for (let i = 0; i < fragments.length; i++) {
          const parsedline = _parseYarnLine(fragments[i]);
          if (i === 0) {
            group = parsedline.group;
            name = parsedline.name;
          } else {
            let fullName = parsedline.name;
            if (parsedline.group?.length) {
              fullName = `${parsedline.group}/${parsedline.name}`;
            }
            if (
              fullName !== name &&
              fullName !== `${group}/${name}` &&
              !name_aliases.includes(fullName)
            ) {
              name_aliases.push({
                group: parsedline.group,
                name: parsedline.name,
              });
            }
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
          let range = tmpA[1];
          // Deal with range with npm: prefix such as npm:string-width@^4.2.0, npm:@types/ioredis@^4.28.10
          if (range.startsWith("npm:")) {
            range = range.split("@").splice(-1)[0];
          }
          const resolvedVersion = identMap[`${dgroupname}|${range}`];
          const depPurlString = new PackageURL(
            "npm",
            null,
            dgroupname,
            resolvedVersion,
            null,
            null,
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
          // in some cases yarn 4 will add a prefix to the checksum, containing the cachekey and compression level
          // example: 10c0/53c2b231a61a46792b39a0d43bc4f4f77...
          const checksum = parts[1].split("/").pop();
          integrity = `sha512-${Buffer.from(checksum, "hex").toString(
            "base64",
          )}`;
        }
        if (l.startsWith("resolved")) {
          const tmpB = parts[1].split("#");
          if (tmpB.length > 1) {
            const digest = tmpB[1].replace(/"/g, "");
            integrity = `sha256-${digest}`;
          }
        }
      }
    });
  }
  if (FETCH_LICENSE && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parseYarnLock`,
      );
    }
    pkgList = await getNpmMetadata(pkgList);
    return {
      pkgList,
      dependenciesList,
    };
  }
  return {
    pkgList,
    dependenciesList,
  };
}

/**
 * Parse nodejs shrinkwrap deps file
 *
 * @param {string} swFile shrinkwrap-deps.json file
 */
export async function parseNodeShrinkwrap(swFile) {
  const pkgList = [];
  if (existsSync(swFile)) {
    const lockData = JSON.parse(readFileSync(swFile, "utf8"));
    const pkgKeys = Object.keys(lockData);
    for (const k in pkgKeys) {
      const fullName = pkgKeys[k];
      const integrity = lockData[fullName];
      const parts = fullName.split("@");
      if (parts?.length) {
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
              value: swFile,
            },
          ],
          evidence: {
            identity: {
              field: "purl",
              confidence: 1,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 1,
                  value: swFile,
                },
              ],
            },
          },
        });
      }
    }
  }
  if (FETCH_LICENSE && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parseNodeShrinkwrap`,
      );
    }
    return await getNpmMetadata(pkgList);
  }
  return pkgList;
}

/**
 * Parse nodejs pnpm lock file
 *
 * @param {string} pnpmLock pnpm-lock.yaml file
 * @param {object} parentComponent parent component
 */
export async function parsePnpmLock(pnpmLock, parentComponent = null) {
  let pkgList = [];
  const dependenciesList = [];
  let ppurl = "";
  if (parentComponent?.name) {
    ppurl =
      parentComponent.purl ||
      new PackageURL(
        "npm",
        parentComponent.group,
        parentComponent.name,
        parentComponent.version,
        null,
        null,
      ).toString();
  }
  if (existsSync(pnpmLock)) {
    if (DEBUG_MODE) {
      console.log(`Parsing file ${pnpmLock}`);
    }
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
          null,
        ).toString();
        ddeplist.push(decodeURIComponent(dpurl));
      }
      dependenciesList.push({
        ref: decodeURIComponent(ppurl),
        dependsOn: ddeplist,
      });
    }
    let lockfileVersion = yamlObj.lockfileVersion;
    try {
      lockfileVersion = Number.parseInt(lockfileVersion, 10);
    } catch (e) {
      // ignore parse errors
    }
    const packages = yamlObj.packages || {};
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
      if (parts?.length) {
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
            `Unable to extract name and version for string ${pkgKeys[k]}`,
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
            null,
          ).toString();
          const deplist = [];
          for (const dpkgName of Object.keys(deps)) {
            const dpurlString = new PackageURL(
              "npm",
              "",
              dpkgName,
              deps[dpkgName],
              null,
              null,
            ).toString();
            deplist.push(decodeURIComponent(dpurlString));
          }
          dependenciesList.push({
            ref: decodeURIComponent(purlString),
            dependsOn: deplist,
          });
          pkgList.push({
            group: group,
            name: name,
            version: version,
            purl: purlString,
            "bom-ref": decodeURIComponent(purlString),
            scope,
            _integrity: integrity,
            properties: [
              {
                name: "SrcFile",
                value: pnpmLock,
              },
            ],
            evidence: {
              identity: {
                field: "purl",
                confidence: 1,
                methods: [
                  {
                    technique: "manifest-analysis",
                    confidence: 1,
                    value: pnpmLock,
                  },
                ],
              },
            },
          });
        }
      }
    }
  }
  if (FETCH_LICENSE && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parsePnpmLock`,
      );
    }
    pkgList = await getNpmMetadata(pkgList);
    return {
      pkgList,
      dependenciesList,
    };
  }
  return {
    pkgList,
    dependenciesList,
  };
}

/**
 * Parse bower json file
 *
 * @param {string} bowerJsonFile bower.json file
 */
export async function parseBowerJson(bowerJsonFile) {
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
            value: bowerJsonFile,
          },
        ],
        evidence: {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: bowerJsonFile,
              },
            ],
          },
        },
      });
    } catch (err) {
      // continue regardless of error
    }
  }
  if (FETCH_LICENSE && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parseBowerJson`,
      );
    }
    return await getNpmMetadata(pkgList);
  }
  return pkgList;
}

/**
 * Parse minified js file
 *
 * @param {string} minJsFile min.js file
 */
export async function parseMinJs(minJsFile) {
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
            if (pkgIdentifier.fullName !== "") {
              pkgList.push({
                name: pkgIdentifier.fullName,
                group: pkgIdentifier.scope || "",
                version: tmpB[1].replace(/^v/, "") || "",
                properties: [
                  {
                    name: "SrcFile",
                    value: minJsFile,
                  },
                ],
                evidence: {
                  identity: {
                    field: "purl",
                    confidence: 0.25,
                    methods: [
                      {
                        technique: "filename",
                        confidence: 0.25,
                        value: minJsFile,
                      },
                    ],
                  },
                },
              });
            }
          }
        }
      });
    } catch (err) {
      // continue regardless of error
    }
  }
  if (FETCH_LICENSE && pkgList && pkgList.length) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages in parseMinJs`,
      );
    }
    return await getNpmMetadata(pkgList);
  }
  return pkgList;
}

/**
 * Parse pom file
 *
 * @param {string} pom file to parse
 */
export function parsePom(pomFile) {
  const deps = [];
  const xmlData = readFileSync(pomFile, "utf-8");
  const project = xml2js(xmlData, {
    compact: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value",
  }).project;
  if (project?.dependencies) {
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
      if (version?._ && version._.indexOf("$") === -1) {
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
                value: pomFile,
              },
            ],
            evidence: {
              identity: {
                field: "purl",
                confidence: 1,
                methods: [
                  {
                    technique: "manifest-analysis",
                    confidence: 1,
                    value: pomFile,
                  },
                ],
              },
            },
          });
      }
    }
  }
  return deps;
}

/**
 * Parse maven tree output
 * @param {string} rawOutput Raw string output
 */
export function parseMavenTree(rawOutput) {
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
    if (tmpline?.length) {
      if (l.includes(" ")) {
        level = l.replace(tmpline[tmpline.length - 1], "").length / 3;
      }
      l = tmpline[tmpline.length - 1];
      const pkgArr = l.split(":");
      if (pkgArr && pkgArr.length > 2) {
        let versionStr = pkgArr[pkgArr.length - 2];
        if (pkgArr.length === 4) {
          versionStr = pkgArr[pkgArr.length - 1];
        }
        const key = `${pkgArr[0]}-${pkgArr[1]}-${versionStr}`;
        if (!keys_cache[key]) {
          keys_cache[key] = key;
          let purlString = new PackageURL(
            "maven",
            pkgArr[0],
            pkgArr[1],
            versionStr,
            { type: pkgArr[2] },
            null,
          ).toString();
          purlString = decodeURIComponent(purlString);
          deps.push({
            group: pkgArr[0],
            name: pkgArr[1],
            version: versionStr,
            qualifiers: { type: pkgArr[2] },
          });
          if (!level_trees[purlString]) {
            level_trees[purlString] = [];
          }
          if (level === 0 || last_purl === "") {
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
      dependsOn: level_trees[lk],
    });
  }
  return {
    pkgList: deps,
    dependenciesList,
  };
}

/**
 * Parse gradle dependencies output
 * @param {string} rawOutput Raw string output
 * @param {string} rootProjectGroup Root project group
 * @param {string} rootProjectName Root project name
 * @param {string} rootProjectVersion Root project version
 */
export function parseGradleDep(
  rawOutput,
  rootProjectGroup = "",
  rootProjectName = "root",
  rootProjectVersion = "latest",
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
      qualifiers: { type: "jar" },
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
        null,
      ).toString(),
    );
    const first_purl = last_purl;
    let last_project_purl = first_purl;
    const level_trees = {};
    level_trees[last_purl] = [];
    let scope = undefined;
    let profileName = undefined;
    if (retMap?.projects) {
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
              null,
            ).toString(),
          ),
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
          versionoverride,
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
            null,
          ).toString();
          purlString = decodeURIComponent(purlString);
          keys_cache[`${purlString}_${last_purl}`] = true;
          // Filter duplicates
          if (!deps_keys_cache[purlString]) {
            deps_keys_cache[purlString] = true;
            const adep = {
              group: group !== "project" ? group : rootProjectGroup,
              name: name,
              version: version !== undefined ? version : rootProjectVersion,
              qualifiers: { type: "jar" },
            };
            adep["purl"] = purlString;
            adep["bom-ref"] = decodeURIComponent(purlString);
            if (scope) {
              adep["scope"] = scope;
            }
            if (profileName) {
              adep.properties = [
                {
                  name: "GradleProfileName",
                  value: profileName,
                },
              ];
            }
            deps.push(adep);
          }
          if (!level_trees[purlString]) {
            level_trees[purlString] = [];
          }
          if (level === 0) {
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
        dependsOn: level_trees[lk],
      });
    }
    return {
      pkgList: deps,
      dependenciesList,
    };
  }
  return {};
}

/**
 * Parse clojure cli dependencies output
 * @param {string} rawOutput Raw string output
 */
export function parseCljDep(rawOutput) {
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
        if (tmpArr.length === 2) {
          let group = dirname(tmpArr[0]);
          if (group === ".") {
            group = "";
          }
          const name = basename(tmpArr[0]);
          const version = tmpArr[1];
          const cacheKey = `${group}-${name}-${version}`;
          if (!keys_cache[cacheKey]) {
            keys_cache[cacheKey] = true;
            deps.push({
              group,
              name,
              version,
            });
          }
        }
      }
    });
    return deps;
  }
  return [];
}

/**
 * Parse lein dependency tree output
 * @param {string} rawOutput Raw string output
 */
export function parseLeinDep(rawOutput) {
  if (typeof rawOutput === "string") {
    const deps = [];
    const keys_cache = {};
    if (rawOutput.includes("{[") && !rawOutput.startsWith("{[")) {
      rawOutput = `{[${rawOutput.split("{[")[1]}`;
    }
    const ednData = parseEDNString(rawOutput);
    return parseLeinMap(ednData, keys_cache, deps);
  }
  return [];
}

export function parseLeinMap(node, keys_cache, deps) {
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
        const cacheKey = `${group}-${name}-${version}`;
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
}

/**
 * Parse gradle projects output
 *
 * @param {string} rawOutput Raw string output
 */
export function parseGradleProjects(rawOutput) {
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
            const tmpName = projName.split(" ")[0];
            if (tmpName.length > 1) {
              projects.add(tmpName);
            }
          }
        }
      } else if (l.includes("--- project ")) {
        const tmpB = l.split("--- project ");
        if (tmpB && tmpB.length > 1) {
          const projName = tmpB[1];
          if (projName.startsWith(":")) {
            const tmpName = projName.split(" ")[0];
            if (tmpName.length > 1) {
              projects.add(tmpName);
            }
          }
        }
      }
    });
  }
  return {
    rootProject,
    projects: Array.from(projects),
  };
}

/**
 * Parse gradle properties output
 *
 * @param {string} rawOutput Raw string output
 */
export function parseGradleProperties(rawOutput) {
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
    metadata,
  };
}

/**
 * Execute gradle properties command and return parsed output
 *
 * @param {string} dir Directory to execute the command
 * @param {string} rootPath Root directory
 * @param {string} subProject Sub project name
 */
export function executeGradleProperties(dir, rootPath, subProject) {
  const defaultProps = {
    rootProject: subProject,
    projects: [],
    metadata: {
      version: "latest",
    },
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
    "--build-cache",
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
    dir,
  );
  const result = spawnSync(gradleCmd, gradlePropertiesArgs, {
    cwd: dir,
    encoding: "utf-8",
    shell: isWin,
  });
  if (result.status !== 0 || result.error) {
    if (result.stderr) {
      if (result.stderr.includes("does not exist")) {
        return defaultProps;
      }
      console.error(result.stdout, result.stderr);
      console.log(
        "1. Check if the correct version of java and gradle are installed and available in PATH. For example, some project might require Java 11 with gradle 7.\n cdxgen container image bundles Java 21 with gradle 8 which might be incompatible.",
      );
      console.log(
        "2. Try running cdxgen with the unofficial JDK11-based image `ghcr.io/appthreat/cdxgen-java:v10`.",
      );
      if (result.stderr.includes("not get unknown property")) {
        console.log(
          "3. Check if the SBOM is generated for the correct root project for your application.",
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
}

/**
 * Parse bazel action graph output
 * @param {string} rawOutput Raw string output
 */
export function parseBazelActionGraph(rawOutput) {
  const mavenPrefixRegex = RegExp(
    `^.*v1/https/[^/]*(?:${
      process.env.BAZEL_STRIP_MAVEN_PREFIX || "/maven2/"
    })?(.*)/(.*)/(.*)/(.*.jar)(?:"| \\\\)?$`,
    "g",
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

        if (matches[0]?.[1]) {
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
              qualifiers: { type: "jar" },
            });
          }
        }
      }
    });
    return deps;
  }
  return [];
}

/**
 * Parse bazel skyframe state output
 * @param {string} rawOutput Raw string output
 */
export function parseBazelSkyframe(rawOutput) {
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
        if (mparts?.[mparts.length - 1].endsWith(".jar")) {
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
                qualifiers: { type: "jar" },
              });
            }
          }
        }
      }
    });
    return deps;
  }
  return [];
}

/**
 * Parse bazel BUILD file
 * @param {string} rawOutput Raw string output
 */
export function parseBazelBuild(rawOutput) {
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
}

/**
 * Parse dependencies in Key:Value format
 */
export function parseKVDep(rawOutput) {
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
        null,
      ).toString();
      deps.push({
        group,
        name,
        version,
        purl: purlString,
        "bom-ref": decodeURIComponent(purlString),
      });
    });
    return deps;
  }
  return [];
}

/**
 * Method to find the spdx license id from name
 *
 * @param {string} name License full name
 */
export function findLicenseId(name) {
  if (!name) {
    return undefined;
  }
  for (const l of licenseMapping) {
    if (l.names.includes(name) || l.exp.toUpperCase() === name.toUpperCase()) {
      return l.exp;
    }
  }
  return name && (name.includes("\n") || name.length > MAX_LICENSE_ID_LENGTH)
    ? guessLicenseId(name)
    : name;
}

/**
 * Method to guess the spdx license id from license contents
 *
 * @param {string} name License file contents
 */
export function guessLicenseId(content) {
  content = content.replace(/\n/g, " ");
  for (const l of licenseMapping) {
    for (const j in l.names) {
      if (content.toUpperCase().indexOf(l.names[j].toUpperCase()) > -1) {
        return l.exp;
      }
    }
  }
  return undefined;
}

/**
 * Method to retrieve metadata for maven packages by querying maven central
 *
 * @param {Array} pkgList Package list
 * @param {Object} jarNSMapping Jar Namespace mapping object
 */
export async function getMvnMetadata(pkgList, jarNSMapping = {}) {
  const MAVEN_CENTRAL_URL =
    process.env.MAVEN_CENTRAL_URL || "https://repo1.maven.org/maven2/";
  const ANDROID_MAVEN_URL =
    process.env.ANDROID_MAVEN_URL || "https://maven.google.com/";
  const cdepList = [];
  if (!pkgList || !pkgList.length) {
    return pkgList;
  }
  if (DEBUG_MODE && FETCH_LICENSE) {
    console.log(`About to query maven for ${pkgList.length} packages`);
  }
  for (const p of pkgList) {
    // Reuse any namespace data from jarNSMapping
    if (jarNSMapping && p.purl && jarNSMapping[p.purl]) {
      if (jarNSMapping[p.purl].jarFile) {
        p.evidence = {
          identity: {
            field: "purl",
            confidence: 0.8,
            methods: [
              {
                technique: "binary-analysis",
                confidence: 0.8,
                value: jarNSMapping[p.purl].jarFile,
              },
            ],
          },
        };
      }
      if (
        jarNSMapping[p.purl].namespaces &&
        jarNSMapping[p.purl].namespaces.length
      ) {
        if (!p.properties) {
          p.properties = [];
        }
        p.properties.push({
          name: "Namespaces",
          value: jarNSMapping[p.purl].namespaces.join("\n"),
        });
      }
    }
    const group = p.group || "";
    // If the package already has key metadata skip querying maven
    if (group && p.name && p.version && !FETCH_LICENSE) {
      cdepList.push(p);
      continue;
    }
    let urlPrefix = MAVEN_CENTRAL_URL;
    // Ideally we should try one resolver after the other. But it increases the time taken
    if (group.indexOf("android") !== -1) {
      urlPrefix = ANDROID_MAVEN_URL;
    }
    // Querying maven requires a valid group name
    if (!group || group === "") {
      cdepList.push(p);
      continue;
    }
    const pomMetadata = {
      urlPrefix: urlPrefix,
      group: group,
      name: p.name,
      version: p.version,
    };
    try {
      if (DEBUG_MODE) {
        console.log(
          `Querying ${pomMetadata} from ${composePomXmlUrl(pomMetadata)}`,
        );
      }
      const bodyJson = await fetchPomXmlAsJson(pomMetadata);
      p.publisher = bodyJson.organization?.name
        ? bodyJson.organization.name._
        : "";
      p.description = bodyJson.description ? bodyJson.description._ : "";
      if (bodyJson.scm?.url) {
        p.repository = { url: bodyJson.scm.url._ };
      }
      p.license =
        parseLicenseEntryOrArrayFromPomXml(bodyJson?.licenses?.license) ||
        (await extractLicenseCommentFromPomXml(pomMetadata)) ||
        (await getRepoLicense(p.repository?.url, undefined));
    } catch (err) {
      if (DEBUG_MODE) {
        console.log(
          `An error occurred when trying to fetch metadata ${pomMetadata}`,
          err,
        );
      }
    } finally {
      cdepList.push(p);
    }
  }
  return cdepList;
}

/**
 * Method to compose URL of pom.xml
 *
 * @param {String} urlPrefix
 * @param {String} group
 * @param {String} name
 * @param {String} version
 *
 * @return {String} fullUrl
 */
export function composePomXmlUrl({ urlPrefix, group, name, version }) {
  const groupPart = group.replace(/\./g, "/");
  const fullUrl = `${
    urlPrefix + groupPart
  }/${name}/${version}/${name}-${version}.pom`;
  return fullUrl;
}

/**
 * Method to fetch pom.xml data and parse it to JSON
 *
 * @param {String} urlPrefix
 * @param {String} group
 * @param {String} name
 * @param {String} version
 *
 * @return {Object|undefined}
 */
export async function fetchPomXmlAsJson({ urlPrefix, group, name, version }) {
  const pomXml = await fetchPomXml({ urlPrefix, group, name, version });
  const options = {
    compact: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value",
  };
  const pomJson = xml2js(pomXml, options).project;
  if (pomJson?.parent) {
    const parentXml = await fetchPomXml({
      urlPrefix,
      group: pomJson.parent.groupId?._,
      name: pomJson.parent.artifactId?._,
      version: pomJson.parent.version?._,
    });
    const parentJson = xml2js(parentXml, options).project;
    const result = { ...parentJson, ...pomJson };
    return result;
  }
  return pomJson;
}

/**
 * Method to fetch pom.xml data
 *
 * @param {String} urlPrefix
 * @param {String} group
 * @param {String} name
 * @param {String} version
 *
 * @return {Promise<String>}
 */
export async function fetchPomXml({ urlPrefix, group, name, version }) {
  const fullUrl = composePomXmlUrl({ urlPrefix, group, name, version });
  const res = await cdxgenAgent.get(fullUrl);
  return res.body;
}

/**
 * Method extract single or multiple license entries that might appear in pom.xml
 *
 * @param {Object|Array} license
 */
export function parseLicenseEntryOrArrayFromPomXml(license) {
  if (!license) return;
  if (Array.isArray(license)) {
    return license.map((l) => {
      return findLicenseId(l.name._);
    });
  }
  if (Object.keys(license).length) {
    return [findLicenseId(license.name._)];
  }
}

/**
 * Method to parse pom.xml in search of a comment containing license text
 *
 * @param {String} urlPrefix
 * @param {String} group
 * @param {String} name
 * @param {String} version
 *
 * @return {Promise<String>} License ID
 */
export async function extractLicenseCommentFromPomXml({
  urlPrefix,
  group,
  name,
  version,
}) {
  const pom_xml = await fetchPomXml({ urlPrefix, group, name, version });
  const licenseRegex = /<!--([\s\S]*?)-->[\s\n]*<project/m;
  const match = licenseRegex.exec(pom_xml);
  if (match?.[1]) {
    return findLicenseId(match[1].trim());
  }
}

/**
 * Method to parse python requires_dist attribute found in pypi setup.py
 *
 * @param requires_dist string
 */
export function parsePyRequiresDist(dist_string) {
  if (!dist_string) {
    return undefined;
  }
  const tmpA = dist_string.split(" ");
  let name = "";
  let version = "";
  if (!tmpA) {
    return undefined;
  }
  if (tmpA.length === 1) {
    name = tmpA[0];
  } else if (tmpA.length > 1) {
    name = tmpA[0];
    const tmpVersion = tmpA[1];
    version = tmpVersion.split(",")[0].replace(/[();=&glt><]/g, "");
  }
  return {
    name,
    version,
  };
}

/**
 * Method to mimic pip version solver using node-semver
 *
 * @param {Array} versionsList List of version numbers available
 * @param {*} versionSpecifiers pip version specifier
 */
export function guessPypiMatchingVersion(versionsList, versionSpecifiers) {
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
  for (const rv of versionsList.sort(comparator)) {
    if (satisfies(coerce(rv), versionSpecifiers, true)) {
      return rv;
    }
  }
  // Let's try to clean and have another go
  return maxSatisfying(versionsList, clean(versionSpecifiers, { loose: true }));
}

/**
 * Method to retrieve metadata for python packages by querying pypi
 *
 * @param {Array} pkgList Package list
 * @param {Boolean} fetchDepsInfo Fetch dependencies info from pypi
 */
export async function getPyMetadata(pkgList, fetchDepsInfo) {
  if (!FETCH_LICENSE && !fetchDepsInfo) {
    return pkgList;
  }
  const PYPI_URL = process.env.PYPI_URL || "https://pypi.org/pypi/";
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
      const origName = p.name;
      // Some packages support extra modules
      if (p.name.includes("[")) {
        p.name = p.name.split("[")[0];
      }
      let res = undefined;
      try {
        res = await cdxgenAgent.get(`${PYPI_URL + p.name}/json`, {
          responseType: "json",
        });
      } catch (err) {
        // retry by prefixing django- to the package name
        res = await cdxgenAgent.get(`${PYPI_URL}django-${p.name}/json`, {
          responseType: "json",
        });
        p.name = `django-${p.name}`;
      }
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
      p.license = [];
      if (body.info.classifiers) {
        for (const c of body.info.classifiers) {
          if (c.startsWith("License :: ")) {
            const licenseName = c.split("::").slice(-1)[0].trim();
            const licenseId = findLicenseId(licenseName);
            if (licenseId && !p.license.includes(licenseId)) {
              p.license.push(licenseId);
            }
          }
        }
      }
      if (body.info.license) {
        const licenseId = findLicenseId(body.info.license);
        if (licenseId && !p.license.includes(licenseId)) {
          p.license.push(licenseId);
        }
      }
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
        if (p.properties?.length) {
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
            versionSpecifiers,
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
                  value: `Version specifiers: ${versionSpecifiers}`,
                },
              ],
            },
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
                  value: `PyPI package: ${p.name}`,
                },
              ],
            },
          };
        }
      } else if (p.version !== body.info.version) {
        if (!p.properties) {
          p.properties = [];
        }
        p.properties.push({
          name: "cdx:pypi:latest_version",
          value: body.info.version,
        });
        p.properties.push({
          name: "cdx:pypi:resolved_from",
          value: origName,
        });
      }
      if (body.releases?.[p.version] && body.releases[p.version].length) {
        const digest = body.releases[p.version][0].digests;
        if (digest["sha256"]) {
          p._integrity = `sha256-${digest["sha256"]}`;
        } else if (digest["md5"]) {
          p._integrity = `md5-${digest["md5"]}`;
        }
      }
      const purlString = new PackageURL(
        "pypi",
        "",
        p.name,
        p.version,
        null,
        null,
      ).toString();
      p.purl = purlString;
      p["bom-ref"] = decodeURIComponent(purlString);
      cdepList.push(p);
    } catch (err) {
      if (DEBUG_MODE) {
        console.error(p.name, "is not found on PyPI.");
        console.log(
          "If this package is available from PyPI or a registry, its name might be different from the module name. Raise a ticket at https://github.com/CycloneDX/cdxgen/issues so that this can be added to the mapping file pypi-pkg-aliases.json",
        );
        console.log(
          "Alternatively, if this is a package that gets installed directly in your environment and offers a python binding, then track such packages manually.",
        );
      }
      if (!p.version) {
        if (DEBUG_MODE) {
          console.log(
            `Assuming the version as latest for the package ${p.name}`,
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
                value: `Module ${p.name}`,
              },
            ],
          },
        };
      }
      const purlString = new PackageURL(
        "pypi",
        "",
        p.name,
        p.version,
        null,
        null,
      ).toString();
      p.purl = purlString;
      p["bom-ref"] = decodeURIComponent(purlString);
      cdepList.push(p);
    }
  }
  return cdepList;
}

/**
 * Method to parse bdist_wheel metadata
 *
 * @param {Object} mData bdist_wheel metadata
 */
export function parseBdistMetadata(mData) {
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
}

/**
 * Method to parse pipfile.lock data
 *
 * @param {Object} lockData JSON data from Pipfile.lock
 */
export async function parsePiplockData(lockData) {
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
}

/**
 * Method to parse python pyproject.toml file
 *
 * @param {string} tomlFile Toml file
 */
export function parsePyProjectToml(tomlFile) {
  // Do we need a toml npm package at some point?
  const tomlData = readFileSync(tomlFile, { encoding: "utf-8" });
  const pkg = {};
  if (!tomlData) {
    return pkg;
  }
  tomlData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      const key = tmpA[0].trim();
      let value = tmpA[1].trim().replace(/["']/g, "");
      switch (key) {
        case "description":
          pkg.description = value;
          break;
        case "name":
          if (!pkg.name) {
            pkg.name = value;
          }
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
}

/**
 * Method to parse poetry.lock data
 *
 * @param {Object} lockData JSON data from poetry.lock
 * @param {string} lockFile Lock file name for evidence
 */
export async function parsePoetrylockData(lockData, lockFile) {
  let pkgList = [];
  const dependenciesList = [];
  const depsMap = {};
  const existingPkgMap = {};
  let pkg = null;
  let lastPkgRef = undefined;
  let depsMode = false;
  if (!lockData) {
    return pkgList;
  }
  lockData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    let key = null;
    let value = null;
    // Package section starts with this marker
    if (
      l.includes("[[package]]") ||
      l.includes("[package.dependencies]") ||
      l.startsWith("[package.") ||
      l.startsWith("[extras") ||
      l.startsWith("[metadata") ||
      l.endsWith(" [")
    ) {
      // Package dependencies starts with this marker
      depsMode = l.includes("[package.dependencies]");
      if (pkg?.name && pkg.version) {
        const purlString = new PackageURL(
          "pypi",
          "",
          pkg.name,
          pkg.version,
          null,
          null,
        ).toString();
        pkg.purl = purlString;
        pkg["bom-ref"] = decodeURIComponent(purlString);
        pkg.evidence = {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: lockFile,
              },
            ],
          },
        };
        // This would help look
        if (!existingPkgMap[pkg.name.toLowerCase()]) {
          existingPkgMap[pkg.name.toLowerCase()] = pkg["bom-ref"];
          pkgList.push(pkg);
        }
        lastPkgRef = pkg["bom-ref"];
        if (!depsMap[lastPkgRef]) {
          depsMap[lastPkgRef] = new Set();
        }
      }
      pkg = {};
    }
    if (l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/"/g, "");
      if (depsMode) {
        key = key.toLowerCase();
        if (lastPkgRef) {
          // Sometimes, the dependency may not have been resolved
          // So we track the name
          depsMap[lastPkgRef].add(existingPkgMap[key] || key);
        }
      } else {
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
            pkg.scope = value === "true" ? "optional" : undefined;
            break;
        }
      }
    }
  });
  pkgList = await getPyMetadata(pkgList, false);
  for (const key of Object.keys(depsMap)) {
    const dependsOnList = [];
    for (const adep of Array.from(depsMap[key])) {
      if (adep.startsWith("pkg:")) {
        dependsOnList.push(adep);
      } else if (existingPkgMap[adep]) {
        dependsOnList.push(existingPkgMap[adep]);
      } else if (existingPkgMap[`py${adep}`]) {
        dependsOnList.push(existingPkgMap[`py${adep}`]);
      } else if (existingPkgMap[adep.replace(/-/g, "_")]) {
        dependsOnList.push(existingPkgMap[adep.replace(/-/g, "_")]);
      }
    }
    dependenciesList.push({
      ref: key,
      dependsOn: dependsOnList,
    });
  }
  return {
    pkgList,
    rootList: pkgList,
    dependenciesList,
  };
}

/**
 * Method to parse requirements.txt data
 *
 * @param {Object} reqData Requirements.txt data
 * @param {Boolean} fetchDepsInfo Fetch dependencies info from pypi
 */
export async function parseReqFile(reqData, fetchDepsInfo) {
  const pkgList = [];
  let compScope = undefined;
  reqData
    .replace(/\r/g, "")
    .replace(/ [\\]\n/g, "")
    .replace(/ {4}/g, " ")
    .split("\n")
    .forEach((l) => {
      l = l.trim();
      let markers = undefined;
      if (l.includes(" ; ")) {
        const tmpA = l.split(" ; ");
        if (tmpA && tmpA.length === 2) {
          l = tmpA[0];
          markers = tmpA[1];
        }
      }
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
              const apkg = {
                name,
                version: versionStr,
                scope: compScope,
              };
              if (markers) {
                apkg.properties = [
                  {
                    name: "cdx:pip:markers",
                    value: markers,
                  },
                ];
              }
              pkgList.push(apkg);
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
                  value: versionSpecifiers,
                },
              ],
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
                    value: versionSpecifiers,
                  },
                ],
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
                    value: versionSpecifiers,
                  },
                ],
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
                    value: versionSpecifiers,
                  },
                ],
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
export async function getPyModules(src, epkgList, options) {
  const allImports = {};
  const dependenciesList = [];
  let modList = [];
  const slicesFile = resolve(
    options.depsSlicesFile || options.usagesSlicesFile,
  );
  // Issue: 615 fix. Reuse existing slices file
  if (slicesFile && existsSync(slicesFile)) {
    const slicesData = JSON.parse(readFileSync(slicesFile, "utf-8"));
    if (slicesData && Object.keys(slicesData) && slicesData.modules) {
      modList = slicesData.modules;
    } else {
      modList = slicesData;
    }
  } else {
    modList = findAppModules(src, "python", "parsedeps", slicesFile);
  }
  const pyDefaultModules = new Set(PYTHON_STD_MODULES);
  modList = modList.filter(
    (x) =>
      !pyDefaultModules.has(x.name.toLowerCase()) &&
      !x.name.startsWith("_") &&
      !x.name.startsWith("."),
  );
  let pkgList = modList.map((p) => {
    const apkg = {
      name:
        PYPI_MODULE_PACKAGE_MAPPING[p.name.toLowerCase()] ||
        PYPI_MODULE_PACKAGE_MAPPING[p.name.replace(/_/g, "-").toLowerCase()] ||
        p.name.replace(/_/g, "-").toLowerCase(),
      version: p.version?.trim().length ? p.version : undefined,
      scope: "required",
      properties: [
        {
          name: "cdx:pypi:versionSpecifiers",
          value: p.versionSpecifiers,
        },
      ],
    };
    if (p.importedSymbols) {
      apkg.properties.push({
        name: "ImportedModules",
        value: p.importedSymbols,
      });
    }
    return apkg;
  });
  pkgList = pkgList.filter(
    (obj, index) => pkgList.findIndex((i) => i.name === obj.name) === index,
  );
  if (epkgList?.length) {
    const pkgMaps = epkgList.map((p) => p.name);
    pkgList = pkgList.filter((p) => !pkgMaps.includes(p.name));
  }
  pkgList = await getPyMetadata(pkgList, true);
  // Populate the imports list after dealiasing
  if (pkgList?.length) {
    pkgList.forEach((p) => {
      allImports[p.name] = true;
    });
  }
  for (const p of pkgList) {
    if (p.version) {
      dependenciesList.push({
        ref: `pkg:pypi/${p.name.replace(/_/g, "-")}@${p.version}`.toLowerCase(),
        dependsOn: [],
      });
    }
  }
  return { allImports, pkgList, dependenciesList, modList };
}

/**
 * Method to parse setup.py data
 *
 * @param {Object} setupPyData Contents of setup.py
 */
export async function parseSetupPyFile(setupPyData) {
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
}

/**
 * Method to construct a GitHub API url for the given repo metadata
 * @param {Object} repoMetadata Repo metadata with group and name
 * @return {String|undefined} github api url (or undefined - if not enough data)
 */
export function repoMetadataToGitHubApiUrl(repoMetadata) {
  if (repoMetadata) {
    const group = repoMetadata.group;
    const name = repoMetadata.name;
    let ghUrl = "https://api.github.com/repos";
    if (group && group !== "." && group !== "") {
      ghUrl = `${ghUrl}/${group.replace("github.com/", "")}`;
    }
    ghUrl = `${ghUrl}/${name}`;
    return ghUrl;
  }
  return undefined;
}

/**
 * Method to split GitHub url into its parts
 * @param {String} repoUrl Repository url
 * @return {[String]} parts from url
 */
export function getGithubUrlParts(repoUrl) {
  if (repoUrl.toLowerCase().endsWith(".git")) {
    repoUrl = repoUrl.slice(0, -4);
  }
  repoUrl.replace(/\/$/, "");
  const parts = repoUrl.split("/");
  return parts;
}

/**
 * Method to construct GitHub api url from repo metadata or one of multiple formats of repo URLs
 * @param {String} repoUrl Repository url
 * @param {Object} repoMetadata Object containing group and package name strings
 * @return {String|undefined} github api url (or undefined - if not a GitHub repo)
 */
export function toGitHubApiUrl(repoUrl, repoMetadata) {
  if (repoMetadata) {
    return repoMetadataToGitHubApiUrl(repoMetadata);
  }
  const parts = getGithubUrlParts(repoUrl);
  if (parts.length < 5 || parts[2] !== "github.com") {
    return undefined; // Not a valid GitHub repo URL
  }
  return repoMetadataToGitHubApiUrl({
    group: parts[3],
    name: parts[4],
  });
}

/**
 * Method to retrieve repo license by querying github api
 *
 * @param {String} repoUrl Repository url
 * @param {Object} repoMetadata Object containing group and package name strings
 * @return {Promise<String>} SPDX license id
 */
export async function getRepoLicense(repoUrl, repoMetadata) {
  const apiUrl = toGitHubApiUrl(repoUrl, repoMetadata);
  // Perform github lookups
  if (apiUrl && get_repo_license_errors < MAX_GET_REPO_LICENSE_ERRORS) {
    const licenseUrl = `${apiUrl}/license`;
    const headers = {};
    if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    try {
      const res = await cdxgenAgent.get(licenseUrl, {
        responseType: "json",
        headers: headers,
      });
      if (res?.body) {
        const license = res.body.license;
        let licenseId = license.spdx_id;
        const licObj = {
          url: res.body.html_url,
        };
        if (license.spdx_id === "NOASSERTION") {
          if (res.body.content) {
            const content = Buffer.from(res.body.content, "base64").toString(
              "ascii",
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
        if (licObj["id"] || licObj["name"]) {
          return licObj;
        }
      }
    } catch (err) {
      if (err?.message) {
        if (
          err.message.includes("rate limit exceeded") &&
          !process.env.GITHUB_TOKEN
        ) {
          console.log(
            "Rate limit exceeded for REST API of github.com. " +
              "Please ensure GITHUB_TOKEN is set as environment variable. " +
              "See: https://docs.github.com/en/rest/overview/rate-limits-for-the-rest-api",
          );
          get_repo_license_errors++;
        } else if (!err.message.includes("404")) {
          console.log(err);
          get_repo_license_errors++;
        }
      }
    }
  }
  return undefined;
}

/**
 * Method to get go pkg license from go.dev site.
 *
 * @param {Object} repoMetadata Repo metadata
 */
export async function getGoPkgLicense(repoMetadata) {
  const group = repoMetadata.group;
  const name = repoMetadata.name;
  let pkgUrlPrefix = "https://pkg.go.dev/";
  if (group && group !== "." && group !== name) {
    pkgUrlPrefix = `${pkgUrlPrefix + group}/`;
  }
  pkgUrlPrefix = `${pkgUrlPrefix + name}?tab=licenses`;
  // Check the metadata cache first
  if (metadata_cache[pkgUrlPrefix]) {
    return metadata_cache[pkgUrlPrefix];
  }
  try {
    const res = await cdxgenAgent.get(pkgUrlPrefix);
    if (res?.body) {
      const $ = load(res.body);
      let licenses = $("#LICENSE > h2").text().trim();
      if (licenses === "") {
        licenses = $("section.License > h2").text().trim();
      }
      const licenseIds = licenses.split(", ");
      const licList = [];
      for (const id of licenseIds) {
        if (id.trim().length) {
          const alicense = {};
          if (id.includes(" ")) {
            alicense.name = id
              .trim()
              .replace(/ {2}/g, "")
              .replace("\n", " ")
              .replace("\n", " OR ");
          } else {
            alicense.id = id.trim();
          }
          alicense["url"] = pkgUrlPrefix;
          licList.push(alicense);
        }
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
}

export async function getGoPkgComponent(group, name, version, hash) {
  let pkg = {};
  let license = undefined;
  if (FETCH_LICENSE) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch go package license information for ${group}:${name}`,
      );
    }
    license = await getGoPkgLicense({
      group: group,
      name: name,
    });
  }
  // By replacing %2F with /, we make the purl compatible with the spec.
  const purlString = new PackageURL("golang", group, name, version)
    .toString()
    .replace(/%2F/g, "/");
  pkg = {
    group: group,
    name: name,
    version: version,
    _integrity: hash,
    license: license,
    purl: purlString,
    "bom-ref": decodeURIComponent(purlString),
  };
  return pkg;
}

export async function parseGoModData(goModData, gosumMap) {
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
    }
    if (l.includes("replace (")) {
      isModReplacement = true;
      continue;
    }
    if (l.includes("replace ")) {
      // If this is an inline replacement, drop the word replace
      // (eg; "replace google.golang.org/grpc => google.golang.org/grpc v1.21.0" becomes " google.golang.org/grpc => google.golang.org/grpc v1.21.0")
      l = l.replace("replace", "");
      isModReplacement = true;
    }

    const tmpA = l.trim().split(" ");

    if (!isModReplacement) {
      // Add group, name and version component properties for required modules
      const version = tmpA[1];
      const gosumHash = gosumMap[`${tmpA[0]}@${version}`];
      // The hash for this version was not found in go.sum, so skip as it is most likely being replaced.
      if (gosumHash === undefined) {
        continue;
      }
      const component = await getGoPkgComponent(
        "",
        tmpA[0],
        version,
        gosumHash,
      );
      pkgComponentsList.push(component);
    } else {
      // Add group, name and version component properties for replacement modules
      const version = tmpA[3];

      const gosumHash = gosumMap[`${tmpA[2]}@${version}`];
      // The hash for this version was not found in go.sum, so skip.
      if (gosumHash === undefined) {
        continue;
      }
      const component = await getGoPkgComponent(
        "",
        tmpA[2],
        version,
        gosumHash,
      );
      pkgComponentsList.push(component);
    }
  }
  // Clear the cache
  metadata_cache = {};
  return pkgComponentsList;
}

/**
 * Parse go list output
 *
 * @param {string} rawOutput Output from go list invocation
 * @returns Object with parent component and List of packages
 */
export async function parseGoListDep(rawOutput, gosumMap) {
  let parentComponent = {};
  const deps = [];
  if (typeof rawOutput === "string") {
    const keys_cache = {};
    const pkgs = rawOutput.split("\n");
    for (const l of pkgs) {
      const verArr = l.trim().replace(/[\"']/g, "").split(" ");

      if (verArr && verArr.length >= 5) {
        const key = `${verArr[0]}-${verArr[1]}`;
        // Filter duplicates
        if (!keys_cache[key]) {
          keys_cache[key] = key;
          const version = verArr[1];
          const gosumHash = gosumMap[`${verArr[0]}@${version}`];
          const component = await getGoPkgComponent(
            "",
            verArr[0],
            version,
            gosumHash,
          );
          if (verArr[2] === "false") {
            component.scope = "required";
          } else if (verArr[2] === "true") {
            component.scope = "optional";
          }
          component.properties = [
            {
              name: "SrcGoMod",
              value: verArr[3] || "",
            },
            {
              name: "ModuleGoVersion",
              value: verArr[4] || "",
            },
          ];
          if (verArr.length > 5 && verArr[5] === "true") {
            parentComponent = component;
          } else {
            deps.push(component);
          }
        }
      }
    }
  }
  return {
    parentComponent,
    pkgList: deps,
  };
}

function _addGoComponentEvidence(component, goModFile) {
  component.evidence = {
    identity: {
      field: "purl",
      confidence: 1,
      methods: [
        {
          technique: "manifest-analysis",
          confidence: 1,
          value: goModFile,
        },
      ],
    },
  };
  if (!component.properties) {
    component.properties = [];
  }
  component.properties.push({
    name: "SrcFile",
    value: goModFile,
  });
  return component;
}

/**
 * Parse go mod graph
 *
 * @param {string} rawOutput Output from go mod graph invocation
 * @param {string} goModFile go.mod file
 * @param {Object} goSumMap Hashes from gosum for lookups
 * @param {Array} epkgList Existing package list
 *
 * @returns Object containing List of packages and dependencies
 */
export async function parseGoModGraph(
  rawOutput,
  goModFile,
  gosumMap,
  epkgList = [],
  parentComponent = {},
) {
  const pkgList = [];
  const dependenciesList = [];
  const addedPkgs = {};
  const depsMap = {};
  const existingPkgMap = {};
  for (const epkg of epkgList) {
    existingPkgMap[epkg["bom-ref"]] = true;
  }
  if (parentComponent && Object.keys(parentComponent).length) {
    existingPkgMap[parentComponent["bom-ref"]] = true;
  }
  if (typeof rawOutput === "string") {
    const lines = rawOutput.split("\n");
    // Each line is of the form ref dependsOn
    // github.com/spf13/afero@v1.2.2 golang.org/x/text@v0.3.0
    for (const l of lines) {
      // To keep the parsing logic simple we prefix pkg:golang/
      // and let packageurl work out the rest
      const tmpA = l.replace("\r", "").split(" ");
      if (tmpA && tmpA.length === 2) {
        try {
          const sourcePurl = PackageURL.fromString(`pkg:golang/${tmpA[0]}`);
          const dependsPurl = PackageURL.fromString(`pkg:golang/${tmpA[1]}`);
          const sourceRefString = decodeURIComponent(sourcePurl.toString());
          const dependsRefString = decodeURIComponent(dependsPurl.toString());
          // Since go mod graph over-reports direct dependencies we use the existing list
          // from go deps to filter the result
          if (
            existingPkgMap &&
            Object.keys(existingPkgMap).length &&
            (!existingPkgMap[sourceRefString] ||
              !existingPkgMap[dependsRefString])
          ) {
            continue;
          }
          // Add the source and depends to the pkgList
          if (!addedPkgs[tmpA[0]]) {
            const component = await getGoPkgComponent(
              "",
              `${sourcePurl.namespace ? `${sourcePurl.namespace}/` : ""}${
                sourcePurl.name
              }`,
              sourcePurl.version,
              gosumMap[tmpA[0]],
            );
            pkgList.push(_addGoComponentEvidence(component, goModFile));
            addedPkgs[tmpA[0]] = true;
          }
          if (!addedPkgs[tmpA[1]]) {
            const component = await getGoPkgComponent(
              "",
              `${dependsPurl.namespace ? `${dependsPurl.namespace}/` : ""}${
                dependsPurl.name
              }`,
              dependsPurl.version,
              gosumMap[tmpA[1]],
            );
            pkgList.push(component);
            addedPkgs[tmpA[1]] = true;
          }
          if (!depsMap[sourceRefString]) {
            depsMap[sourceRefString] = new Set();
          }
          if (!depsMap[dependsRefString]) {
            depsMap[dependsRefString] = new Set();
          }
          depsMap[sourceRefString].add(dependsRefString);
        } catch (_e) {
          // pass
        }
      }
    }
  }
  for (const adep of Object.keys(depsMap).sort()) {
    dependenciesList.push({
      ref: adep,
      dependsOn: Array.from(depsMap[adep]).sort(),
    });
  }
  return { pkgList, dependenciesList };
}

/**
 * Parse go mod why output
 * @param {string} rawOutput Output from go mod why
 * @returns package name or none
 */
export function parseGoModWhy(rawOutput) {
  if (typeof rawOutput === "string") {
    let pkg_name = undefined;
    const lines = rawOutput.split("\n");
    lines.forEach((l) => {
      if (l && !l.startsWith("#") && !l.startsWith("(")) {
        pkg_name = l.trim();
      }
    });
    return pkg_name;
  }
  return undefined;
}

/**
 * Parse go sum data
 * @param {string} gosumData Content of go.sum
 * @returns package list
 */
export async function parseGosumData(gosumData) {
  const pkgList = [];
  if (!gosumData) {
    return pkgList;
  }
  const pkgs = gosumData.split("\n");
  for (const l of pkgs) {
    const m = l.replace("\r", "");
    // look for lines containing go.mod
    if (m.indexOf("go.mod") > -1) {
      const tmpA = m.split(" ");
      const name = tmpA[0];
      const version = tmpA[1].replace("/go.mod", "");
      const hash = tmpA[tmpA.length - 1].replace("h1:", "sha256-");
      let license = undefined;
      if (FETCH_LICENSE) {
        if (DEBUG_MODE) {
          console.log(
            `About to fetch go package license information for ${name}`,
          );
        }
        license = await getGoPkgLicense({
          group: "",
          name: name,
        });
      }
      pkgList.push({
        group: "",
        name: name,
        version: version,
        _integrity: hash,
        license: license,
      });
    }
  }
  return pkgList;
}

export async function parseGopkgData(gopkgData) {
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
          pkg._integrity = `sha256-${toBase64(digestStr)}`;
          break;
        case "name":
          pkg.group = "";
          pkg.name = value;
          if (FETCH_LICENSE) {
            pkg.license = await getGoPkgLicense({
              group: pkg.group,
              name: pkg.name,
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
}

export async function parseGoVersionData(buildInfoData) {
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
    if (tmpA.length === 4) {
      hash = tmpA[tmpA.length - 1].replace("h1:", "sha256-");
    }
    const component = await getGoPkgComponent("", name, tmpA[2].trim(), hash);
    pkgList.push(component);
  }
  return pkgList;
}

export const RUBY_PLATFORM_PREFIXES = [
  "-x86_64",
  "-x86",
  "-x64",
  "-aarch",
  "-arm",
  "-ruby",
  "-universal",
  "-java",
  "-truffle",
];

/**
 * Simplify the ruby version by removing platform suffixes
 *
 * @param {string} version Version to simplify
 * @returns {string} Simplified version
 */
function simplifyRubyVersion(version) {
  for (const prefix of RUBY_PLATFORM_PREFIXES) {
    if (version.includes(prefix)) {
      version = version.split(prefix)[0];
    }
  }
  return version;
}

/**
 * Method to query rubygems api for gems details
 *
 * @param {Array} pkgList List of packages with metadata
 */
export async function getRubyGemsMetadata(pkgList) {
  const RUBYGEMS_V2_URL =
    process.env.RUBYGEMS_V2_URL || "https://rubygems.org/api/v2/rubygems/";
  const RUBYGEMS_V1_URL =
    process.env.RUBYGEMS_V1_URL || "https://rubygems.org/api/v1/gems/";
  const rdepList = [];
  const apiOptions = {
    responseType: "json",
  };
  if (process.env.GEM_HOST_API_KEY) {
    apiOptions.headers = {
      Authorization: process.env.GEM_HOST_API_KEY,
    };
  }
  for (const p of pkgList) {
    try {
      if (DEBUG_MODE) {
        console.log(`Querying rubygems.org for ${p.name}`);
      }
      const fullUrl = p.version
        ? `${RUBYGEMS_V2_URL}${p.name}/versions/${simplifyRubyVersion(
            p.version,
          )}.json`
        : `${RUBYGEMS_V1_URL}${p.name}.json`;
      const res = await cdxgenAgent.get(fullUrl, apiOptions);
      let body = res.body;
      if (body?.length) {
        body = body[0];
      }
      p.description = body.description || body.summary || "";
      if (body.licenses) {
        p.license = body.licenses;
      }
      if (body.metadata) {
        if (body.metadata.source_code_uri) {
          p.repository = { url: body.metadata.source_code_uri };
          if (
            body.homepage_uri &&
            body.homepage_uri !== body.metadata.source_code_uri
          ) {
            p.homepage = { url: body.homepage_uri };
          }
        }
        if (body.metadata.bug_tracker_uri) {
          p.bugs = { url: body.metadata.bug_tracker_uri };
        }
      }
      if (body.sha) {
        p._integrity = `sha256-${body.sha}`;
      }
      if (body.authors) {
        p.author = body.authors;
      }
      const platformPresent =
        p.properties.filter((p) => p.name === "cdx:gem:platform").length > 0;
      // Track the platform such as java
      if (!platformPresent && body.platform && body.platform !== "ruby") {
        p.properties.push({
          name: "cdx:gem:platform",
          value: body.platform,
        });
      }
      if (body.ruby_version) {
        p.properties.push({
          name: "cdx:gem:rubyVersionSpecifiers",
          value: body.ruby_version,
        });
      }
      if (body.gem_uri) {
        p.properties.push({
          name: "cdx:gem:gemUri",
          value: body.gem_uri,
        });
      }
      if (body.yanked) {
        p.properties.push({
          name: "cdx:gem:yanked",
          value: `${body.yanked}`,
        });
      }
      if (body.prerelease) {
        p.properties.push({
          name: "cdx:gem:prerelease",
          value: `${body.prerelease}`,
        });
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
}

/**
 * Method to parse Gemspec
 *
 * @param {string} gemspecData Gemspec data
 */
export async function parseGemspecData(gemspecData) {
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
  if (FETCH_LICENSE) {
    return await getRubyGemsMetadata(pkgList);
  }
  return pkgList;
}

/**
 * Method to parse Gemfile.lock
 *
 * @param {object} gemLockData Gemfile.lock data
 * @param {string} lockFile Lock file
 */
export async function parseGemfileLockData(gemLockData, lockFile) {
  let pkgList = [];
  const pkgnames = {};
  const dependenciesList = [];
  const dependenciesMap = {};
  const pkgVersionMap = {};
  const pkgVersionPlatformMap = {};
  const rootList = [];
  if (!gemLockData) {
    return pkgList;
  }
  let specsFound = false;
  // We need two passes to identify components and resolve dependencies
  // In the first pass, we capture package name and version
  gemLockData.split("\n").forEach((l) => {
    l = l.trim();
    l = l.replace("\r", "");
    if (specsFound) {
      const tmpA = l.split(" ");
      if (tmpA && tmpA.length === 2) {
        const name = tmpA[0];
        if (name === "remote:") {
          return;
        }
        let version = tmpA[1];
        // We only allow bracket characters ()
        if (version.search(/[,><~ ]/) < 0) {
          version = version.replace(/[=()]/g, "");
          // Sometimes, the version number could include the platform
          // Examples:
          //  bcrypt_pbkdf (1.1.0)
          //  bcrypt_pbkdf (1.1.0-x64-mingw32)
          //  bcrypt_pbkdf (1.1.0-x86-mingw32)
          // In such cases, we need to track all of them to improve precision
          let platformPrefix = false;
          for (const prefix of RUBY_PLATFORM_PREFIXES) {
            if (version.includes(prefix)) {
              platformPrefix = true;
              const platform = version.split(prefix).pop();
              pkgVersionMap[`${name}${prefix}${platform}`] = version;
              if (!pkgVersionPlatformMap[name]) {
                pkgVersionPlatformMap[name] = new Set();
              }
              pkgVersionPlatformMap[name].add(version);
              break;
            }
          }
          if (!platformPrefix) {
            pkgVersionMap[name] = version;
          }
        }
      }
    }
    if (l === "specs:") {
      specsFound = true;
    }
    if (l === l.toUpperCase()) {
      specsFound = false;
    }
  });
  specsFound = false;
  let lastParent = undefined;
  let lastRemote = undefined;
  let lastRevision = undefined;
  let lastBranch = undefined;
  let lastTag = undefined;
  let lastParentPlatform = undefined;
  // In the second pass, we use the space in the prefix to figure out the dependency tree
  gemLockData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (l.trim().startsWith("remote:")) {
      lastRemote = l.trim().split(" ")[1];
      if (lastRemote.length < 3) {
        lastRemote = undefined;
      }
    }
    if (l.trim().startsWith("revision:")) {
      lastRevision = l.trim().split(" ")[1];
    }
    if (l.trim().startsWith("branch:")) {
      lastBranch = l.trim().split(" ")[1];
    }
    if (l.trim().startsWith("tag:")) {
      lastTag = l.trim().split(" ")[1];
    }
    if (l.trim() === l.trim().toUpperCase()) {
      specsFound = false;
      lastRemote = undefined;
      lastRevision = undefined;
      lastBranch = undefined;
      lastTag = undefined;
      lastParentPlatform = undefined;
    }
    if (l.trim() === "specs:") {
      specsFound = true;
      return;
    }
    if (specsFound) {
      const tmpA = l.split(" (");
      const nameWithPrefix = tmpA[0];
      const name = tmpA[0].trim();
      const level = nameWithPrefix.replace(name, "").split("  ").length % 2;
      if (
        !name.length ||
        ["remote:", "bundler", name.toUpperCase()].includes(name)
      ) {
        return;
      }
      let mayBeVersion = l
        .trim()
        .replace(name, "")
        .replace(" (", "")
        .replace(")", "");
      if (mayBeVersion.search(/[,><~ ]/) < 0) {
        // Reset the platform
        if (level === 1) {
          lastParentPlatform = undefined;
        }
        // Extract the platform
        for (const prefix of RUBY_PLATFORM_PREFIXES) {
          if (mayBeVersion.includes(prefix)) {
            const platform = mayBeVersion.split(prefix).pop();
            lastParentPlatform = `${prefix.replace("-", "")}${platform}`;
            break;
          }
        }
      } else {
        mayBeVersion = undefined;
      }
      // Give preference to the version in the line
      let version = mayBeVersion;
      if (!version) {
        // Identifying the resolved version for a given dependency requires multiple lookups
        version = pkgVersionMap[name];
      }
      // Is there a platform specific alias?
      if (!version && lastParentPlatform) {
        version = pkgVersionMap[`${name}-${lastParentPlatform}`];
      }

      // Is there a match based on the last parent platform
      if (!version && lastParentPlatform && pkgVersionPlatformMap[name]) {
        for (const aver of Array.from(pkgVersionPlatformMap[name])) {
          if (aver.includes(lastParentPlatform.replace("-gnu", ""))) {
            version = aver;
            break;
          }
        }
      }
      const purlString = new PackageURL(
        "gem",
        "",
        name,
        version,
        null,
        null,
      ).toString();
      const bomRef = decodeURIComponent(purlString);
      if (level === 1) {
        lastParent = bomRef;
        rootList.push(bomRef);
      }
      const properties = [
        {
          name: "SrcFile",
          value: lockFile,
        },
      ];
      if (lastRemote) {
        properties.push({
          name: "cdx:gem:remote",
          value: lastRemote,
        });
      }
      if (lastRevision) {
        properties.push({
          name: "cdx:gem:remoteRevision",
          value: lastRevision,
        });
      }
      if (lastBranch) {
        properties.push({
          name: "cdx:gem:remoteBranch",
          value: lastBranch,
        });
      }
      if (lastTag) {
        properties.push({
          name: "cdx:gem:remoteTag",
          value: lastTag,
        });
      }
      if (lastParentPlatform) {
        properties.push({
          name: "cdx:gem:platform",
          value: lastParentPlatform,
        });
      }
      const apkg = {
        name,
        version,
        purl: purlString,
        "bom-ref": bomRef,
        properties,
        evidence: {
          identity: {
            field: "purl",
            confidence: 0.8,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 0.8,
                value: lockFile,
              },
            ],
          },
        },
      };
      if (lastParent && lastParent !== bomRef) {
        if (!dependenciesMap[lastParent]) {
          dependenciesMap[lastParent] = new Set();
        }
        dependenciesMap[lastParent].add(bomRef);
      }
      if (!dependenciesMap[bomRef]) {
        dependenciesMap[bomRef] = new Set();
      }
      // Allow duplicate packages if the version number includes platform
      if (!pkgnames[purlString]) {
        pkgList.push(apkg);
        pkgnames[purlString] = true;
      }
    }
  });
  for (const k of Object.keys(dependenciesMap)) {
    dependenciesList.push({
      ref: k,
      dependsOn: Array.from(dependenciesMap[k]),
    });
  }
  if (FETCH_LICENSE) {
    pkgList = await getRubyGemsMetadata(pkgList);
    return { pkgList, dependenciesList };
  }
  return { pkgList, dependenciesList, rootList };
}

/**
 * Method to retrieve metadata for rust packages by querying crates
 *
 * @param {Array} pkgList Package list
 */
export async function getCratesMetadata(pkgList) {
  const CRATES_URL = "https://crates.io/api/v1/crates/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      if (DEBUG_MODE) {
        console.log(`Querying crates.io for ${p.name}`);
      }
      const res = await cdxgenAgent.get(CRATES_URL + p.name, {
        responseType: "json",
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
}

/**
 * Method to retrieve metadata for dart packages by querying pub.dev
 *
 * @param {Array} pkgList Package list
 */
export async function getDartMetadata(pkgList) {
  const RESPONSE_TYPE = "json";
  const HEADER_ACCEPT = "application/vnd.pub.v2+json";
  const PUB_DEV_URL = process.env.PUB_DEV_URL || "https://pub.dev";
  const PUB_PACKAGES_URL = `${PUB_DEV_URL}/api/packages/`;
  const PUB_LICENSE_REGEX = /^license:/i;
  const cdepList = [];

  for (const p of pkgList) {
    try {
      if (DEBUG_MODE) {
        console.log(`Querying ${PUB_DEV_URL} for ${p.name}`);
      }
      const res = await cdxgenAgent.get(PUB_PACKAGES_URL + p.name, {
        responseType: RESPONSE_TYPE,
        headers: {
          Accept: HEADER_ACCEPT,
        },
      });
      if (res?.body) {
        const version = res.body.versions.find((v) => p.version === v.version);
        if (version) {
          const pubspec = version.pubspec;
          p.description = pubspec.description;
          if (pubspec.repository) {
            p.repository = { url: pubspec.repository };
          }
          if (pubspec.homepage) {
            p.homepage = { url: pubspec.homepage };
          }
          const res2 = await cdxgenAgent.get(
            `${PUB_PACKAGES_URL + p.name}/score`,
            {
              responseType: RESPONSE_TYPE,
              headers: {
                Accept: HEADER_ACCEPT,
              },
            },
          );
          if (res2?.body) {
            const tags = res2.body.tags;
            const license = tags.find((tag) => PUB_LICENSE_REGEX.test(tag));
            if (license) {
              p.license = spdxLicenses.find(
                (spdxLicense) =>
                  spdxLicense.toLowerCase() ===
                  license.replace(PUB_LICENSE_REGEX, "").toLowerCase(),
              );
            }
          }
          cdepList.push(p);
        }
      }
    } catch (err) {
      cdepList.push(p);
    }
  }
  return cdepList;
}

/**
 * Method to parse cargo.toml data
 *
 * The component described by a [package] section will be put at the front of
 * the list, regardless of if [package] appears before or after
 * [dependencies]. Found dependencies will be placed at the back of the
 * list.
 *
 * The Cargo documentation specifies that the [package] section should appear
 * first as a convention, but it is not enforced.
 * https://doc.rust-lang.org/stable/style-guide/cargo.html#formatting-conventions
 *
 * @param {string} cargoTomlFile cargo.toml file
 * @param {boolean} simple Return a simpler representation of the component by skipping extended attributes and license fetch.
 *
 * @returns {array} Package list
 */
export async function parseCargoTomlData(cargoTomlFile, simple = false) {
  const pkgList = [];

  // Helper function to add a component to the package list. It will uphold
  // the guarantee that the component described by the
  // [package]-section remains at the front of the list, and add evidence if
  // requested.
  const addPackageToList = (packageList, pkg, { packageMode, simple }) => {
    if (!pkg) return;

    if (!simple) {
      pkg.properties = [
        {
          name: "SrcFile",
          value: cargoTomlFile,
        },
      ];
      pkg.evidence = {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.5,
              value: cargoTomlFile,
            },
          ],
        },
      };
    }
    const ppurl = new PackageURL(
      "cargo",
      pkg.group,
      pkg.name,
      pkg.version,
      null,
      null,
    ).toString();
    pkg.purl = ppurl;
    pkg["bom-ref"] = decodeURIComponent(ppurl);
    pkg.type = "library";

    // Ensure the component described by [package] is in front of the list to
    // give the caller some information about which component the BOM is the
    // parent component and which are dependencies.
    if (packageMode) {
      packageList.unshift(pkg);
    } else {
      packageList.push(pkg);
    }
  };

  if (!cargoTomlFile || !existsSync(cargoTomlFile)) {
    return pkgList;
  }
  const cargoData = readFileSync(cargoTomlFile, { encoding: "utf-8" });
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
      addPackageToList(pkgList, pkg, { packageMode, simple });
      pkg = {};
    }
    if (l.startsWith("[dependencies]")) {
      dependencyMode = true;
      packageMode = false;
    }

    // Properly parsing project with workspeces is currently unsupported. Some
    // projects may have a top-level Cargo.toml file containing only
    // workspace definitions and no package name. That will make the parent
    // component unreliable.
    if (l.startsWith("[workspace]") && DEBUG_MODE) {
      console.log(
        `Found [workspace] section in ${cargoTomlFile}. Workspaces are currently not fully supported. Verify that the parent component is correct.`,
      );
    }

    if (
      l.startsWith("[") &&
      !l.startsWith("[dependencies]") &&
      (!packageMode || l.startsWith("[["))
    ) {
      dependencyMode = false;
      packageMode = false;
    }
    if (packageMode && l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/"/g, "");
      switch (key) {
        case "checksum":
          pkg._integrity = `sha384-${value}`;
          break;
        case "name":
          value = value.split(" ")[0];
          pkg.group = dirname(value);
          if (pkg.group === ".") {
            pkg.group = "";
          }
          pkg.name = basename(value);
          break;
        case "version":
          pkg.version = value.split(" ")[0];
          break;
        case "authors":
          pkg.author = value.replace(/[[\]]/g, "");
          break;
        case "homepage":
          pkg.homepage = { url: value };
          break;
        case "repository":
          pkg.repository = { url: value };
          break;
        case "license":
          pkg.license = value;
          break;
      }
    } else if (dependencyMode && l.indexOf("=") > -1) {
      if (pkg) {
        addPackageToList(pkgList, pkg, { packageMode, simple });
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
          version = `git+${tmpB[1].split(" }")[0]}`;
        }
      } else if (l.indexOf("path =") === -1 && tmpA.length > 1) {
        version = tmpA[1];
      }
      if (name && version) {
        name = name.replace(/[\"']/g, "");
        version = version.replace(/[\"']/g, "");
        const apkg = { name, version };
        addPackageToList(pkgList, apkg, { packageMode, simple });
      }
    }
  });
  if (pkg) {
    addPackageToList(pkgList, pkg, { packageMode, simple });
  }
  if (!simple && FETCH_LICENSE) {
    return await getCratesMetadata(pkgList);
  }
  return pkgList;
}

/**
 * Parse a Cargo.lock file to find components within the Rust project.
 *
 * @param {string} cargoLockFile A path to a Cargo.lock file. The Cargo.lock-file path may be used as information for extended attributes, such as manifest based evidence.
 * @param {boolean} simple Return a simpler representation of the component by skipping extended attributes and license fetch.
 *
 * @returns {array} A list of the project's components as described by the Cargo.lock-file.
 */
export async function parseCargoData(cargoLockFile, simple = false) {
  const addPackageToList = (packageList, newPackage, { simple }) => {
    if (!newPackage) {
      return;
    }

    const purl = new PackageURL(
      "cargo",
      "",
      newPackage.name,
      newPackage.version,
      null,
      null,
    ).toString();
    const component = {
      type: "library",
      group: newPackage.group,
      "bom-ref": purl,
      purl: purl,
      name: newPackage.name,
      version: newPackage.version,
    };

    if (newPackage._integrity) {
      component.hashes = [
        {
          alg: "SHA-384",
          content: pkg._integrity,
        },
      ];
    }

    if (!simple) {
      // Assign evidence according to CycloneDX's confidence recommendations in section Evidence of:
      // * https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-SBOM-en.pdf
      // The evidence is deemed to be reliable because Cargo itself generates
      // the Cargo.lock-file based on the listed dependencies in the
      // Cargo.toml-file and registry information. So, either we get a direct
      // dependency (very likely), or a transitive dependency based on
      // evidence from the package information in the Cargo registry.
      component.evidence = {
        identity: {
          field: "purl",
          confidence: 0.6,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.6,
              value: cargoLockFile,
            },
          ],
        },
      };

      // Evidence information for CyclondDX specification version < 1.5.
      component.properties = [
        {
          name: "SrcFile",
          value: cargoLockFile,
        },
      ];
    }
    packageList.push(component);
  };

  const pkgList = [];
  if (!cargoLockFile) {
    return pkgList;
  }

  const cargoData = readFileSync(cargoLockFile, { encoding: "utf-8" });
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
        addPackageToList(pkgList, pkg, { simple });
      }
      pkg = {};
    }
    if (l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/"/g, "");
      switch (key) {
        case "checksum":
          pkg._integrity = value;
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
  // The last package will not be followed by a [[package]]-table, so the
  // last package has no termination condition, other than end-of-file.
  if (pkg) {
    addPackageToList(pkgList, pkg, { simple });
  }
  if (FETCH_LICENSE && !simple) {
    return await getCratesMetadata(pkgList);
  }
  return pkgList;
}

export function parseCargoDependencyData(cargoLockData) {
  // The patterns to parse the Cargo.lock file makes no attempt to parse
  // toml-files properly. They match the structure of Cargo.lock specifically.

  // Cargo.lock files generates packages separated by blank lines. There does
  // not seem to be a specification for the lock files, but cargo
  // generate-lockfile seems to consistently create them that way. Important
  // note to perform an eager match, so as to not match the first header with
  // the entire document.
  // If the Cargo.lock file do not contain a footer with metadata, the last
  // package section only has one trailing newline trailed by the end-of-file
  // instead.
  const packagePattern = /\[\[package\]\][\s\S]+?(\r?\n)((\r?\n)|$)/g;

  // Match each key-value pair. This assumes the value to only be a string or
  // an array (either single- or multi-line).
  const keyValuePattern = /\w+\s?=\s?(".+"|\[[\s\S]+\])\r?\n/g;

  const purlFromPackageInfo = (pkg) =>
    decodeURIComponent(
      new PackageURL("cargo", "", pkg.name, pkg.version, null, null).toString(),
    );

  // The dependency list may appear as a single-line list:
  //  ["ansi_term", "openssl-sys"]
  // or as a multi-line list with a trailing comma for the last item:
  // [
  //   "ansi_term",
  //   "openssl-sys",
  // ]
  // Names in the dependency-list may appear is simple names:
  //  "ansi_term", "openssl-sys"
  // or with a version attached, delimited by a space:
  //  "winapi 0.3.8", "semver-parser 0.9.0"
  // or possibly with a registry link:
  //  "base64 0.5.1 (registry+https://github.com/rust-lang/crates.io-index)"
  const parseDependencyValue = (dependencyValue) => {
    return (
      dependencyValue
        // Remove starting and trailing brackets, with surrounding whitespace
        .replace(/^\s*\[\s+/g, "")
        .replace(/\s*\]\s+$/g, "")
        // Remove the quotes from each dependency name, making the dependency
        // list a comma-separated list of names.
        .replace(/"/g, "")
        // Trim any whitespace surrounding the commas
        .replace(/\s*,\s*/g, ",")
        // In order to not end up with an empty item at the end in case of a
        // trailing comma, remove one if it exists.
        .replace(/,$/, "")
        // Finally, create a list from the comma separated values
        .split(",")
        // In order to not drop the version from the dependency name, we return
        // both the name and the version, if one exists. If it doesn't exist, we
        // can assume it is the version of the component in the component list.
        // The registry link is always dropped.
        .map((dependencyName) => {
          const [name, version] = dependencyName.split(" ");
          return {
            name,
            version,
          };
        })
    );
  };

  // To fulfill the specification, the list of dependencies has to be sweeped
  // twice. References (the PURL) to entries in the component list requires
  // both the package name and specific package version. And packages may
  // appear as a dependency before it is "defined" in the Cargo.lock file.
  // So, the first sweep creates an inventory of packages in the Cargo.lock
  // file. With a full inventory of the packages in the Cargo.lock file, a
  // second sweep can construct the objects for the depndencies-list.

  // First sweep: Construct inventory of Cargo.lock contents.
  const lockfileInventory = {};
  const allPackages = cargoLockData.matchAll(packagePattern);
  [...allPackages].forEach((packageObject) => {
    const packageTable = packageObject[0].matchAll(keyValuePattern);
    const packageInfo = {};
    [...packageTable].forEach((keyValue) => {
      const [key, value] = keyValue[0].split(" = ");
      switch (key) {
        // Only "dependencies" is expected to be a list. All other keys are
        // expected to be strings.
        case "dependencies":
          packageInfo[key] = parseDependencyValue(value);
          break;
        default:
          packageInfo[key] = value.replace(/\s*"\s*/g, "");
          break;
      }
    });
    lockfileInventory[packageInfo.name] = packageInfo;
  });

  // Second sweep, construct the dependencies-list.
  return Object.values(lockfileInventory).map((pkg) => {
    if (!pkg.dependencies) {
      return {
        ref: purlFromPackageInfo(pkg),
        dependsOn: [],
      };
    }
    return {
      ref: purlFromPackageInfo(pkg),
      dependsOn: pkg.dependencies
        .map((dependency) => {
          // If the package has a dependency with a specific version, it needs
          // to be respected.
          if (dependency.version) {
            return purlFromPackageInfo(dependency);
          }

          if (!lockfileInventory[dependency.name]) {
            // We have found a package listed as a dependency that does not
            // appear as a package in the Cargo.lock-file. This is an error!
            // If this happens, the Cargo.lock-file is incomplete and have
            // most likely been manually tampered with. Add a warning to
            // signal to the user that the file is invalid, skip the package,
            // and continue.
            if (DEBUG_MODE) {
              console.warn(
                `The package "${dependency.name}" appears as a dependency to "${pkg.name}" but is not itself listed in the Cargo.lock-file. The Cargo.lock-file is invalid! The produced SBOM will not list ${dependency.name} as a dependency.`,
              );
            }
            return undefined;
          }

          // If no version was specified for the dependency, default to the
          // version known from the package table.
          return purlFromPackageInfo(lockfileInventory[dependency.name]);
        })
        .filter((pkg) => pkg), // Filter undefined entries, which should only happen when packages listed as a dependency are not defined as packages.
    };
  });
}

export async function parseCargoAuditableData(cargoData) {
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
        version,
      });
    }
  });
  if (FETCH_LICENSE) {
    return await getCratesMetadata(pkgList);
  }
  return pkgList;
}

export async function parsePubLockData(pubLockData) {
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
        name: l.trim().replace(":", ""),
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
  if (FETCH_LICENSE) {
    return await getDartMetadata(pkgList);
  }
  return pkgList;
}

export function parsePubYamlData(pubYamlData) {
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
    homepage: { url: yamlObj.homepage },
  });
  return pkgList;
}

export function parseHelmYamlData(helmData) {
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
      version: yamlObj.version,
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
        version: hd.version, // This could have * so not precise
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
            description: hd.description || "",
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
            pkg._integrity = `sha256-${hd.digest}`;
          }

          pkgList.push(pkg);
        }
      }
    }
  }
  return pkgList;
}

export function recurseImageNameLookup(keyValueObj, pkgList, imgList) {
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
    if (
      !imageLike &&
      keyValueObj.name &&
      typeof keyValueObj.name === "string" &&
      keyValueObj.name.includes("/")
    ) {
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
}

export function parseContainerFile(fileContents) {
  const imgList = [];

  const buildStageNames = [];
  for (let line of fileContents.split("\n")) {
    line = line.trim();

    if (line.startsWith("#")) {
      continue; // skip commented out lines
    }

    if (line.startsWith("FROM")) {
      const fromStatement = line.split("FROM")[1].split("AS");

      const imageStatement = fromStatement[0].trim();
      const buildStageName = fromStatement[1]?.trim();

      if (buildStageNames.includes(imageStatement)) {
        if (DEBUG_MODE) {
          console.log(
            `Skipping image ${imageStatement} which uses previously seen build stage name.`,
          );
        }
        continue;
      }

      imgList.push({
        image: imageStatement,
      });

      if (buildStageName) {
        buildStageNames.push(buildStageName);
      }
    }
  }

  return imgList;
}

export function parseBitbucketPipelinesFile(fileContents) {
  const imgList = [];

  let privateImageBlockFound = false;

  for (let line of fileContents.split("\n")) {
    line = line.trim();
    if (line.startsWith("#")) {
      continue; // skip commented out lines
    }

    // Assume this is a private build image object
    if (line.startsWith("name:") && privateImageBlockFound) {
      const imageName = line.split("name:").pop().trim();

      imgList.push({
        image: imageName,
      });

      privateImageBlockFound = false;
    }

    // Docker image usage
    if (line.startsWith("image:")) {
      const imageName = line.split("image:").pop().trim();

      /**
       * Assume this is a private build image object
       * See: https://support.atlassian.com/bitbucket-cloud/docs/use-docker-images-as-build-environments/#Using-private-build-images
       */
      if (imageName === "") {
        privateImageBlockFound = true;
        continue;
      }
      /**
       * Assume this is a public build image
       * See: https://support.atlassian.com/bitbucket-cloud/docs/use-docker-images-as-build-environments/#Using-public-build-images
       */

      imgList.push({
        image: imageName,
      });
    }

    // Pipe usage
    if (line.startsWith("- pipe:")) {
      let pipeName = line.split("- pipe:").pop().trim();

      if (pipeName.startsWith("docker://")) {
        pipeName = pipeName.replace("docker://", "");
      }

      imgList.push({
        image: pipeName,
      });
    }
  }

  return imgList;
}

export function parseContainerSpecData(dcData) {
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
          service: serv,
        });
        const aservice = yamlObj.services[serv];
        // Track locally built images
        if (aservice.build) {
          if (Object.keys(aservice.build).length && aservice.build.dockerfile) {
            pkgList.push({
              ociSpec: aservice.build.dockerfile,
            });
          } else {
            if (aservice.build === "." || aservice.build === "./") {
              pkgList.push({
                ociSpec: "Dockerfile",
              });
            } else {
              pkgList.push({
                ociSpec: aservice.build,
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
            image: imgFullName,
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
}

export function identifyFlow(processingObj) {
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
}

function convertProcessing(processing_list) {
  const data_list = [];
  for (const p of processing_list) {
    data_list.push({
      classification: p.sourceId || p.sinkId,
      flow: identifyFlow(p),
    });
  }
  return data_list;
}

export function parsePrivadoFile(f) {
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
    endpoints: [],
  };
  if (jsonData.repoName) {
    aservice.name = jsonData.repoName;
    aservice.properties = [
      {
        name: "SrcFile",
        value: f,
      },
    ];
    // Capture git metadata info
    if (jsonData.gitMetadata) {
      aservice.version = jsonData.gitMetadata.commitId || "";
      aservice.properties.push({
        name: "privadoCoreVersion",
        value: jsonData.privadoCoreVersion || "",
      });
      aservice.properties.push({
        name: "privadoCLIVersion",
        value: jsonData.privadoCLIVersion || "",
      });
      aservice.properties.push({
        name: "localScanPath",
        value: jsonData.localScanPath || "",
      });
    }
    // Capture processing
    if (jsonData.processing?.length) {
      aservice.data = aservice.data.concat(
        convertProcessing(jsonData.processing),
      );
    }
    // Capture sink processing
    if (jsonData.sinkProcessing?.length) {
      aservice.data = aservice.data.concat(
        convertProcessing(jsonData.sinkProcessing),
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
          value: v.policyId,
        });
      }
    }
    // If there are third party libraries detected, then there are cross boundary calls happening
    if (jsonData.dataFlow?.third_parties?.length) {
      aservice["x-trust-boundary"] = true;
    }
    servlist.push(aservice);
  }
  return servlist;
}

export function parseOpenapiSpecData(oaData) {
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
    return servlist;
  }

  const name = oaData.info?.title
    ? oaData.info.title.replace(/ /g, "-")
    : "default-name";
  const version = oaData.info?.version ? oaData.info.version : "latest";
  const aservice = {
    "bom-ref": `urn:service:${name}:${version}`,
    name,
    description: oaData.description || "",
    version,
  };
  let serverName = [];
  if (oaData.servers?.length && oaData.servers[0].url) {
    serverName = oaData.servers[0].url;
    if (!serverName.startsWith("http") || !serverName.includes("//")) {
      serverName = `http://${serverName}`;
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
  if (oaData.components?.securitySchemes) {
    authenticated = true;
  }
  aservice.authenticated = authenticated;
  servlist.push(aservice);
  return servlist;
}

export function parseCabalData(cabalData) {
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
          version,
        });
      }
    }
  });
  return pkgList;
}

export function parseMixLockData(mixData) {
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
            version,
          });
        }
      }
    }
  });
  return pkgList;
}

export function parseGitHubWorkflowData(ghwData) {
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
            if (tmpB.length === 2) {
              name = tmpB[1];
              group = tmpB[0];
            }
            const key = `${group}-${name}-${version}`;
            if (!keys_cache[key] && name && version) {
              keys_cache[key] = key;
              pkgList.push({
                group,
                name,
                version,
              });
            }
          }
        }
      }
    }
  }
  return pkgList;
}

export function parseCloudBuildData(cbwData) {
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
          const key = `${group}-${name}-${version}`;
          if (!keys_cache[key] && name && version) {
            keys_cache[key] = key;
            pkgList.push({
              group,
              name,
              version,
            });
          }
        }
      }
    }
  }
  return pkgList;
}

export function parseConanLockData(conanLockData) {
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
        let version = tmpA[1] || "latest";
        if (tmpA[1].includes("@")) {
          version = version.split("@")[0];
        } else if (tmpA[1].includes("#")) {
          version = version.split("#")[0];
        }
        const purlString = new PackageURL(
          "conan",
          "",
          tmpA[0],
          version,
          null,
          null,
        ).toString();
        pkgList.push({
          name: tmpA[0],
          version,
          purl: purlString,
          "bom-ref": decodeURIComponent(purlString),
        });
      }
    }
  }
  return pkgList;
}

export function parseConanData(conanData) {
  const pkgList = [];
  if (!conanData) {
    return pkgList;
  }
  let scope = "required";
  conanData.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (l.includes("[build_requires]")) {
      scope = "optional";
    }
    if (l.includes("[requires]")) {
      scope = "required";
    }
    if (!l.includes("/")) {
      return;
    }
    if (l.includes("/")) {
      const tmpA = l.trim().split("#")[0].split("/");
      if (tmpA.length >= 2 && /^\d+/.test(tmpA[1])) {
        let version = tmpA[1] || "latest";
        let qualifiers = undefined;
        if (tmpA[1].includes("#")) {
          const tmpB = version.split("#");
          version = tmpB[0];
          qualifiers = { revision: tmpB[1] };
        }
        if (l.includes("#")) {
          const tmpB = l.split("#");
          qualifiers = { revision: tmpB[1] };
        }
        if (tmpA[1].includes("@")) {
          version = version.split("@")[0];
        }
        const purlString = new PackageURL(
          "conan",
          "",
          tmpA[0],
          version,
          qualifiers,
          null,
        ).toString();
        pkgList.push({
          name: tmpA[0],
          version,
          purl: purlString,
          "bom-ref": decodeURIComponent(purlString),
          scope,
        });
      }
    }
  });
  return pkgList;
}

export function parseLeiningenData(leinData) {
  const pkgList = [];
  if (!leinData) {
    return pkgList;
  }
  const tmpArr = leinData.split("(defproject");
  if (tmpArr.length > 1) {
    leinData = `(defproject${tmpArr[1]}`;
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
}

export function parseEdnData(rawEdnData) {
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
                            const cacheKey = `${group}-${name}-${version}`;
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
}

export async function parseNupkg(nupkgFile) {
  let nuspecData = await readZipEntry(nupkgFile, ".nuspec");
  if (!nuspecData) {
    return [];
  }
  if (nuspecData.charCodeAt(0) === 65533) {
    nuspecData = await readZipEntry(nupkgFile, ".nuspec", "ucs2");
  }
  return await parseNuspecData(nupkgFile, nuspecData);
}

export function parseNuspecData(nupkgFile, nuspecData) {
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
      commentKey: "value",
    }).package;
  } catch (e) {
    // If we are parsing with invalid encoding, unicode replacement character is used
    if (nuspecData.charCodeAt(0) === 65533) {
      console.log(`Unable to parse ${nupkgFile} in utf-8 mode`);
    } else {
      console.log(
        "Unable to parse this package. Tried utf-8 and ucs2 encoding.",
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
      value: nupkgFile,
    },
  ];
  pkg.evidence = {
    identity: {
      field: "purl",
      confidence: 1,
      methods: [
        {
          technique: "binary-analysis",
          confidence: 1,
          value: nupkgFile,
        },
      ],
    },
  };
  pkgList.push(pkg);
  return pkgList;
}

export function parseCsPkgData(pkgData) {
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
    commentKey: "value",
  }).packages;
  if (!packages || packages.length === 0) {
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
  return pkgList;
}

export function parseCsProjData(csProjData, projFile) {
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
    commentKey: "value",
  }).Project;
  if (!projects || projects.length === 0) {
    return pkgList;
  }
  const project = projects[0];
  if (project.ItemGroup?.length) {
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
        if (projFile) {
          pkg.properties = [
            {
              name: "SrcFile",
              value: projFile,
            },
          ];
          pkg.evidence = {
            identity: {
              field: "purl",
              confidence: 0.7,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 0.7,
                  value: projFile,
                },
              ],
            },
          };
        }
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
        if (projFile) {
          pkg.properties = [
            {
              name: "SrcFile",
              value: projFile,
            },
          ];
          pkg.evidence = {
            identity: {
              field: "purl",
              confidence: 0.7,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 0.7,
                  value: projFile,
                },
              ],
            },
          };
        }
        pkgList.push(pkg);
      }
    }
  }
  return pkgList;
}

export function parseCsProjAssetsData(csProjData, assetsJsonFile) {
  // extract name, operator, version from .NET package representation
  // like "NLog >= 4.5.0"
  function extractNameOperatorVersion(inputStr) {
    const extractNameOperatorVersion = /([\w.-]+)\s*([><=!]+)\s*([\d.]+)/;
    const match = inputStr.match(extractNameOperatorVersion);

    if (match) {
      return {
        name: match[1],
        operator: match[2],
        version: match[3],
      };
    }
    return null;
  }

  const pkgList = [];
  const dependenciesList = [];
  let rootPkg = {};
  // This tracks the resolved version
  const pkgNameVersionMap = {};
  const pkgAddedMap = {};

  if (!csProjData) {
    return { pkgList, dependenciesList };
  }
  csProjData = JSON.parse(csProjData);
  const purlString = new PackageURL(
    "nuget",
    "",
    csProjData.project.restore.projectName,
    csProjData.project.version || "latest",
    null,
    null,
  ).toString();
  rootPkg = {
    group: "",
    name: csProjData.project.restore.projectName,
    version: csProjData.project.version || "latest",
    type: "application",
    purl: purlString,
    "bom-ref": decodeURIComponent(purlString),
  };
  pkgList.push(rootPkg);
  const rootPkgDeps = new Set();

  // create root pkg deps
  if (csProjData.targets && csProjData.projectFileDependencyGroups) {
    for (const frameworkTarget in csProjData.projectFileDependencyGroups) {
      for (const dependencyName of csProjData.projectFileDependencyGroups[
        frameworkTarget
      ]) {
        const nameOperatorVersion = extractNameOperatorVersion(dependencyName);
        if (nameOperatorVersion == null) {
          continue;
        }
        const targetNameVersion = `${nameOperatorVersion.name}/${nameOperatorVersion.version}`;

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
            null,
          ).toString(),
        );
        rootPkgDeps.add(dpurl);
      }
    }

    dependenciesList.push({
      ref: purlString,
      dependsOn: Array.from(rootPkgDeps),
    });
  }

  if (csProjData.libraries && csProjData.targets) {
    const lib = csProjData.libraries;
    // Pass 1: Construct pkgList alone and track name and resolved version
    for (const framework in csProjData.targets) {
      for (const rootDep of Object.keys(csProjData.targets[framework])) {
        // if (rootDep.startsWith("runtime")){
        //   continue;
        // }
        const [name, version] = rootDep.split("/");
        const dpurl = new PackageURL(
          "nuget",
          "",
          name,
          version,
          null,
          null,
        ).toString();
        const pkg = {
          group: "",
          name: name,
          version: version,
          description: "",
          type: csProjData.targets[framework][rootDep].type,
          purl: dpurl,
          "bom-ref": decodeURIComponent(dpurl),
        };
        if (lib[rootDep]) {
          if (lib[rootDep].sha512) {
            pkg["_integrity"] = `sha512-${lib[rootDep].sha512}`;
          } else if (lib[rootDep].sha256) {
            pkg["_integrity"] = `sha256-${lib[rootDep].sha256}`;
          }
          if (lib[rootDep].files && Array.isArray(lib[rootDep].files)) {
            const dllFiles = new Set();
            lib[rootDep].files.forEach((f) => {
              if (
                f.endsWith(".dll") ||
                f.endsWith(".exe") ||
                f.endsWith(".so")
              ) {
                dllFiles.add(basename(f));
              }
            });
            pkg.properties = [
              {
                name: "SrcFile",
                value: assetsJsonFile,
              },
              {
                name: "PackageFiles",
                value: Array.from(dllFiles).join(", "),
              },
            ];
          }
        }
        if (assetsJsonFile) {
          pkg.evidence = {
            identity: {
              field: "purl",
              confidence: 1,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 1,
                  value: assetsJsonFile,
                },
              ],
            },
          };
        }
        pkgList.push(pkg);
        pkgNameVersionMap[name + framework] = version;
        pkgAddedMap[name] = true;
      }
    }
    // Pass 2: Fix the dependency tree
    for (const framework in csProjData.targets) {
      for (const rootDep of Object.keys(csProjData.targets[framework])) {
        const depList = new Set();
        const [name, version] = rootDep.split("/");
        const dpurl = decodeURIComponent(
          new PackageURL("nuget", "", name, version, null, null).toString(),
        );
        const dependencies =
          csProjData.targets[framework][rootDep].dependencies;
        if (dependencies) {
          for (const p of Object.keys(dependencies)) {
            // This condition is not required for assets json that are well-formed.
            if (!pkgNameVersionMap[p + framework]) {
              continue;
            }
            const dversion = pkgNameVersionMap[p + framework];
            const ipurl = new PackageURL(
              "nuget",
              "",
              p,
              dversion,
              null,
              null,
            ).toString();
            depList.add(ipurl);
            if (!pkgAddedMap[p]) {
              pkgList.push({
                group: "",
                name: p,
                version: dversion,
                description: "",
                purl: ipurl,
                "bom-ref": decodeURIComponent(ipurl),
              });
              pkgAddedMap[p] = true;
            }
          }
        }
        dependenciesList.push({
          ref: dpurl,
          dependsOn: Array.from(depList),
        });
      }
    }
  }
  return {
    pkgList,
    dependenciesList,
  };
}

export function parseCsPkgLockData(csLockData, pkgLockFile) {
  const pkgList = [];
  const dependenciesList = [];
  const rootList = [];
  let pkg = null;
  if (!csLockData) {
    return {
      pkgList,
      dependenciesList,
      rootList,
    };
  }
  const assetData = JSON.parse(csLockData);
  if (!assetData || !assetData.dependencies) {
    return {
      pkgList,
      dependenciesList,
      rootList,
    };
  }
  for (const aversion of Object.keys(assetData.dependencies)) {
    for (const alib of Object.keys(assetData.dependencies[aversion])) {
      const libData = assetData.dependencies[aversion][alib];
      const purl = new PackageURL(
        "nuget",
        "",
        alib,
        libData.resolved,
        null,
        null,
      ).toString();
      pkg = {
        group: "",
        name: alib,
        version: libData.resolved,
        purl,
        "bom-ref": decodeURIComponent(purl),
        _integrity: libData.contentHash
          ? `sha512-${libData.contentHash}`
          : undefined,
        properties: [
          {
            name: "SrcFile",
            value: pkgLockFile,
          },
        ],
        evidence: {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: pkgLockFile,
              },
            ],
          },
        },
      };
      pkgList.push(pkg);
      if (["Direct", "Project"].includes(libData.type)) {
        rootList.push(pkg);
      }
      const dependsOn = [];
      if (libData.dependencies) {
        for (let adep of Object.keys(libData.dependencies)) {
          let adepResolvedVersion = libData.dependencies[adep];
          const aversionNoRuntime = aversion.split("/")[0];
          // Try to get the resolved version of the dependency. See #930 and #937
          if (assetData.dependencies[aversion]?.[adep]?.resolved) {
            adepResolvedVersion =
              assetData.dependencies[aversion][adep].resolved;
          } else if (
            aversion.includes("/") &&
            assetData.dependencies[aversionNoRuntime] &&
            assetData.dependencies[aversionNoRuntime][adep] &&
            assetData.dependencies[aversionNoRuntime][adep].resolved
          ) {
            adepResolvedVersion =
              assetData.dependencies[aversionNoRuntime][adep].resolved;
          } else if (
            (assetData.dependencies[aversion]?.[adep.toLowerCase()] &&
              assetData.dependencies[aversion][adep.toLowerCase()].type ===
                "Project") ||
            (assetData.dependencies[aversionNoRuntime]?.[adep.toLowerCase()] &&
              assetData.dependencies[aversionNoRuntime][adep.toLowerCase()]
                .type === "Project")
          ) {
            adepResolvedVersion = undefined;
            adep = adep.toLowerCase();
          } else if (DEBUG_MODE) {
            console.warn(
              `Unable to find the resolved version for ${adep} ${aversion}. Using ${adepResolvedVersion} which may be incorrect.`,
            );
          }
          const adpurl = new PackageURL(
            "nuget",
            "",
            adep,
            adepResolvedVersion,
            null,
            null,
          ).toString();
          dependsOn.push(decodeURIComponent(adpurl));
        }
      }
      dependenciesList.push({
        ref: decodeURIComponent(purl),
        dependsOn,
      });
    }
  }
  return {
    pkgList,
    dependenciesList,
    rootList,
  };
}

export function parsePaketLockData(paketLockData, pkgLockFile) {
  const pkgList = [];
  const dependenciesList = [];
  const dependenciesMap = {};
  const pkgNameVersionMap = {};
  let group = null;
  let pkg = null;
  if (!paketLockData) {
    return { pkgList, dependenciesList };
  }

  const packages = paketLockData.split("\n");
  const groupRegex = /^GROUP\s(\S*)$/;
  const pkgRegex = /^\s{4}([\w.-]+) \(((?=.*?\.)[\w.-]+)\)/;
  const depRegex = /^\s{6}([\w.-]+) \([><= \w.-]+\)/;

  // Gather all packages
  packages.forEach((l) => {
    let match = l.match(groupRegex);
    if (match) {
      group = match[1];
      return;
    }

    match = l.match(pkgRegex);
    if (match) {
      const name = match[1];
      const version = match[2];
      const purl = new PackageURL(
        "nuget",
        "",
        name,
        version,
        null,
        null,
      ).toString();
      pkg = {
        group: "",
        name,
        version,
        purl,
        "bom-ref": decodeURIComponent(purl),
        properties: [
          {
            name: "SrcFile",
            value: pkgLockFile,
          },
        ],
        evidence: {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: pkgLockFile,
              },
            ],
          },
        },
      };
      pkgList.push(pkg);
      dependenciesMap[purl] = new Set();
      pkgNameVersionMap[name + group] = version;
    }
  });

  let purl = null;
  group = null;

  // Construct the dependency tree
  packages.forEach((l) => {
    let match = l.match(groupRegex);
    if (match) {
      group = match[1];
      return;
    }

    match = l.match(pkgRegex);
    if (match) {
      const pkgName = match[1];
      const pkgVersion = match[2];
      purl = decodeURIComponent(
        new PackageURL("nuget", "", pkgName, pkgVersion, null, null).toString(),
      );
      return;
    }

    match = l.match(depRegex);
    if (match) {
      const depName = match[1];
      const depVersion = pkgNameVersionMap[depName + group];
      const dpurl = decodeURIComponent(
        new PackageURL("nuget", "", depName, depVersion, null, null).toString(),
      );
      dependenciesMap[purl].add(dpurl);
    }
  });

  for (const ref in dependenciesMap) {
    dependenciesList.push({
      ref: ref,
      dependsOn: Array.from(dependenciesMap[ref]),
    });
  }

  return {
    pkgList,
    dependenciesList,
  };
}

/**
 * Parse composer lock file
 *
 * @param {string} pkgLockFile composer.lock file
 * @param {array} rootRequires require section from composer.json
 */
export function parseComposerLock(pkgLockFile, rootRequires) {
  const pkgList = [];
  const dependenciesList = [];
  const dependenciesMap = {};
  const pkgNamePurlMap = {};
  const rootList = [];
  const rootRequiresMap = {};
  if (rootRequires) {
    for (const rr of Object.keys(rootRequires)) {
      rootRequiresMap[rr] = true;
    }
  }
  if (existsSync(pkgLockFile)) {
    let lockData = {};
    try {
      lockData = JSON.parse(readFileSync(pkgLockFile, { encoding: "utf-8" }));
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
      // Pass 1: Collect all packages
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
          const purl = new PackageURL(
            "composer",
            group,
            name,
            pkg.version,
            null,
            null,
          ).toString();
          const apkg = {
            group: group,
            name: name,
            purl,
            "bom-ref": decodeURIComponent(purl),
            version: pkg.version,
            repository: pkg.source,
            license: pkg.license,
            description: pkg.description,
            scope: compScope,
            properties: [
              {
                name: "SrcFile",
                value: pkgLockFile,
              },
            ],
            evidence: {
              identity: {
                field: "purl",
                confidence: 1,
                methods: [
                  {
                    technique: "manifest-analysis",
                    confidence: 1,
                    value: pkgLockFile,
                  },
                ],
              },
            },
          };
          if (pkg.autoload && Object.keys(pkg.autoload).length) {
            const namespaces = [];
            for (const aaload of Object.keys(pkg.autoload)) {
              if (aaload.startsWith("psr")) {
                for (const ans of Object.keys(pkg.autoload[aaload])) {
                  namespaces.push(ans.trim());
                }
              }
            }
            if (namespaces.length) {
              apkg.properties.push({
                name: "Namespaces",
                value: namespaces.join(", "),
              });
            }
          }
          pkgList.push(apkg);
          dependenciesMap[purl] = new Set();
          pkgNamePurlMap[pkg.name] = purl;
          // Add this package to the root list if needed
          if (rootRequiresMap[pkg.name]) {
            rootList.push(apkg);
          }
        }
      }
      // Pass 2: Construct dependency tree
      for (const compScope in packages) {
        for (const i in packages[compScope]) {
          const pkg = packages[compScope][i];
          if (!pkg || !pkg.name || !pkg.version) {
            continue;
          }
          if (!pkg.require || !Object.keys(pkg.require).length) {
            continue;
          }
          const purl = pkgNamePurlMap[pkg.name];
          for (const adepName of Object.keys(pkg.require)) {
            if (pkgNamePurlMap[adepName]) {
              dependenciesMap[purl].add(pkgNamePurlMap[adepName]);
            }
          }
        }
      }
    }
  }
  for (const ref in dependenciesMap) {
    dependenciesList.push({
      ref: ref,
      dependsOn: Array.from(dependenciesMap[ref]),
    });
  }
  return {
    pkgList,
    dependenciesList,
    rootList,
  };
}

export function parseSbtTree(sbtTreeFile) {
  const pkgList = [];
  const dependenciesList = [];
  const keys_cache = {};
  const level_trees = {};
  const tmpA = readFileSync(sbtTreeFile, { encoding: "utf-8" }).split("\n");
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
      null,
    ).toString();
    // Filter duplicates
    if (!keys_cache[purlString]) {
      const adep = {
        group,
        name,
        version,
        purl: purlString,
        "bom-ref": decodeURIComponent(purlString),
        evidence: {
          identity: {
            field: "purl",
            confidence: 1,
            methods: [
              {
                technique: "manifest-analysis",
                confidence: 1,
                value: sbtTreeFile,
              },
            ],
          },
        },
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
    if (level === 0) {
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
      dependsOn: level_trees[lk],
    });
  }
  return { pkgList, dependenciesList };
}

/**
 * Parse sbt lock file
 *
 * @param {string} pkgLockFile build.sbt.lock file
 */
export function parseSbtLock(pkgLockFile) {
  const pkgList = [];
  if (existsSync(pkgLockFile)) {
    const lockData = JSON.parse(
      readFileSync(pkgLockFile, { encoding: "utf-8" }),
    );
    if (lockData?.dependencies) {
      for (const pkg of lockData.dependencies) {
        const artifacts = pkg.artifacts || undefined;
        let integrity = "";
        if (artifacts?.length) {
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
              value: pkgLockFile,
            },
          ],
          evidence: {
            identity: {
              field: "purl",
              confidence: 1,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 1,
                  value: pkgLockFile,
                },
              ],
            },
          },
        });
      }
    }
  }
  return pkgList;
}

function convertStdoutToList(result) {
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
}

/**
 * Method to execute dpkg --listfiles to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export function executeDpkgList(pkgName) {
  const result = spawnSync("dpkg", ["--listfiles", "--no-pager", pkgName], {
    encoding: "utf-8",
  });
  return convertStdoutToList(result);
}

/**
 * Method to execute dnf repoquery to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export function executeRpmList(pkgName) {
  let result = spawnSync("dnf", ["repoquery", "-l", pkgName], {
    encoding: "utf-8",
  });
  // Fallback to rpm
  if (result.status !== 0 || result.error) {
    result = spawnSync("rpm", ["-ql", pkgName], {
      encoding: "utf-8",
    });
  }
  return convertStdoutToList(result);
}

/**
 * Method to execute apk -L info to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export function executeApkList(pkgName) {
  const result = spawnSync("apk", ["-L", "info", pkgName], {
    encoding: "utf-8",
  });
  return convertStdoutToList(result);
}

/**
 * Method to execute alpm -Ql to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export function executeAlpmList(pkgName) {
  const result = spawnSync("pacman", ["-Ql", pkgName], {
    encoding: "utf-8",
  });
  return convertStdoutToList(result);
}

/**
 * Method to execute equery files to determine the files provided by a given package
 *
 * @param {string} pkgName deb package name
 * @returns
 */
export function executeEqueryList(pkgName) {
  const result = spawnSync("equery", ["files", pkgName], {
    encoding: "utf-8",
  });
  return convertStdoutToList(result);
}

/**
 * Convert OS query results
 *
 * @param {string} Query category
 * @param {Object} queryObj Query Object from the queries.json configuration
 * @param {Array} results Query Results
 * @param {Boolean} enhance Optionally enhance results by invoking additional package manager commands
 */
export function convertOSQueryResults(
  queryCategory,
  queryObj,
  results,
  enhance = false,
) {
  const pkgList = [];
  if (results?.length) {
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
      if (res.identifying_number?.length) {
        qualifiers = {
          tag_id: res.identifying_number.replace("{", "").replace("}", ""),
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
          subpath,
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
          type: queryObj.componentType,
        };
        for (const k of Object.keys(res).filter(
          (p) => !["name", "version", "description", "publisher"].includes(p),
        )) {
          if (res[k] && res[k] !== "null") {
            props.push({
              name: k,
              value: res[k],
            });
          }
        }
        apkg.properties = props;
        pkgList.push(apkg);
      }
    }
  }
  return pkgList;
}

function purlFromUrlString(type, repoUrl, version) {
  let namespace = "";
  let name;
  if (repoUrl?.startsWith("http")) {
    const url = new URL(repoUrl);
    const pathnameParts = url.pathname.split("/");
    const pathnameLastElement = pathnameParts.pop(); // pop() returns last element and removes it from pathnameParts
    name = pathnameLastElement.replace(".git", "");
    const urlpath = pathnameParts.join("/");
    namespace = url.hostname + urlpath;
  } else if (repoUrl?.startsWith("git@")) {
    const parts = repoUrl.split(":");
    const hostname = parts[0].split("@")[1];
    const pathnameParts = parts[1].split("/");
    const pathnameLastElement = pathnameParts.pop();
    name = pathnameLastElement.replace(".git", "");
    const urlpath = pathnameParts.join("/");
    namespace = `${hostname}/${urlpath}`;
  } else if (repoUrl?.startsWith("ssh://git@bitbucket")) {
    repoUrl = repoUrl.replace("ssh://git@", "");
    const parts = repoUrl.split(":");
    const hostname = parts[0];
    const pathnameParts = parts[1].split("/").slice(1);
    const pathnameLastElement = pathnameParts.pop();
    name = pathnameLastElement.replace(".git", "");
    const urlpath = pathnameParts.join("/");
    namespace = `${hostname}/${urlpath}`;
  } else if (repoUrl?.startsWith("/")) {
    const parts = repoUrl.split("/");
    name = parts[parts.length - 1];
  } else {
    if (DEBUG_MODE) {
      console.warn("unsupported repo url for swift type");
    }
    return undefined;
  }

  const purl = new PackageURL(type, namespace, name, version, null, null);
  return purl;
}

/**
 * Parse swift dependency tree output json object
 * @param {string} jsonObject Swift dependencies json object
 * @param {string} pkgFile Package.swift file
 */
export function parseSwiftJsonTreeObject(
  pkgList,
  dependenciesList,
  jsonObject,
  pkgFile,
) {
  const urlOrPath = jsonObject.url || jsonObject.path;
  const version = jsonObject.version;
  const purl = purlFromUrlString("swift", urlOrPath, version);
  const purlString = decodeURIComponent(purl.toString());
  const rootPkg = {
    name: purl.name,
    group: purl.namespace,
    version: purl.version,
    purl: purlString,
    "bom-ref": purlString,
  };
  if (urlOrPath) {
    if (urlOrPath.startsWith("http")) {
      rootPkg.repository = { url: urlOrPath };
    } else {
      const properties = [];
      properties.push({
        name: "SrcPath",
        value: urlOrPath,
      });
      if (pkgFile) {
        properties.push({
          name: "SrcFile",
          value: pkgFile,
        });
      }
      rootPkg.properties = properties;
    }
  }
  pkgList.push(rootPkg);
  const depList = [];
  if (jsonObject.dependencies) {
    for (const dependency of jsonObject.dependencies) {
      const res = parseSwiftJsonTreeObject(
        pkgList,
        dependenciesList,
        dependency,
        pkgFile,
      );
      depList.push(res);
    }
  }
  dependenciesList.push({
    ref: purlString,
    dependsOn: depList,
  });
  return purlString;
}

/**
 * Parse swift dependency tree output
 * @param {string} rawOutput Swift dependencies json output
 * @param {string} pkgFile Package.swift file
 */
export function parseSwiftJsonTree(rawOutput, pkgFile) {
  if (!rawOutput) {
    return {};
  }
  const pkgList = [];
  const dependenciesList = [];
  try {
    const jsonData = JSON.parse(rawOutput);
    parseSwiftJsonTreeObject(pkgList, dependenciesList, jsonData, pkgFile);
  } catch (e) {
    if (DEBUG_MODE) {
      console.log(e);
    }
    return {};
  }
  return {
    pkgList,
    dependenciesList,
  };
}

/**
 * Parse swift package resolved file
 * @param {string} resolvedFile Package.resolved file
 */
export function parseSwiftResolved(resolvedFile) {
  const pkgList = [];
  if (existsSync(resolvedFile)) {
    try {
      const pkgData = JSON.parse(
        readFileSync(resolvedFile, { encoding: "utf-8" }),
      );
      let resolvedList = [];
      if (pkgData.pins) {
        resolvedList = pkgData.pins;
      } else if (pkgData.object?.pins) {
        resolvedList = pkgData.object.pins;
      }
      for (const adep of resolvedList) {
        const locationOrUrl = adep.location || adep.repositoryURL;
        const version = adep.state.version || adep.state.revision;
        const purl = purlFromUrlString("swift", locationOrUrl, version);
        const purlString = decodeURIComponent(purl.toString());
        const rootPkg = {
          name: purl.name,
          group: purl.namespace,
          version: purl.version,
          purl: purlString,
          "bom-ref": purlString,
          properties: [
            {
              name: "SrcFile",
              value: resolvedFile,
            },
          ],
          evidence: {
            identity: {
              field: "purl",
              confidence: 1,
              methods: [
                {
                  technique: "manifest-analysis",
                  confidence: 1,
                  value: resolvedFile,
                },
              ],
            },
          },
        };
        if (locationOrUrl) {
          rootPkg.repository = { url: locationOrUrl };
        }
        pkgList.push(rootPkg);
      }
    } catch (err) {
      // continue regardless of error
    }
  }
  return pkgList;
}

/**
 * Collect maven dependencies
 *
 * @param {string} mavenCmd Maven command to use
 * @param {string} basePath Path to the maven project
 * @param {boolean} cleanup Remove temporary directories
 * @param {boolean} includeCacheDir Include maven and gradle cache directories
 */
export async function collectMvnDependencies(
  mavenCmd,
  basePath,
  cleanup = true,
  includeCacheDir = false,
) {
  let jarNSMapping = {};
  const MAVEN_CACHE_DIR =
    process.env.MAVEN_CACHE_DIR || join(homedir(), ".m2", "repository");
  const tempDir = mkdtempSync(join(tmpdir(), "mvn-deps-"));
  let copyArgs = [
    "dependency:copy-dependencies",
    `-DoutputDirectory=${tempDir}`,
    "-U",
    "-Dmdep.copyPom=true",
    "-Dmdep.useRepositoryLayout=true",
    "-Dmdep.includeScope=compile",
    `-Dmdep.prependGroupId=${process.env.MAVEN_PREPEND_GROUP || "false"}`,
    `-Dmdep.stripVersion=${process.env.MAVEN_STRIP_VERSION || "false"}`,
  ];
  if (process.env.MVN_ARGS) {
    const addArgs = process.env.MVN_ARGS.split(" ");
    copyArgs = copyArgs.concat(addArgs);
  }
  if (basePath && basePath !== MAVEN_CACHE_DIR) {
    console.log(`Executing '${mavenCmd} ${copyArgs.join(" ")}' in ${basePath}`);
    const result = spawnSync(mavenCmd, copyArgs, {
      cwd: basePath,
      encoding: "utf-8",
      shell: isWin,
    });
    if (result.status !== 0 || result.error) {
      console.error(result.stdout, result.stderr);
      console.log(
        "Resolve the above maven error. You can try the following remediation tips:\n",
      );
      console.log(
        "1. Check if the correct version of maven is installed and available in the PATH.",
      );
      console.log(
        "2. Perform 'mvn compile package' before invoking this command. Fix any errors found during this invocation.",
      );
      console.log(
        "3. Ensure the temporary directory is available and has sufficient disk space to copy all the artifacts.",
      );
    } else {
      jarNSMapping = await collectJarNS(tempDir);
    }
  }
  if (includeCacheDir || basePath === MAVEN_CACHE_DIR) {
    // slow operation
    jarNSMapping = await collectJarNS(MAVEN_CACHE_DIR);
  }

  // Clean up
  if (cleanup && tempDir && tempDir.startsWith(tmpdir()) && rmSync) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return jarNSMapping;
}

export async function collectGradleDependencies(
  gradleCmd,
  basePath,
  cleanup = true, // eslint-disable-line no-unused-vars
  includeCacheDir = false, // eslint-disable-line no-unused-vars
) {
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
      "files-2.1",
    );
  }
  if (DEBUG_MODE) {
    console.log("Collecting jars from", GRADLE_CACHE_DIR);
    console.log(
      "To improve performance, ensure only the project dependencies are present in this cache location.",
    );
  }
  const pomPathMap = {};
  const pomFiles = getAllFiles(GRADLE_CACHE_DIR, "**/*.pom");
  for (const apom of pomFiles) {
    pomPathMap[basename(apom)] = apom;
  }
  const jarNSMapping = await collectJarNS(GRADLE_CACHE_DIR, pomPathMap);
  return jarNSMapping;
}

/**
 * Method to collect class names from all jars in a directory
 *
 * @param {string} jarPath Path containing jars
 * @param {object} pomPathMap Map containing jar to pom names. Required to successfully parse gradle cache.
 *
 * @return object containing jar name and class list
 */
export async function collectJarNS(jarPath, pomPathMap = {}) {
  const jarNSMapping = {};
  console.log(
    `About to identify class names for all jars in the path ${jarPath}`,
  );
  const env = {
    ...process.env,
  };
  // jar command usually would not be available in the PATH for windows
  if (isWin && env.JAVA_HOME) {
    env.PATH = `${env.PATH || env.Path}${_delimiter}${join(
      env.JAVA_HOME,
      "bin",
    )}`;
  }
  // Parse jar files to get class names
  const jarFiles = getAllFiles(jarPath, "**/*.jar");
  if (jarFiles?.length) {
    for (const jf of jarFiles) {
      const jarname = jf;
      let pomname =
        pomPathMap[basename(jf).replace(".jar", ".pom")] ||
        jarname.replace(".jar", ".pom");
      let pomData = undefined;
      let purl = undefined;
      // In some cases, the pom name might be slightly different to the jar name
      if (!existsSync(pomname)) {
        let searchDir = dirname(jf);
        // in case of gradle, there would be hash directory that is different for jar vs pom
        // so we need to start search from a level up
        if (searchDir.includes(join(".gradle", "caches"))) {
          searchDir = join(searchDir, "..");
        }
        const pomSearch = getAllFiles(searchDir, "**/*.pom");
        if (pomSearch && pomSearch.length === 1) {
          pomname = pomSearch[0];
        }
      }
      if (existsSync(pomname)) {
        pomData = parsePomXml(readFileSync(pomname, { encoding: "utf-8" }));
        if (pomData) {
          const purlObj = new PackageURL(
            "maven",
            pomData.groupId || "",
            pomData.artifactId,
            pomData.version,
            { type: "jar" },
            null,
          );
          purl = purlObj.toString();
        }
      } else if (jf.includes(join(".m2", "repository"))) {
        // Let's try our best to construct a purl for .m2 cache entries of the form
        // .m2/repository/org/apache/logging/log4j/log4j-web/3.0.0-SNAPSHOT/log4j-web-3.0.0-SNAPSHOT.jar
        const tmpA = jf.split(join(".m2", "repository", ""));
        if (tmpA?.length) {
          const tmpJarPath = tmpA[tmpA.length - 1];
          // This would yield log4j-web-3.0.0-SNAPSHOT.jar
          const jarFileName = basename(tmpJarPath).replace(".jar", "");
          const tmpDirParts = dirname(tmpJarPath).split(_sep);
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
            null,
          );
          purl = purlObj.toString();
        }
      } else if (jf.includes(join(".gradle", "caches"))) {
        // Let's try our best to construct a purl for gradle cache entries of the form
        // .gradle/caches/modules-2/files-2.1/org.xmlresolver/xmlresolver/4.2.0/f4dbdaa83d636dcac91c9003ffa7fb173173fe8d/xmlresolver-4.2.0-data.jar
        const tmpA = jf.split(join("files-2.1", ""));
        if (tmpA?.length) {
          const tmpJarPath = tmpA[tmpA.length - 1];
          // This would yield xmlresolver-4.2.0-data.jar
          const jarFileName = basename(tmpJarPath).replace(".jar", "");
          const tmpDirParts = dirname(tmpJarPath).split(_sep);
          // This would remove the hash from the end of the directory name
          tmpDirParts.pop();
          // Retrieve the version
          const jarVersion = tmpDirParts.pop();
          const pkgName = jarFileName.replace(`-${jarVersion}`, "");
          // The result would form the group name
          let jarGroupName = tmpDirParts.join(".").replace(/^\./, "");
          if (jarGroupName.includes(pkgName)) {
            jarGroupName = jarGroupName.replace(`.${pkgName}`, "");
          }
          const purlObj = new PackageURL(
            "maven",
            jarGroupName,
            pkgName,
            jarVersion,
            { type: "jar" },
            null,
          );
          purl = purlObj.toString();
        }
      }
      // If we have a hit from the cache, use it.
      if (purl && jarNSMapping_cache[purl]) {
        jarNSMapping[purl] = jarNSMapping_cache[purl];
      } else {
        if (DEBUG_MODE) {
          console.log(`Parsing ${jf}`);
        }
        const nsList = await getJarClasses(jf);
        jarNSMapping[purl || jf] = {
          jarFile: jf,
          pom: pomData,
          namespaces: nsList,
        };
        // Retain in the global cache to speed up future lookups
        if (purl) {
          jarNSMapping_cache[purl] = jarNSMapping[purl];
        }
      }
    }
    if (!jarNSMapping) {
      console.log(`Unable to determine class names for the jars in ${jarPath}`);
    }
  } else {
    console.log(`${jarPath} did not contain any jars.`);
  }
  return jarNSMapping;
}

export function convertJarNSToPackages(jarNSMapping) {
  const pkgList = [];
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
        `Unable to identify the metadata for ${purl}. This will be skipped.`,
      );
      continue;
    }
    const apackage = {
      name,
      group: pom.groupId || purlObj.namespace || "",
      version: pom.version || purlObj.version,
      description: (pom.description || "").trim(),
      purl,
      "bom-ref": decodeURIComponent(purl),
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "filename",
              confidence: 1,
              value: jarFile,
            },
          ],
        },
      },
      properties: [
        {
          name: "SrcFile",
          value: jarFile,
        },
        {
          name: "Namespaces",
          value: namespaces.join("\n"),
        },
      ],
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
}

export function parsePomXml(pomXmlData) {
  if (!pomXmlData) {
    return undefined;
  }
  const project = xml2js(pomXmlData, {
    compact: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value",
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
      scm: project.scm?.url ? project.scm.url._ : "",
    };
  }
  return undefined;
}

export function parseJarManifest(jarMetadata) {
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
}

export function parsePomProperties(pomProperties) {
  const properties = {};
  if (!pomProperties) {
    return properties;
  }
  pomProperties.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (l.includes("=")) {
      const tmpA = l.split("=");
      if (tmpA && tmpA.length === 2) {
        properties[tmpA[0]] = tmpA[1].replace("\r", "");
      }
    }
  });
  return properties;
}

export function encodeForPurl(s) {
  return s && !s.includes("%40")
    ? encodeURIComponent(s).replace(/%3A/g, ":").replace(/%2F/g, "/")
    : s;
}

/**
 * Method to get pom properties from maven directory
 *
 * @param {string} mavenDir Path to maven directory
 *
 * @return array with pom properties
 */
export function getPomPropertiesFromMavenDir(mavenDir) {
  let pomProperties = {};
  if (existsSync(mavenDir) && lstatSync(mavenDir).isDirectory()) {
    const pomPropertiesFiles = getAllFiles(mavenDir, "**/pom.properties");
    if (pomPropertiesFiles?.length) {
      const pomPropertiesString = readFileSync(pomPropertiesFiles[0], {
        encoding: "utf-8",
      });
      pomProperties = parsePomProperties(pomPropertiesString);
    }
  }
  return pomProperties;
}

/**
 *
 * @param {string} hashName name of hash algorithm
 * @param {string} path path to file
 * @returns {Promise<String>} hex value of hash
 */
export function checksumFile(hashName, path) {
  return new Promise((resolve, reject) => {
    const hash = createHash(hashName);
    const stream = createReadStream(path);
    stream.on("error", (err) => reject(err));
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Method to extract a war or ear file
 *
 * @param {string} jarFile Path to jar file
 * @param {string} tempDir Temporary directory to use for extraction
 * @param {object} jarNSMapping Jar class names mapping object
 *
 * @return pkgList Package list
 */
export async function extractJarArchive(jarFile, tempDir, jarNSMapping = {}) {
  const pkgList = [];
  let jarFiles = [];
  const fname = basename(jarFile);
  let pomname = undefined;
  // If there is a pom file in the same directory, try to use it
  const manifestname = join(dirname(jarFile), "META-INF", "MANIFEST.MF");
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
  } else if (
    !existsSync(join(tempDir, fname)) &&
    existsSync(jarFile) &&
    lstatSync(jarFile).isFile()
  ) {
    // Only copy if the file doesn't exist
    copyFileSync(jarFile, join(tempDir, fname), constants.COPYFILE_FICLONE);
  }
  const env = {
    ...process.env,
  };
  // jar command usually would not be available in the PATH for windows
  if (isWin && env.JAVA_HOME) {
    env.PATH = `${env.PATH || env.Path}${_delimiter}${join(
      env.JAVA_HOME,
      "bin",
    )}`;
  }
  if (
    jarFile.endsWith(".war") ||
    jarFile.endsWith(".hpi") ||
    jarFile.endsWith(".jar")
  ) {
    try {
      const zip = new StreamZip.async({ file: join(tempDir, fname) });
      await zip.extract(null, tempDir);
      await zip.close();
    } catch (e) {
      console.log(`Unable to extract ${join(tempDir, fname)}. Skipping.`);
      return pkgList;
    }
    jarFiles = getAllFiles(join(tempDir, "WEB-INF", "lib"), "**/*.jar");
    if (jarFile.endsWith(".hpi")) {
      jarFiles.push(jarFile);
    }
    // Some jar files could also have more jar files inside BOOT-INF directory
    const jarFiles2 = getAllFiles(join(tempDir, "BOOT-INF", "lib"), "**/*.jar");
    if (jarFiles && jarFiles2.length) {
      jarFiles = jarFiles.concat(jarFiles2);
    }
    // Fallback. If our jar file didn't include any jar
    if (jarFile.endsWith(".jar") && !jarFiles.length) {
      jarFiles = [join(tempDir, fname)];
    }
  } else {
    jarFiles = [join(tempDir, fname)];
  }
  if (DEBUG_MODE) {
    console.log(`List of jars: ${jarFiles}`);
  }
  if (jarFiles?.length) {
    for (const jf of jarFiles) {
      // If the jar file doesn't exist at the point of use, skip it
      if (!existsSync(jf)) {
        if (DEBUG_MODE) {
          console.log(jf, "is not a readable file");
        }
        continue;
      }
      pomname = jf.replace(".jar", ".pom");
      const jarname = basename(jf);
      // Ignore test jars
      if (
        jarname.endsWith("-tests.jar") ||
        jarname.endsWith("-test-sources.jar")
      ) {
        if (DEBUG_MODE) {
          console.log(`Skipping tests jar ${jarname}`);
        }
        continue;
      }
      const manifestDir = join(tempDir, "META-INF");
      const manifestFile = join(manifestDir, "MANIFEST.MF");
      const mavenDir = join(manifestDir, "maven");
      let jarResult = {
        status: 1,
      };
      if (existsSync(pomname)) {
        jarResult = { status: 0 };
      } else {
        // Unzip natively
        try {
          const zip = new StreamZip.async({ file: jf });
          await zip.extract(null, tempDir);
          await zip.close();
          jarResult = { status: 0 };
        } catch (e) {
          if (DEBUG_MODE) {
            console.log(`Unable to extract ${jf}. Skipping.`);
          }
          jarResult = { status: 1 };
        }
      }
      if (jarResult.status === 0) {
        // When maven descriptor is available take group, name and version from pom.properties
        // META-INF/maven/${groupId}/${artifactId}/pom.properties
        // see https://maven.apache.org/shared/maven-archiver/index.html
        const pomProperties = getPomPropertiesFromMavenDir(mavenDir);
        let group = pomProperties["groupId"];
        let name = pomProperties["artifactId"];
        let version = pomProperties["version"];
        let confidence = 1;
        let technique = "manifest-analysis";
        if (
          (!group || !name || !version) &&
          SEARCH_MAVEN_ORG &&
          search_maven_org_errors < MAX_SEARCH_MAVEN_ORG_ERRORS
        ) {
          try {
            const sha = await checksumFile("sha1", jf);
            const searchurl = `https://search.maven.org/solrsearch/select?q=1:%22${sha}%22&rows=20&wt=json`;
            const res = await cdxgenAgent.get(searchurl, {
              responseType: "json",
              timeout: {
                lookup: 1000,
                connect: 5000,
                secureConnect: 5000,
                socket: 1000,
                send: 10000,
                response: 1000,
              },
            });
            const data = res?.body ? res.body["response"] : undefined;
            if (data && data["numFound"] === 1) {
              const jarInfo = data["docs"][0];
              group = jarInfo["g"];
              name = jarInfo["a"];
              version = jarInfo["v"];
              technique = "hash-comparison";
            }
          } catch (err) {
            if (err?.message && !err.message.includes("404")) {
              if (err.message.includes("Timeout")) {
                console.log(
                  "Maven search appears to be unavailable. Search will be skipped for all remaining packages.",
                );
              } else if (DEBUG_MODE) {
                console.log(err);
              }
              search_maven_org_errors++;
            }
          }
        }
        if ((!group || !name || !version) && existsSync(manifestFile)) {
          confidence = 0.8;
          const jarMetadata = parseJarManifest(
            readFileSync(manifestFile, {
              encoding: "utf-8",
            }),
          );
          group =
            group ||
            jarMetadata["Extension-Name"] ||
            jarMetadata["Implementation-Vendor-Id"] ||
            jarMetadata["Bundle-SymbolicName"] ||
            jarMetadata["Bundle-Vendor"] ||
            jarMetadata["Automatic-Module-Name"] ||
            "";
          version =
            version ||
            jarMetadata["Bundle-Version"] ||
            jarMetadata["Implementation-Version"] ||
            jarMetadata["Specification-Version"];
          if (version?.includes(" ")) {
            version = version.split(" ")[0];
          }
          // Prefer jar filename to construct name and version
          if (!name || !version || name === "" || version === "") {
            confidence = 0.5;
            technique = "filename";
            name = jarname.replace(".jar", "");
            const tmpA = jarname.split("-");
            if (tmpA && tmpA.length > 1) {
              const lastPart = tmpA[tmpA.length - 1];
              // Bug #768. Check if we have any number before simplifying the name.
              if (/\d/.test(lastPart)) {
                if (!version || version === "") {
                  version = lastPart.replace(".jar", "");
                }
                name = jarname.replace(`-${lastPart}`, "") || "";
              }
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
            if (group.includes(`.${name.toLowerCase().replace(/-/g, ".")}`)) {
              group = group.replace(
                new RegExp(`.${name.toLowerCase().replace(/-/g, ".")}$`),
                "",
              );
            } else if (group.includes(`.${name.toLowerCase()}`)) {
              group = group.replace(new RegExp(`.${name.toLowerCase()}$`), "");
            }
          }
          // Patch the group string
          for (const aprefix in vendorAliases) {
            if (name?.startsWith(aprefix)) {
              group = vendorAliases[aprefix];
              break;
            }
          }
          // if group is empty use name as group
          group = group === "." ? name : group || name;
        }
        if (name && version) {
          const apkg = {
            group: group ? encodeForPurl(group) : "",
            name: name ? encodeForPurl(name) : "",
            version,
            purl: new PackageURL(
              "maven",
              group,
              name,
              version,
              { type: "jar" },
              null,
            ).toString(),
            evidence: {
              identity: {
                field: "purl",
                confidence: confidence,
                methods: [
                  {
                    technique: technique,
                    confidence: confidence,
                    value: jarname,
                  },
                ],
              },
            },
            properties: [
              {
                name: "SrcFile",
                value: jarname,
              },
            ],
          };
          if (jarNSMapping?.[apkg.purl] && jarNSMapping[apkg.purl].namespaces) {
            apkg.properties.push({
              name: "Namespaces",
              value: jarNSMapping[apkg.purl].namespaces.join("\n"),
            });
          }
          pkgList.push(apkg);
        } else {
          if (DEBUG_MODE) {
            console.log(`Ignored jar ${jarname}`, name, version);
          }
        }
      }
      try {
        if (rmSync && existsSync(join(tempDir, "META-INF"))) {
          // Clean up META-INF
          rmSync(join(tempDir, "META-INF"), {
            recursive: true,
            force: true,
          });
        }
      } catch (err) {
        // ignore cleanup errors
      }
    } // for
  } // if
  if (jarFiles.length !== pkgList.length) {
    console.log(`Obtained only ${pkgList.length} from ${jarFiles.length} jars`);
  }
  return pkgList;
}

/**
 * Determine the version of SBT used in compilation of this project.
 * By default it looks into a standard SBT location i.e.
 * <path-project>/project/build.properties
 * Returns `null` if the version cannot be determined.
 *
 * @param {string} projectPath Path to the SBT project
 */
export function determineSbtVersion(projectPath) {
  const buildPropFile = join(projectPath, "project", "build.properties");
  if (DEBUG_MODE) {
    console.log("Looking for", buildPropFile);
  }
  if (existsSync(buildPropFile)) {
    const properties = propertiesReader(buildPropFile);
    const property = properties.get("sbt.version");
    if (property != null && valid(property)) {
      return property;
    }
  }
  return null;
}

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
export function addPlugin(projectPath, plugin) {
  const pluginsFile = sbtPluginsPath(projectPath);
  let originalPluginsFile = null;
  if (existsSync(pluginsFile)) {
    originalPluginsFile = `${pluginsFile}.cdxgen`;
    copyFileSync(pluginsFile, originalPluginsFile, constants.COPYFILE_FICLONE);
  }

  writeFileSync(pluginsFile, plugin, { flag: "a" });
  return originalPluginsFile;
}

/**
 * Cleans up modifications to the project's plugins' file made by the
 * `addPlugin` function.
 *
 * @param {string} projectPath Path to the SBT project
 * @param {string} originalPluginsFile Location of the original plugins file, if any
 */
export function cleanupPlugin(projectPath, originalPluginsFile) {
  const pluginsFile = sbtPluginsPath(projectPath);
  if (existsSync(pluginsFile)) {
    if (!originalPluginsFile) {
      // just remove the file, it was never there
      unlinkSync(pluginsFile);
      return !existsSync(pluginsFile);
    }
    // Bring back the original file
    copyFileSync(originalPluginsFile, pluginsFile, constants.COPYFILE_FICLONE);
    unlinkSync(originalPluginsFile);
    return true;
  }
  return false;
}

/**
 * Returns a default location of the plugins file.
 *
 * @param {string} projectPath Path to the SBT project
 */
export function sbtPluginsPath(projectPath) {
  return join(projectPath, "project", "plugins.sbt");
}

/**
 * Method to read a single file entry from a zip file
 *
 * @param {string} zipFile Zip file to read
 * @param {string} filePattern File pattern
 * @param {string} contentEncoding Encoding. Defaults to utf-8
 *
 * @returns File contents
 */
export async function readZipEntry(
  zipFile,
  filePattern,
  contentEncoding = "utf-8",
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
}

/**
 * Method to get the classes and relevant sources in a jar file
 *
 * @param {string} jarFile Jar file to read
 *
 * @returns List of classes and sources matching certain known patterns
 */
export async function getJarClasses(jarFile) {
  const retList = [];
  try {
    const zip = new StreamZip.async({ file: jarFile });
    const entriesCount = await zip.entriesCount;
    if (!entriesCount) {
      return [];
    }
    const entries = await zip.entries();
    for (const entry of Object.values(entries)) {
      if (entry.isDirectory) {
        continue;
      }
      if (
        (entry.name.includes(".class") ||
          entry.name.includes(".java") ||
          entry.name.includes(".scala") ||
          entry.name.includes(".groovy") ||
          entry.name.includes(".kt")) &&
        !entry.name.includes("-INF") &&
        !entry.name.includes("module-info")
      ) {
        retList.push(
          entry.name
            .replace("\r", "")
            .replace(/.(class|java|kt|scala|groovy)/g, "")
            .replace(/\/$/, "")
            .replace(/\//g, "."),
        );
      }
    }
    zip.close();
  } catch (e) {
    if (DEBUG_MODE) {
      console.log(`Unable to parse ${jarFile}. Skipping.`);
    }
  }
  return retList;
}

/**
 * Method to return the gradle command to use.
 *
 * @param {string} srcPath Path to look for gradlew wrapper
 * @param {string} rootPath Root directory to look for gradlew wrapper
 */
export function getGradleCommand(srcPath, rootPath) {
  let gradleCmd = "gradle";

  let findGradleFile = "gradlew";
  if (platform() === "win32") {
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
}
/**
 * Method to split the output produced by Gradle using parallel processing by project
 *
 * @param {string} rawOutput Full output produced by Gradle using parallel processing
 * @param {array} allProjects List of Gradle (sub)projects
 * @returns {map} Map with subProject names as keys and corresponding dependency task outputs as values.
 */

export function splitOutputByGradleProjects(rawOutput, allProjects) {
  const outputSplitBySubprojects = new Map();
  for (const sp of allProjects) {
    outputSplitBySubprojects.set(sp.name, "");
  }

  let subProjectOut = "";
  const outSplitByLine = rawOutput.split("\n");
  let currentProjectName = "";
  for (const [i, line] of outSplitByLine.entries()) {
    //filter out everything before first dependencies task output
    if (!line.startsWith("> Task :") && subProjectOut === "") {
      continue;
    }

    if (line.startsWith("Root project '") || line.startsWith("Project ':")) {
      currentProjectName = line.split("'")[1];
      currentProjectName = currentProjectName.replace(":", "");
    }
    // if previous subProject has ended, push to array and reset subProject string
    if (line.startsWith("> Task :") && subProjectOut !== "") {
      outputSplitBySubprojects.set(currentProjectName, subProjectOut);
      subProjectOut = "";
    }
    //if in subproject block, keep appending to string
    subProjectOut += `${line}\n`;

    //if end of last dependencies output block, push to array
    if (i === outSplitByLine.length - 1) {
      outputSplitBySubprojects.set(currentProjectName, subProjectOut);
    }
  }

  return outputSplitBySubprojects;
}
/**
 * Method to return the maven command to use.
 *
 * @param {string} srcPath Path to look for maven wrapper
 * @param {string} rootPath Root directory to look for maven wrapper
 */
export function getMavenCommand(srcPath, rootPath) {
  let mavenCmd = "mvn";
  // Check if the wrapper script is both available and functional
  let isWrapperReady = false;
  let isWrapperFound = false;
  let findMavenFile = "mvnw";
  let mavenWrapperCmd = null;
  if (platform() === "win32") {
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
    mavenWrapperCmd = resolve(join(srcPath, findMavenFile));
    isWrapperFound = true;
  } else if (rootPath && existsSync(join(rootPath, findMavenFile))) {
    // Check if the root directory has a wrapper script
    try {
      chmodSync(join(rootPath, findMavenFile), 0o775);
    } catch (e) {
      // continue regardless of error
    }
    mavenWrapperCmd = resolve(join(rootPath, findMavenFile));
    isWrapperFound = true;
  }
  if (isWrapperFound) {
    if (DEBUG_MODE) {
      console.log(
        "Testing the wrapper script by invoking wrapper:wrapper task",
      );
    }
    const result = spawnSync(mavenWrapperCmd, ["wrapper:wrapper"], {
      encoding: "utf-8",
      cwd: rootPath,
      timeout: TIMEOUT_MS,
      shell: isWin,
    });
    if (!result.error && !result.status) {
      isWrapperReady = true;
      mavenCmd = mavenWrapperCmd;
    } else {
      if (DEBUG_MODE) {
        console.log(
          "Maven wrapper script test has failed. Will use the installed version of maven.",
        );
      }
    }
  }
  if (!isWrapperFound || !isWrapperReady) {
    if (process.env.MVN_CMD || process.env.MAVEN_CMD) {
      mavenCmd = process.env.MVN_CMD || process.env.MAVEN_CMD;
    } else if (process.env.MAVEN_HOME) {
      mavenCmd = join(process.env.MAVEN_HOME, "bin", "mvn");
    }
  }
  return mavenCmd;
}

/**
 * Retrieves the atom command by referring to various environment variables
 */
export function getAtomCommand() {
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
    "index.js",
  );
  if (existsSync(localAtom)) {
    return `${NODE_CMD} ${localAtom}`;
  }
  return "atom";
}

export function executeAtom(src, args) {
  const cwd =
    existsSync(src) && lstatSync(src).isDirectory() ? src : dirname(src);
  let ATOM_BIN = getAtomCommand();
  let isSupported = true;
  if (ATOM_BIN.includes(" ")) {
    const tmpA = ATOM_BIN.split(" ");
    if (tmpA && tmpA.length > 1) {
      ATOM_BIN = tmpA[0];
      args.unshift(tmpA[1]);
    }
  }
  if (DEBUG_MODE) {
    console.log("Executing", ATOM_BIN, args.join(" "));
  }
  const env = {
    ...process.env,
  };

  if (isWin) {
    env.PATH = `${env.PATH || env.Path}${_delimiter}${join(
      dirNameStr,
      "node_modules",
      ".bin",
    )}`;
  } else {
    env.PATH = `${env.PATH}${_delimiter}${join(
      dirNameStr,
      "node_modules",
      ".bin",
    )}`;
  }
  const result = spawnSync(ATOM_BIN, args, {
    cwd,
    encoding: "utf-8",
    timeout: TIMEOUT_MS,
    detached: !isWin && !process.env.CI,
    shell: isWin,
    killSignal: "SIGKILL",
    env,
  });
  if (result.stderr) {
    if (
      result.stderr.includes(
        "has been compiled by a more recent version of the Java Runtime",
      ) ||
      result.stderr.includes("Error: Could not create the Java Virtual Machine")
    ) {
      console.log(
        "Atom requires Java 21 or above. To improve the SBOM accuracy, please install a suitable version, set the JAVA_HOME environment variable, and re-run cdxgen.\nAlternatively, use the cdxgen container image.",
      );
      console.log(`Current JAVA_HOME: ${env["JAVA_HOME"] || ""}`);
    } else if (result.stderr.includes("astgen")) {
      console.warn(
        "WARN: Unable to locate astgen command. Install atom globally using sudo npm install -g @appthreat/atom to resolve this issue.",
      );
    }
  }
  if (result.stdout) {
    if (result.stdout.includes("No language frontend supported for language")) {
      console.log("This language is not yet supported by atom.");
      isSupported = false;
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
  return isSupported && !result.error;
}

/**
 * Find the imported modules in the application with atom parsedeps command
 *
 * @param {string} src
 * @param {string} language
 * @param {string} methodology
 * @param {string} slicesFile
 * @returns List of imported modules
 */
export function findAppModules(
  src,
  language,
  methodology = "usages",
  slicesFile = undefined,
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
    resolve(src),
  ];
  executeAtom(src, args);
  if (existsSync(slicesFile)) {
    const slicesData = JSON.parse(readFileSync(slicesFile, "utf-8"), {
      encoding: "utf-8",
    });
    if (slicesData && Object.keys(slicesData) && slicesData.modules) {
      retList = slicesData.modules;
    } else {
      retList = slicesData;
    }
  } else {
    console.log(
      "Slicing was not successful. For large projects (> 1 million lines of code), try running atom cli externally in Java mode. Please refer to the instructions in https://github.com/CycloneDX/cdxgen/blob/master/ADVANCED.md.",
    );
    console.log(
      "NOTE: Atom is in detached mode and will continue to run in the background with max CPU and memory unless it's killed.",
    );
  }
  // Clean up
  if (tempDir?.startsWith(tmpdir()) && rmSync) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return retList;
}

function flattenDeps(dependenciesMap, pkgList, reqOrSetupFile, t) {
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
    const purlString = new PackageURL(
      "pypi",
      "",
      d.name,
      d.version,
      null,
      null,
    ).toString();
    pkgList.push({
      name: d.name,
      version: d.version,
      purl: purlString,
      "bom-ref": decodeURIComponent(purlString),
      properties: [
        {
          name: "SrcFile",
          value: reqOrSetupFile,
        },
      ],
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.8,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.8,
              value: reqOrSetupFile,
            },
          ],
        },
      },
    });
    // Recurse and flatten
    if (d.dependencies && d.dependencies) {
      flattenDeps(dependenciesMap, pkgList, reqOrSetupFile, d);
    }
  }
  dependenciesMap[tRef] = (dependenciesMap[tRef] || [])
    .concat(dependsOn)
    .sort();
}

/**
 * Execute pip freeze by creating a virtual env in a temp directory and construct the dependency tree
 *
 * @param {string} basePath Base path
 * @param {string} reqOrSetupFile Requirements or setup.py file
 * @param {string} tempVenvDir Temp venv dir
 * @returns List of packages from the virtual env
 */
export function getPipFrozenTree(basePath, reqOrSetupFile, tempVenvDir) {
  const pkgList = [];
  const rootList = [];
  const dependenciesList = [];
  let result = undefined;
  let frozen = true;
  const env = {
    ...process.env,
  };
  /**
   * Let's start with an attempt to create a new temporary virtual environment in case we aren't in one
   *
   * By checking the environment variable "VIRTUAL_ENV" we decide whether to create an env or not
   */
  if (
    !process.env.VIRTUAL_ENV &&
    !process.env.CONDA_PREFIX &&
    reqOrSetupFile &&
    !reqOrSetupFile.endsWith("poetry.lock")
  ) {
    result = spawnSync(PYTHON_CMD, ["-m", "venv", tempVenvDir], {
      encoding: "utf-8",
      shell: isWin,
    });
    if (result.status !== 0 || result.error) {
      frozen = false;
      if (DEBUG_MODE) {
        console.log("Virtual env creation has failed");
        if (result.stderr?.includes("spawnSync python ENOENT")) {
          console.log(
            "Install suitable version of python or set the environment variable PYTHON_CMD.",
          );
        }
        if (!result.stderr) {
          console.log(
            "Ensure the virtualenv package is installed using pip. `python -m pip install virtualenv`",
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
        platform() === "win32" ? "Scripts" : "bin",
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
    // We have a poetry.lock file
    if (reqOrSetupFile.endsWith("poetry.lock")) {
      const poetryConfigArgs = [
        "-m",
        "poetry",
        "config",
        "virtualenvs.options.no-setuptools",
        "true",
        "--local",
      ];
      result = spawnSync(PYTHON_CMD, poetryConfigArgs, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS,
        shell: isWin,
      });
      let poetryInstallArgs = ["-m", "poetry", "install", "-n", "--no-root"];
      // Attempt to perform poetry install
      result = spawnSync(PYTHON_CMD, poetryInstallArgs, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS,
        shell: isWin,
      });
      if (result.status !== 0 || result.error) {
        if (result.stderr?.includes("No module named poetry")) {
          poetryInstallArgs = ["install", "-n", "--no-root"];
          // Attempt to perform poetry install
          result = spawnSync("poetry", poetryInstallArgs, {
            cwd: basePath,
            encoding: "utf-8",
            timeout: TIMEOUT_MS,
            shell: isWin,
            env,
          });
          if (result.status !== 0 || result.error) {
            frozen = false;
            if (DEBUG_MODE && result.stderr) {
              console.log(result.stderr);
            }
            console.log("poetry install has failed.");
            console.log(
              "1. Install the poetry command using python -m pip install poetry.",
            );
            console.log(
              "2. Check the version of python supported by the project. Poetry is strict about the version used.",
            );
            console.log(
              "3. Setup and activate the poetry virtual environment and re-run cdxgen.",
            );
          }
        } else {
          frozen = false;
          console.log(
            "Poetry install has failed. Setup and activate the poetry virtual environment and re-run cdxgen.",
          );
          if (DEBUG_MODE) {
            if (result.error) {
              console.log(result.error);
            }
            if (result.stderr) {
              console.log(result.stderr);
            }
          }
        }
      } else {
        const poetryEnvArgs = ["env info", "--path"];
        result = spawnSync("poetry", poetryEnvArgs, {
          cwd: basePath,
          encoding: "utf-8",
          timeout: TIMEOUT_MS,
          shell: isWin,
          env,
        });
        tempVenvDir = result.stdout.replaceAll(/[\r\n]+/g, "");
        if (tempVenvDir?.length) {
          env.VIRTUAL_ENV = tempVenvDir;
          env.PATH = `${join(
            tempVenvDir,
            platform() === "win32" ? "Scripts" : "bin",
          )}${_delimiter}${process.env.PATH || ""}`;
        }
      }
    } else {
      const pipInstallArgs = [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
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
        shell: isWin,
        env,
      });
      if (result.status !== 0 || result.error) {
        frozen = false;
        let versionRelatedError = false;
        if (
          result.stderr &&
          (result.stderr.includes(
            "Could not find a version that satisfies the requirement",
          ) ||
            result.stderr.includes("No matching distribution found for"))
        ) {
          versionRelatedError = true;
          console.log(
            "The version or the version specifiers used for a dependency is invalid. Resolve the below error to improve SBOM accuracy.",
          );
          console.log(result.stderr);
        }
        if (!versionRelatedError) {
          if (DEBUG_MODE) {
            console.log("args used:", pipInstallArgs);
            if (result.stderr) {
              console.log(result.stderr);
            }
            console.log(
              "Possible build errors detected. The resulting list in the SBOM would therefore be incomplete.\nTry installing any missing build tools or development libraries to improve the accuracy.",
            );
            if (platform() === "win32") {
              console.log(
                "- Install the appropriate compilers and build tools on Windows by following this documentation - https://wiki.python.org/moin/WindowsCompilers",
              );
            } else {
              console.log(
                "- For example, you may have to install gcc, gcc-c++ compiler, make tools and additional development libraries using apt-get or yum package manager.",
              );
            }
            console.log(
              "- Certain projects would only build with specific versions of python and OS. Data science and ML related projects might require a conda/anaconda distribution.",
            );
            console.log(
              "- Check if any git submodules have to be initialized.",
            );
            console.log(
              "- If the application has its own Dockerfile, look for additional clues in there. You can also run cdxgen npm package during the container build step.",
            );
          } else {
            console.log(
              "Possible build errors detected. Set the environment variable CDXGEN_DEBUG_MODE=debug to troubleshoot.",
            );
          }
        }
      }
    }
  }
  // Bug #375. Attempt pip freeze on existing and new virtual environments
  if (env.VIRTUAL_ENV?.length || env.CONDA_PREFIX?.length) {
    /**
     * At this point, the previous attempt to do a pip install might have failed and we might have an unclean virtual environment with an incomplete list
     * The position taken by cdxgen is "Some SBOM is better than no SBOM", so we proceed to collecting the dependencies that got installed with pip freeze
     */
    if (DEBUG_MODE) {
      console.log(
        "About to construct the pip dependency tree. Please wait ...",
      );
    }
    // This is a slow step that ideally needs to be invoked only once per venv
    const tree = getTreeWithPlugin(env, PYTHON_CMD, basePath);
    if (DEBUG_MODE && !tree.length) {
      console.log(
        "Dependency tree generation has failed. Please check for any errors or version incompatibilities reported in the logs.",
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
      const exclude = ["pip", "setuptools", "wheel"];
      if (!exclude.includes(name)) {
        const purlString = new PackageURL(
          "pypi",
          "",
          name,
          version,
          null,
          null,
        ).toString();
        pkgList.push({
          name,
          version,
          purl: purlString,
          "bom-ref": decodeURIComponent(purlString),
          evidence: {
            identity: {
              field: "purl",
              confidence: 1,
              methods: [
                {
                  technique: "instrumentation",
                  confidence: 1,
                  value: env.VIRTUAL_ENV || env.CONDA_PREFIX,
                },
              ],
            },
          },
        });
        rootList.push({
          name,
          version,
        });
        flattenDeps(dependenciesMap, pkgList, reqOrSetupFile, t);
      }
    } // end for
    for (const k of Object.keys(dependenciesMap)) {
      dependenciesList.push({ ref: k, dependsOn: dependenciesMap[k] });
    }
  }
  return {
    pkgList,
    rootList,
    dependenciesList,
    frozen,
  };
}

// taken from a very old package https://github.com/keithamus/parse-packagejson-name/blob/master/index.js
export function parsePackageJsonName(name) {
  const nameRegExp = /^(?:@([^/]+)\/)?(([^.]+)(?:\.(.*))?)$/;
  const returnObject = {
    scope: null,
    fullName: "",
    projectName: "",
    moduleName: "",
  };
  const match = (typeof name === "object" ? name.name || "" : name || "").match(
    nameRegExp,
  );
  if (match) {
    returnObject.scope =
      (match[1] && name.includes("@") ? `@${match[1]}` : match[1]) || null;
    returnObject.fullName = match[2] || match[0];
    returnObject.projectName = match[3] === match[2] ? null : match[3];
    returnObject.moduleName = match[4] || match[2] || null;
  }
  return returnObject;
}

/**
 * Method to add occurrence evidence for components based on import statements. Currently useful for js
 *
 * @param {array} pkgList List of package
 * @param {object} allImports Import statements object with package name as key and an object with file and location details
 * @param {object} allExports Exported modules if available from node_modules
 */
export async function addEvidenceForImports(
  pkgList,
  allImports,
  allExports,
  deep,
) {
  const impPkgs = Object.keys(allImports);
  const exportedPkgs = Object.keys(allExports);
  for (const pkg of pkgList) {
    if (impPkgs?.length) {
      // Assume that all packages are optional until we see an evidence
      pkg.scope = "optional";
    }
    const { group, name } = pkg;
    // Evidence belonging to a type must be associated with the package
    if (group === "@types") {
      continue;
    }
    const aliases = group?.length
      ? [name, `${group}/${name}`, `@${group}/${name}`]
      : [name];
    for (const alias of aliases) {
      const all_includes = impPkgs.filter(
        (find_pkg) =>
          find_pkg.startsWith(alias) &&
          (find_pkg.length === alias.length || find_pkg[alias.length] === "/"),
      );
      const all_exports = exportedPkgs.filter((find_pkg) =>
        find_pkg.startsWith(alias),
      );
      if (all_exports?.length) {
        let exportedModules = new Set(all_exports);
        pkg.properties = pkg.properties || [];
        for (const subevidence of all_exports) {
          const evidences = allExports[subevidence];
          for (const evidence of evidences) {
            if (evidence && Object.keys(evidence).length) {
              if (evidence.exportedModules.length > 1) {
                for (const aexpsubm of evidence.exportedModules) {
                  // Be selective on the submodule names
                  if (
                    !evidence.importedAs
                      .toLowerCase()
                      .includes(aexpsubm.toLowerCase()) &&
                    !alias.endsWith(aexpsubm)
                  ) {
                    // Store both the short and long form of the exported sub modules
                    if (aexpsubm.length > 3) {
                      exportedModules.add(aexpsubm);
                    }
                    exportedModules.add(
                      `${evidence.importedAs.replace("./", "")}/${aexpsubm}`,
                    );
                  }
                }
              }
            }
          }
        }
        exportedModules = Array.from(exportedModules);
        if (exportedModules.length) {
          pkg.properties.push({
            name: "ExportedModules",
            value: exportedModules.join(","),
          });
        }
      }
      // Identify all the imported modules of a component
      if (impPkgs.includes(alias) || all_includes.length) {
        let importedModules = new Set();
        pkg.scope = "required";
        for (const subevidence of all_includes) {
          const evidences = allImports[subevidence];
          for (const evidence of evidences) {
            if (evidence && Object.keys(evidence).length && evidence.fileName) {
              pkg.evidence = pkg.evidence || {};
              pkg.evidence.occurrences = pkg.evidence.occurrences || [];
              pkg.evidence.occurrences.push({
                location: `${evidence.fileName}${
                  evidence.lineNumber ? `#${evidence.lineNumber}` : ""
                }`,
              });
              importedModules.add(evidence.importedAs);
              for (const importedSm of evidence.importedModules || []) {
                if (!importedSm) {
                  continue;
                }
                // Store both the short and long form of the imported sub modules
                if (importedSm.length > 3) {
                  importedModules.add(importedSm);
                }
                importedModules.add(`${evidence.importedAs}/${importedSm}`);
              }
            }
          }
        }
        importedModules = Array.from(importedModules);
        if (importedModules.length) {
          pkg.properties = pkg.properties || [];
          pkg.properties.push({
            name: "ImportedModules",
            value: importedModules.join(","),
          });
        }
        break;
      }
      // Capture metadata such as description from local node_modules in deep mode
      if (deep && !pkg.description && pkg.properties) {
        let localNodeModulesPath = undefined;
        for (const aprop of pkg.properties) {
          if (aprop.name === "LocalNodeModulesPath") {
            localNodeModulesPath = resolve(join(aprop.value, "package.json"));
            break;
          }
        }
        if (localNodeModulesPath && existsSync(localNodeModulesPath)) {
          const lnmPkgList = await parsePkgJson(localNodeModulesPath, true);
          if (lnmPkgList && lnmPkgList.length === 1) {
            const lnmMetadata = lnmPkgList[0];
            if (lnmMetadata && Object.keys(lnmMetadata).length) {
              pkg.description = lnmMetadata.description;
              pkg.author = lnmMetadata.author;
              pkg.license = lnmMetadata.license;
              pkg.homepage = lnmMetadata.homepage;
              pkg.repository = lnmMetadata.repository;
            }
          }
        }
      }
    } // for alias
    // Trim the properties
    pkg.properties = pkg.properties.filter(
      (p) => p.name !== "LocalNodeModulesPath",
    );
  } // for pkg
  return pkgList;
}

export function componentSorter(a, b) {
  if (a && b) {
    for (const k of ["bom-ref", "purl", "name"]) {
      if (a[k] && b[k]) {
        return a[k].localeCompare(b[k]);
      }
    }
  }
  return a.localeCompare(b);
}

export function parseCmakeDotFile(dotFile, pkgType, options = {}) {
  const dotGraphData = readFileSync(dotFile, { encoding: "utf-8" });
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
    const group = "";
    const version = "";
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
        if (tmpA?.length) {
          const relationship = tmpA[1];
          if (relationship.includes("->")) {
            const tmpB = relationship.split(" -> ");
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
        type: "application",
      };
      parentComponent["purl"] = new PackageURL(
        pkgType,
        parentComponent.group,
        parentComponent.name,
        parentComponent.version,
        null,
        path,
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
          path,
        ).toString(),
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
      dependsOn,
    });
  }
  return {
    parentComponent,
    pkgList,
    dependenciesList,
  };
}

export function parseCmakeLikeFile(cmakeListFile, pkgType, options = {}) {
  let cmakeListData = readFileSync(cmakeListFile, { encoding: "utf-8" });
  const pkgList = [];
  const pkgAddedMap = {};
  const versionSpecifiersMap = {};
  const versionsMap = {};
  let parentComponent = {};
  const templateValues = {};
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
    const group = "";
    const path = undefined;
    const name_list = [];
    if (l.startsWith("set")) {
      const tmpA = l.replace("set(", "").replace(")", "").trim().split(" ");
      if (tmpA && tmpA.length === 2) {
        templateValues[tmpA[0]] = tmpA[1];
      }
    } else if (
      l.startsWith("project") &&
      !Object.keys(parentComponent).length
    ) {
      if (l.includes("${")) {
        for (const tmplKey of Object.keys(templateValues)) {
          l = l.replace(`\${${tmplKey}}`, templateValues[tmplKey] || "");
        }
      }
      const tmpA = l.replace("project (", "project(").split("project(");
      if (tmpA && tmpA.length > 1) {
        const tmpB = (tmpA[1] || "")
          .trim()
          .replace(/["']/g, "")
          .replace(/[ ]/g, ",")
          .split(")")[0]
          .split(",")
          .filter((v) => v.length > 1);
        const parentName = tmpB[0].replace(":", "");
        let parentVersion = undefined;
        // In case of meson.build we can find the version number after the word version
        // thanks to our replaces and splits
        const versionIndex = tmpB.findIndex((v) => v === "version");
        if (versionIndex > -1 && tmpB.length > versionIndex) {
          parentVersion = tmpB[versionIndex + 1];
        }
        if (parentName?.length && !parentName.includes("$")) {
          parentComponent = {
            group: options.projectGroup || "",
            name: parentName,
            version: parentVersion || options.projectVersion || "",
            type: "application",
          };
          parentComponent["purl"] = new PackageURL(
            pkgType,
            parentComponent.group,
            parentComponent.name,
            parentComponent.version,
            null,
            path,
          ).toString();
          parentComponent["bom-ref"] = decodeURIComponent(
            parentComponent["purl"],
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
        "FetchContent_MakeAvailable(",
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
              "NO_DEFAULT_PATH",
            ].includes(v) &&
            !v.includes("$") &&
            !v.includes("LIB") &&
            !v.startsWith("CMAKE_") &&
            v.length,
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
            if (
              /^\d+/.test(tmpB[1]) &&
              !tmpB[1].includes("${") &&
              !tmpB[1].startsWith("@")
            ) {
              versionsMap[working_name] = tmpB[1];
            }
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
      if (tmpA?.length) {
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
                } else if (
                  /^\d+/.test(tmpB[1]) &&
                  !tmpB[1].includes("${") &&
                  !tmpB[1].startsWith("@")
                ) {
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
      const props = [];
      let confidence = 0;
      if (
        n &&
        n.length > 1 &&
        !pkgAddedMap[n] &&
        !n.startsWith(_sep) &&
        !n.startsWith("@")
      ) {
        n = n.replace(/"/g, "");
        // Can this be replaced with a db lookup?
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
                  : awrap[eprop],
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
            name: "cdx:build:versionSpecifiers",
            value: versionSpecifiersMap[n],
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
            path,
          ).toString(),
          evidence: {
            identity: {
              field: "purl",
              confidence,
              methods: [
                {
                  technique: "source-code-analysis",
                  confidence: 0.5,
                  value: `Filename ${cmakeListFile}`,
                },
              ],
            },
          },
          properties: props,
        };
        apkg["bom-ref"] = decodeURIComponent(apkg["purl"]);
        pkgList.push(apkg);
        pkgAddedMap[n] = true;
      }
    }
  });
  return {
    parentComponent,
    pkgList,
  };
}

export function getOSPackageForFile(afile, osPkgsList) {
  for (const ospkg of osPkgsList) {
    for (const props of ospkg.properties || []) {
      if (
        props.name === "PkgProvides" &&
        props.value.includes(afile.toLowerCase())
      ) {
        delete ospkg.scope;
        // dev packages are libraries
        ospkg.type = "library";
        // Set the evidence to indicate how we identified this package from the header or .so file
        ospkg.evidence = {
          identity: {
            field: "purl",
            confidence: 0.8,
            methods: [
              {
                technique: "filename",
                confidence: 0.8,
                value: `PkgProvides ${afile}`,
              },
            ],
          },
        };
        return ospkg;
      }
    }
  }
  return undefined;
}

/**
 * Method to find c/c++ modules by collecting usages with atom
 *
 * @param {string} src directory
 * @param {object} options Command line options
 * @param {array} osPkgsList Array of OS pacakges represented as components
 * @param {array} epkgList Existing packages list
 */
export function getCppModules(src, options, osPkgsList, epkgList) {
  // Generic is the type to use where the package registry could not be located
  const pkgType = "generic";
  const pkgList = [];
  const pkgAddedMap = {};
  let sliceData = {};
  const epkgMap = {};
  let parentComponent = undefined;
  const dependsOn = [];
  (epkgList || []).forEach((p) => {
    epkgMap[`${p.group}/${p.name}`] = p;
  });
  // Let's look for any vcpkg.json file to tell us about the directory we're scanning
  // users can use this file to give us a clue even if they do not use vcpkg library manager
  if (existsSync(join(src, "vcpkg.json"))) {
    const vcPkgData = JSON.parse(
      readFileSync(join(src, "vcpkg.json"), { encoding: "utf-8" }),
    );
    if (vcPkgData && Object.keys(vcPkgData).length && vcPkgData.name) {
      const parentPurl = new PackageURL(
        pkgType,
        "",
        vcPkgData.name,
        vcPkgData.version || "",
        null,
        null,
      ).toString();
      parentComponent = {
        name: vcPkgData.name,
        version: vcPkgData.version || "",
        description: vcPkgData.description,
        license: vcPkgData.license,
        purl: parentPurl,
        type: "application",
        "bom-ref": decodeURIComponent(parentPurl),
      };
      if (vcPkgData.homepage) {
        parentComponent.homepage = { url: vcPkgData.homepage };
      }
      // Are there any dependencies declared in vcpkg.json
      if (vcPkgData.dependencies && Array.isArray(vcPkgData.dependencies)) {
        for (const avcdep of vcPkgData.dependencies) {
          let avcpkgName = undefined;
          let scope = undefined;
          if (typeof avcdep === "string" || avcdep instanceof String) {
            avcpkgName = avcdep;
          } else if (Object.keys(avcdep).length && avcdep.name) {
            avcpkgName = avcdep.name;
            if (avcdep.host) {
              scope = "optional";
            }
          }
          // Is this a dependency we haven't seen before including the all lower and upper case version?
          if (
            avcpkgName &&
            !epkgMap[`/${avcpkgName}`] &&
            !epkgMap[`/${avcpkgName.toLowerCase()}`] &&
            !epkgMap[`/${avcpkgName.toUpperCase()}`]
          ) {
            const pkgPurl = new PackageURL(
              pkgType,
              "",
              avcpkgName,
              "",
              null,
              null,
            ).toString();
            const apkg = {
              group: "",
              name: avcpkgName,
              type: pkgType,
              version: "",
              purl: pkgPurl,
              scope,
              "bom-ref": decodeURIComponent(pkgPurl),
              evidence: {
                identity: {
                  field: "purl",
                  confidence: 0.5,
                  methods: [
                    {
                      technique: "source-code-analysis",
                      confidence: 0.5,
                      value: `Filename ${join(src, "vcpkg.json")}`,
                    },
                  ],
                },
              },
            };
            if (!pkgAddedMap[avcpkgName]) {
              pkgList.push(apkg);
              dependsOn.push(apkg["bom-ref"]);
              pkgAddedMap[avcpkgName] = true;
            }
          }
        }
      }
    } // if
  } else if (existsSync(join(src, "CMakeLists.txt"))) {
    const retMap = parseCmakeLikeFile(join(src, "CMakeLists.txt"), pkgType);
    if (retMap.parentComponent && Object.keys(retMap.parentComponent).length) {
      parentComponent = retMap.parentComponent;
    }
  } else if (options.projectName && options.projectVersion) {
    parentComponent = {
      group: options.projectGroup || "",
      name: options.projectName || "",
      version: `${options.projectVersion}` || "latest",
      type: "application",
    };
    const parentPurl = new PackageURL(
      pkgType,
      parentComponent.group,
      parentComponent.name,
      parentComponent.version,
      null,
      null,
    ).toString();
    parentComponent.purl = parentPurl;
    parentComponent["bom-ref"] = decodeURIComponent(parentPurl);
  }
  if (options.usagesSlicesFile && existsSync(options.usagesSlicesFile)) {
    sliceData = JSON.parse(
      readFileSync(options.usagesSlicesFile, { encoding: "utf-8" }),
    );
    if (DEBUG_MODE) {
      console.log("Re-using existing slices file", options.usagesSlicesFile);
    }
  } else {
    sliceData = findAppModules(
      src,
      options.deep ? "c" : "h",
      "usages",
      options.usagesSlicesFile,
    );
  }
  const usageData = parseCUsageSlice(sliceData);
  for (let afile of Object.keys(usageData)) {
    // Normalize windows separator
    afile = afile.replace("..\\", "").replace(/\\/g, "/");
    const fileName = basename(afile);
    if (!fileName || !fileName.length) {
      continue;
    }
    const extn = extname(fileName);
    let group = dirname(afile);
    if (
      group.startsWith(".") ||
      group.startsWith(_sep) ||
      existsSync(resolve(afile)) ||
      existsSync(resolve(src, afile))
    ) {
      group = "";
    }
    const version = "";
    // We need to resolve the name to an os package here
    const name = fileName.replace(extn, "");
    let apkg = getOSPackageForFile(afile, osPkgsList) ||
      epkgMap[`${group}/${name}`] || {
        name,
        group,
        version: "",
        type: pkgType,
      };
    // If this is a relative file, there is a good chance we can reuse the project group
    if (!afile.startsWith(_sep) && !group.length) {
      group = options.projectGroup || "";
    }
    if (!apkg.purl) {
      apkg.purl = new PackageURL(
        pkgType,
        group,
        name,
        version,
        null,
        afile,
      ).toString();
      apkg.evidence = {
        identity: {
          field: "purl",
          confidence: 0,
          methods: [
            {
              technique: "source-code-analysis",
              confidence: 0,
              value: `Filename ${afile}`,
            },
          ],
        },
      };
      apkg["bom-ref"] = decodeURIComponent(apkg["purl"]);
    }
    if (usageData[afile]) {
      const usymbols = Array.from(usageData[afile])
        .filter(
          (v) =>
            !v.startsWith("<") &&
            !v.startsWith("__") &&
            v !== "main" &&
            !v.includes("anonymous_") &&
            !v.includes(afile),
        )
        .sort();
      if (!apkg["properties"] && usymbols.length) {
        apkg["properties"] = [
          { name: "ImportedSymbols", value: usymbols.join(", ") },
        ];
      } else {
        apkg["properties"] = [];
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
      if (!symbolsPropertyFound && usymbols.length) {
        apkg["properties"].push({
          name: "ImportedSymbols",
          value: usymbols.join(", "),
        });
      }
      apkg["properties"] = newProps;
    }
    // At this point, we have a package but we don't know what it's called
    // So let's try to locate this generic package using some heuristics
    apkg = locateGenericPackage(apkg);
    if (!pkgAddedMap[name]) {
      pkgList.push(apkg);
      dependsOn.push(apkg["bom-ref"]);
      pkgAddedMap[name] = true;
    }
  }
  const dependenciesList =
    dependsOn.length && parentComponent
      ? [
          {
            ref: parentComponent["bom-ref"],
            dependsOn,
          },
        ]
      : [];
  return {
    parentComponent,
    pkgList: pkgList.sort((a, b) => a.purl.localeCompare(b.purl)),
    dependenciesList,
  };
}

/**
 * NOT IMPLEMENTED YET.
 * A future method to locate a generic package given some name and properties
 *
 * @param {object} apkg Package to locate
 * @returns Located project with precise purl or the original unmodified input.
 */
export function locateGenericPackage(apkg) {
  return apkg;
}

export function parseCUsageSlice(sliceData) {
  if (!sliceData) {
    return undefined;
  }
  const usageData = {};
  try {
    const objectSlices = sliceData.objectSlices || [];
    for (const slice of objectSlices) {
      if (
        (!slice.fileName && !slice.code.startsWith("#include")) ||
        slice.fileName.startsWith("<includes") ||
        slice.fileName.startsWith("<global") ||
        slice.fileName.includes("__")
      ) {
        continue;
      }
      const slFileName = slice.fileName;
      const allLines = usageData[slFileName] || new Set();
      if (slice.fullName && slice.fullName.length > 3) {
        if (slice.code?.startsWith("#include")) {
          usageData[slice.fullName] = new Set();
        } else {
          allLines.add(slice.fullName);
        }
      }
      for (const ausage of slice.usages) {
        let calls = ausage?.invokedCalls || [];
        calls = calls.concat(ausage?.argToCalls || []);
        for (const acall of calls) {
          if (!acall.resolvedMethod.includes("->")) {
            allLines.add(acall.resolvedMethod);
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
}

async function getNugetUrl() {
  const req = "https://api.nuget.org/v3/index.json";
  const res = await cdxgenAgent.get(req, {
    responseType: "json",
  });
  const urls = res.body.resources;
  for (const resource of urls) {
    if (resource["@type"] === "RegistrationsBaseUrl/3.6.0") {
      return resource["@id"];
    }
  }
  return "https://api.nuget.org/v3/registration3/";
}

async function queryNuget(p, NUGET_URL) {
  function setLatestVersion(upper) {
    // Handle special case for versions with more than 3 parts
    if (upper.split(".").length > 3) {
      const tmpVersionArray = upper.split("-")[0].split(".");
      // Compromise for versions such as 1.2.3.0-alpha
      // How to find latest proper release version?
      if (
        upper.split("-").length > 1 &&
        Number(tmpVersionArray.slice(-1)) === 0
      ) {
        return upper;
      }
      if (upper.split("-").length > 1) {
        tmpVersionArray[tmpVersionArray.length - 1] = (
          Number(tmpVersionArray.slice(-1)) - 1
        ).toString();
      }
      return tmpVersionArray.join(".");
    }
    const tmpVersion = parse(upper);
    let version = `${tmpVersion.major}.${tmpVersion.minor}.${tmpVersion.patch}`;
    if (compare(version, upper) === 1) {
      if (tmpVersion.patch > 0) {
        version = `${tmpVersion.major}.${tmpVersion.minor}.${(
          tmpVersion.patch - 1
        ).toString()}`;
      }
    }
    return version;
  }
  // Coerce only when missing patch/minor version
  function coerceUp(version) {
    return version.split(".").length < 3 ? coerce(version).version : version;
  }
  if (DEBUG_MODE) {
    console.log(`Querying nuget for ${p.name}`);
  }
  const np = JSON.parse(JSON.stringify(p));
  const body = [];
  const newBody = [];
  let res = await cdxgenAgent.get(
    `${NUGET_URL + np.name.toLowerCase()}/index.json`,
    { responseType: "json" },
  );
  const items = res.body.items;
  if (!items || !items[0]) {
    return [np, newBody, body];
  }
  if (items[0] && !items[0].items) {
    if (!p.version || p.version === "0.0.0" || p.version === "latest") {
      const upper = items[items.length - 1].upper;
      np.version = setLatestVersion(upper);
    }
    for (const item of items) {
      if (np.version) {
        const lower = compare(coerce(item.lower), coerce(np.version));
        const upper = compare(coerce(item.upper), coerce(np.version));
        if (lower !== 1 && upper !== -1) {
          res = await cdxgenAgent.get(item["@id"], { responseType: "json" });
          for (const i of res.body.items.reverse()) {
            if (
              i.catalogEntry &&
              i.catalogEntry.version === coerceUp(np.version)
            ) {
              newBody.push(i);
              return [np, newBody];
            }
          }
        }
      }
    }
  } else {
    if (!p.version || p.version === "0.0.0" || p.version === "latest") {
      const upper = items[items.length - 1].upper;
      np.version = setLatestVersion(upper);
    }
    if (np.version) {
      for (const item of items) {
        const lower = compare(coerce(item.lower), coerce(np.version));
        const upper = compare(coerce(item.upper), coerce(np.version));
        if (lower !== 1 && upper !== -1) {
          for (const i of item.items.reverse()) {
            if (
              i.catalogEntry &&
              i.catalogEntry.version === coerceUp(np.version)
            ) {
              newBody.push(i);
              return [np, newBody];
            }
          }
        }
      }
    }
  }
  return [np, newBody];
}

/**
 * Method to retrieve metadata for nuget packages
 *
 * @param {Array} pkgList Package list
 */
export async function getNugetMetadata(pkgList, dependencies = undefined) {
  const NUGET_URL = await getNugetUrl();
  const cdepList = [];
  const depRepList = {};
  for (const p of pkgList) {
    let cacheKey = undefined;
    try {
      // If there is a version, we can safely use the cache to retrieve the license
      // See: https://github.com/CycloneDX/cdxgen/issues/352
      cacheKey = `${p.name}|${p.version}`;
      let body = metadata_cache[cacheKey];

      if (body?.error) {
        cdepList.push(p);
        continue;
      }
      if (!body) {
        let newBody = {};
        let np = {};
        [np, newBody] = await queryNuget(p, NUGET_URL);
        if (p.version !== np.version) {
          const oldRef = p["bom-ref"];
          p["bom-ref"] = decodeURIComponent(
            new PackageURL(
              "nuget",
              "",
              np.name,
              np.version,
              null,
              null,
            ).toString(),
          );
          depRepList[oldRef] = p["bom-ref"];
          p.version = np.version;
        }
        if (newBody && newBody.length > 0) {
          body = newBody[0];
        }
        if (body) {
          metadata_cache[cacheKey] = body;
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
            if (
              typeof p.license === "string" &&
              p.license.includes("://github.com/")
            ) {
              p.license =
                (await getRepoLicense(p.license, undefined)) || p.license;
            }
          }
          if (body.catalogEntry.projectUrl) {
            p.repository = { url: body.catalogEntry.projectUrl };
            p.homepage = {
              url: `https://www.nuget.org/packages/${p.name}/${p.version}/`,
            };
            if (
              (!p.license || typeof p.license === "string") &&
              typeof p.repository.url === "string" &&
              p.repository.url.includes("://github.com/")
            ) {
              // license couldn't be properly identified and is still a url,
              // therefore trying to resolve license via repository
              p.license =
                (await getRepoLicense(p.repository.url, undefined)) ||
                p.license;
            }
          }
          cdepList.push(p);
        }
      }
    } catch (err) {
      if (cacheKey) {
        metadata_cache[cacheKey] = { error: err.code };
      }
      cdepList.push(p);
    }
  }
  const newDependencies = [].concat(dependencies);
  if (depRepList && newDependencies.length) {
    const changed = Object.keys(depRepList);
    // if (!parentComponent.version || parentComponent.version === "latest" || parentComponent.version === "0.0.0"){
    //   if (changed.includes(parentComponent["bom-ref"])) {
    //     parentComponent["bom-ref"] = depRepList[parentComponent["bom-ref"]["ref"]];
    //   }
    // }
    for (const d of newDependencies) {
      if (changed.length > 0 && changed.includes(d["ref"])) {
        d["ref"] = depRepList[d["ref"]];
      }
      for (const dd in d["dependsOn"]) {
        if (changed.includes(d["dependsOn"][dd])) {
          const replace = d["dependsOn"][dd];
          d["dependsOn"][dd] = depRepList[replace];
        }
      }
    }
  }
  return {
    pkgList: cdepList,
    dependencies: newDependencies,
  };
}

export function addEvidenceForDotnet(pkgList, slicesFile) {
  // We need two datastructures.
  // dll to purl mapping from the pkgList
  // purl to occurrences list using the slicesFile
  if (!slicesFile || !existsSync(slicesFile)) {
    return pkgList;
  }
  const pkgFilePurlMap = {};
  const purlLocationMap = {};
  const purlModulesMap = {};
  const purlMethodsMap = {};
  for (const apkg of pkgList) {
    if (apkg.properties && Array.isArray(apkg.properties)) {
      apkg.properties
        .filter((p) => p.name === "PackageFiles")
        .forEach((aprop) => {
          if (aprop.value) {
            const tmpA = aprop.value.split(", ");
            if (tmpA?.length) {
              tmpA.forEach((dllFile) => {
                pkgFilePurlMap[dllFile] = apkg.purl;
              });
            }
          }
        });
    }
  }
  const slicesData = JSON.parse(readFileSync(slicesFile, "utf-8"));
  if (slicesData && Object.keys(slicesData)) {
    if (slicesData.Dependencies) {
      for (const adep of slicesData.Dependencies) {
        if (adep.Module?.endsWith(".dll") && pkgFilePurlMap[adep.Module]) {
          const modPurl = pkgFilePurlMap[adep.Module];
          if (!purlLocationMap[modPurl]) {
            purlLocationMap[modPurl] = new Set();
          }
          purlLocationMap[modPurl].add(`${adep.Path}#${adep.LineNumber}`);
        }
      }
    }
    if (slicesData.MethodCalls) {
      for (const amethodCall of slicesData.MethodCalls) {
        if (
          amethodCall.Module?.endsWith(".dll") &&
          pkgFilePurlMap[amethodCall.Module]
        ) {
          const modPurl = pkgFilePurlMap[amethodCall.Module];
          if (!purlLocationMap[modPurl]) {
            purlLocationMap[modPurl] = new Set();
          }
          if (!purlModulesMap[modPurl]) {
            purlModulesMap[modPurl] = new Set();
          }
          if (!purlMethodsMap[modPurl]) {
            purlMethodsMap[modPurl] = new Set();
          }
          purlLocationMap[modPurl].add(
            `${amethodCall.Path}#${amethodCall.LineNumber}`,
          );
          purlModulesMap[modPurl].add(amethodCall.ClassName);
          purlMethodsMap[modPurl].add(amethodCall.CalledMethod);
        }
      }
    }
  }
  if (Object.keys(purlLocationMap).length) {
    for (const apkg of pkgList) {
      if (purlLocationMap[apkg.purl]) {
        const locationOccurrences = Array.from(
          purlLocationMap[apkg.purl],
        ).sort();
        // Add the occurrences evidence
        apkg.evidence.occurrences = locationOccurrences.map((l) => ({
          location: l,
        }));
      }
      // Add the imported modules to properties
      if (purlModulesMap[apkg.purl]) {
        apkg.properties.push({
          name: "ImportedModules",
          value: Array.from(purlModulesMap[apkg.purl]).sort().join(", "),
        });
      }
      // Add the called methods to properties
      if (purlMethodsMap[apkg.purl]) {
        apkg.properties.push({
          name: "CalledMethods",
          value: Array.from(purlMethodsMap[apkg.purl]).sort().join(", "),
        });
      }
    }
  }
  return pkgList;
}
