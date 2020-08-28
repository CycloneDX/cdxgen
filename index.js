const readInstalled = require("read-installed");
const parsePackageJsonName = require("parse-packagejson-name");
const os = require("os");
const pathLib = require("path");
const request = require("request");
const ssri = require("ssri");
const fs = require("fs");
const uuidv4 = require("uuid/v4");
const PackageURL = require("packageurl-js");
const builder = require("xmlbuilder");
const utils = require("./utils");
const { spawnSync } = require("child_process");
const selfPjson = require("./package.json");
const { findJSImports } = require("./analyzer");

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
 * Function to create metadata block
 *
 */
function addMetadata() {
  let metadata = {
    timestamp: new Date().toISOString(),
    tools: [
      {
        tool: {
          vendor: "AppThreat",
          name: "cdxgen",
          version: selfPjson.version,
        },
      },
    ],
    authors: [
      {
        author: { name: selfPjson.author, email: "cloud@appthreat.com" },
      },
    ],
    supplier: undefined,
  };
  return metadata;
}

/**
 * Method to create external references
 *
 * @param pkg
 * @returns {Array}
 */
function addExternalReferences(pkg, format = "xml") {
  let externalReferences = [];
  if (format === "xml") {
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
  } else {
    if (pkg.homepage) {
      externalReferences.push({
        type: "website",
        url: pkg.homepage,
      });
    }
    if (pkg.bugs && pkg.bugs.url) {
      externalReferences.push({
        type: "issue-tracker",
        url: pkg.bugs.url,
      });
    }
    if (pkg.repository && pkg.repository.url) {
      externalReferences.push({
        type: "vcs",
        url: pkg.repository.url,
      });
    }
  }
  return externalReferences;
}

/**
 * For all modules in the specified package, creates a list of
 * component objects from each one.
 */
exports.listComponents = listComponents;
function listComponents(allImports, pkg, ptype = "npm", format = "xml") {
  let list = {};
  let isRootPkg = ptype === "npm";
  if (Array.isArray(pkg)) {
    pkg.forEach((p) => {
      addComponent(allImports, p, ptype, list, false, format);
    });
  } else {
    addComponent(allImports, pkg, ptype, list, isRootPkg, format);
  }
  if (format === "xml") {
    return Object.keys(list).map((k) => ({ component: list[k] }));
  } else {
    return Object.keys(list).map((k) => list[k]);
  }
}

/**
 * Given the specified package, create a CycloneDX component and add it to the list.
 */
function addComponent(
  allImports,
  pkg,
  ptype,
  list,
  isRootPkg = false,
  format = "xml"
) {
  //read-installed with default options marks devDependencies as extraneous
  //if a package is marked as extraneous, do not include it as a component
  if (pkg.extraneous) return;
  if (!isRootPkg) {
    let pkgIdentifier = parsePackageJsonName(pkg.name);
    let group = pkg.group || pkgIdentifier.scope;
    // Create empty group for json format
    if (format === "json") {
      group = group || "";
    }
    let name = pkgIdentifier.fullName || pkg.name;
    // Skip @types package for npm
    if (ptype == "npm" && (group === "types" || name.startsWith("@types"))) {
      return;
    }
    let version = pkg.version;
    let licenses = utils.getLicenses(pkg, format);
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
      group: group,
      name: name,
      version: version,

      hashes: [],
      licenses: licenses,
      purl: purlString,
      externalReferences: addExternalReferences(pkg, format),
    };
    let compScope = undefined;
    if (allImports) {
      const impPkgs = Object.keys(allImports);
      if (impPkgs.includes(name) || impPkgs.includes(group + "/" + name)) {
        compScope = "required";
      }
    }
    if (compScope) {
      component["scope"] = compScope;
    }
    if (format === "xml") {
      component["@type"] = determinePackageType(pkg);
      component["@bom-ref"] = purlString;
      component["description"] = { "#cdata": pkg.description };
    } else {
      component["type"] = determinePackageType(pkg);
      component["bom-ref"] = purlString;
      component["description"] = pkg.description;
    }
    if (
      component.externalReferences === undefined ||
      component.externalReferences.length === 0
    ) {
      delete component.externalReferences;
    }

    processHashes(pkg, component, format);

    if (list[component.purl]) return; //remove cycles
    list[component.purl] = component;
  }
  if (pkg.dependencies) {
    Object.keys(pkg.dependencies)
      .map((x) => pkg.dependencies[x])
      .filter((x) => typeof x !== "string") //remove cycles
      .map((x) => addComponent(allImports, x, ptype, list, false, format));
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
function processHashes(pkg, component, format = "xml") {
  if (pkg._shasum) {
    let ahash = { "@alg": "SHA-1", "#text": pkg._shasum };
    if (format === "json") {
      ahash = { alg: "SHA-1", content: pkg._shasum };
      component.hashes.push(ahash);
    } else {
      component.hashes.push({
        hash: ahash,
      });
    }
  } else if (pkg._integrity) {
    let integrity = ssri.parse(pkg._integrity);
    // Components may have multiple hashes with various lengths. Check each one
    // that is supported by the CycloneDX specification.
    if (integrity.hasOwnProperty("sha512")) {
      addComponentHash(
        "SHA-512",
        integrity.sha512[0].digest,
        component,
        format
      );
    }
    if (integrity.hasOwnProperty("sha384")) {
      addComponentHash(
        "SHA-384",
        integrity.sha384[0].digest,
        component,
        format
      );
    }
    if (integrity.hasOwnProperty("sha256")) {
      addComponentHash(
        "SHA-256",
        integrity.sha256[0].digest,
        component,
        format
      );
    }
    if (integrity.hasOwnProperty("sha1")) {
      addComponentHash("SHA-1", integrity.sha1[0].digest, component, format);
    }
  }
  if (component.hashes.length === 0) {
    delete component.hashes; // If no hashes exist, delete the hashes node (it's optional)
  }
}

/**
 * Adds a hash to component.
 */
function addComponentHash(alg, digest, component, format = "xml") {
  let hash = Buffer.from(digest, "base64").toString("hex");
  let ahash = { "@alg": alg, "#text": hash };
  if (format === "json") {
    ahash = { alg: alg, content: hash };
    component.hashes.push(ahash);
  } else {
    component.hashes.push({ hash: ahash });
  }
}

const buildBomString = (
  { includeBomSerialNumber, pkgInfo, ptype, context },
  callback
) => {
  let bom = builder
    .create("bom", { encoding: "utf-8", separateArrayItems: true })
    .att("xmlns", "http://cyclonedx.org/schema/bom/1.2");
  const serialNum = "urn:uuid:" + uuidv4();
  if (includeBomSerialNumber) {
    bom.att("serialNumber", serialNum);
  }
  bom.att("version", 1);
  if (context && context.src && context.filename) {
    bom
      .ele("externalReferences")
      .ele(addGlobalReferences(context.src, context.filename));
  }
  let allImports = {};
  if (context && context.allImports) {
    allImports = context.allImports;
  }
  const metadata = addMetadata();
  bom.ele("metadata").ele(metadata);
  const components = listComponents(allImports, pkgInfo, ptype, "xml");
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
    // CycloneDX 1.2 Json Template
    let jsonTpl = {
      bomFormat: "CycloneDX",
      specVersion: "1.2",
      serialNumber: serialNum,
      version: 1,
      metadata: metadata,
      components: listComponents(allImports, pkgInfo, ptype, "json"),
    };
    callback(null, bomString, JSON.stringify(jsonTpl, null, 2));
  } else {
    callback();
  }
};

/**
 * Function to create bom string for Java projects
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
const createJavaBom = async (
  includeBomSerialNumber,
  path,
  options,
  callback
) => {
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
      let bomJonString = "";
      if (fs.existsSync(pathLib.join(firstPath, "target", "bom.json"))) {
        bomJonString = fs.readFileSync(
          pathLib.join(firstPath, "target", "bom.json"),
          { encoding: "utf-8" }
        );
      }
      callback(null, bomString, bomJonString);
    } else {
      const bomFiles = utils.getAllFiles(path, "bom.xml");
      const bomJsonFiles = utils.getAllFiles(path, "bom.json");
      callback(null, bomFiles, bomJsonFiles);
    }
  }
  // gradle
  let gradleFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "build.gradle*"
  );
  if (gradleFiles && gradleFiles.length) {
    let GRADLE_CMD = "gradle";
    if (process.env.GRADLE_HOME) {
      GRADLE_CMD = pathLib.join(process.env.GRADLE_HOME, "bin", "gradle");
    }
    // Use local gradle wrapper if available
    if (fs.existsSync(path, "gradlew")) {
      // Enable execute permission
      try {
        fs.chmodSync(pathLib.join(path, "gradlew"), 0o775);
      } catch (e) {}
      GRADLE_CMD = pathLib.join(path, "gradlew");
    }
    let pkgList = [];
    for (let i in gradleFiles) {
      const f = gradleFiles[i];
      const basePath = pathLib.dirname(f);
      console.log("Executing", GRADLE_CMD, "dependencies in", basePath);
      const result = spawnSync(
        GRADLE_CMD,
        ["dependencies", "-q", "--console", "plain"],
        { cwd: basePath }
      );
      const stdout = result.stdout;
      if (stdout) {
        const cmdOutput = Buffer.from(stdout).toString();
        const dlist = utils.parseGradleDep(cmdOutput);
        if (dlist && dlist.length) {
          pkgList = pkgList.concat(dlist);
        }
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
  // scala sbt
  let sbtFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "build.sbt*"
  );
  if (sbtFiles && sbtFiles.length) {
    let pkgList = [];
    let SBT_CMD = "sbt";
    let tempDir = fs.mkdtempSync(pathLib.join(os.tmpdir(), "cdxsbt-"));
    let tempSbtgDir = fs.mkdtempSync(pathLib.join(os.tmpdir(), "cdxsbtg-"));
    tempSbtgDir = pathLib.join(tempSbtgDir, "1.0", "plugins");
    fs.mkdirSync(tempSbtgDir, { recursive: true });
    // Create temporary global plugins
    fs.writeFileSync(
      pathLib.join(tempSbtgDir, "build.sbt"),
      `addSbtPlugin("net.virtual-void" % "sbt-dependency-graph" % "0.10.0-RC1")\n`
    );
    for (let i in sbtFiles) {
      const f = sbtFiles[i];
      const basePath = pathLib.dirname(f);
      let dlFile = pathLib.join(tempDir, "dl-" + i + ".tmp");
      console.log(
        "Executing",
        SBT_CMD,
        "dependencyList in",
        basePath,
        "using plugins",
        tempSbtgDir
      );
      const result = spawnSync(
        SBT_CMD,
        ["--sbt-dir", tempSbtgDir, `dependencyList::toFile"${dlFile}"`],
        { cwd: basePath }
      );
      if (fs.existsSync(dlFile)) {
        const cmdOutput = fs.readFileSync(dlFile, { encoding: "utf-8" });
        const dlist = utils.parseKVDep(cmdOutput);
        if (dlist && dlist.length) {
          pkgList = pkgList.concat(dlist);
        }
      }
    }
    pkgList = await utils.getMvnMetadata(pkgList);
    buildBomString(
      {
        includeBomSerialNumber,
        pkgInfo: pkgList,
        ptype: "maven",
        context: { src: path, filename: "build.sbt" },
      },
      callback
    );
  }
};

/**
 * Function to create bom string for Node.js projects
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
const createNodejsBom = async (
  includeBomSerialNumber,
  path,
  options,
  callback
) => {
  const yarnLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "yarn.lock"
  );
  const pkgLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "package-lock.json"
  );
  const pnpmLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "pnpm-lock.yaml"
  );
  const { allImports } = await findJSImports(path);
  if (pnpmLockFiles && pnpmLockFiles.length) {
    let pkgList = [];
    for (let i in pnpmLockFiles) {
      const f = pnpmLockFiles[i];
      const dlist = utils.parsePnpmLock(f);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomString(
      {
        includeBomSerialNumber,
        pkgInfo: pkgList,
        ptype: "npm",
        context: { allImports, src: path, filename: "pnpm-lock.yaml" },
      },
      callback
    );
  } else if (fs.existsSync(pathLib.join(path, "node_modules"))) {
    readInstalled(path, options, (err, pkgInfo) => {
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo,
          ptype: "npm",
          context: { allImports, src: path, filename: "package.json" },
        },
        callback
      );
    });
  } else if (pkgLockFiles && pkgLockFiles.length) {
    let pkgList = [];
    for (let i in pkgLockFiles) {
      const f = pkgLockFiles[i];
      // Parse package-lock.json if available
      const dlist = utils.parsePkgLock(f);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomString(
      {
        includeBomSerialNumber,
        pkgInfo: pkgList,
        ptype: "npm",
        context: { allImports, src: path, filename: "package-lock.json" },
      },
      callback
    );
  } else if (fs.existsSync(pathLib.join(path, "rush.json"))) {
    // Rush.js creates node_modules inside common/temp directory
    const nmDir = pathLib.join(path, "common", "temp", "node_modules");
    // Do rush install if we don't have node_modules directory
    if (!fs.existsSync(nmDir)) {
      console.log("Executing 'rush install --no-link'", path);
      result = spawnSync("rush", ["install", "--no-link", "--bypass-policy"], {
        cwd: path,
      });
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
          context: { allImports, src: path, filename: "shrinkwrap-deps.json" },
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
          context: { allImports, src: path, filename: "pnpm-lock.yaml" },
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
  } else if (yarnLockFiles && yarnLockFiles.length) {
    let pkgList = [];
    for (let i in yarnLockFiles) {
      const f = yarnLockFiles[i];
      // Parse yarn.lock if available. This check is after rush.json since
      // rush.js could include yarn.lock :(
      const dlist = utils.parseYarnLock(f);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomString(
      {
        includeBomSerialNumber,
        pkgInfo: pkgList,
        ptype: "npm",
        context: { allImports, src: path, filename: "yarn.lock" },
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
};

/**
 * Function to create bom string for Python projects
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
const createPythonBom = async (
  includeBomSerialNumber,
  path,
  options,
  callback
) => {
  const pipenvMode = fs.existsSync(pathLib.join(path, "Pipfile"));
  const poetryMode = fs.existsSync(pathLib.join(path, "poetry.lock"));
  const reqFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "requirements.txt"
  );
  const setupPy = pathLib.join(path, "setup.py");
  const requirementsMode = reqFiles && reqFiles.length;
  const setupPyMode = fs.existsSync(setupPy);
  if (requirementsMode || pipenvMode || poetryMode || setupPyMode) {
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
      let pkgList = [];
      for (let i in reqFiles) {
        const f = reqFiles[i];
        const reqData = fs.readFileSync(f, { encoding: "utf-8" });
        const dlist = await utils.parseReqFile(reqData);
        if (dlist && dlist.length) {
          pkgList = pkgList.concat(dlist);
        }
      }
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
};

/**
 * Function to create bom string for Go projects
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
const createGoBom = async (includeBomSerialNumber, path, options, callback) => {
  const gosumFile = pathLib.join(path, "go.sum");
  const gopkgLockFile = pathLib.join(path, "Gopkg.lock");
  const gosumMode = fs.existsSync(gosumFile);
  const gopkgMode = fs.existsSync(gopkgLockFile);
  if (gosumMode || gopkgMode) {
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
};

/**
 * Function to create bom string for Rust projects
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
const createRustBom = async (
  includeBomSerialNumber,
  path,
  options,
  callback
) => {
  const cargoLockFile = pathLib.join(path, "Cargo.lock");
  const cargoFile = pathLib.join(path, "Cargo.toml");
  const cargoMode = fs.existsSync(cargoFile);
  let cargoLockMode = fs.existsSync(cargoLockFile);
  if (cargoMode) {
    if (!cargoLockMode) {
      console.log("Executing 'cargo update' in", path);
      result = spawnSync("cargo", ["update"], { cwd: path });
      if (result.status == 1 || result.error) {
        console.error("cargo update has failed.");
      }
      cargoLockMode = fs.existsSync(cargoLockFile);
    }
    if (cargoLockMode) {
      const cargoData = fs.readFileSync(cargoLockFile, { encoding: "utf-8" });
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
      console.error(
        "Unable to find or generate Cargo.lock for the rust project at",
        path
      );
      callback();
    }
  } else {
    console.error("Unable to find Cargo.toml for the rust project at", path);
    callback();
  }
};

/**
 * Function to create bom string for php projects
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
const createPHPBom = async (
  includeBomSerialNumber,
  path,
  options,
  callback
) => {
  const composerJsonFile = pathLib.join(path, "composer.json");
  const composerLockFile = pathLib.join(path, "composer.lock");
  const composerJsonMode = fs.existsSync(composerJsonFile);
  let composerLockMode = fs.existsSync(composerLockFile);
  if (composerJsonMode || composerLockMode) {
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
};

/**
 * Function to create bom string for roby projects
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
const createRubyBom = async (
  includeBomSerialNumber,
  path,
  options,
  callback
) => {
  const gemFile = pathLib.join(path, "Gemfile");
  const gemLockFile = pathLib.join(path, "Gemfile.lock");
  const gemFileMode = fs.existsSync(gemFile);
  let gemLockMode = fs.existsSync(gemLockFile);
  if (gemLockMode || gemFileMode) {
    if (gemFileMode && !gemLockMode) {
      console.log("Executing 'bundle install' in", path);
      result = spawnSync("bundle", ["install"], { cwd: path });
      if (result.status == 1 || result.error) {
        console.error("Bundle install has failed.");
      }
      gemLockMode = fs.existsSync(gemLockFile);
    }
    if (gemLockMode) {
      let gemLockData = fs.readFileSync(gemLockFile, { encoding: "utf-8" });
      const pkgList = await utils.parseGemfileLockData(gemLockData);
      buildBomString(
        {
          includeBomSerialNumber,
          pkgInfo: pkgList,
          ptype: "rubygems",
          context: { src: path, filename: "Gemfile.lock" },
        },
        callback
      );
    } else {
      console.error(
        "Unable to find Gemfile.lock for the ruby project at",
        path
      );
      callback();
    }
  }
};

/**
 * Function to create bom string for roby projects
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
const createCsharpBom = async (
  includeBomSerialNumber,
  path,
  options,
  callback
) => {
  const csProjFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*.csproj"
  );
  if (csProjFiles.length) {
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
 * Function to create bom string for various languages
 *
 * @param includeBomSerialNumber Boolean to include BOM serial number
 * @param path to the project
 * @param options Parse options from the cli
 * @param callback Function callback
 */
const createXBom = async (includeBomSerialNumber, path, options, callback) => {
  try {
    fs.accessSync(path, fs.constants.R_OK);
  } catch (err) {
    console.error(path, "is invalid");
    process.exit(1);
  }
  const { projectType } = options;
  // node.js - package.json
  if (
    fs.existsSync(pathLib.join(path, "package.json")) ||
    fs.existsSync(pathLib.join(path, "rush.json"))
  ) {
    return await createNodejsBom(
      includeBomSerialNumber,
      path,
      options,
      callback
    );
  }
  // maven - pom.xml
  const pomFiles = utils.getAllFiles(path, "pom.xml");
  // gradle
  let gradleFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "build.gradle*"
  );
  // scala sbt
  let sbtFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "build.sbt*"
  );
  if (pomFiles.length || gradleFiles.length || sbtFiles.length) {
    return await createJavaBom(includeBomSerialNumber, path, options, callback);
  }
  // python
  const pipenvMode = fs.existsSync(pathLib.join(path, "Pipfile"));
  const poetryMode = fs.existsSync(pathLib.join(path, "poetry.lock"));
  const reqFile = pathLib.join(path, "requirements.txt");
  const setupPy = pathLib.join(path, "setup.py");
  const requirementsMode = fs.existsSync(reqFile);
  const setupPyMode = fs.existsSync(setupPy);
  if (requirementsMode || pipenvMode || poetryMode || setupPyMode) {
    return await createPythonBom(
      includeBomSerialNumber,
      path,
      options,
      callback
    );
  }
  // go
  const gosumFile = pathLib.join(path, "go.sum");
  const gopkgLockFile = pathLib.join(path, "Gopkg.lock");
  const gosumMode = fs.existsSync(gosumFile);
  const gopkgMode = fs.existsSync(gopkgLockFile);
  if (gosumMode || gopkgMode) {
    return await createGoBom(includeBomSerialNumber, path, options, callback);
  }

  // rust
  const cargoLockFile = pathLib.join(path, "Cargo.lock");
  const cargoFile = pathLib.join(path, "Cargo.toml");
  const cargoMode = fs.existsSync(cargoFile);
  const cargoLockMode = fs.existsSync(cargoLockFile);
  if (cargoMode || cargoLockMode) {
    return await createRustBom(includeBomSerialNumber, path, options, callback);
  }

  // php
  const composerJsonFile = pathLib.join(path, "composer.json");
  const composerLockFile = pathLib.join(path, "composer.lock");
  const composerJsonMode = fs.existsSync(composerJsonFile);
  let composerLockMode = fs.existsSync(composerLockFile);
  if (composerJsonMode || composerLockMode) {
    return await createPHPBom(includeBomSerialNumber, path, options, callback);
  }

  // Ruby
  const gemFile = pathLib.join(path, "Gemfile");
  const gemLockFile = pathLib.join(path, "Gemfile.lock");
  const gemFileMode = fs.existsSync(gemFile);
  let gemLockMode = fs.existsSync(gemLockFile);
  if (gemLockMode || gemFileMode) {
    return await createRubyBom(includeBomSerialNumber, path, options, callback);
  }

  // .Net
  const csProjFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*.csproj"
  );
  if (csProjFiles.length) {
    return await createCsharpBom(
      includeBomSerialNumber,
      path,
      options,
      callback
    );
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
  let { projectType } = options;
  if (!projectType) {
    projectType = "";
  }
  projectType = projectType.toLowerCase();
  switch (projectType) {
    case "java":
    case "groovy":
    case "kotlin":
    case "scala":
    case "jvm":
      return await createJavaBom(
        includeBomSerialNumber,
        path,
        options,
        callback
      );
    case "nodejs":
    case "js":
    case "javascript":
    case "typescript":
    case "ts":
      return await createNodejsBom(
        includeBomSerialNumber,
        path,
        options,
        callback
      );
    case "python":
    case "py":
      return await createPythonBom(
        includeBomSerialNumber,
        path,
        options,
        callback
      );
    case "go":
    case "golang":
      return await createGoBom(includeBomSerialNumber, path, options, callback);
    case "rust":
    case "rust-lang":
      return await createRustBom(
        includeBomSerialNumber,
        path,
        options,
        callback
      );
    case "php":
      return await createPHPBom(
        includeBomSerialNumber,
        path,
        options,
        callback
      );
    case "ruby":
      return await createRubyBom(
        includeBomSerialNumber,
        path,
        options,
        callback
      );
    case "csharp":
    case "netcore":
    case "dotnet":
      return await createCsharpBom(
        includeBomSerialNumber,
        path,
        options,
        callback
      );
    default:
      return await createXBom(includeBomSerialNumber, path, options, callback);
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
