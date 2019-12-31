const glob = require("glob");
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
      if (l.indexOf("---") >= 0) {
        l = l.substr(l.indexOf("---") + 4, l.length).trim();
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
