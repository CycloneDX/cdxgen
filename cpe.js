const sqlite3 = require("better-sqlite3");
const fs = require("fs");
const { PackageURL } = require("packageurl-js");

let db = undefined;

const KNOWN_PKG_TYPES = [
  "composer",
  "maven",
  "npm",
  "nuget",
  "pypi",
  "gem",
  "rubygems",
  "golang",
  "crates",
  "clojars",
  "conan",
  "pub",
  "hackage",
  "android",
  "dwf",
  "gsd",
  "hex",
  "packagist",
  "uvi",
  "apk",
  "deb",
  "rpm",
  "linux",
  "swift"
];

CPE_FULL_REGEX =
  /cpe:?:[^:]+:(?<cve_type>[^:]+):(?<vendor>[^:]+):(?<package>[^:]+):(?<version>[^:]+):(?<update>[^:]+):(?<edition>[^:]+):(?<lang>[^:]+):(?<sw_edition>[^:]+):(?<target_sw>[^:]+):(?<target_hw>[^:]+):(?<other>[^:]+)/gm;

const openDatabase = (dbpath) => {
  if (db) {
    return db;
  }
  if (fs.existsSync(dbpath)) {
    try {
      db = sqlite3(dbpath, { readonly: true, fileMustExist: true });
    } catch (err) {
      console.log("Unable to open the cpe database at", dbpath);
      console.log(err);
    }
  } else {
    console.log(dbpath, "doesn't exist");
  }
  return db;
};
exports.openDatabase = openDatabase;

const closeDatabase = () => {
  if (db) {
    try {
      db.close();
      db = undefined;
    } catch (err) {
      // ignore errors
    }
  }
};
exports.closeDatabase = closeDatabase;

const convertPurl = (purl) => {
  let purlString = "";
  if (typeof purl === "string" || purl instanceof String) {
    try {
      purl = PackageURL.fromString(purl);
    } catch (err) {
      console.log(err);
    }
  }
  purlString = `pkg:${purl.type}/${purl.namespace}/${purl.name}`;
  let sw_edition = "*";
  let target_sw = KNOWN_PKG_TYPES.includes(purl.type) ? purl.type : "*";
  let cpeString = `cpe:2.3:a:${purl.namespace || purl.name + "_project"}:${
    purl.name
  }:${purl.version}:*:*:*:${sw_edition}:${target_sw}:*:*`;
  if (db) {
    const row = db
      .prepare("select cpe from purl2cpe where purl = ?")
      .get(purlString);
    if (row && row.cpe) {
      let rparsed = false;
      const matches = row.cpe.matchAll(CPE_FULL_REGEX);
      for (const match of matches) {
        if (!match.groups) {
          continue;
        }
        if (match.groups.sw_edition && match.groups.sw_edition !== "*") {
          sw_edition = match.groups.sw_edition;
        }
        if (match.groups.target_sw && match.groups.target_sw !== "*") {
          target_sw = match.groups.target_sw;
        }
        rparsed = true;
        cpeString = `cpe:2.3:a:${match.groups.vendor}:${match.groups.package}:${purl.version}:*:*:*:${sw_edition}:${target_sw}:*:*`;
      }
      // Fallback to manually spliting and parsing the cpe
      if (!rparsed) {
        const tmpA = row.cpe.split(":");
        if (tmpA && tmpA.length > 9) {
          if (tmpA[9] && tmpA[9] !== "*") {
            sw_edition = tmpA[9];
          } else if (tmpA.length > 10 && tmpA[10] && tmpA[10] !== "*") {
            target_sw = tmpA[10];
          }
        }
        cpeString = `${tmpA[0]}:${tmpA[1]}:${tmpA[2]}:${tmpA[3]}:${tmpA[4]}:${purl.version}:*:*:*:${sw_edition}:${target_sw}:*:*`;
      }
    }
  }
  return cpeString;
};
exports.convertPurl = convertPurl;
