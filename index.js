const readInstalled = require("read-installed");
const parsePackageJsonName = require("parse-packagejson-name");
const pathLib = require("path");
const request = require("request");
const ssri = require("ssri");
const fs = require("fs");
const uuidv4 = require("uuid/v4");
const PackageURL = require("packageurl-js");
const builder = require("xmlbuilder");
const utils = require("./utils");
const { spawnSync } = require("child_process");

let MVN_CMD = "mvn";
if (process.env.MVN_CMD) {
  MVN_CMD = process.env.MVN_CMD;
} else if (process.env.MAVEN_HOME) {
  MVN_CMD = pathLib.join(process.env.MAVEN_HOME, "bin", "mvn");
}

/**
 * Method to create global external references
 *
 * @param pkg
 * @returns {Array}
 */
function addGlobalReferences(src, filename) {
  let externalReferences = [];
  externalReferences.push({
    reference: { "@type": "other", url: src, comment: "Base path" },
  });
  externalReferences.push({
    reference: {
      "@type": "other",
      url: pathLib.join(src, filename),
      comment: "Package file",
    },
  });
  return externalReferences;
}

/**
 * Method to create external references
 *
 * @param pkg
 * @returns {Array}
 */
function addExternalReferences(pkg) {
  let externalReferences = [];
  if (pkg.homepage) {
    externalReferences.push({
      reference: { "@type": "website", url: pkg.homepage },
    });
  }
  if (pkg.bugs && pkg.bugs.url) {
    externalReferences.push({
      reference: { "@type": "issue-tracker", url: pkg.bugs.url },
    });
  }
  if (pkg.repository && pkg.repository.url) {
    externalReferences.push({
      reference: { "@type": "vcs", url: pkg.repository.url },
    });
  }
  return externalReferences;
}

/**
 * For all modules in the specified package, creates a list of
 * component objects from each one.
 */
exports.listComponents = listComponents;
function listComponents(pkg, ptype = "npm") {
  let list = {};
  let isRootPkg = ptype === "npm";
  if (Array.isArray(pkg)) {
    pkg.forEach((p) => {
      addComponent(p, ptype, list, false);
    });
  } else {
    addComponent(pkg, ptype, list, isRootPkg);
  }
  return Object.keys(list).map((k) => ({ component: list[k] }));
}

/**
 * Given the specified package, create a CycloneDX component and add it to the list.
 */
function addComponent(pkg, ptype, list, isRootPkg = false) {
  //read-installed with default options marks devDependencies as extraneous
  //if a package is marked as extraneous, do not include it as a component
  if (pkg.extraneous) return;
  if (!isRootPkg) {
    let pkgIdentifier = parsePackageJsonName(pkg.name);
    let group = pkg.group || pkgIdentifier.scope;
    let name = pkgIdentifier.fullName || pkg.name;
    // Skip @types package for npm
    if (ptype == "npm" && (group === "types" || name.startsWith("@types"))) {
      return;
    }
    let version = pkg.version;
    let licenses = utils.getLicenses(pkg);
    let purl = new PackageURL(
      ptype,
      group,
      name,
      version,
      pkg.qualifiers,
      pkg.subpath
    );
    let purlString = purl.toString();
    purlString = decodeURIComponent(purlString);
    let component = {
      "@type": determinePackageType(pkg),
      "@bom-ref": purlString,
      group: group,
      name: name,
      version: version,
      description: { "#cdata": pkg.description },
      hashes: [],
      licenses: licenses,
      purl: purlString,
      externalReferences: addExternalReferences(pkg),
    };

    if (
      component.externalReferences === undefined ||
      component.externalReferences.length === 0
    ) {
      delete component.externalReferences;
    }

    processHashes(pkg, component);

    if (list[component.purl]) return; //remove cycles
    list[component.purl] = component;
  }
  if (pkg.dependencies) {
    Object.keys(pkg.dependencies)
      .map((x) => pkg.dependencies[x])
      .filter((x) => typeof x !== "string") //remove cycles
      .map((x) => addComponent(x, ptype, list));
  }
}

/**
 * If the author has described the module as a 'framework', the take their
 * word for it, otherwise, identify the module as a 'library'.
 */
function determinePackageType(pkg) {
  if (pkg.hasOwnProperty("keywords")) {
    for (let keyword of pkg.keywords) {
      if (keyword.toLowerCase() === "framework") {
        return "framework";
      }
    }
  }
  return "library";
}

/**
 * Uses the SHA1 shasum (if present) otherwise utilizes Subresource Integrity
 * of the package with support for multiple hashing algorithms.
 */
function processHashes(pkg, component) {
  if (pkg._shasum) {
    component.hashes.push({
      hash: { "@alg": "SHA-1", "#text": pkg._shasum },
    });
  } else if (pkg._integrity) {
    let integrity = ssri.parse(pkg._integrity);
    // Components may have multiple hashes with various lengths. Check each one
    // that is supported by the CycloneDX specification.
    if (integrity.hasOwnProperty("sha512")) {
      addComponentHash("SHA-512", integrity.sha512[0].digest, component);
    }
    if (integrity.hasOwnProperty("sha384")) {
      addComponentHash("SHA-384", integrity.sha384[0].digest, component);
    }
    if (integrity.hasOwnProperty("sha256")) {
      addComponentHash("SHA-256", integrity.sha256[0].digest, component);
    }
    if (integrity.hasOwnProperty("sha1")) {
      addComponentHash("SHA-1", integrity.sha1[0].digest, component);
    }
  }
  if (component.hashes.length === 0) {
    delete component.hashes; // If no hashes exist, delete the hashes node (it's optional)
  }
}

/**
 * Adds a hash to component.
 */
function addComponentHash(alg, digest, component) {
  let hash = Buffer.from(digest, "base64").toString("hex");
  component.hashes.push({ hash: { "@alg": alg, "#text": hash } });
}

const buildBomString = (
  { includeBomSerialNumber, pkgInfo, ptype, context },
  callback
) => {
  let bom = builder
    .create("bom", { encoding: "utf-8", separateArrayItems: true })
    .att("xmlns", "http://cyclonedx.org/schema/bom/1.1");
  if (includeBomSerialNumber) {
    bom.att("serialNumber", "urn:uuid:" + uuidv4());
  }
  bom.att("version", 1);
  if (context && context.src && context.filename) {
    bom
      .ele("externalReferences")
      .ele(addGlobalReferences(context.src, context.filename));
  }
  const components = listComponents(pkgInfo, ptype);
  if (components && components.length) {
    bom.ele("components").ele(components);
    let bomString = bom.end({
      pretty: true,
      indent: "  ",
      newline: "\n",
      width: 0,
      allowEmpty: false,
      spacebeforeslash: "",
    });
    callback(null, bomString);
  } else {
    callback();
  }
};

/**
 * Function to create bom string for various languages
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
exports.createBom = async (includeBomSerialNumber, path, options, callback) => {
  try {
    fs.accessSync(path, fs.constants.R_OK);
  } catch (err) {
    console.error(path, "is invalid");
    process.exit(1);
  }
  const { projectType } = options;
  // node.js - package.json
  if (
    projectType === "nodejs" ||
    fs.existsSync(pathLib.join(path, "package.json")) ||
    fs.existsSync(pathLib.join(path, "rush.json"))
  ) {
    if (fs.existsSync(pathLib.join(path, "node_modules"))) {
      readInstalled(path, options, (err, pkgInfo) => {
        buildBomString(
          {
            includeBomSerialNumber,
            pkgInfo,
            ptype: "npm",
            context: { src: path, filename: "package.json" },
          },
          callback
        );
      });
    } else if (fs.existsSync(pathLib.join(path, "package-lock.json"))) {
      // Parse package-lock.json if available
      const pkgList = utils.parsePkgLock(
        pathLib.join(path, "package-lock.json")
      );
      console.log(
        "NOTE: To obtain license information for the node.js dependencies perform npm or yarn install before invoking this script"
      );
      return buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "npm",
          context: { src: path, filename: "package-lock.json" },
        },
        callback
      );
    } else if (fs.existsSync(pathLib.join(path, "rush.json"))) {
      // Rush.js creates node_modules inside common/temp directory
      const nmDir = pathLib.join(path, "common", "temp", "node_modules");
      // Do rush install if we don't have node_modules directory
      if (!fs.existsSync(nmDir)) {
        console.log("Executing 'rush install --no-link'", path);
        result = spawnSync(
          "rush",
          ["install", "--no-link", "--bypass-policy"],
          { cwd: path }
        );
      }
      // Look for shrinkwrap file
      const swFile = pathLib.join(
        path,
        "tools",
        "build-tasks",
        ".rush",
        "temp",
        "shrinkwrap-deps.json"
      );
      const pnpmLock = pathLib.join(
        path,
        "common",
        "config",
        "rush",
        "pnpm-lock.yaml"
      );
      if (fs.existsSync(swFile)) {
        const pkgList = utils.parseNodeShrinkwrap(swFile);
        return buildBomString(
          {
            includeBomSerialNumber,
            pkgInfo: pkgList,
            ptype: "npm",
            context: { src: path, filename: "shrinkwrap-deps.json" },
          },
          callback
        );
      } else if (fs.existsSync(pnpmLock)) {
        const pkgList = utils.parsePnpmLock(pnpmLock);
        return buildBomString(
          {
            includeBomSerialNumber,
            pkgInfo: pkgList,
            ptype: "npm",
            context: { src: path, filename: "pnpm-lock.yaml" },
          },
          callback
        );
      } else {
        console.log(
          "Neither shrinkwrap file: ",
          swFile,
          " nor pnpm lockfile",
          pnpmLock,
          "was found!"
        );
      }
    } else if (fs.existsSync(pathLib.join(path, "yarn.lock"))) {
      // Parse yarn.lock if available. This is check after rush.json since
      // rush.js could include yarn.lock :(
      const pkgList = utils.parseYarnLock(pathLib.join(path, "yarn.lock"));
      return buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "npm",
          context: { src: path, filename: "yarn.lock" },
        },
        callback
      );
    } else {
      console.error(
        "Unable to find node_modules or package-lock.json or rush.json or yarn.lock at",
        path
      );
      callback();
    }
  }
  // maven - pom.xml
  const pomFiles = utils.getAllFiles(path, "pom.xml");
  if (pomFiles && pomFiles.length) {
    let pkgList = [];
    for (let i in pomFiles) {
      const f = pomFiles[i];
      const basePath = pathLib.dirname(f);
      console.log(
        "Executing 'mvn org.cyclonedx:cyclonedx-maven-plugin:makeAggregateBom' in",
        basePath
      );
      result = spawnSync(
        MVN_CMD,
        ["org.cyclonedx:cyclonedx-maven-plugin:makeAggregateBom"],
        { cwd: basePath }
      );
      if (result.status == 1 || result.error) {
        const dlist = utils.parsePom(f);
        if (dlist && dlist.length) {
          pkgList = pkgList.concat(dlist);
        }
        pkgList = await utils.getMvnMetadata(pkgList);
        return buildBomString(
          {
            includeBomSerialNumber,
            pkgInfo: pkgList,
            ptype: "maven",
            context: { src: path, filename: "pom.xml" },
          },
          callback
        );
      }
    }
    const firstPath = pathLib.dirname(pomFiles[0]);
    if (fs.existsSync(pathLib.join(firstPath, "target", "bom.xml"))) {
      const bomString = fs.readFileSync(
        pathLib.join(firstPath, "target", "bom.xml"),
        { encoding: "utf-8" }
      );
      callback(null, bomString);
    } else {
      const bomFiles = utils.getAllFiles(path, "bom.xml");
      callback(null, bomFiles);
    }
  }
  // gradle
  const gradleFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "build.gradle"
  );
  if (gradleFiles && gradleFiles.length) {
    let GRADLE_CMD = "gradle";
    if (process.env.GRADLE_HOME) {
      GRADLE_CMD = pathLib.join(process.env.GRADLE_HOME, "bin", "gradle");
    }
    if (fs.existsSync(pathLib.join(path, "gradlew"))) {
      GRADLE_CMD = "gradlew";
    }
    let pkgList = [];
    for (let i in gradleFiles) {
      const f = gradleFiles[i];
      const basePath = pathLib.dirname(f);
      console.log("Executing 'gradle dependencies' in", basePath);
      const result = spawnSync(
        GRADLE_CMD,
        [
          "dependencies",
          "-q",
          "--configuration",
          "default",
          "--console",
          "plain",
        ],
        { cwd: basePath }
      );
      const cmdOutput = Buffer.from(result.stdout).toString();
      const dlist = utils.parseGradleDep(cmdOutput);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    pkgList = await utils.getMvnMetadata(pkgList);
    buildBomString(
      {
        includeBomSerialNumber,
        pkgInfo: pkgList,
        ptype: "maven",
        context: { src: path, filename: "build.gradle" },
      },
      callback
    );
  }
  // python
  const pipenvMode = fs.existsSync(pathLib.join(path, "Pipfile"));
  const poetryMode = fs.existsSync(pathLib.join(path, "poetry.lock"));
  const reqFile = pathLib.join(path, "requirements.txt");
  const setupPy = pathLib.join(path, "setup.py");
  const requirementsMode = fs.existsSync(reqFile);
  const setupPyMode = fs.existsSync(setupPy);
  if (
    projectType === "python" ||
    requirementsMode ||
    pipenvMode ||
    poetryMode ||
    setupPyMode
  ) {
    if (pipenvMode) {
      spawnSync("pipenv", ["install"], { cwd: path });
      const piplockFile = pathLib.join(path, "Pipfile.lock");
      if (fs.existsSync(piplockFile)) {
        const lockData = JSON.parse(fs.readFileSync(piplockFile));
        const pkgList = await utils.parsePiplockData(lockData);
        buildBomString(
          {
            includeBomSerialNumber,
            pkgInfo: pkgList,
            ptype: "pypi",
            context: { src: path, filename: "Pipfile.lock" },
          },
          callback
        );
      } else {
        console.error("Pipfile.lock not found at", path);
      }
    } else if (poetryMode) {
      const poetrylockFile = pathLib.join(path, "poetry.lock");
      const lockData = fs.readFileSync(poetrylockFile, {
        encoding: "utf-8",
      });
      const pkgList = await utils.parsePoetrylockData(lockData);
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "pypi",
          context: { src: path, filename: "poetry.lock" },
        },
        callback
      );
    } else if (requirementsMode) {
      const reqData = fs.readFileSync(reqFile, { encoding: "utf-8" });
      const pkgList = await utils.parseReqFile(reqData);
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "pypi",
          context: { src: path, filename: "requirements.txt" },
        },
        callback
      );
    } else if (setupPyMode) {
      const setupPyData = fs.readFileSync(setupPy, { encoding: "utf-8" });
      const pkgList = await utils.parseSetupPyFile(setupPyData);
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "pypi",
          context: { src: path, filename: "setup.py" },
        },
        callback
      );
    } else {
      console.error(
        "Unable to find requirements.txt or Pipfile.lock for the python project at",
        path
      );
      callback();
    }
  }
  // go
  const gosumFile = pathLib.join(path, "go.sum");
  const gopkgLockFile = pathLib.join(path, "Gopkg.lock");
  const gosumMode = fs.existsSync(gosumFile);
  const gopkgMode = fs.existsSync(gopkgLockFile);
  if (
    projectType === "go" ||
    projectType === "golang" ||
    gosumMode ||
    gopkgMode
  ) {
    if (gosumMode) {
      const gosumData = fs.readFileSync(gosumFile, { encoding: "utf-8" });
      const pkgList = await utils.parseGosumData(gosumData);
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "golang",
          context: { src: path, filename: "go.sum" },
        },
        callback
      );
    } else if (gopkgMode) {
      const gopkgData = fs.readFileSync(gopkgLockFile, {
        encoding: "utf-8",
      });
      const pkgList = await utils.parseGopkgData(gopkgData);
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "golang",
          context: { src: path, filename: "Gopkg.lock" },
        },
        callback
      );
    } else {
      console.error(
        "Unable to find go.sum or Gopkg.lock for the python project at",
        path
      );
      callback();
    }
  }

  // rust
  const cargoFile = pathLib.join(path, "Cargo.lock");
  const cargoMode = fs.existsSync(cargoFile);
  if (projectType === "rust" || projectType === "rust-lang" || cargoMode) {
    if (cargoMode) {
      const cargoData = fs.readFileSync(cargoFile, { encoding: "utf-8" });
      const pkgList = await utils.parseCargoData(cargoData);
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "crates",
          context: { src: path, filename: "Cargo.lock" },
        },
        callback
      );
    } else {
      console.error("Unable to find Cargo.lock for the rust project at", path);
      callback();
    }
  }

  // php
  const composerJsonFile = pathLib.join(path, "composer.json");
  const composerLockFile = pathLib.join(path, "composer.lock");
  const composerJsonMode = fs.existsSync(composerJsonFile);
  let composerLockMode = fs.existsSync(composerLockFile);
  if (projectType === "php" || composerJsonMode || composerLockMode) {
    if (!composerLockMode && composerJsonMode) {
      console.log("Executing 'composer install' in", path);
      result = spawnSync("composer", ["install"], { cwd: path });
      if (result.status == 1 || result.error) {
        console.error("Composer install has failed.");
      }
      composerLockMode = fs.existsSync(composerLockFile);
    }
    if (composerLockMode) {
      const pkgList = utils.parseComposerLock(composerLockFile);
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "composer",
          context: { src: path, filename: "composer.lock" },
        },
        callback
      );
    } else {
      console.error(
        "Unable to find composer.lock or composer.json for the php project at",
        path
      );
      callback();
    }
  }

  // .Net
  const csProjFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*.csproj"
  );
  if (
    projectType === "netcore" ||
    projectType === "dotnet" ||
    csProjFiles.length
  ) {
    let pkgList = [];
    for (let i in csProjFiles) {
      const f = csProjFiles[i];
      let csProjData = fs.readFileSync(f, { encoding: "utf-8" });
      if (csProjData.charCodeAt(0) === 0xfeff) {
        csProjData = csProjData.slice(1);
      }
      const dlist = await utils.parseCsProjData(csProjData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    if (pkgList.length) {
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "nuget",
          context: { src: path, filename: csProjFiles.join(", ") },
        },
        callback
      );
    } else {
      console.error("Unable to find .Net core dependencies at", path);
      callback();
    }
  }
};

/**
 * Method to submit the generated bom to dependency-track or AppThreat server
 *
 * @param args CLI args
 */
exports.submitBom = function (args, bom, callback) {
  let serverUrl = args.serverUrl + "/api/v1/bom";

  const formData = {
    bom: {
      value: bom,
      options: {
        filename: args.output ? pathLib.basename(args.output) : "bom.xml",
        contentType: "text/xml",
      },
    },
  };
  if (args.projectId) {
    formData.project = args.projectId;
  } else if (args.projectName) {
    formData.projectName = args.projectName;
    formData.projectVersion = args.projectVersion;
    formData.autoCreate = "true";
  }
  const options = {
    method: "POST",
    url: serverUrl,
    port: 443,
    json: true,
    headers: {
      "X-Api-Key": args.apiKey,
      "Content-Type": "multipart/form-data",
    },
    formData,
  };
  request(options, callback);
};
