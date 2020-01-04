const glob = require("glob");
const path = require("path");
const request = require("sync-request");
const xml2json = require("simple-xml2json");
const licenseMapping = require("./license-mapping.json");

/**
 * Method to get files matching a pattern
 *
 * @param {string} dirPath Root directory for search
 * @param {string} pattern Glob pattern (eg: *.gradle)
 */
const getAllFiles = function(dirPath, pattern) {
  return glob.sync(pattern, { cwd: dirPath, silent: false, absolute: true });
};
exports.getAllFiles = getAllFiles;

/**
 * Parse gradle dependencies output
 * @param {string} rawOutput Raw string output
 */
const parseGradleDep = function(rawOutput) {
  if (typeof rawOutput === "string") {
    const deps = [];
    const tmpA = rawOutput.split("\n");
    tmpA.forEach(l => {
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
          deps.push({
            group: verArr[0].toLowerCase(),
            name: verArr[1].toLowerCase(),
            version: versionStr,
            qualifiers: { type: "jar" }
          });
        }
      }
    });
    return deps;
  }
  return undefined;
};
exports.parseGradleDep = parseGradleDep;

/**
 * Method to find the spdx license id from name
 *
 * @param {string} name License full name
 */
const findLicenseId = function(name) {
  for (var i in licenseMapping) {
    const l = licenseMapping[i];
    if (l.names.includes(name)) {
      return l.exp;
    }
  }
  return name;
};

/**
 * Method to retrieve metadata for maven packages by querying maven central
 *
 * @param {Array} pkgList Package list
 */
const getMvnMetadata = function(pkgList) {
  const MAVEN_CENTRAL_URL = "https://repo1.maven.org/maven2/";
  const cdepList = [];
  pkgList.forEach(p => {
    try {
      const res = request(
        "GET",
        MAVEN_CENTRAL_URL +
          p.group.replace(/\./g, "/") +
          "/" +
          p.name +
          "/" +
          p.version +
          "/" +
          p.name +
          "-" +
          p.version +
          ".pom"
      );
      const body = res.getBody("utf8");
      const bodyJson = xml2json.parser(body).project;
      if (bodyJson && bodyJson.licenses && bodyJson.licenses.license) {
        p.license = findLicenseId(bodyJson.licenses.license.name);
      }
      p.description = bodyJson.description;
      if (bodyJson.scm && bodyJson.scm.url) {
        p.repository = { url: bodyJson.scm.url };
      }
      cdepList.push(p);
    } catch (err) {
      cdepList.push(p);
    }
  });
  return cdepList;
};
exports.getMvnMetadata = getMvnMetadata;

/**
 * Method to retrieve metadata for python packages by querying pypi
 *
 * @param {Array} pkgList Package list
 */
const getPyMetadata = function(pkgList) {
  const PYPI_URL = "https://pypi.org/pypi/";
  const cdepList = [];
  pkgList.forEach(p => {
    try {
      const res = request(
        "GET",
        PYPI_URL + p.name + (p.version ? "/" + p.version : "") + "/json"
      );
      const body = JSON.parse(res.getBody("utf8"));
      p.description = body.info.summary;
      p.license = findLicenseId(body.info.license);
      if (body.info.home_page.indexOf("git") > -1) {
        p.repository = { url: body.info.home_page };
      } else {
        p.homepage = { url: body.info.home_page };
      }
      // Use the latest version if none specified
      if (!p.version) {
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
    }
  });
  return cdepList;
};
exports.getMvnMetadata = getMvnMetadata;

/**
 * Method to parse pipfile.lock data
 *
 * @param {Object} lockData JSON data from Pipfile.lock
 */
const parsePiplockData = function(lockData) {
  const pkgList = [];
  Object.keys(lockData)
    .filter(i => i !== "_meta")
    .forEach(k => {
      const depBlock = lockData[k];
      Object.keys(depBlock).forEach(p => {
        const pkg = depBlock[p];
        let versionStr = pkg.version.replace("==", "");
        pkgList.push({ name: p, version: versionStr });
      });
    });
  return getPyMetadata(pkgList);
};
exports.parsePiplockData = parsePiplockData;

/**
 * Method to parse requirements.txt data
 *
 * @param {Object} reqData Requirements.txt data
 */
const parseReqFile = function(reqData) {
  const pkgList = [];
  reqData.split("\n").forEach(l => {
    if (l.indexOf("=") > -1) {
      const tmpA = l.split(/(==|<=|~=)/);
      let versionStr = tmpA[tmpA.length - 1].trim().replace("*", "0");
      if (versionStr === "0") {
        versionStr = null;
      }
      pkgList.push({
        name: tmpA[0].trim(),
        version: versionStr
      });
    } else if (/[>|\[|@]/.test(l)) {
      const tmpA = l.split(/(>|\[|@)/);
      pkgList.push({
        name: tmpA[0].trim(),
        version: null
      });
    }
  });
  return getPyMetadata(pkgList);
};
exports.parseReqFile = parseReqFile;

const parseGosumData = function(gosumData) {
  const pkgList = [];
  gosumData.split("\n").forEach(l => {
    // look for lines containing go.mod
    if (l.indexOf("go.mod") > -1) {
      const tmpA = l.split(" ");
      const group = path.dirname(tmpA[0]);
      const name = path.basename(tmpA[0]);
      const version = tmpA[1].replace("/go.mod", "");
      const hash = tmpA[tmpA.length - 1].replace("h1:", "sha256-");
      pkgList.push({
        group: group,
        name: name,
        version: version,
        _integrity: hash
      });
    }
  });
  return pkgList;
};
exports.parseGosumData = parseGosumData;

const parseGopkgData = function(gopkgData) {
  const pkgList = [];
  let pkg = null;
  gopkgData.split("\n").forEach(l => {
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
          pkg._integrity = value.replace("1:", "sha256-");
          break;
        case "name":
          pkg.group = path.dirname(value);
          pkg.name = path.basename(value);
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
  });
  return pkgList;
};
exports.parseGopkgData = parseGopkgData;
