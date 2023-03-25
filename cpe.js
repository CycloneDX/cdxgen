const sqlite3 = require("better-sqlite3");
const fs = require("fs");
const { PackageURL } = require("packageurl-js");

let db = undefined;

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
  let cpeString = `cpe:2.3:a:${purl.namespace || purl.name + "_project"}:${
    purl.name
  }:${purl.version}:*:*:*:*:*:*:*`;
  if (db) {
    const row = db
      .prepare("select cpe from purl2cpe where purl = ?")
      .get(purlString);
    if (row && row.cpe) {
      cpeString = row.cpe.replace(":-:", `:${purl.version}:`);
    }
  }
  return cpeString;
};
exports.convertPurl = convertPurl;
