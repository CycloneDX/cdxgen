const glob = require("glob");
const path = require("path");
const fs = require("fs");
const got = require("got");
const convert = require("xml-js");
const licenseMapping = require("./license-mapping.json");
const spdxLicenses = require("./spdx-licenses.json");
const knownLicenses = require("./known-licenses.json");
const cheerio = require("cheerio");
const yaml = require("js-yaml");
const ssri = require("ssri");

/**
 * Method to get files matching a pattern
 *
 * @param {string} dirPath Root directory for search
 * @param {string} pattern Glob pattern (eg: *.gradle)
 */
const getAllFiles = function (dirPath, pattern) {
  return glob.sync(pattern, { cwd: dirPath, silent: false, absolute: true });
};
exports.getAllFiles = getAllFiles;

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

const _getDepPkgList = function (pkgList, pkg) {
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
        _getDepPkgList(pkgList, pkg.dependencies[name]);
      }
    }
  }
  return pkgList;
};

/**
 * Parse nodejs package lock file
 *
 * @param {string} pkgLockFile package-lock.json file
 */
const parsePkgLock = function (pkgLockFile) {
  const pkgList = [];
  if (fs.existsSync(pkgLockFile)) {
    lockData = require(pkgLockFile);
    return _getDepPkgList(pkgList, lockData);
  }
  return pkgList;
};
exports.parsePkgLock = parsePkgLock;

/**
 * Parse nodejs yarn lock file
 *
 * @param {string} yarnLockFile yarn.lock file
 */
const parseYarnLock = function (yarnLockFile) {
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
          integrity = "sha256-" + tmpB[1].replace(/"/g, "");
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
const parseNodeShrinkwrap = function (swFile) {
  const pkgList = [];
  if (fs.existsSync(swFile)) {
    lockData = require(swFile);
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
const parsePnpmLock = function (pnpmLock) {
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
exports.parseGradleDep = parseGradleDep;

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
  return name;
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
      if (content.indexOf(l.names[j]) > -1) {
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
      /*
      console.warn(
        "Unable to find metadata for",
        p.group,
        p.name,
        p.version,
        fullUrl
      );
      */
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
      console.error(err, p);
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
    if (l.indexOf("=") > -1) {
      const tmpA = l.split(/(==|<=|~=|>=)/);
      let versionStr = tmpA[tmpA.length - 1].trim().replace("*", "0");
      if (versionStr === "0") {
        versionStr = null;
      }
      pkgList.push({
        name: tmpA[0].trim(),
        version: versionStr,
      });
    } else if (/[>|\[|@]/.test(l)) {
      const tmpA = l.split(/(>|\[|@)/);
      pkgList.push({
        name: tmpA[0].trim(),
        version: null,
      });
    } else if (l) {
      pkgList.push({
        name: l,
        version: null,
      });
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
      const license = await getGoPkgLicense({
        group: group,
        name: name,
      });
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
          pkg._integrity = ssri.fromHex(value.substring(2), "sha256");
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

const parseCsProjData = async function (csProjData) {
  const pkgList = [];
  let pkg = null;
  if (!csProjData) {
    return pkgList;
  }
  const project = convert.xml2js(csProjData, {
    compact: true,
    spaces: 4,
    textKey: "_",
    attributesKey: "$",
    commentKey: "value",
  }).Project;
  if (project.ItemGroup && project.ItemGroup.length) {
    for (let i in project.ItemGroup) {
      const item = project.ItemGroup[i];
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
 * Parse nodejs package lock file
 *
 * @param {string} pkgLockFile package-lock.json file
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
