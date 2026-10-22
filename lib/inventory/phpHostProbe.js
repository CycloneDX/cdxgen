// Bounded, read-only probe for the PHP no package manager owns on a live host,
// for `-t os` / obom. osquery's package tables list what dpkg, rpm and the like
// installed, so a PHP built from source (a Docker Official image, FrankenPHP, a
// /usr/local or /opt build) is invisible to them, and with it the version a PHP
// advisory is read against.
//
// Candidates come from a few fixed directories, one level deep, never from a
// walk of the file system. A candidate is opened only after the package
// databases have said they do not own it: a package manager's file is
// identified by its package, and distros backport fixes under old PHP version
// numbers, which the cdx:php properties would misstate. Only files nothing owns
// are read, for their bytes; nothing is executed.
//
// A package database that exists but cannot be read leaves ownership unknown.
// Unknown is not unpackaged: it emits nothing and records a degradation.

import { readdirSync, realpathSync, statSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import process from "node:process";

import {
  isDryRun,
  readEnvironmentVariable,
  recordActivity,
} from "../core/activity.js";
import { recordDegradation } from "../core/buildLedger.js";
import { safeExistsSync, safeReadFileSync } from "../core/fs.js";
import { thoughtLog } from "../core/logger.js";
import {
  attachPhpBuild,
  classifyPhpSapi,
  createPhpRuntimeInventory,
  MAX_PHP_PROBES,
  readPhpBuildVersion,
} from "./phpBuildInfo.js";
import { tryBuildPurl } from "./purl.js";

// One dpkg list or the apk database, and every dpkg list together. A database
// past these caps counts as unreadable instead of being read in part.
const MAX_DATABASE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_DATABASE_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_DPKG_LISTS = 100000;

// Where the PHP of a source build is installed, relative to the root. `only`
// narrows a directory to one SAPI. `opt/*/bin` and `opt/*/sbin` read /opt one
// level down and nothing below that.
const POSIX_DIRECTORIES = {
  linux: [
    { dir: "usr/local/bin" },
    { dir: "usr/local/sbin" },
    { dir: "usr/local/lib", only: "libphp" },
    { dir: "usr/lib/apache2/modules", only: "libphp" },
    { dir: "usr/lib/httpd/modules", only: "libphp" },
    { dir: "usr/lib64/httpd/modules", only: "libphp" },
    { dir: "opt/*/bin" },
    { dir: "opt/*/sbin" },
  ],
  darwin: [
    { dir: "usr/local/bin" },
    { dir: "usr/local/sbin" },
    { dir: "opt/homebrew/bin" },
    { dir: "opt/homebrew/sbin" },
  ],
};

// The programs of a php.net Windows build. The CGI and debugger executables
// hold no version of their own; the core DLL beside them does (php8.dll, or
// php8ts.dll for a thread-safe build).
const WINDOWS_SAPIS = {
  "php.exe": "cli",
  "php-win.exe": "cli",
  "php-cgi.exe": "cgi",
  "phpdbg.exe": "phpdbg",
};

function isWindowsCoreLibrary(name) {
  const lower = name.toLowerCase();
  if (!lower.startsWith("php") || !lower.endsWith(".dll")) {
    return false;
  }
  const stem = lower.slice("php".length, -".dll".length);
  return /^\d+$/.test(stem.endsWith("ts") ? stem.slice(0, -2) : stem);
}

function listDirectory(directory) {
  try {
    return readdirSync(directory).sort();
  } catch {
    return [];
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function realPathOf(path) {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function quoteForOsquery(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function byBomRef(a, b) {
  const left = a["bom-ref"];
  const right = b["bom-ref"];
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The Homebrew formula a file belongs to, read from its resolved path.
 * Everything under a Cellar belongs to Homebrew, whatever the version suffix
 * (`8.5.11_1`).
 *
 * @param {string} realPath resolved path of the file
 * @returns {{formula: string, version: string}|undefined}
 */
function homebrewOwner(realPath) {
  const parts = realPath.split(sep);
  const index = parts.indexOf("Cellar");
  // Cellar/<formula>/<version>/<file>
  if (index === -1 || parts.length - index < 4) {
    return undefined;
  }
  return { formula: parts[index + 1], version: parts[index + 2] };
}

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
  return typeof text === "string" ? text : undefined;
}

// A package database: its name and path, `absent` when the host has none,
// `unreadable` when it has one that could not be read in full, and the paths of
// the candidates it lists.
function database(name, path, state = "ok") {
  return { name, path, state, owned: new Set() };
}

// dpkg keeps one <package>.list per package, naming each path as it is on the
// system.
function scanDpkg(infoDirectory, wanted) {
  const result = database("dpkg", infoDirectory);
  if (!safeExistsSync(infoDirectory)) {
    result.state = "absent";
    return result;
  }
  const lists = listDirectory(infoDirectory).filter((name) =>
    name.endsWith(".list"),
  );
  if (!isDirectory(infoDirectory) || lists.length > MAX_DPKG_LISTS) {
    result.state = "unreadable";
  }
  let total = 0;
  for (const name of lists.slice(0, MAX_DPKG_LISTS)) {
    const text = readBounded(
      join(infoDirectory, name),
      Math.min(MAX_DATABASE_FILE_BYTES, MAX_DATABASE_TOTAL_BYTES - total),
    );
    if (text === undefined) {
      result.state = "unreadable";
      continue;
    }
    total += text.length;
    for (const line of text.split("\n")) {
      if (wanted.has(line)) {
        result.owned.add(line);
      }
    }
  }
  return result;
}

// apk keeps one record per package: F: names a directory, each R: after it a
// file in that directory, and a blank line ends the record.
function scanApk(installedFile, wanted) {
  const result = database("apk", installedFile);
  if (!safeExistsSync(installedFile)) {
    result.state = "absent";
    return result;
  }
  const text = readBounded(installedFile, MAX_DATABASE_FILE_BYTES);
  if (text === undefined) {
    result.state = "unreadable";
    return result;
  }
  let directory = "";
  for (const line of text.split("\n")) {
    if (line === "") {
      directory = "";
    } else if (line.startsWith("F:")) {
      directory = line.slice("F:".length);
    } else if (line.startsWith("R:")) {
      const file = `/${directory ? `${directory}/` : ""}${line.slice("R:".length)}`;
      if (wanted.has(file)) {
        result.owned.add(file);
      }
    }
  }
  return result;
}

// osquery's rpm_package_files answers for a path without being told the
// package.
function queryRpm(databaseDirectories, wanted, executeOsQuery) {
  const result = database("rpm", databaseDirectories[0]);
  if (!databaseDirectories.some((directory) => safeExistsSync(directory))) {
    result.state = "absent";
    return result;
  }
  if (!wanted.size) {
    return result;
  }
  const rows =
    typeof executeOsQuery === "function"
      ? executeOsQuery(
          `SELECT package, path FROM rpm_package_files WHERE path IN (${[
            ...wanted,
          ]
            .map(quoteForOsquery)
            .join(", ")})`,
        )
      : undefined;
  if (!Array.isArray(rows)) {
    result.state = "unreadable";
    return result;
  }
  for (const row of rows) {
    if (typeof row?.path === "string") {
      result.owned.add(row.path);
    }
  }
  return result;
}

// Chocolatey's database is the list of packages the OS scan has already made.
// The client is itself a package, so a Chocolatey with none listed was not
// listed: the query failed.
function readChocolatey(context) {
  const configured =
    context.readEnv("ChocolateyInstall") ||
    join(context.rootPath, "ProgramData", "chocolatey");
  const result = database("chocolatey", configured);
  if (!safeExistsSync(configured)) {
    result.state = "absent";
    return result;
  }
  const packages = (context.packageComponents || []).filter((component) =>
    component?.purl?.startsWith("pkg:chocolatey/"),
  );
  if (!packages.length) {
    result.state = "unreadable";
    return result;
  }
  result.directory = realPathOf(configured) || resolve(configured);
  result.hasPhp = packages.some(
    (component) => `${component.name}`.toLowerCase() === "php",
  );
  return result;
}

// Chocolatey's php package unpacks under C:\tools by default, outside the
// package's own folder, so what makes a file Chocolatey's is the package being
// installed and the file being where the package puts it.
function chocolateyOwns(chocolatey, context, candidate) {
  if (!chocolatey.hasPhp) {
    return false;
  }
  const first = relative(context.realRoot, candidate.real).split(sep)[0];
  return (
    first.toLowerCase() === "tools" ||
    candidate.real.startsWith(`${chocolatey.directory}${sep}`)
  );
}

// The directories to look in, as absolute paths.
function candidateDirectories(context) {
  const { rootPath, platform } = context;
  const directories = [];
  if (platform === "win32") {
    const programFiles =
      context.readEnv("ProgramFiles") || join(rootPath, "Program Files");
    for (const parent of [rootPath, join(rootPath, "tools"), programFiles]) {
      for (const name of listDirectory(parent)) {
        const directory = join(parent, name);
        if (name.toLowerCase().startsWith("php") && isDirectory(directory)) {
          directories.push({ directory });
        }
      }
    }
    return directories;
  }
  for (const { dir, only } of POSIX_DIRECTORIES[platform] || []) {
    if (!dir.startsWith("opt/*/")) {
      directories.push({ directory: join(rootPath, dir), only });
      continue;
    }
    const leaf = dir.slice("opt/*/".length);
    for (const name of listDirectory(join(rootPath, "opt"))) {
      const directory = join(rootPath, "opt", name, leaf);
      if (isDirectory(directory)) {
        directories.push({ directory, only });
      }
    }
  }
  return directories;
}

// A path as the system being described names it, and as a purl subpath. `base`
// is the directory the path hangs off, so that a symlinked root, as a temporary
// directory often is, does not matter.
function locate(context, base, absolutePath) {
  const parts = relative(base, absolutePath).split(sep);
  return {
    logical: context.pathApi.join(context.logicalRoot, ...parts),
    subpath: parts.join("/"),
  };
}

/**
 * The distinct PHP files of the fixed directories, at most `maxProbes`. A
 * symlink is read through to the file it names, which must itself be a PHP
 * file under the root, and two names for one file are one candidate.
 *
 * @param {Object} context probe context
 * @returns {Object[]} candidates with their real path, SAPI and locations
 */
function collectCandidates(context) {
  const { realRoot, platform, maxProbes } = context;
  const classify =
    platform === "win32"
      ? (name) => WINDOWS_SAPIS[name.toLowerCase()]
      : classifyPhpSapi;
  const candidates = [];
  const seen = new Set();
  for (const { directory, only } of candidateDirectories(context)) {
    for (const name of listDirectory(directory)) {
      const listed = join(directory, name);
      const real = realPathOf(listed);
      if (!real || seen.has(real) || !classify(name)) {
        continue;
      }
      const sapi = classify(basename(real));
      const inside = relative(realRoot, real);
      if (
        !sapi ||
        (only && sapi !== only) ||
        !inside ||
        inside.startsWith("..") ||
        isAbsolute(inside)
      ) {
        continue;
      }
      try {
        if (!statSync(real).isFile()) {
          continue;
        }
      } catch {
        continue;
      }
      if (candidates.length >= maxProbes) {
        thoughtLog(
          `The PHP host probe looked at ${maxProbes} files and left any others unread.`,
        );
        return candidates;
      }
      seen.add(real);
      candidates.push({
        real,
        sapi,
        name: basename(real),
        ...locate(context, realRoot, real),
        listedLogical: locate(context, context.rootPath, listed).logical,
      });
    }
  }
  return candidates;
}

function recordUnreadable(unreadable, recorded) {
  if (recorded.has(unreadable.name)) {
    return;
  }
  recorded.add(unreadable.name);
  recordDegradation("php.host-probe.package-db-unreadable", {
    ecosystem: "php",
    tool: unreadable.name,
    impact: "components",
    path: unreadable.path,
    detail: `The ${unreadable.name} package database could not be read in full, so PHP files it may own were not identified as unpackaged PHP.`,
  });
}

/**
 * Sort the candidates into those a package owns, those whose ownership could
 * not be settled, and the unpackaged rest.
 *
 * @param {Object[]} candidates candidates from collectCandidates
 * @param {Object} context probe context
 * @returns {{unpackaged: Object[], owned: number, unknown: number}}
 */
function classifyOwnership(candidates, context) {
  const unpackaged = [];
  const recorded = new Set();
  let owned = 0;
  let unknown = 0;
  const pending = candidates.filter((candidate) => {
    if (homebrewOwner(candidate.real)) {
      owned++;
      return false;
    }
    return true;
  });
  if (!pending.length) {
    return { unpackaged, owned, unknown };
  }
  const wanted = new Set(
    pending.flatMap((candidate) => [
      candidate.logical,
      candidate.listedLogical,
    ]),
  );
  const databases = [];
  if (context.platform === "win32") {
    databases.push(readChocolatey(context));
  } else {
    const { dpkgInfoDirectory, apkInstalledFile, rpmDatabaseDirectories } =
      context.databases;
    databases.push(
      scanDpkg(dpkgInfoDirectory, wanted),
      scanApk(apkInstalledFile, wanted),
    );
    // Only what dpkg and apk did not claim is asked of osquery.
    const claimed = new Set(databases.flatMap((db) => [...db.owned]));
    databases.push(
      queryRpm(
        rpmDatabaseDirectories,
        new Set([...wanted].filter((path) => !claimed.has(path))),
        context.executeOsQuery,
      ),
    );
  }
  for (const candidate of pending) {
    const paths = [candidate.logical, candidate.listedLogical];
    const isOwned = databases.some(
      (db) =>
        db.state === "ok" &&
        (db.name === "chocolatey"
          ? chocolateyOwns(db, context, candidate)
          : paths.some((path) => db.owned.has(path))),
    );
    if (isOwned) {
      owned++;
      continue;
    }
    const unreadable = databases.filter((db) => db.state === "unreadable");
    if (!unreadable.length) {
      unpackaged.push(candidate);
      continue;
    }
    unknown++;
    for (const db of unreadable) {
      recordUnreadable(db, recorded);
    }
  }
  return { unpackaged, owned, unknown };
}

// Like a container's unpackaged files, but named by where they are: a host can
// hold several binaries of one name.
function fileComponent(candidate) {
  const purl = tryBuildPurl({
    type: "generic",
    name: candidate.name,
    subpath: candidate.subpath,
  });
  return {
    name: candidate.name,
    type: "file",
    ...(purl ? { purl } : {}),
    "bom-ref": purl ? decodeURIComponent(purl) : `file:${candidate.logical}`,
    properties: [{ name: "internal:SrcFile", value: candidate.logical }],
    evidence: {
      identity: [
        {
          field: "purl",
          confidence: 0,
          methods: [
            { technique: "filename", confidence: 0, value: candidate.logical },
          ],
          concludedValue: candidate.logical,
        },
      ],
    },
  };
}

// On Windows the CGI and debugger executables hold no version; the core DLL in
// the same directory does.
function readBuild(context, candidate) {
  const build = readPhpBuildVersion(candidate.real, context.realRoot);
  if (build || context.platform !== "win32") {
    return build;
  }
  const directory = dirname(candidate.real);
  for (const name of listDirectory(directory)) {
    if (isWindowsCoreLibrary(name)) {
      const fromLibrary = readPhpBuildVersion(
        join(directory, name),
        context.realRoot,
      );
      if (fromLibrary) {
        return fromLibrary;
      }
    }
  }
  return undefined;
}

function createContext(options, platform, readEnv, logicalRoot) {
  const rootPath = options.rootPath || logicalRoot;
  const realRoot = realPathOf(rootPath);
  if (!realRoot) {
    return undefined;
  }
  const databases = options.packageDatabases || {};
  return {
    platform,
    readEnv,
    rootPath,
    realRoot,
    logicalRoot,
    pathApi: platform === "win32" ? win32 : posix,
    maxProbes: options.maxProbes || MAX_PHP_PROBES,
    executeOsQuery: options.executeOsQuery,
    packageComponents: options.packageComponents,
    databases: {
      dpkgInfoDirectory:
        databases.dpkgInfoDirectory || join(rootPath, "var/lib/dpkg/info"),
      apkInstalledFile:
        databases.apkInstalledFile || join(rootPath, "lib/apk/db/installed"),
      rpmDatabaseDirectories: databases.rpmDatabaseDirectories || [
        join(rootPath, "var/lib/rpm"),
        join(rootPath, "usr/lib/sysimage/rpm"),
      ],
    },
  };
}

/**
 * Look for PHP no package manager owns, in the fixed directories of the host.
 * Components come back only for the files nothing owns: a `file` component for
 * each PHP binary or library with the cdx:php properties, one `platform`
 * component per version with its CPE, and the edges between them.
 *
 * @param {Object} [options] probe options
 * @param {string} [options.rootPath] directory the fixed directories hang off:
 *   `/`, or the system drive on Windows. Tests point it at a built tree.
 * @param {string} [options.platform] `linux`, `darwin` or `win32`
 * @param {Object} [options.env] environment read for ProgramFiles, SystemDrive
 *   and ChocolateyInstall, instead of the process's
 * @param {{dpkgInfoDirectory?: string, apkInstalledFile?: string, rpmDatabaseDirectories?: string[]}} [options.packageDatabases]
 *   where the package databases are, instead of under `rootPath`
 * @param {function(string): (Object[]|undefined)} [options.executeOsQuery] runs
 *   an osquery query; the rpm database is only asked through it
 * @param {Object[]} [options.packageComponents] the packages the OS scan has
 *   inventoried, from which Chocolatey's are known
 * @param {number} [options.maxProbes] most candidate files to look at
 * @returns {{components: Object[], dependencies: Object[]}}
 */
export function probeHostPhp(options = {}) {
  const empty = { components: [], dependencies: [] };
  const platform = options.platform || process.platform;
  const readEnv = (name) =>
    options.env ? options.env[name] : readEnvironmentVariable(name);
  const logicalRoot =
    platform === "win32" ? `${readEnv("SystemDrive") || "C:"}\\` : "/";
  if (isDryRun) {
    recordActivity({
      capability: "php-host-probe",
      kind: "read",
      reason:
        "Dry run mode blocks the PHP host probe, which opens executables and package databases outside the project.",
      status: "blocked",
      target: options.rootPath || logicalRoot,
    });
    return empty;
  }
  const context = createContext(options, platform, readEnv, logicalRoot);
  if (!context) {
    return empty;
  }
  const candidates = collectCandidates(context);
  if (!candidates.length) {
    return empty;
  }
  const { unpackaged, owned, unknown } = classifyOwnership(candidates, context);
  const inventory = createPhpRuntimeInventory();
  const files = [];
  for (const candidate of unpackaged) {
    const build = readBuild(context, candidate);
    if (build) {
      const component = fileComponent(candidate);
      attachPhpBuild(inventory, component, build, candidate.sapi);
      files.push(component);
    }
  }
  recordActivity({
    capability: "php-host-probe",
    kind: "read",
    reason: `Looked at ${candidates.length} PHP file(s) in the fixed directories: ${owned} owned by a package, ${unknown} of unknown ownership, ${files.length} unpackaged PHP identified.`,
    status: "completed",
    target: context.rootPath,
  });
  if (files.length) {
    thoughtLog(
      `I found ${files.length} unpackaged PHP file(s) on this host, from ${inventory.runtimeComponents.length} version(s).`,
    );
  }
  return {
    components: [
      ...files.sort(byBomRef),
      ...inventory.runtimeComponents.sort(byBomRef),
    ],
    dependencies: inventory.dependencies,
  };
}
