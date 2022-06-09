const fs = require("fs");
const os = require("os");
const pathLib = require("path");
const propertiesReader = require("properties-reader");
const semver = require("semver");
const { spawnSync } = require("child_process");
const utils = require("./utils");

const ADD_SBT_PLUGIN='addSbtPlugin("net.virtual-void" % "sbt-dependency-graph" % "0.10.0-RC1")';
const ENABLE_SBT_PLUGIN='addDependencyTreePlugin';
const EOL = "\n";

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
  function uniqueFilename(attempt) {
    const proposedName = pathLib.join(projectPath, 'project', `shiftleft-cdxgen-plugins${attempt}.sbt`);
    if (!fs.existsSync(proposedName)) {
      return proposedName;
    } else {
      return uniqueFilename(attempt + 1);
    }
  }

  const pluginFileName = uniqueFilename(0);
  fs.writeFileSync(pluginFileName, plugin);
  return pluginFileName;
};

/**
 * 
 * @param {string} input output of `sbt projectInfo` command
 * @returns {Array.<string>} list of sbt projects
 */
const parseProjectInfo = function(input) {
  const startFrom = 'ModuleInfo('.length;
  const regex = /ModuleInfo\([^,]+,/g;
  return [...input.matchAll(regex)].map(s => s.toString()).map(s => s.substr(startFrom, s.length - (startFrom + 1)));
}
exports.parseProjectInfo = parseProjectInfo;

 /**
 * Parse dependencies in Key:Value format
 */
const parseKVDep = function (rawOutput) {
  if (typeof rawOutput === "string") {
    const deps = [];
    rawOutput.split(EOL).forEach((l) => {
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

const sbtInvoker = function (debugMode, path, tempSbtPlugins) {
  let SBT_CMD = process.env.SBT_CMD || "sbt";
  let sbtVersion = determineSbtVersion(path);
  if (debugMode) {
    console.log("Detected sbt version: " + sbtVersion);
  }
  const standalonePluginFileSupported = standalonePluginFile(sbtVersion);
  const disableAggregateString = isDependencyTreeBuiltIn(sbtVersion) ? `set every _root_.sbt.plugins.DependencyTreePlugin.autoImport.dependencyList / aggregate := false` : `set every dependencyList / aggregate := false`

  let enablePluginString =  isDependencyTreeBuiltIn(sbtVersion) ? ENABLE_SBT_PLUGIN : ADD_SBT_PLUGIN;

  if (standalonePluginFileSupported) {
    fs.writeFileSync(tempSbtPlugins, enablePluginString);
  }

  return {
    invokeDependencyList: function(commandPrefix, basePath, timeoutMs) {
      let dependencyListCmd;
      let filesToGatherOutput = [];
      
      let tmpDir = pathLib.join(os.tmpdir(), 'cdxgen-sbt');
      outDir = fs.mkdtempSync(tmpDir);
      if (commandPrefix !== '') {
        outFile = pathLib.join(outDir, 'outfile')
        dependencyListCmd = `";${disableAggregateString};${commandPrefix}dependencyList::toFile ${outFile} --force"`
        filesToGatherOutput = [outFile];
      } else {
        const projectInfoRes = spawnSync(SBT_CMD, ["projectInfo"], { cwd: basePath, shell: true, encoding: "utf-8", timeout: timeoutMs });
        let subProjects = parseProjectInfo(projectInfoRes.stdout);

        let subProjectsWithFiles = subProjects.map(sp => ({project: sp, filename: pathLib.join(outDir, `out-${sp}`)}));

        dependencyListCmd = `";${disableAggregateString}` + subProjectsWithFiles.map(x => `;${x.project}/dependencyList::toFile ${x.filename} --force`).join('') + `"`;
        filesToGatherOutput = subProjectsWithFiles.map(x => x.filename);
      }

      let pluginFileName = '';
      if (standalonePluginFileSupported) {
        sbtArgs = [`-addPluginSbtFile=${tempSbtPlugins}`, dependencyListCmd]
      } else {
        // write to a new shiftleft-cdxgen-plugins0.sbt file
        pluginFileName = addPlugin(basePath, enablePluginString);
        sbtArgs = [dependencyListCmd]
      }

      try {
        console.log(`Executing ${SBT_CMD} ${sbtArgs} in ${basePath}`)
        // Note that the command has to be invoked with `shell: true` to properly execut sbt
        const result = spawnSync(
          SBT_CMD,
          sbtArgs,
          { cwd: basePath, shell: true, encoding: "utf-8", timeout: timeoutMs }
        );
        if (result.status == 1 || result.error) {
          console.error(result.stdout, result.stderr);
          utils.debug(`1. Check if scala and sbt is installed and available in PATH. Only scala 2.10 + sbt 0.13.6+ and 2.12 + sbt 1.0+ is supported for now.`);
          utils.debug(`2. Check if the plugin net.virtual-void:sbt-dependency-graph 0.10.0-RC1 can be used in the environment`);
        } else {
          utils.debug(result.stdout);
        }
      } finally {
        if (pluginFileName != '' && fs.existsSync(pluginFileName)) {
          fs.rmSync(pluginFileName);
        }
      }
      outputAsStr = '';
      filesToGatherOutput.forEach(f => {
        if (fs.existsSync(f)) {
          try {
            outputAsStr += fs.readFileSync(f, { encoding: "utf-8" });
            // Files we merge don't have trailing EOL so if we don't put it manually we would end up with 2 entries at a single line
            outputAsStr += EOL;
          } catch(error) {
          }
        }
      });
      return outputAsStr;
    }
  }
}
exports.sbtInvoker = sbtInvoker;

/**
 *
 * @param {string} sbtVersion SBT version, might be null
 * @returns {boolean} true if SBT version has sbt-dependency-graph built-in
 */
const isDependencyTreeBuiltIn = function(sbtVersion) {
  // Introduced in https://www.scala-sbt.org/1.x/docs/sbt-1.4-Release-Notes.html#sbt-dependency-graph+is+in-sourced
  return sbtVersion != null && semver.gte(sbtVersion, "1.4.0");
}

/**
 *
 * @param {string} sbtVersion SBT version, might be null
 * @returns {boolean} true if SBT version supports addPluginSbtFile
 */
 const standalonePluginFile = function (sbtVersion) {
  // Introduced in https://www.scala-sbt.org/1.x/docs/sbt-1.2-Release-Notes.html#addPluginSbtFile+command
  return sbtVersion != null && semver.gte(sbtVersion, "1.2.0");
}
