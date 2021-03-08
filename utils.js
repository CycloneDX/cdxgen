const glob = require("glob");
const os = require("os");
const path = require("path");
const fs = require("fs");
const got = require("got");
const convert = require("xml-js");
const licenseMapping = require("./license-mapping.json");
const vendorAliases = require("./vendor-alias.json");
const spdxLicenses = require("./spdx-licenses.json");
const knownLicenses = require("./known-licenses.json");
const cheerio = require("cheerio");
const yaml = require("js-yaml");
const { spawnSync } = require("child_process");
const propertiesReader = require("properties-reader");
const semver = require("semver");

// Debug mode flag
const DEBUG_MODE =
  process.env.SCAN_DEBUG_MODE === "debug" ||
  process.env.SHIFTLEFT_LOGGING_LEVEL === "debug";

// Metadata cache
let metadata_cache = {};

const MAX_LICENSE_ID_LENGTH = 100;

/**
 * Method to get files matching a pattern
 *
 * @param {string} dirPath Root directory for search
 * @param {string} pattern Glob pattern (eg: *.gradle)
 */
const getAllFiles = function (dirPath, pattern) {
  return glob.sync(pattern, { cwd: dirPath, silent: true, absolute: true });
};
exports.getAllFiles = getAllFiles;

const toBase64 = (hexString) => {
  return Buffer.from(hexString, "hex").toString("base64");
};

/**
 * Performs a lookup + validation of the license specified in the
 * package. If the license is a valid SPDX license ID, set the 'id'
 * and url of the license object, otherwise, set the 'name' of the license
 * object.
 */
function getLicenses(pkg, format = "xml") {
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
            licenseContent.url = l;
            if (!l.includes("opensource.org")) {
              licenseContent.name = "CUSTOM";
            }
          } else {
            licenseContent.name = l;
          }
        } else if (Object.keys(l).length) {
          licenseContent = l;
        } else {
          return null;
        }
        if (!licenseContent.id) {
          addLicenseText(pkg, l, licenseContent, format);
        }
        return licenseContent;
      })
      .map((l) => ({ license: l }));
  }
  return null;
}
exports.getLicenses = getLicenses;

/**
 * Tries to find a file containing the license text based on commonly
 * used naming and content types. If a candidate file is found, add
 * the text to the license text object and stop.
 */
function addLicenseText(pkg, l, licenseContent, format = "xml") {
  let licenseFilenames = [
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
  let licenseContentTypes = {
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
        licenseContentTypes
      )) {
        let licenseFilepath = `${pkg.realPath}/${licenseFilename}${licenseName}${fileExtension}`;
        if (fs.existsSync(licenseFilepath)) {
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
function readLicenseText(licenseFilepath, licenseContentType, format = "xml") {
  let licenseText = fs.readFileSync(licenseFilepath, "utf8");
  if (licenseText) {
    if (format === "xml") {
      let licenseContentText = { "#cdata": licenseText };
      if (licenseContentType !== "text/plain") {
        licenseContentText["@content-type"] = licenseContentType;
      }
      return licenseContentText;
    } else {
      let licenseContentText = { content: licenseText };
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
const getNpmMetadata = async function (pkgList) {
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
        const res = await got.get(NPM_URL + key, {
          responseType: "json",
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
      console.error(err, p);
    }
  }
  return cdepList;
};
exports.getNpmMetadata = getNpmMetadata;

const _getDepPkgList = async function (pkgList, pkg) {
  if (pkg && pkg.dependencies) {
    const pkgKeys = Object.keys(pkg.dependencies);
    for (var k in pkgKeys) {
      const name = pkgKeys[k];
      pkgList.push({
        name: name,
        version: pkg.dependencies[name].version,
        _integrity: pkg.dependencies[name].integrity,
      });
      // Include child dependencies
      if (pkg.dependencies[name].dependencies) {
        await _getDepPkgList(pkgList, pkg.dependencies[name]);
      }
    }
  }
  if (process.env.FETCH_LICENSE) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch license information for ${pkgList.length} packages`
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
 */
const parsePkgLock = async function (pkgLockFile) {
  const pkgList = [];
  if (fs.existsSync(pkgLockFile)) {
    lockData = JSON.parse(fs.readFileSync(pkgLockFile, "utf8"));
    return await _getDepPkgList(pkgList, lockData);
  }
  return pkgList;
};
exports.parsePkgLock = parsePkgLock;

/**
 * Parse nodejs yarn lock file
 *
 * @param {string} yarnLockFile yarn.lock file
 */
const parseYarnLock = async function (yarnLockFile) {
  const pkgList = [];
  if (fs.existsSync(yarnLockFile)) {
    const lockData = fs.readFileSync(yarnLockFile, "utf8");
    let name = "";
    let group = "";
    let version = "";
    let integrity = "";
    lockData.split("\n").forEach((l) => {
      if (l === "\n" || l.startsWith("dependencies") || l.startsWith("    ")) {
        return;
      }
      if (!l.startsWith(" ")) {
        const tmpA = l.split("@");
        if (tmpA.length == 2) {
          const fullName = tmpA[0];
          if (fullName.indexOf("/") > -1) {
            const parts = fullName.split("/");
            group = parts[0];
            name = parts[1];
          } else {
            name = fullName;
          }
        }
      } else {
        l = l.trim();
        const parts = l.split(" ");
        if (l.includes("version")) {
          version = parts[1].replace(/"/g, "");
        }
        if (l.includes("resolved")) {
          const tmpB = parts[1].split("#");
          if (tmpB.length > 1) {
            const digest = tmpB[1].replace(/"/g, "");
            integrity = "sha256-" + digest;
          }
        }
      }
      if (name !== "" && version !== "" && integrity != "") {
        pkgList.push({
          group: group,
          name: name,
          version: version,
          _integrity: integrity,
        });
        group = "";
        name = "";
        version = "";
        integrity = "";
      }
    });
  }
  return pkgList;
};
exports.parseYarnLock = parseYarnLock;

/**
 * Parse nodejs shrinkwrap deps file
 *
 * @param {string} swFile shrinkwrap-deps.json file
 */
const parseNodeShrinkwrap = async function (swFile) {
  const pkgList = [];
  if (fs.existsSync(swFile)) {
    lockData = JSON.parse(fs.readFileSync(swFile, "utf8"));
    const pkgKeys = Object.keys(lockData);
    for (var k in pkgKeys) {
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
            let gnameparts = parts[1].split("/");
            group = gnameparts[0];
            name = gnameparts[1];
          } else {
            name = parts[0];
          }
          version = parts[2];
        }
        if (group !== "@types") {
          pkgList.push({
            group: group,
            name: name,
            version: version,
            _integrity: integrity,
          });
        }
      }
    }
  }
  return pkgList;
};
exports.parseNodeShrinkwrap = parseNodeShrinkwrap;

/**
 * Parse nodejs pnpm lock file
 *
 * @param {string} pnpmLock pnpm-lock.yaml file
 */
const parsePnpmLock = async function (pnpmLock) {
  const pkgList = [];
  if (fs.existsSync(pnpmLock)) {
    const lockData = fs.readFileSync(pnpmLock, "utf8");
    const yamlObj = yaml.safeLoad(lockData);
    const packages = yamlObj.packages;
    const pkgKeys = Object.keys(packages);
    for (var k in pkgKeys) {
      // Eg: @babel/code-frame/7.10.1
      const fullName = pkgKeys[k].replace("/@", "@");
      const parts = fullName.split("/");
      const integrity = packages[pkgKeys[k]].resolution.integrity;
      if (parts && parts.length) {
        let name = "";
        let version = "";
        let group = "";
        if (parts.length === 2) {
          name = parts[0];
          version = parts[1];
        } else if (parts.length === 3) {
          group = parts[0];
          name = parts[1];
          version = parts[2];
        }
        if (group !== "@types" && name.indexOf("file:") !== 0) {
          pkgList.push({
            group: group,
            name: name,
            version: version,
            _integrity: integrity,
          });
        }
      }
    }
  }
  return pkgList;
};
exports.parsePnpmLock = parsePnpmLock;

/**
 * Parse pom file
 *
 * @param {string} pom file to parse
 */
const parsePom = function (pomFile) {
  const deps = [];
  const xmlData = fs.readFileSync(pomFile);
  const project = convert.xml2js(xmlData, {
    compact: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value",
  }).project;
  if (project && project.dependencies) {
    const dependencies = project.dependencies.dependency;
    for (var i in dependencies) {
      const adep = dependencies[i];
      const version = adep.version;
      let versionStr = undefined;
      if (version && version._ && version._.indexOf("$") == -1) {
        versionStr = version._;
        deps.push({
          group: adep.groupId ? adep.groupId._ : "",
          name: adep.artifactId ? adep.artifactId._ : "",
          version: versionStr,
          qualifiers: { type: "jar" },
        });
      }
    }
  }
  return deps;
};
exports.parsePom = parsePom;

/**
 * Parse gradle dependencies output
 * @param {string} rawOutput Raw string output
 */
const parseGradleDep = function (rawOutput) {
  if (typeof rawOutput === "string") {
    const deps = [];
    const keys_cache = {};
    const tmpA = rawOutput.split("\n");
    tmpA.forEach((l) => {
      if (l.indexOf("--- ") >= 0) {
        l = l.substr(l.indexOf("--- ") + 4, l.length).trim();
        l = l.replace(" (*)", "");
        const verArr = l.split(":");
        if (verArr && verArr.length === 3) {
          let versionStr = verArr[2];
          if (versionStr.indexOf("->") >= 0) {
            versionStr = versionStr
              .substr(versionStr.indexOf("->") + 3, versionStr.length)
              .trim();
          }
          versionStr = versionStr.split(" ")[0];
          const key = verArr[0] + "-" + verArr[1] + "-" + versionStr;
          // Filter duplicates
          if (!keys_cache[key]) {
            keys_cache[key] = key;
            deps.push({
              group: verArr[0],
              name: verArr[1],
              version: versionStr,
              qualifiers: { type: "jar" },
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
 * Parse dependencies in Key:Value format
 */
exports.parseGradleDep = parseGradleDep;

const parseKVDep = function (rawOutput) {
  if (typeof rawOutput === "string") {
    const deps = [];
    rawOutput.split("\n").forEach((l) => {
      const tmpA = l.split(":");
      if (tmpA.length === 3) {
        deps.push({
          group: tmpA[0],
          name: tmpA[1],
          version: tmpA[2],
          qualifiers: { type: "jar" },
        });
      } else if (tmpA.length === 2) {
        deps.push({
          group: "",
          name: tmpA[0],
          version: tmpA[1],
          qualifiers: { type: "jar" },
        });
      }
    });
    return deps;
  }
  return [];
};
exports.parseKVDep = parseKVDep;

/**
 * Method to find the spdx license id from name
 *
 * @param {string} name License full name
 */
const findLicenseId = function (name) {
  for (let i in licenseMapping) {
    const l = licenseMapping[i];
    if (l.names.includes(name)) {
      return l.exp;
    }
  }
  return name && (name.includes("\n") || name.length > MAX_LICENSE_ID_LENGTH)
    ? guessLicenseId(name)
    : name;
};
exports.findLicenseId = findLicenseId;

/**
 * Method to guess the spdx license id from license contents
 *
 * @param {string} name License file contents
 */
const guessLicenseId = function (content) {
  content = content.replace(/\n/g, " ");
  for (let i in licenseMapping) {
    const l = licenseMapping[i];
    for (let j in l.names) {
      if (content.toUpperCase().indexOf(l.names[j].toUpperCase()) > -1) {
        return l.exp;
      }
    }
  }
  return undefined;
};
exports.guessLicenseId = guessLicenseId;

/**
 * Method to retrieve metadata for maven packages by querying maven central
 *
 * @param {Array} pkgList Package list
 */
const getMvnMetadata = async function (pkgList) {
  const MAVEN_CENTRAL_URL = "https://repo1.maven.org/maven2/";
  const ANDROID_MAVEN = "https://maven.google.com/";
  const JCENTER_MAVEN = "https://jcenter.bintray.com/";
  const cdepList = [];
  for (const p of pkgList) {
    // If the package already has key metadata skip querying maven
    if (
      p.group &&
      p.name &&
      p.version &&
      p.description &&
      !process.env.FETCH_LICENSE
    ) {
      cdepList.push(p);
      continue;
    }
    let urlPrefix = MAVEN_CENTRAL_URL;
    // Ideally we should try one resolver after the other. But it increases the time taken
    if (p.group.indexOf("android") !== -1) {
      urlPrefix = ANDROID_MAVEN;
    } else if (
      p.group.indexOf("jetbrains") !== -1 ||
      p.group.indexOf("airbnb") !== -1
    ) {
      urlPrefix = JCENTER_MAVEN;
    }
    let groupPart = p.group.replace(/\./g, "/");
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
      const res = await got.get(fullUrl);
      const bodyJson = convert.xml2js(res.body, {
        compact: true,
        spaces: 4,
        textKey: "_",
        attributesKey: "$",
        commentKey: "value",
      }).project;
      if (bodyJson && bodyJson.licenses && bodyJson.licenses.license) {
        if (Array.isArray(bodyJson.licenses.license)) {
          p.license = bodyJson.licenses.license.map((l) => {
            return findLicenseId(l.name._);
          });
        } else if (Object.keys(bodyJson.licenses.license).length) {
          l = bodyJson.licenses.license;
          p.license = [findLicenseId(l.name._)];
        } else {
        }
      }
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
exports.getMvnMetadata = getMvnMetadata;

/**
 * Method to retrieve metadata for python packages by querying pypi
 *
 * @param {Array} pkgList Package list
 */
const getPyMetadata = async function (pkgList) {
  const PYPI_URL = "https://pypi.org/pypi/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      if (p.name.includes("https")) {
        cdepList.push(p);
        continue;
      }
      // Some packages support extra modules
      if (p.name.includes("[")) {
        p.name = p.name.split("[")[0];
      }
      const res = await got.get(PYPI_URL + p.name + "/json", {
        responseType: "json",
      });
      const body = res.body;
      p.description = body.info.summary;
      p.license = findLicenseId(body.info.license);
      if (body.info.home_page.indexOf("git") > -1) {
        p.repository = { url: body.info.home_page };
      } else {
        p.homepage = { url: body.info.home_page };
      }
      // Use the latest version if none specified
      if (
        !p.version ||
        p.version.includes("*") ||
        p.version.includes("<") ||
        p.version.includes(">")
      ) {
        p.version = body.info.version;
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
      cdepList.push(p);
      console.error(err);
    }
  }
  return cdepList;
};
exports.getPyMetadata = getPyMetadata;

/**
 * Method to parse pipfile.lock data
 *
 * @param {Object} lockData JSON data from Pipfile.lock
 */
const parsePiplockData = async function (lockData) {
  const pkgList = [];
  Object.keys(lockData)
    .filter((i) => i !== "_meta")
    .forEach((k) => {
      const depBlock = lockData[k];
      Object.keys(depBlock).forEach((p) => {
        const pkg = depBlock[p];
        let versionStr = pkg.version.replace("==", "");
        pkgList.push({ name: p, version: versionStr });
      });
    });
  return await getPyMetadata(pkgList);
};
exports.parsePiplockData = parsePiplockData;

/**
 * Method to parse poetry.lock data
 *
 * @param {Object} lockData JSON data from poetry.lock
 */
const parsePoetrylockData = async function (lockData) {
  const pkgList = [];
  let pkg = null;
  if (!lockData) {
    return pkgList;
  }
  lockData.split("\n").forEach((l) => {
    let key = null;
    let value = null;
    // Package section starts with this marker
    if (l.indexOf("[[package]]") > -1) {
      if (pkg && pkg.name && pkg.version) {
        pkgList.push(pkg);
      }
      pkg = {};
    }
    if (l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/\"/g, "");
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
      }
    }
  });
  return await getPyMetadata(pkgList);
};
exports.parsePoetrylockData = parsePoetrylockData;

/**
 * Method to parse requirements.txt data
 *
 * @param {Object} reqData Requirements.txt data
 */
const parseReqFile = async function (reqData) {
  const pkgList = [];
  reqData.split("\n").forEach((l) => {
    if (!l.startsWith("#")) {
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
        pkgList.push({
          name: tmpA[0].trim(),
          version: versionStr,
        });
      } else if (/[>|\[|@]/.test(l)) {
        let tmpA = l.split(/(>|\[|@)/);
        if (tmpA.includes("#")) {
          tmpA = tmpA.split("#")[0];
        }
        pkgList.push({
          name: tmpA[0].trim(),
          version: null,
        });
      } else if (l) {
        if (l.includes("#")) {
          l = l.split("#")[0];
        }
        pkgList.push({
          name: l.trim(),
          version: null,
        });
      }
    }
  });
  return await getPyMetadata(pkgList);
};
exports.parseReqFile = parseReqFile;

/**
 * Method to parse setup.py data
 *
 * @param {Object} setupPyData Contents of setup.py
 */
const parseSetupPyFile = async function (setupPyData) {
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
      let tmpA = l.replace(/['\"]/g, "").split(",");
      tmpA = tmpA.filter((v) => v.length);
      lines = lines.concat(tmpA);
    }
  });
  return await parseReqFile(lines.join("\n"));
};
exports.parseSetupPyFile = parseSetupPyFile;

/**
 * Method to construct a github url for the given repo
 * @param {Object} repoMetadata Repo metadata with group and name
 */
const toGitHubUrl = function (repoMetadata) {
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
exports.toGitHubUrl = toGitHubUrl;

/**
 * Method to retrieve repo license by querying github api
 *
 * @param {String} repoUrl Repository url
 * @param {Object} repoMetadata Object containing group and package name strings
 * @return {String} SPDX license id
 */
const getRepoLicense = async function (repoUrl, repoMetadata) {
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
      const res = await got.get(apiUrl, {
        responseType: "json",
        headers: headers,
      });
      if (res && res.body) {
        const license = res.body.license;
        let licenseId = license.spdx_id;
        const licObj = {
          url: res.body.html_url,
        };
        if (license.spdx_id === "NOASSERTION") {
          if (res.body.content) {
            content = Buffer.from(res.body.content, "base64").toString("ascii");
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
      for (let i in knownLicenses) {
        const akLic = knownLicenses[i];
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
exports.getRepoLicense = getRepoLicense;

/**
 * Method to get go pkg license from go.dev site.
 *
 * @param {Object} repoMetadata Repo metadata
 */
const getGoPkgLicense = async function (repoMetadata) {
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
    const res = await got.get(pkgUrlPrefix);
    if (res && res.body) {
      const $ = cheerio.load(res.body);
      let licenses = $("#LICENSE > h2").text();
      if (licenses === "") {
        licenses = $("section.License > h2").text();
      }
      licenseIds = licenses.split(", ");
      const licList = [];
      for (var i in licenseIds) {
        const alicense = {
          id: licenseIds[i],
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
exports.getGoPkgLicense = getGoPkgLicense;

const getGoPkgComponent = async function (group, name, version, hash) {
  let pkg = {};
  let license = undefined;
  if (process.env.FETCH_LICENSE) {
    if (DEBUG_MODE) {
      console.log(
        `About to fetch go package license information for ${group}:${name}`
      );
    }
    license = await getGoPkgLicense({
      group: group,
      name: name,
    });
  }
  pkg = {
    group: group,
    name: name,
    version: version,
    _integrity: hash,
    license: license,
  };
  return pkg;
};
exports.getGoPkgComponent = getGoPkgComponent;

const parseGoModData = async function (goModData, gosumMap) {
  const pkgComponentsList = [];
  let isModReplacement = false;

  if (!goModData) {
    return pkgComponentsList;
  }

  const pkgs = goModData.split("\n");
  for (let i in pkgs) {
    let l = pkgs[i];

    // Skip go.mod file headers, whitespace, and/or comments
    if (
      l.includes("module ") ||
      l.includes("go ") ||
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
      let group = path.dirname(tmpA[0]);
      const name = path.basename(tmpA[0]);
      if (group === ".") {
        group = name;
      }
      const version = tmpA[1];
      gosumHash = gosumMap[`${group}/${name}/${version}`];
      // The hash for this version was not found in go.sum, so skip as it is most likely being replaced.
      if (gosumHash === undefined) {
        continue;
      }
      let component = await getGoPkgComponent(group, name, version, gosumHash);
      pkgComponentsList.push(component);
    } else {
      // Add group, name and version component properties for replacement modules
      let group = path.dirname(tmpA[2]);
      const name = path.basename(tmpA[2]);
      if (group === ".") {
        group = name;
      }
      const version = tmpA[3];

      gosumHash = gosumMap[`${group}/${name}/${version}`];
      // The hash for this version was not found in go.sum, so skip.
      if (gosumHash === undefined) {
        continue;
      }
      let component = await getGoPkgComponent(group, name, version, gosumHash);
      pkgComponentsList.push(component);
    }
  }
  // Clear the cache
  metadata_cache = {};
  return pkgComponentsList;
};
exports.parseGoModData = parseGoModData;

const parseGosumData = async function (gosumData) {
  const pkgList = [];
  if (!gosumData) {
    return pkgList;
  }
  const pkgs = gosumData.split("\n");
  for (let i in pkgs) {
    const l = pkgs[i];
    // look for lines containing go.mod
    if (l.indexOf("go.mod") > -1) {
      const tmpA = l.split(" ");
      let group = path.dirname(tmpA[0]);
      const name = path.basename(tmpA[0]);
      if (group === ".") {
        group = name;
      }
      const version = tmpA[1].replace("/go.mod", "");
      const hash = tmpA[tmpA.length - 1].replace("h1:", "sha256-");
      let license = undefined;
      if (process.env.FETCH_LICENSE) {
        if (DEBUG_MODE) {
          console.log(
            `About to fetch go package license information for ${group}:${name}`
          );
        }
        license = await getGoPkgLicense({
          group: group,
          name: name,
        });
      }
      pkgList.push({
        group: group,
        name: name,
        version: version,
        _integrity: hash,
        license: license,
      });
    }
  }
  return pkgList;
};
exports.parseGosumData = parseGosumData;

const parseGopkgData = async function (gopkgData) {
  const pkgList = [];
  if (!gopkgData) {
    return pkgList;
  }
  let pkg = null;
  const pkgs = gopkgData.split("\n");
  for (let i in pkgs) {
    const l = pkgs[i];
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
      value = tmpA[1].trim().replace(/\"/g, "");
      switch (key) {
        case "digest":
          const digest = value.replace("1:", "");
          pkg._integrity = "sha256-" + toBase64(digest);
          break;
        case "name":
          pkg.group = path.dirname(value);
          pkg.name = path.basename(value);
          if (pkg.group === ".") {
            pkg.group = pkg.name;
          }
          pkg.license = await getGoPkgLicense({
            group: pkg.group,
            name: pkg.name,
          });
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
exports.parseGopkgData = parseGopkgData;

/**
 * Method to query rubygems api for gems details
 *
 * @param {*} pkgList List of packages with metadata
 */
const getRubyGemsMetadata = async function (pkgList) {
  const RUBYGEMS_URL = "https://rubygems.org/api/v1/versions/";
  const rdepList = [];
  for (const p of pkgList) {
    try {
      if (DEBUG_MODE) {
        console.log(`Querying rubygems.org for ${p.name}`);
      }
      const res = await got.get(RUBYGEMS_URL + p.name + ".json", {
        responseType: "json",
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
      console.error(err);
    }
  }
  return rdepList;
};
exports.getRubyGemsMetadata = getRubyGemsMetadata;

/**
 * Method to parse Gemfile.lock
 *
 * @param {*} gemLockData Gemfile.lock data
 */
const parseGemfileLockData = async function (gemLockData) {
  const pkgList = [];
  const pkgnames = {};
  if (!gemLockData) {
    return pkgList;
  }
  let specsFound = false;
  gemLockData.split("\n").forEach((l) => {
    l = l.trim();
    if (specsFound) {
      const tmpA = l.split(" ");
      if (tmpA && tmpA.length == 2) {
        const name = tmpA[0];
        if (!pkgnames[name]) {
          let version = tmpA[1].split(", ")[0];
          version = version.replace(/[\(>=<\)~ ]/g, "");
          pkgList.push({
            name,
            version,
          });
          pkgnames[name] = true;
        }
      }
    } else {
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
  return await getRubyGemsMetadata(pkgList);
};
exports.parseGemfileLockData = parseGemfileLockData;

/**
 * Method to retrieve metadata for rust packages by querying crates
 *
 * @param {Array} pkgList Package list
 */
const getCratesMetadata = async function (pkgList) {
  const CRATES_URL = "https://crates.io/api/v1/crates/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      if (DEBUG_MODE) {
        console.log(`Querying crates.io for ${p.name}`);
      }
      const res = await got.get(CRATES_URL + p.name, { responseType: "json" });
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
exports.getCratesMetadata = getCratesMetadata;

const parseCargoData = async function (cargoData) {
  const pkgList = [];
  if (!cargoData) {
    return pkgList;
  }
  let pkg = null;
  cargoData.split("\n").forEach((l) => {
    let key = null;
    let value = null;
    if (l.indexOf("[[package]]") > -1) {
      if (pkg) {
        pkgList.push(pkg);
      }
      pkg = {};
    }
    if (l.indexOf("=") > -1) {
      const tmpA = l.split("=");
      key = tmpA[0].trim();
      value = tmpA[1].trim().replace(/\"/g, "");
      switch (key) {
        case "checksum":
          pkg._integrity = "sha384-" + value;
          break;
        case "name":
          pkg.group = path.dirname(value);
          if (pkg.group === ".") {
            pkg.group = "";
          }
          pkg.name = path.basename(value);
          break;
        case "version":
          pkg.version = value;
          break;
      }
    }
  });
  return await getCratesMetadata(pkgList);
};
exports.parseCargoData = parseCargoData;

const parseCsPkgData = async function (pkgData) {
  const pkgList = [];
  let pkg = null;
  if (!pkgData) {
    return pkgList;
  }
  let packages = convert.xml2js(pkgData, {
    compact: true,
    alwaysArray: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value",
  }).packages;
  if (packages.length == 0) {
    return pkgList;
  }
  packages = packages[0].package;
  for (let i in packages) {
    const p = packages[i].$;
    let pkg = {};
    const pname = p.id.replace(/\./g, "/");
    pkg.group = path.dirname(pname).replace(/\//g, ".");
    if (pkg.group == ".") {
      pkg.group = "";
    }
    pkg.name = path.basename(pname);
    pkg.version = p.version;
    pkgList.push(pkg);
  }
  return await getNugetMetadata(pkgList);
};
exports.parseCsPkgData = parseCsPkgData;

const parseCsProjData = async function (csProjData) {
  const pkgList = [];
  let pkg = null;
  if (!csProjData) {
    return pkgList;
  }
  const projects = convert.xml2js(csProjData, {
    compact: true,
    alwaysArray: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value",
  }).Project;
  if (projects.length == 0) {
    return pkgList;
  }
  const project = projects[0];
  if (project.ItemGroup && project.ItemGroup.length) {
    for (let i in project.ItemGroup) {
      const item = project.ItemGroup[i];
      // .net core use PackageReference
      for (let j in item.PackageReference) {
        const pref = item.PackageReference[j].$;
        let pkg = {};
        if (pref.Include.includes(".csproj")) {
          continue;
        }
        const pname = pref.Include.replace(/\./g, "/");
        pkg.group = path.dirname(pname).replace(/\//g, ".");
        if (pkg.group == ".") {
          pkg.group = "";
        }
        pkg.name = path.basename(pname);
        pkg.version = pref.Version;
        pkgList.push(pkg);
      }
      // .net framework use Reference
      for (let j in item.Reference) {
        const pref = item.Reference[j].$;
        let pkg = {};
        if (!pref.Include || pref.Include.includes(".csproj")) {
          continue;
        }
        const incParts = pref.Include.split(",");
        const pname = incParts[0].replace(/\./g, "/");
        pkg.group = path.dirname(pname).replace(/\//g, ".");
        if (pkg.group == ".") {
          pkg.group = "";
        }
        pkg.name = path.basename(pname);
        if (incParts.length > 1 && incParts[1].includes("Version")) {
          pkg.version = incParts[1].replace("Version=", "").trim();
        }
        pkgList.push(pkg);
      }
    }
  }
  return await getNugetMetadata(pkgList);
};
exports.parseCsProjData = parseCsProjData;

/**
 * Method to retrieve metadata for nuget packages
 *
 * @param {Array} pkgList Package list
 */
const getNugetMetadata = async function (pkgList) {
  const NUGET_URL = "https://api.nuget.org/v3/registration3/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      if (DEBUG_MODE) {
        console.log(`Querying nuget for ${p.name}`);
      }
      const res = await got.get(
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
      const body = firstItem.items[firstItem.items.length - 1];
      // Set the latest version in case it is missing
      if (!p.version && body.catalogEntry.version) {
        p.version = body.catalogEntry.version;
      }
      p.description = body.catalogEntry.description;
      if (
        body.catalogEntry.licenseExpression &&
        body.catalogEntry.licenseExpression !== ""
      ) {
        p.license = findLicenseId(body.catalogEntry.licenseExpression);
      } else if (body.catalogEntry.licenseUrl) {
        p.license = body.catalogEntry.licenseUrl;
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
            "/",
        };
      }
      cdepList.push(p);
    } catch (err) {
      cdepList.push(p);
    }
  }
  return cdepList;
};
exports.getNugetMetadata = getNugetMetadata;

/**
 * Parse composer lock file
 *
 * @param {string} pkgLockFile composer.lock file
 */
const parseComposerLock = function (pkgLockFile) {
  const pkgList = [];
  if (fs.existsSync(pkgLockFile)) {
    lockData = JSON.parse(fs.readFileSync(pkgLockFile, "utf8"));
    if (lockData && lockData.packages) {
      for (let i in lockData.packages) {
        const pkg = lockData.packages[i];
        let group = path.dirname(pkg.name);
        if (group === ".") {
          group = "";
        }
        let name = path.basename(pkg.name);
        pkgList.push({
          group: group,
          name: name,
          version: pkg.version.replace("v", ""),
          repository: pkg.source,
          license: pkg.license,
          description: pkg.description,
        });
      }
    }
  }
  return pkgList;
};
exports.parseComposerLock = parseComposerLock;

/**
 * Parse sbt lock file
 *
 * @param {string} pkgLockFile build.sbt.lock file
 */
const parseSbtLock = function (pkgLockFile) {
  const pkgList = [];
  if (fs.existsSync(pkgLockFile)) {
    lockData = JSON.parse(fs.readFileSync(pkgLockFile, "utf8"));
    if (lockData && lockData.dependencies) {
      for (let i in lockData.dependencies) {
        const pkg = lockData.dependencies[i];
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
        });
      }
    }
  }
  return pkgList;
};
exports.parseSbtLock = parseSbtLock;

/**
 * Collect maven dependencies
 *
 * @param {string} mavenCmd Maven command to use
 * @param {string} basePath Path to the maven project
 */
const collectMvnDependencies = function (mavenCmd, basePath) {
  let tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mvn-deps-"));
  console.log(
    `Executing 'mvn dependency:copy-dependencies -DoutputDirectory=${tempDir} -DexcludeTransitive=true -DincludeScope=runtime' in ${basePath}`
  );
  const result = spawnSync(
    mavenCmd,
    [
      "dependency:copy-dependencies",
      `-DoutputDirectory=${tempDir}`,
      "-DexcludeTransitive=true",
      "-DincludeScope=runtime",
      "-U",
      "-Dmdep.prependGroupId=" + (process.env.MAVEN_PREPEND_GROUP || "false"),
      "-Dmdep.stripVersion=" + (process.env.MAVEN_STRIP_VERSION || "false"),
    ],
    { cwd: basePath, encoding: "utf-8" }
  );
  let jarNSMapping = {};
  if (result.status === 1 || result.error) {
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
  // Clean up
  if (tempDir && tempDir.startsWith(os.tmpdir())) {
    console.log(`Cleaning up ${tempDir}`);
    fs.rmdirSync(tempDir, { recursive: true });
  }
  return jarNSMapping;
};
exports.collectMvnDependencies = collectMvnDependencies;

/**
 * Method to collect class names from all jars in a directory
 *
 * @param {string} jarPath Path containing jars
 *
 * @return object containing jar name and class list
 */
const collectJarNS = function (jarPath) {
  const jarNSMapping = {};
  console.log(
    `About to identify class names for all jars in the path ${jarPath}`
  );
  // Execute jar tvf to get class names
  const jarFiles = getAllFiles(jarPath, "**/*.jar");
  if (jarFiles && jarFiles.length) {
    for (let i in jarFiles) {
      const jf = jarFiles[i];
      const jarname = path.basename(jf);
      if (DEBUG_MODE) {
        console.log(`Executing 'jar tf ${jf}'`);
      }
      const jarResult = spawnSync("jar", ["-tf", jf], { encoding: "utf-8" });
      if (jarResult.status === 1) {
        console.error(jarResult.stdout, jarResult.stderr);
        console.log(
          "Check if JRE is installed and the jar command is available in the PATH."
        );
        break;
      } else {
        const consolelines = (jarResult.stdout || "").split("\n");
        const nsList = consolelines
          .filter((l) => {
            return l.includes(".class") && !l.includes("-INF");
          })
          .map((e) => {
            return e
              .replace(/\/$/, "")
              .replace(/\//g, ".")
              .replace(".class", "");
          });
        jarNSMapping[jarname] = nsList;
      }
    }
    if (!jarNSMapping) {
      console.log(`Unable to determine class names for the jars in ${jarPath}`);
    }
  } else {
    console.log(`${jarPath} did not contain any jars.`);
  }
  if (DEBUG_MODE) {
    console.log("JAR Namespace mapping", jarNSMapping);
  }
  return jarNSMapping;
};
exports.collectJarNS = collectJarNS;

const parsePomXml = function (pomXmlData) {
  if (!pomXmlData) {
    return undefined;
  }
  const project = convert.xml2js(pomXmlData, {
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
      scm: project.scm ? project.scm.url._ : "",
    };
  }
  return undefined;
};
exports.parsePomXml = parsePomXml;

const parseJarManifest = function (jarMetadata) {
  const metadata = {};
  if (!jarMetadata) {
    return metadata;
  }
  jarMetadata.split("\n").forEach((l) => {
    if (l.includes(": ")) {
      const tmpA = l.split(": ");
      if (tmpA && tmpA.length === 2) {
        metadata[tmpA[0]] = tmpA[1].replace("\r", "");
      }
    }
  });
  return metadata;
};
exports.parseJarManifest = parseJarManifest;

/**
 * Method to extract a war or ear file
 *
 * @param {string} jarFile Path to jar file
 * @param {string} tempDir Temporary directory to use for extraction
 *
 * @return pkgList Package list
 */
const extractJarArchive = function (jarFile, tempDir) {
  let pkgList = [];
  const fname = path.basename(jarFile);
  fs.copyFileSync(jarFile, path.join(tempDir, fname));
  let jarResult = spawnSync("jar", ["-xf", path.join(tempDir, fname)], {
    encoding: "utf-8",
    cwd: tempDir,
  });
  if (jarResult.status === 1) {
    console.error(jarResult.stdout, jarResult.stderr);
    console.log(
      "Check if JRE is installed and the jar command is available in the PATH."
    );
    return pkgList;
  }
  const jarFiles = getAllFiles(
    path.join(tempDir, "WEB-INF", "lib"),
    "**/*.jar"
  );
  if (jarFiles && jarFiles.length) {
    for (let i in jarFiles) {
      const jf = jarFiles[i];
      const jarname = path.basename(jf);
      const manifestDir = path.join(tempDir, "META-INF");
      const manifestFile = path.join(tempDir, "META-INF", "MANIFEST.MF");
      jarResult = spawnSync("jar", ["-xf", jf], {
        encoding: "utf-8",
        cwd: tempDir,
      });
      if (jarResult.status === 1) {
        console.error(jarResult.stdout, jarResult.stderr);
      } else {
        const pomXmls = getAllFiles(manifestDir, "**/pom.xml");
        // Check if there are pom.xml
        if (pomXmls && pomXmls.length) {
          const pxml = pomXmls[0];
          const pomMetadata = parsePomXml(
            fs.readFileSync(pxml, {
              encoding: "utf-8",
            })
          );
          if (pomMetadata) {
            pkgList.push({
              group: pomMetadata["groupId"],
              name: pomMetadata["artifactId"],
              version: pomMetadata["version"],
              description: pomMetadata["description"],
              homepage: { url: pomMetadata["url"] },
              repository: { url: pomMetadata["scm"] },
              qualifiers: { type: "jar" },
            });
          }
        } else if (fs.existsSync(manifestFile)) {
          const jarMetadata = parseJarManifest(
            fs.readFileSync(manifestFile, {
              encoding: "utf-8",
            })
          );
          let group =
            jarMetadata["Extension-Name"] ||
            jarMetadata["Implementation-Vendor-Id"] ||
            jarMetadata["Bundle-SymbolicName"] ||
            jarMetadata["Automatic-Module-Name"];
          let name = undefined;
          if (
            jarMetadata["Bundle-Name"] &&
            !jarMetadata["Bundle-Name"].includes(" ")
          ) {
            name = jarMetadata["Bundle-Name"];
          }
          let version =
            jarMetadata["Bundle-Version"] ||
            jarMetadata["Implementation-Version"];
          if (!name && group) {
            name = path.basename(group.replace(/\./g, "/"));
            if (!group.startsWith("javax")) {
              group = path.dirname(group.replace(/\./g, "/"));
              group = group.replace(/\//g, ".");
            }
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
          // Fallback to parsing jar filename
          if (!name || !version || name === "" || version === "") {
            const tmpA = jarname.split("-");
            if (tmpA && tmpA.length > 1) {
              const lastPart = tmpA[tmpA.length - 1];
              if (!version || version === "") {
                version = lastPart.replace(".jar", "");
              }
              if (!name || name === "") {
                name = jarname.replace("-" + lastPart, "");
              }
            }
          }
          // Patch the group string
          for (const aprefix in vendorAliases) {
            if (name.startsWith(aprefix)) {
              group = vendorAliases[aprefix];
              break;
            }
          }
          if (name && version) {
            pkgList.push({
              group: group || "",
              name,
              version,
            });
          } else {
            if (DEBUG_MODE) {
              console.log(`Ignored jar ${jarname}`, jarMetadata);
            }
          }
        }
        // Clean up META-INF
        fs.rmdirSync(path.join(tempDir, "META-INF"), { recursive: true });
      }
    }
  }
  return pkgList;
};
exports.extractJarArchive = extractJarArchive;

/**
 * Determine the version of SBT used in compilation of this project.
 * By default it looks into a standard SBT location i.e.
 * <path-project>/project/build.properties
 * Returns `null` if the version cannot be determined.
 *
 * @param {string} projectPath Path to the SBT project
 */
const determineSbtVersion = function (projectPath) {
  const buildPropFile = path.join(projectPath, "project", "build.properties");
  if (fs.existsSync(buildPropFile)) {
    let properties = propertiesReader(buildPropFile);
    let property = properties.get("sbt.version");
    if (property != null && semver.valid(property)) {
      return property;
    }
  }
  return null;
};
exports.determineSbtVersion = determineSbtVersion;

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
const addPlugin = function (projectPath, plugin) {
  const pluginsFile = sbtPluginsPath(projectPath);
  var originalPluginsFile = null;
  if (fs.existsSync(pluginsFile)) {
    originalPluginsFile = pluginsFile + ".cdxgen";
    fs.copyFileSync(pluginsFile, originalPluginsFile);
  }

  fs.writeFileSync(pluginsFile, plugin, { flag: "a" });
  return originalPluginsFile;
};
exports.addPlugin = addPlugin;

/**
 * Cleans up modifications to the project's plugins' file made by the
 * `addPlugin` function.
 *
 * @param {string} projectPath Path to the SBT project
 * @param {string} originalPluginsFile Location of the original plugins file, if any
 */
const cleanupPlugin = function (projectPath, originalPluginsFile) {
  const pluginsFile = sbtPluginsPath(projectPath);
  if (fs.existsSync(pluginsFile)) {
    if (!originalPluginsFile) {
      // just remove the file, it was never there
      fs.unlinkSync(pluginsFile);
      return !fs.existsSync(pluginsFile);
    } else {
      // Bring back the original file
      fs.copyFileSync(originalPluginsFile, pluginsFile);
      fs.unlinkSync(originalPluginsFile);
      return true;
    }
  } else {
    return false;
  }
};
exports.cleanupPlugin = cleanupPlugin;

/**
 * Returns a default location of the plugins file.
 *
 * @param {string} projectPath Path to the SBT project
 */
const sbtPluginsPath = function (projectPath) {
  return path.join(projectPath, "project", "plugins.sbt");
};
exports.sbtPluginsPath = sbtPluginsPath;
