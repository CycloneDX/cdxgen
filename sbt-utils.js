const fs = require("fs");
const pathLib = require("path");
const propertiesReader = require("properties-reader");
const semver = require("semver");

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
 * Determine the version of SBT used in compilation of this project.
 * By default it looks into a standard SBT location i.e.
 * <path-project>/project/build.properties
 * Returns `null` if the version cannot be determined.
 *
 * @param {string} projectPath Path to the SBT project
 */
 const determineSbtVersion = function (projectPath) {
  const buildPropFile = pathLib.join(projectPath, "project", "build.properties");
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

    // sbt-dependency-graph may already be present in the users' plugins file.
    // Since we are using our own version of it, and require the most
    // recent one, we have to ensure that there are no conflicts.
    // There is no version resolution for plugins in SBT, and it seems to pick
    // the first one that is defined. Rather than pre-pending the plugin,
    // and wishing we are lucky, we just make sure there are no conflicts by
    // ignoring the plugin.
    var data = fs.readFileSync(pluginsFile, 'utf-8').toString();
    var newData = data.replace(/^(.+\"sbt-dependency-graph\".+)/gim, '//$1');
    fs.writeFileSync(pluginsFile, newData, 'utf-8');
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
  return pathLib.join(projectPath, "project", "plugins.sbt");
};

/**
 * Parse dependencies in Key:Value format
 */
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
