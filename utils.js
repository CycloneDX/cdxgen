const glob = require("glob");
const path = require("path");
const got = require("got");
const convert = require("xml-js");
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
            group: verArr[0],
            name: verArr[1],
            version: versionStr,
            qualifiers: { type: "jar" }
          });
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
const findLicenseId = function(name) {
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
 * Method to retrieve metadata for maven packages by querying maven central
 *
 * @param {Array} pkgList Package list
 */
const getMvnMetadata = async function(pkgList) {
  const MAVEN_CENTRAL_URL = "https://repo1.maven.org/maven2/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      const res = await got.get(
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
      const bodyJson = convert.xml2js(res.body, {
        compact: true,
        spaces: 4,
        textKey: "_",
        attributesKey: "$",
        commentKey: "value"
      }).project;
      if (bodyJson && bodyJson.licenses && bodyJson.licenses.license) {
        p.license = bodyJson.licenses.license.map(l => {
          return { id: findLicenseId(l.name._), name: l.name._ };
        });
      }
      p.description = bodyJson.description ? bodyJson.description._ : "";
      if (bodyJson.scm && bodyJson.scm.url) {
        p.repository = { url: bodyJson.scm.url._ };
      }
      cdepList.push(p);
    } catch (err) {
      console.warn("Unable to find metadata for", p.group, p.name);
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
const getPyMetadata = async function(pkgList) {
  const PYPI_URL = "https://pypi.org/pypi/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      const res = await got.get(
        PYPI_URL + p.name + (p.version ? "/" + p.version : "") + "/json",
        { responseType: "json" }
      );
      const body = res.body;
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
const parsePiplockData = async function(lockData) {
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
  return await getPyMetadata(pkgList);
};
exports.parsePiplockData = parsePiplockData;

/**
 * Method to parse poetry.lock data
 *
 * @param {Object} lockData JSON data from poetry.lock
 */
const parsePoetrylockData = async function(lockData) {
  const pkgList = [];
  let pkg = null;
  if (!lockData) {
    return pkgList;
  }
  lockData.split("\n").forEach(l => {
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
const parseReqFile = async function(reqData) {
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
    } else if (l) {
      pkgList.push({
        name: l,
        version: null
      });
    }
  });
  return await getPyMetadata(pkgList);
};
exports.parseReqFile = parseReqFile;

const parseGosumData = function(gosumData) {
  const pkgList = [];
  if (!gosumData) {
    return pkgList;
  }
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
  if (!gopkgData) {
    return pkgList;
  }
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

/**
 * Method to retrieve metadata for rust packages by querying crates
 *
 * @param {Array} pkgList Package list
 */
const getCratesMetadata = async function(pkgList) {
  const CRATES_URL = "https://crates.io/api/v1/crates/";
  const cdepList = [];
  for (const p of pkgList) {
    try {
      const res = await got.get(CRATES_URL + p.name, { responseType: "json" });
      const body = res.body.crate;
      p.description = body.description;
      if (res.body.versions) {
        p.license = findLicenseId(res.body.versions[0].license);
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
      console.error(err);
    }
  }
  return cdepList;
};
exports.getCratesMetadata = getCratesMetadata;

const parseCargoData = async function(cargoData) {
  const pkgList = [];
  if (!cargoData) {
    return pkgList;
  }
  let pkg = null;
  cargoData.split("\n").forEach(l => {
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
          pkg._integrity = "sha256-" + value;
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

const parseCsProjData = async function(csProjData) {
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
    commentKey: "value"
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
const getNugetMetadata = async function(pkgList) {
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
            "/"
        };
      }
      cdepList.push(p);
    } catch (err) {
      cdepList.push(p);
      console.error(p, err);
    }
  }
  return cdepList;
};
exports.getNugetMetadata = getNugetMetadata;
