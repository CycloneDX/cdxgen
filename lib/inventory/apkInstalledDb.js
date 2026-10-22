// Bounded, read-only reader of the apk installed database.
//
// osquery has no apk table, so an Alpine, Wolfi or Chainguard host would have no
// OS package inventory in an OBOM, and the PHP host probe needs the same
// database to tell which PHP files a package owns. Both read it through here, so
// what the OBOM lists and what the probe treats as owned follow one parser: the
// same file, location order, caps and record rules.
//
// The database is `/lib/apk/db/installed`. A usr-merged system keeps it at
// `/usr/lib/apk/db/installed` (and `/lib` is a link to `/usr/lib`, so the two
// names are one file), and Alpaquita keeps it under `/var/lib/apk/db`. The first
// of those that exists is the database. One that exists but cannot be read
// leaves the packages unknown: it is reported as unreadable, never read in part
// and never skipped for the next name.
//
// A record is a run of `<letter>:<value>` lines ended by a blank line. P: names
// the package, V: its version, A: its architecture, o: its origin (the source
// package), m: its maintainer, L: its licence, U: its home page and T: its
// description. F: names a directory and each R: after it a file in that
// directory. A record may start with C: (Alpine) or P: (Wolfi).

import { statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { isDryRun, recordActivity } from "../core/activity.js";
import { safeExistsSync, safeReadFileSync } from "../core/fs.js";
import { thoughtLog } from "../core/logger.js";

/** The database, or the packages it lists, past these is unreadable rather than read in part. */
export const MAX_APK_DATABASE_BYTES = 64 * 1024 * 1024;
export const MAX_APK_PACKAGES = 100000;

/** Where apk keeps the installed database, relative to the root, in the order they are tried. */
export const APK_INSTALLED_DB_PATHS = [
  "lib/apk/db/installed",
  "usr/lib/apk/db/installed",
  "var/lib/apk/db/installed",
];

// No field of a package record is longer than this once read.
const MAX_FIELD_LENGTH = 4096;

const FIELD_NAMES = {
  P: "name",
  V: "version",
  A: "arch",
  o: "origin",
  m: "maintainer",
  L: "license",
  U: "url",
  T: "description",
};

function readBounded(file, maxBytes) {
  try {
    const stats = statSync(file);
    if (!stats.isFile() || stats.size > maxBytes) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  const text = safeReadFileSync(file, "utf-8");
  // A file that grew between the stat and the read is over the cap too.
  return typeof text === "string" && text.length <= maxBytes ? text : undefined;
}

function newRecord() {
  return { fields: {}, fileCount: 0, files: [], touched: false };
}

/**
 * Parse the text of an installed database.
 *
 * @param {string} text Database text
 * @param {Set<string>|undefined} wantedFiles Absolute paths whose owner is wanted
 * @param {number} maxPackages Most packages to accept
 * @returns {{packages: Object[], malformed: number, overflow: boolean}}
 */
function parseDatabase(text, wantedFiles, maxPackages) {
  const packages = [];
  let malformed = 0;
  let overflow = false;
  let record = newRecord();
  let directory = "";
  const finishRecord = () => {
    const { fields, fileCount, files, touched } = record;
    record = newRecord();
    directory = "";
    if (!touched) {
      return;
    }
    // A package with no name or no version cannot be named by a purl.
    if (!fields.name || !fields.version) {
      malformed++;
      return;
    }
    packages.push({ ...fields, fileCount, files });
    if (packages.length > maxPackages) {
      overflow = true;
    }
  };
  let position = 0;
  while (position <= text.length && !overflow) {
    let end = text.indexOf("\n", position);
    if (end === -1) {
      end = text.length;
    }
    let line = text.slice(position, end);
    position = end + 1;
    if (line.endsWith("\r")) {
      line = line.slice(0, -1);
    }
    if (line === "") {
      finishRecord();
      continue;
    }
    if (line.length < 2 || line[1] !== ":") {
      continue;
    }
    const letter = line[0];
    const value = line.slice(2);
    if (Object.hasOwn(FIELD_NAMES, letter)) {
      record.touched = true;
      if (value) {
        record.fields[FIELD_NAMES[letter]] =
          value.length > MAX_FIELD_LENGTH
            ? value.slice(0, MAX_FIELD_LENGTH)
            : value;
      }
    } else if (letter === "F") {
      record.touched = true;
      directory = value;
    } else if (letter === "R") {
      record.touched = true;
      record.fileCount++;
      if (wantedFiles) {
        const file = `/${directory ? `${directory}/` : ""}${value}`;
        if (wantedFiles.has(file)) {
          record.files.push(file);
        }
      }
    }
  }
  if (!overflow) {
    finishRecord();
  }
  return { packages, malformed, overflow };
}

/**
 * Read the packages of the apk installed database.
 *
 * @param {Object} [options] Read options
 * @param {string} [options.rootPath="/"] Directory the database paths hang off;
 *   tests point it at a built tree
 * @param {string} [options.databaseFile] Read this file instead of looking
 *   under `rootPath`
 * @param {Set<string>} [options.wantedFiles] Absolute paths whose owner is
 *   wanted. A package comes back with the ones it owns in `files`; the other
 *   files of a package are only counted, so a large database stays small.
 * @param {number} [options.maxBytes] Largest database to read, 64 MiB by default
 * @param {number} [options.maxPackages] Most packages to accept, 100000 by default
 * @param {string} [options.platform] `linux` by default for the process; an apk
 *   database exists on Linux only
 * @returns {{state: string, path?: string, packages: Object[], malformed: number}}
 *   `state` is `ok`, `absent` (no database, or not Linux), `unreadable` (a
 *   database that could not be read in full) or `skipped` (a dry run).
 *   `malformed` counts the records left out for having no name or version.
 *   Each package has `name`, `version` and `fileCount`, `files`, and, when the
 *   record has them, `arch`, `origin`, `maintainer`, `license`, `url` and
 *   `description`.
 */
export function readApkInstalledDb(options = {}) {
  const result = (state, extra = {}) => ({
    state,
    packages: [],
    malformed: 0,
    ...extra,
  });
  const platform = options.platform || process.platform;
  if (platform !== "linux") {
    return result("absent");
  }
  const rootPath = options.rootPath || "/";
  if (isDryRun) {
    recordActivity({
      capability: "apk-installed-db",
      kind: "read",
      reason:
        "Dry run mode blocks reading the apk installed database, which lives outside the project.",
      status: "blocked",
      target: options.databaseFile || rootPath,
    });
    return result("skipped");
  }
  const candidates = options.databaseFile
    ? [options.databaseFile]
    : APK_INSTALLED_DB_PATHS.map((location) => join(rootPath, location));
  const file = candidates.find((candidate) => safeExistsSync(candidate));
  if (!file) {
    return result("absent");
  }
  const unreadable = (reason) => {
    thoughtLog(`The apk installed database ${file} was not read: ${reason}.`);
    recordActivity({
      capability: "apk-installed-db",
      kind: "read",
      reason: `The apk installed database ${file} could not be read: ${reason}.`,
      status: "failed",
      target: file,
    });
    return result("unreadable", { path: file });
  };
  const maxBytes = options.maxBytes ?? MAX_APK_DATABASE_BYTES;
  const text = readBounded(file, maxBytes);
  if (text === undefined) {
    return unreadable(`it is not a file of at most ${maxBytes} bytes`);
  }
  const maxPackages = options.maxPackages ?? MAX_APK_PACKAGES;
  const { packages, malformed, overflow } = parseDatabase(
    text,
    options.wantedFiles,
    maxPackages,
  );
  if (overflow) {
    return unreadable(`it lists more than ${maxPackages} packages`);
  }
  if (malformed) {
    thoughtLog(
      `${malformed} record(s) of the apk installed database ${file} have no name or no version and were left out.`,
    );
  }
  recordActivity({
    capability: "apk-installed-db",
    kind: "read",
    reason: `Read ${packages.length} package(s) from the apk installed database ${file}.`,
    status: "completed",
    target: file,
  });
  return result("ok", { path: file, packages, malformed });
}
