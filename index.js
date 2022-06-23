const parsePackageJsonName = require("parse-packagejson-name");
const os = require("os");
const pathLib = require("path");
const ssri = require("ssri");
const fs = require("fs");
const got = require("got");
const { v4: uuidv4 } = require("uuid");
const { PackageURL } = require("packageurl-js");
const builder = require("xmlbuilder");
const utils = require("./utils");
const { spawnSync } = require("child_process");
const selfPjson = require("./package.json");
const { findJSImports } = require("./analyzer");
const semver = require("semver");
const dockerLib = require("./docker");
const binaryLib = require("./binary");

// Construct maven command
let MVN_CMD = "mvn";
if (process.env.MVN_CMD) {
  MVN_CMD = process.env.MVN_CMD;
} else if (process.env.MAVEN_HOME) {
  MVN_CMD = pathLib.join(process.env.MAVEN_HOME, "bin", "mvn");
}

// Construct gradle cache directory
let GRADLE_CACHE_DIR =
  process.env.GRADLE_CACHE_DIR ||
  pathLib.join(os.homedir(), ".gradle", "caches", "modules-2", "files-2.1");
if (process.env.GRADLE_USER_HOME) {
  GRADLE_CACHE_DIR =
    process.env.GRADLE_USER_HOME + "/caches/modules-2/files-2.1";
}

// Clojure CLI
let CLJ_CMD = "clj";
if (process.env.CLJ_CMD) {
  CLJ_CMD = process.env.CLJ_CMD;
}

let LEIN_CMD = "lein";
if (process.env.LEIN_CMD) {
  LEIN_CMD = process.env.LEIN_CMD;
}

// Construct sbt cache directory
let SBT_CACHE_DIR =
  process.env.SBT_CACHE_DIR || pathLib.join(os.homedir(), ".ivy2", "cache");

// Debug mode flag
const DEBUG_MODE =
  process.env.SCAN_DEBUG_MODE === "debug" ||
  process.env.SHIFTLEFT_LOGGING_LEVEL === "debug" ||
  process.env.NODE_ENV === "development";

// CycloneDX Hash pattern
const HASH_PATTERN =
  "^([a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64}|[a-fA-F0-9]{96}|[a-fA-F0-9]{128})$";

// Timeout milliseconds. Default 10 mins
const TIMEOUT_MS = process.env.CDXGEN_TIMEOUT_MS || 10 * 60 * 1000;

/**
 * Method to create global external references
 *
 * @param pkg
 * @returns {Array}
 */
function addGlobalReferences(src, filename, format = "xml") {
  let externalReferences = [];
  if (format === "json") {
    externalReferences.push({
      type: "other",
      url: src,
      comment: "Base path",
    });
  } else {
    externalReferences.push({
      reference: { "@type": "other", url: src, comment: "Base path" },
    });
  }
  let packageFileMeta = filename;
  if (!filename.includes(src)) {
    packageFileMeta = pathLib.join(src, filename);
  }
  if (format === "json") {
    externalReferences.push({
      type: "other",
      url: packageFileMeta,
      comment: "Package file",
    });
  } else {
    externalReferences.push({
      reference: {
        "@type": "other",
        url: packageFileMeta,
        comment: "Package file",
      },
    });
  }
  return externalReferences;
}

/**
 * Function to create metadata block
 *
 */
function addMetadata(format = "xml") {
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
        author: { name: "Team AppThreat", email: "cloud@appthreat.com" },
      },
    ],
    supplier: undefined,
  };
  if (format === "json") {
    metadata.tools = [
      {
        vendor: "AppThreat",
        name: "cdxgen",
        version: selfPjson.version,
      },
    ];
    metadata.authors = [
      { name: "Team AppThreat", email: "cloud@appthreat.com" },
    ];
  }
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
    if (pkg.homepage && pkg.homepage.url) {
      externalReferences.push({
        reference: { "@type": "website", url: pkg.homepage.url },
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
    if (pkg.homepage && pkg.homepage.url) {
      externalReferences.push({
        type: "website",
        url: pkg.homepage.url,
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
function listComponents(
  options,
  allImports,
  pkg,
  ptype = "npm",
  format = "xml"
) {
  let list = {};
  let isRootPkg = ptype === "npm";
  if (Array.isArray(pkg)) {
    pkg.forEach((p) => {
      addComponent(options, allImports, p, ptype, list, false, format);
    });
  } else {
    addComponent(options, allImports, pkg, ptype, list, isRootPkg, format);
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
  options,
  allImports,
  pkg,
  ptype,
  list,
  isRootPkg = false,
  format = "xml"
) {
  if (!pkg || pkg.extraneous) {
    return;
  }
  if (!isRootPkg) {
    let pkgIdentifier = parsePackageJsonName(pkg.name);
    let group = pkg.group || pkgIdentifier.scope;
    // Create empty group
    group = group || "";
    let name = pkgIdentifier.fullName || pkg.name || "";
    // name is mandatory
    if (!name) {
      return;
    }
    // Skip @types package for npm
    if (
      ptype == "npm" &&
      (group === "types" || !name || name.startsWith("@types"))
    ) {
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
    let description = { "#cdata": pkg.description };
    if (format === "json") {
      description = pkg.description || "";
    }
    let compScope = pkg.scope;
    if (allImports) {
      const impPkgs = Object.keys(allImports);
      if (
        impPkgs.includes(name) ||
        impPkgs.includes(group + "/" + name) ||
        impPkgs.includes("@" + group + "/" + name) ||
        impPkgs.includes(group) ||
        impPkgs.includes("@" + group)
      ) {
        compScope = "required";
      } else if (impPkgs.length) {
        compScope = "optional";
      }
    }
    if (options.requiredOnly && ["optional", "excluded"].includes(compScope)) {
      return;
    }
    let component = {
      group,
      name,
      version,
      description,
      scope: compScope,
      hashes: [],
      licenses,
      purl: purlString,
      externalReferences: addExternalReferences(pkg, format),
    };
    if (format === "xml") {
      component["@type"] = determinePackageType(pkg);
      component["@bom-ref"] = purlString;
    } else {
      component["type"] = determinePackageType(pkg);
      component["bom-ref"] = purlString;
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
      .map((x) =>
        addComponent(options, allImports, x, ptype, list, false, format)
      );
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
    let integrity = ssri.parse(pkg._integrity) || {};
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
  let hash = "";
  // If it is a valid hash simply use it
  if (new RegExp(HASH_PATTERN).test(digest)) {
    hash = digest;
  } else {
    // Check if base64 encoded
    const isBase64Encoded =
      Buffer.from(digest, "base64").toString("base64") === digest;
    hash = isBase64Encoded
      ? Buffer.from(digest, "base64").toString("hex")
      : digest;
  }
  let ahash = { "@alg": alg, "#text": hash };
  if (format === "json") {
    ahash = { alg: alg, content: hash };
    component.hashes.push(ahash);
  } else {
    component.hashes.push({ hash: ahash });
  }
}

/**
 * Return Bom in xml format
 *
 * @param {Array} components Bom components
 * @param {Object} context Context object
 * @returns bom xml string
 */
const buildBomXml = (serialNum, components, context) => {
  const bom = builder
    .create("bom", { encoding: "utf-8", separateArrayItems: true })
    .att("xmlns", "http://cyclonedx.org/schema/bom/1.4");
  bom.att("serialNumber", serialNum);
  bom.att("version", 1);
  const metadata = addMetadata("xml");
  bom.ele("metadata").ele(metadata);
  if (components && components.length) {
    bom.ele("components").ele(components);
    if (context && context.src && context.filename) {
      bom
        .ele("externalReferences")
        .ele(addGlobalReferences(context.src, context.filename, "xml"));
    }
    const bomString = bom.end({
      pretty: true,
      indent: "  ",
      newline: "\n",
      width: 0,
      allowEmpty: false,
      spacebeforeslash: "",
    });
    return bomString;
  }
  return "";
};

/**
 * Return the BOM in xml, json format including any namespace mapping
 */
const buildBomNSData = (options, pkgInfo, ptype, context) => {
  const bomNSData = {
    bomXml: undefined,
    bomXmlFiles: undefined,
    bomJson: undefined,
    bomJsonFiles: undefined,
    nsMapping: undefined,
  };
  const serialNum = "urn:uuid:" + uuidv4();
  let allImports = {};
  if (context && context.allImports) {
    allImports = context.allImports;
  }
  const nsMapping = context.nsMapping || {};
  const metadata = addMetadata("json");
  const components = listComponents(options, allImports, pkgInfo, ptype, "xml");
  if (components && components.length) {
    const bomString = buildBomXml(serialNum, components, context);
    // CycloneDX 1.4 Json Template
    const jsonTpl = {
      bomFormat: "CycloneDX",
      specVersion: "1.4",
      serialNumber: serialNum,
      version: 1,
      metadata: metadata,
      components: listComponents(options, allImports, pkgInfo, ptype, "json"),
    };
    if (context && context.src && context.filename) {
      jsonTpl.externalReferences = addGlobalReferences(
        context.src,
        context.filename,
        "json"
      );
    }
    bomNSData.bomXml = bomString;
    bomNSData.bomJson = jsonTpl;
    bomNSData.nsMapping = nsMapping;
  }
  return bomNSData;
};

/**
 * Function to create bom string for Java jars
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createJarBom = (path, options) => {
  let pkgList = [];
  let jarFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*.[jw]ar"
  );
  let tempDir = fs.mkdtempSync(pathLib.join(os.tmpdir(), "jar-deps-"));
  for (let jar of jarFiles) {
    const dlist = utils.extractJarArchive(jar, tempDir);
    if (dlist && dlist.length) {
      pkgList = pkgList.concat(dlist);
    }
  }
  // Clean up
  if (tempDir && tempDir.startsWith(os.tmpdir())) {
    console.log(`Cleaning up ${tempDir}`);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return buildBomNSData(options, pkgList, "maven", {
    src: path,
    filename: jarFiles.join(", "),
    nsMapping: {},
  });
};

/**
 * Function to create bom string for Java projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createJavaBom = async (path, options) => {
  let jarNSMapping = {};
  let pkgList = [];
  // war/ear mode
  if (path.endsWith(".war")) {
    // Check if the file exists
    if (fs.existsSync(path)) {
      if (DEBUG_MODE) {
        console.log(`Retrieving packages from ${path}`);
      }
      let tempDir = fs.mkdtempSync(pathLib.join(os.tmpdir(), "war-deps-"));
      pkgList = utils.extractJarArchive(path, tempDir);
      if (pkgList.length) {
        pkgList = await utils.getMvnMetadata(pkgList);
      }
      // Should we attempt to resolve class names
      if (options.resolveClass) {
        console.log(
          "Creating class names list based on available jars. This might take a few mins ..."
        );
        jarNSMapping = utils.collectJarNS(tempDir);
      }
      // Clean up
      if (tempDir && tempDir.startsWith(os.tmpdir())) {
        console.log(`Cleaning up ${tempDir}`);
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } else {
      console.log(`${path} doesn't exist`);
    }
    return buildBomNSData(options, pkgList, "maven", {
      src: pathLib.dirname(path),
      filename: path,
      nsMapping: jarNSMapping,
    });
  } else {
    // maven - pom.xml
    const pomFiles = utils.getAllFiles(path, "pom.xml");
    if (pomFiles && pomFiles.length) {
      let mvnArgs = [
        "org.cyclonedx:cyclonedx-maven-plugin:2.5.3:makeAggregateBom",
      ];
      // By using quiet mode we can reduce the maxBuffer used and avoid crashes
      if (!DEBUG_MODE) {
        mvnArgs.push("-q");
      }
      // Support for passing additional settings and profile to maven
      if (process.env.MVN_ARGS) {
        const addArgs = process.env.MVN_ARGS.split(" ");
        mvnArgs = mvnArgs.concat(addArgs);
      }
      for (let f of pomFiles) {
        const basePath = pathLib.dirname(f);
        // Should we attempt to resolve class names
        if (options.resolveClass) {
          console.log(
            "Creating class names list based on available jars. This might take a few mins ..."
          );
          jarNSMapping = utils.collectMvnDependencies(MVN_CMD, basePath);
        }
        console.log(`Executing '${MVN_CMD} ${mvnArgs.join(" ")}' in`, basePath);
        let result = spawnSync(MVN_CMD, mvnArgs, {
          cwd: basePath,
          shell: true,
          encoding: "utf-8",
          timeout: TIMEOUT_MS,
        });
        // Check if the cyclonedx plugin created the required bom.xml file
        // Sometimes the plugin fails silently for complex maven projects
        const bomGenerated = fs.existsSync(
          pathLib.join(basePath, "target", "bom.xml")
        );
        if (!bomGenerated || result.status == 1 || result.error) {
          let tempDir = fs.mkdtempSync(pathLib.join(os.tmpdir(), "cdxmvn-"));
          let tempMvnTree = pathLib.join(tempDir, "mvn-tree.txt");
          let mvnTreeArgs = ["dependency:tree", "-DoutputFile=" + tempMvnTree];
          if (process.env.MVN_ARGS) {
            const addArgs = process.env.MVN_ARGS.split(" ");
            mvnTreeArgs = mvnTreeArgs.concat(addArgs);
          }
          console.log(
            `Fallback to executing ${MVN_CMD} ${mvnTreeArgs.join(" ")}`
          );
          result = spawnSync(MVN_CMD, mvnTreeArgs, {
            cwd: basePath,
            shell: true,
            encoding: "utf-8",
            timeout: TIMEOUT_MS,
          });
          if (result.status == 1 || result.error) {
            console.error(result.stdout, result.stderr);
            console.log(
              "Resolve the above maven error. This could be due to the following:\n"
            );
            console.log(
              "1. Java version requirement - Scan or the CI build agent could be using an incompatible version"
            );
            console.log(
              "2. Private maven repository is not serving all the required maven plugins correctly. Refer to your registry documentation to add support for jitpack.io"
            );
            console.log(
              "3. Check if all required environment variables including any maven profile arguments are passed correctly to this tool"
            );
            console.log(
              "\nFalling back to manual pom.xml parsing. The result would be incomplete!"
            );
            const dlist = utils.parsePom(f);
            if (dlist && dlist.length) {
              pkgList = pkgList.concat(dlist);
            }
          } else {
            if (fs.existsSync(tempMvnTree)) {
              const mvnTreeString = fs.readFileSync(tempMvnTree, {
                encoding: "utf-8",
              });
              const dlist = utils.parseMavenTree(mvnTreeString);
              if (dlist && dlist.length) {
                pkgList = pkgList.concat(dlist);
              }
              fs.unlinkSync(tempMvnTree);
            }
          }
          pkgList = await utils.getMvnMetadata(pkgList);
          return buildBomNSData(options, pkgList, "maven", {
            src: path,
            filename: "pom.xml",
            nsMapping: jarNSMapping,
          });
        }
      } // for
      const firstPath = pathLib.dirname(pomFiles[0]);
      if (fs.existsSync(pathLib.join(firstPath, "target", "bom.xml"))) {
        const bomString = fs.readFileSync(
          pathLib.join(firstPath, "target", "bom.xml"),
          { encoding: "utf-8" }
        );
        let bomJonString = "";
        if (fs.existsSync(pathLib.join(firstPath, "target", "bom.json"))) {
          try {
            bomJonString = JSON.parse(
              fs.readFileSync(pathLib.join(firstPath, "target", "bom.json"), {
                encoding: "utf-8",
              })
            );
          } catch (err) {
            if (DEBUG_MODE) {
              console.log(err);
            }
          }
        }
        const bomNSData = {};
        bomNSData.bomXml = bomString;
        bomNSData.bomJson = bomJonString;
        bomNSData.nsMapping = jarNSMapping;
        return bomNSData;
      } else {
        const bomFiles = utils.getAllFiles(path, "bom.xml");
        const bomJsonFiles = utils.getAllFiles(path, "bom.json");
        const bomNSData = {};
        bomNSData.bomXmlFiles = bomFiles;
        bomNSData.bomJsonFiles = bomJsonFiles;
        bomNSData.nsMapping = jarNSMapping;
        return bomNSData;
      }
    }
    // gradle
    let gradleFiles = utils.getAllFiles(
      path,
      (options.multiProject ? "**/" : "") + "build.gradle*"
    );
    if (gradleFiles && gradleFiles.length && options.installDeps) {
      let GRADLE_CMD = "gradle";
      if (process.env.GRADLE_CMD) {
        GRADLE_CMD = process.env.GRADLE_CMD;
      } else if (process.env.GRADLE_HOME) {
        GRADLE_CMD = pathLib.join(process.env.GRADLE_HOME, "bin", "gradle");
      } else if (fs.existsSync(pathLib.join(path, "gradlew"))) {
        // Use local gradle wrapper if available
        // Enable execute permission
        try {
          fs.chmodSync(pathLib.join(path, "gradlew"), 0o775);
        } catch (e) {}
        GRADLE_CMD = pathLib.resolve(pathLib.join(path, "gradlew"));
      }
      // Support for multi-project applications
      if (process.env.GRADLE_MULTI_PROJECT_MODE) {
        console.log("Executing", GRADLE_CMD, "projects in", path);
        const result = spawnSync(
          GRADLE_CMD,
          ["projects", "-q", "--console", "plain"],
          { cwd: path, encoding: "utf-8", timeout: TIMEOUT_MS }
        );
        if (result.status == 1 || result.error) {
          if (result.stderr) {
            console.error(result.stdout, result.stderr);
          }
          console.log(
            "1. Check if the correct version of java and gradle are installed and available in PATH. For example, some project might require Java 11 with gradle 7."
          );
        }
        const stdout = result.stdout;
        if (stdout) {
          const cmdOutput = Buffer.from(stdout).toString();
          const allProjects = utils.parseGradleProjects(cmdOutput);
          if (!allProjects) {
            console.log(
              "No projects found. Is this a gradle multi-project application?"
            );
          } else {
            console.log("Found", allProjects.length, "gradle sub-projects");
            for (let sp of allProjects) {
              let gradleDepArgs = [
                sp + ":dependencies",
                "-q",
                "--console",
                "plain",
              ];
              // Support custom GRADLE_ARGS such as --configuration runtimeClassPath
              if (process.env.GRADLE_ARGS) {
                const addArgs = process.env.GRADLE_ARGS.split(" ");
                gradleDepArgs = gradleDepArgs.concat(addArgs);
              }
              console.log(
                "Executing",
                GRADLE_CMD,
                gradleDepArgs.join(" "),
                "in",
                path
              );
              const sresult = spawnSync(GRADLE_CMD, gradleDepArgs, {
                cwd: path,
                encoding: "utf-8",
                timeout: TIMEOUT_MS,
              });
              if (sresult.status == 1 || sresult.error) {
                if (DEBUG_MODE) {
                  console.error(sresult.stdout, sresult.stderr);
                }
              }
              const sstdout = sresult.stdout;
              if (sstdout) {
                const cmdOutput = Buffer.from(sstdout).toString();
                const dlist = utils.parseGradleDep(cmdOutput);
                if (dlist && dlist.length) {
                  if (DEBUG_MODE) {
                    console.log(
                      "Found",
                      dlist.length,
                      "packages in gradle project",
                      sp
                    );
                  }
                  pkgList = pkgList.concat(dlist);
                } else {
                  if (DEBUG_MODE) {
                    console.log("No packages were found in gradle project", sp);
                  }
                }
              }
            }
            if (pkgList.length) {
              console.log(
                "Obtained",
                pkgList.length,
                "from this gradle multi-project"
              );
            } else {
              console.log(
                "No packages found. Unset the environment variable GRADLE_MULTI_PROJECT_MODE and try again."
              );
            }
          }
        }
      } else {
        let gradleDepArgs = ["dependencies", "-q", "--console", "plain"];
        // Support for overriding the gradle task name. Issue# 90
        if (process.env.GRADLE_DEPENDENCY_TASK) {
          gradleDepArgs = process.env.GRADLE_DEPENDENCY_TASK.split(" ");
        } else if (process.env.GRADLE_ARGS) {
          // Support custom GRADLE_ARGS such as --configuration runtimeClassPath
          const addArgs = process.env.GRADLE_ARGS.split(" ");
          gradleDepArgs = gradleDepArgs.concat(addArgs);
        }
        for (let f of gradleFiles) {
          const basePath = pathLib.dirname(f);
          console.log(
            "Executing",
            GRADLE_CMD,
            gradleDepArgs.join(" "),
            "in",
            basePath
          );
          const result = spawnSync(GRADLE_CMD, gradleDepArgs, {
            cwd: basePath,
            encoding: "utf-8",
            timeout: TIMEOUT_MS,
          });
          if (result.status == 1 || result.error) {
            if (result.stderr) {
              console.error(result.stdout, result.stderr);
            }
            if (DEBUG_MODE || !result.stderr) {
              console.log(
                "1. Check if the correct version of java and gradle are installed and available in PATH. For example, some project might require Java 11 with gradle 7."
              );
              console.log(
                "2. When using tools such as sdkman, the init script must be invoked to set the PATH variables correctly."
              );
            }
          }
          const stdout = result.stdout;
          if (stdout) {
            const cmdOutput = Buffer.from(stdout).toString();
            const dlist = utils.parseGradleDep(cmdOutput);
            if (dlist && dlist.length) {
              pkgList = pkgList.concat(dlist);
            } else {
              console.log(
                "No packages were detected. If this is a multi-project gradle application set the environment variable GRADLE_MULTI_PROJECT_MODE to true and try again."
              );
            }
          }
        }
      }
      pkgList = await utils.getMvnMetadata(pkgList);
      // Should we attempt to resolve class names
      if (options.resolveClass) {
        console.log(
          "Creating class names list based on available jars. This might take a few mins ..."
        );
        jarNSMapping = utils.collectJarNS(GRADLE_CACHE_DIR);
      }
      return buildBomNSData(options, pkgList, "maven", {
        src: path,
        filename: "build.gradle",
        nsMapping: jarNSMapping,
      });
    }

    // Bazel
    // Look for the BUILD file only in the root directory
    let bazelFiles = utils.getAllFiles(path, "BUILD");
    if (bazelFiles && bazelFiles.length) {
      let BAZEL_CMD = "bazel";
      if (process.env.BAZEL_HOME) {
        BAZEL_CMD = pathLib.join(process.env.BAZEL_HOME, "bin", "bazel");
      }
      for (let f of bazelFiles) {
        const basePath = pathLib.dirname(f);
        // Invoke bazel build first
        const bazelTarget = process.env.BAZEL_TARGET || ":all";
        console.log(
          "Executing",
          BAZEL_CMD,
          "build",
          bazelTarget,
          "in",
          basePath
        );
        let result = spawnSync(BAZEL_CMD, ["build", bazelTarget], {
          cwd: basePath,
          shell: true,
          encoding: "utf-8",
          timeout: TIMEOUT_MS,
        });
        if (result.status == 1 || result.error) {
          if (result.stderr) {
            console.error(result.stdout, result.stderr);
          }
          console.log(
            "1. Check if bazel is installed and available in PATH.\n2. Try building your app with bazel prior to invoking cdxgen"
          );
        } else {
          console.log(
            "Executing",
            BAZEL_CMD,
            "aquery --output=textproto --skyframe_state in",
            basePath
          );
          result = spawnSync(
            BAZEL_CMD,
            ["aquery", "--output=textproto", "--skyframe_state"],
            { cwd: basePath, encoding: "utf-8", timeout: TIMEOUT_MS }
          );
          if (result.status == 1 || result.error) {
            console.error(result.stdout, result.stderr);
          }
          stdout = result.stdout;
          if (stdout) {
            const cmdOutput = Buffer.from(stdout).toString();
            const dlist = utils.parseBazelSkyframe(cmdOutput);
            if (dlist && dlist.length) {
              pkgList = pkgList.concat(dlist);
            } else {
              console.log(
                "No packages were detected.\n1. Build your project using bazel build command before running cdxgen\n2. Try running the bazel aquery command manually to see if skyframe state can be retrieved."
              );
              console.log(
                "If your project requires a different query, please file a bug at AppThreat/cdxgen repo!"
              );
            }
          }
          pkgList = await utils.getMvnMetadata(pkgList);
          return buildBomNSData(options, pkgList, "maven", {
            src: path,
            filename: "BUILD",
            nsMapping: {},
          });
        }
      }
    }

    // scala sbt
    // Identify sbt projects via its `project` directory:
    // - all SBT project _should_ define build.properties file with sbt version info
    // - SBT projects _typically_ have some configs/plugins defined in .sbt files
    // - SBT projects that are still on 0.13.x, can still use the old approach,
    //   where configs are defined via Scala files
    // Detecting one of those should be enough to determine an SBT project.
    let sbtProjectFiles = utils.getAllFiles(
      path,
      (options.multiProject ? "**/" : "") +
        "project/{build.properties,*.sbt,*.scala}"
    );

    let sbtProjects = [];
    for (let i in sbtProjectFiles) {
      // parent dir of sbtProjectFile is the `project` directory
      // parent dir of `project` is the sbt root project directory
      const baseDir = pathLib.dirname(pathLib.dirname(sbtProjectFiles[i]));
      sbtProjects = sbtProjects.concat(baseDir);
    }

    // Fallback in case sbt's project directory is non-existent
    if (!sbtProjects.length) {
      sbtProjectFiles = utils.getAllFiles(
        path,
        (options.multiProject ? "**/" : "") + "*.sbt"
      );
      for (let i in sbtProjectFiles) {
        const baseDir = pathLib.dirname(sbtProjectFiles[i]);
        sbtProjects = sbtProjects.concat(baseDir);
      }
    }

    sbtProjects = [...new Set(sbtProjects)]; // eliminate duplicates

    let sbtLockFiles = utils.getAllFiles(
      path,
      (options.multiProject ? "**/" : "") + "build.sbt.lock"
    );

    if (sbtProjects && sbtProjects.length) {
      let pkgList = [];
      // If the project use sbt lock files
      if (sbtLockFiles && sbtLockFiles.length) {
        for (let f of sbtLockFiles) {
          const dlist = utils.parseSbtLock(f);
          if (dlist && dlist.length) {
            pkgList = pkgList.concat(dlist);
          }
        }
      } else {
        let SBT_CMD = process.env.SBT_CMD || "sbt";
        let sbtVersion = utils.determineSbtVersion(path);
        if (DEBUG_MODE) {
          console.log("Detected sbt version: " + sbtVersion);
        }
        const standalonePluginFile =
          sbtVersion != null && semver.gte(sbtVersion, "1.2.0");
        let tempDir = fs.mkdtempSync(pathLib.join(os.tmpdir(), "cdxsbt-"));
        let tempSbtgDir = fs.mkdtempSync(pathLib.join(os.tmpdir(), "cdxsbtg-"));
        fs.mkdirSync(tempSbtgDir, { recursive: true });
        // Create temporary plugins file
        let tempSbtPlugins = pathLib.join(tempSbtgDir, "dep-plugins.sbt");

        // Requires a custom version of `sbt-dependency-graph` that
        // supports `--append` for `toFile` subtask.
        const sbtPluginDefinition = `\naddSbtPlugin("io.shiftleft" % "sbt-dependency-graph" % "0.10.0-append-to-file3")\n`;
        fs.writeFileSync(tempSbtPlugins, sbtPluginDefinition);

        for (let i in sbtProjects) {
          const basePath = sbtProjects[i];
          let dlFile = pathLib.join(tempDir, "dl-" + i + ".tmp");
          console.log(
            "Executing",
            SBT_CMD,
            "dependencyList in",
            basePath,
            "using plugins",
            tempSbtgDir
          );
          var sbtArgs = [];
          var pluginFile = null;
          if (standalonePluginFile) {
            sbtArgs = [
              `-addPluginSbtFile=${tempSbtPlugins}`,
              `"dependencyList::toFile ${dlFile} --append"`,
            ];
          } else {
            // write to the existing plugins file
            sbtArgs = [`"dependencyList::toFile ${dlFile} --append"`];
            pluginFile = utils.addPlugin(basePath, sbtPluginDefinition);
          }
          // Note that the command has to be invoked with `shell: true` to properly execut sbt
          const result = spawnSync(SBT_CMD, sbtArgs, {
            cwd: basePath,
            shell: true,
            encoding: "utf-8",
            timeout: TIMEOUT_MS,
          });
          if (result.status == 1 || result.error) {
            console.error(result.stdout, result.stderr);
            console.log(
              `1. Check if scala and sbt is installed and available in PATH. Only scala 2.10 + sbt 0.13.6+ and 2.12 + sbt 1.0+ is supported for now.`
            );
            console.log(
              `2. Check if the plugin net.virtual-void:sbt-dependency-graph 0.10.0-RC1 can be used in the environment`
            );
            console.log(
              "3. Consider creating a lockfile using sbt-dependency-lock plugin. See https://github.com/stringbean/sbt-dependency-lock"
            );
          } else if (DEBUG_MODE) {
            console.log(result.stdout);
          }
          if (!standalonePluginFile) {
            utils.cleanupPlugin(basePath, pluginFile);
          }
          if (fs.existsSync(dlFile)) {
            const cmdOutput = fs.readFileSync(dlFile, { encoding: "utf-8" });
            if (DEBUG_MODE) {
              console.log(cmdOutput);
            }
            const dlist = utils.parseKVDep(cmdOutput);
            if (dlist && dlist.length) {
              pkgList = pkgList.concat(dlist);
            }
          } else {
            if (DEBUG_MODE) {
              console.log(`sbt dependencyList did not yield ${dlFile}`);
            }
          }
        }

        // Cleanup
        fs.unlinkSync(tempSbtPlugins);
      } // else

      if (DEBUG_MODE) {
        console.log(`Found ${pkgList.length} packages`);
      }
      pkgList = await utils.getMvnMetadata(pkgList);
      // Should we attempt to resolve class names
      if (options.resolveClass) {
        console.log(
          "Creating class names list based on available jars. This might take a few mins ..."
        );
        jarNSMapping = utils.collectJarNS(SBT_CACHE_DIR);
      }
      return buildBomNSData(options, pkgList, "maven", {
        src: path,
        filename: sbtProjects.join(", "),
        nsMapping: jarNSMapping,
      });
    }
  }
};

/**
 * Function to create bom string for Node.js projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createNodejsBom = async (path, options) => {
  let pkgList = [];
  let manifestFiles = [];
  // Docker mode requires special handling
  if (options.projectType === "docker") {
    const pkgJsonFiles = utils.getAllFiles(path, "**/package.json");
    // Are there any package.json files in the container?
    if (pkgJsonFiles.length) {
      for (let pj of pkgJsonFiles) {
        const dlist = await utils.parsePkgJson(pj);
        if (dlist && dlist.length) {
          pkgList = pkgList.concat(dlist);
        }
      }
      return buildBomNSData(options, pkgList, "npm", {
        allImports: {},
        src: path,
        filename: "package.json",
      });
    }
  }
  const { allImports } = await findJSImports(path);
  const yarnLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "yarn.lock"
  );
  const shrinkwrapFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "npm-shrinkwrap.json"
  );
  let pkgLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "package-lock.json"
  );
  if (shrinkwrapFiles.length) {
    pkgLockFiles = pkgLockFiles.concat(shrinkwrapFiles);
  }
  const pnpmLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "pnpm-lock.yaml"
  );
  const minJsFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*min.js"
  );
  const bowerFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "bower.json"
  );
  // Parse min js files
  if (minJsFiles && minJsFiles.length) {
    manifestFiles = manifestFiles.concat(minJsFiles);
    for (let f of minJsFiles) {
      const dlist = await utils.parseMinJs(f);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  // Parse bower json files
  if (bowerFiles && bowerFiles.length) {
    manifestFiles = manifestFiles.concat(bowerFiles);
    for (let f of bowerFiles) {
      const dlist = await utils.parseBowerJson(f);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  if (pnpmLockFiles && pnpmLockFiles.length) {
    manifestFiles = manifestFiles.concat(pnpmLockFiles);
    for (let f of pnpmLockFiles) {
      const dlist = await utils.parsePnpmLock(f);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "npm", {
      allImports,
      src: path,
      filename: manifestFiles.join(", "),
    });
  } else if (pkgLockFiles && pkgLockFiles.length) {
    manifestFiles = manifestFiles.concat(pkgLockFiles);
    for (let f of pkgLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      // Parse package-lock.json if available
      const dlist = await utils.parsePkgLock(f);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "npm", {
      allImports,
      src: path,
      filename: manifestFiles.join(", "),
    });
  } else if (fs.existsSync(pathLib.join(path, "rush.json"))) {
    // Rush.js creates node_modules inside common/temp directory
    const nmDir = pathLib.join(path, "common", "temp", "node_modules");
    // Do rush install if we don't have node_modules directory
    if (!fs.existsSync(nmDir)) {
      console.log("Executing 'rush install --no-link'", path);
      spawnSync("rush", ["install", "--no-link", "--bypass-policy"], {
        cwd: path,
        encoding: "utf-8",
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
      const pkgList = await utils.parseNodeShrinkwrap(swFile);
      return buildBomNSData(options, pkgList, "npm", {
        allImports,
        src: path,
        filename: "shrinkwrap-deps.json",
      });
    } else if (fs.existsSync(pnpmLock)) {
      const pkgList = await utils.parsePnpmLock(pnpmLock);
      return buildBomNSData(options, pkgList, "npm", {
        allImports,
        src: path,
        filename: "pnpm-lock.yaml",
      });
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
    manifestFiles = manifestFiles.concat(yarnLockFiles);
    for (let f of yarnLockFiles) {
      // Parse yarn.lock if available. This check is after rush.json since
      // rush.js could include yarn.lock :(
      const dlist = await utils.parseYarnLock(f);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "npm", {
      allImports,
      src: path,
      filename: manifestFiles.join(", "),
    });
  } else if (fs.existsSync(pathLib.join(path, "node_modules"))) {
    const pkgJsonFiles = utils.getAllFiles(
      pathLib.join(path, "node_modules"),
      "**/package.json"
    );
    manifestFiles = manifestFiles.concat(pkgJsonFiles);
    for (let pkgjf of pkgJsonFiles) {
      const dlist = await utils.parsePkgJson(pkgjf);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "npm", {
      allImports,
      src: path,
      filename: manifestFiles.join(", "),
    });
  }
  // Projects containing just min files or bower
  if (pkgList.length && manifestFiles.length) {
    return buildBomNSData(options, pkgList, "npm", {
      allImports,
      src: path,
      filename: manifestFiles.join(", "),
    });
  }
  return {};
};

/**
 * Function to create bom string for Python projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createPythonBom = async (path, options) => {
  let pkgList = [];
  const pipenvMode = fs.existsSync(pathLib.join(path, "Pipfile"));
  const poetryFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "poetry.lock"
  );
  const reqFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "requirements.txt"
  );
  const reqDirFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "requirements/*.txt"
  );
  const metadataFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/site-packages/**/" : "") + "METADATA"
  );
  const whlFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*.whl"
  );
  const setupPy = pathLib.join(path, "setup.py");
  const requirementsMode =
    (reqFiles && reqFiles.length) || (reqDirFiles && reqDirFiles.length);
  const poetryMode = poetryFiles && poetryFiles.length;
  const setupPyMode = fs.existsSync(setupPy);
  // Poetry sets up its own virtual env containing site-packages so
  // we give preference to poetry lock file. Issue# 129
  if (poetryMode) {
    for (let f of poetryFiles) {
      const lockData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parsePoetrylockData(lockData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "pypi", {
      src: path,
      filename: poetryFiles.join(", "),
    });
  } else if (metadataFiles && metadataFiles.length) {
    // dist-info directories
    for (let mf of metadataFiles) {
      const mData = fs.readFileSync(mf, {
        encoding: "utf-8",
      });
      const dlist = utils.parseBdistMetadata(mData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "pypi", {
      src: path,
      filename: metadataFiles.join(", "),
    });
  }
  // .whl files. Zip file containing dist-info directory
  if (whlFiles && whlFiles.length) {
    for (let wf of whlFiles) {
      const mData = await utils.readZipEntry(wf, "METADATA");
      if (mData) {
        const dlist = utils.parseBdistMetadata(mData);
        if (dlist && dlist.length) {
          pkgList = pkgList.concat(dlist);
        }
      }
    }
    return buildBomNSData(options, pkgList, "pypi", {
      src: path,
      filename: whlFiles.join(", "),
    });
  }
  if (requirementsMode || pipenvMode || setupPyMode) {
    if (pipenvMode) {
      spawnSync("pipenv", ["install"], { cwd: path, encoding: "utf-8" });
      const piplockFile = pathLib.join(path, "Pipfile.lock");
      if (fs.existsSync(piplockFile)) {
        const lockData = JSON.parse(fs.readFileSync(piplockFile));
        pkgList = await utils.parsePiplockData(lockData);
        return buildBomNSData(options, pkgList, "pypi", {
          src: path,
          filename: "Pipfile.lock",
        });
      } else {
        console.error("Pipfile.lock not found at", path);
      }
    } else if (requirementsMode) {
      let metadataFilename = "requirements.txt";
      if (reqFiles && reqFiles.length) {
        for (let f of reqFiles) {
          const reqData = fs.readFileSync(f, { encoding: "utf-8" });
          const dlist = await utils.parseReqFile(reqData);
          if (dlist && dlist.length) {
            pkgList = pkgList.concat(dlist);
          }
        }
        metadataFilename = reqFiles.join(", ");
      } else if (reqDirFiles && reqDirFiles.length) {
        for (let j in reqDirFiles) {
          const f = reqDirFiles[j];
          const reqData = fs.readFileSync(f, { encoding: "utf-8" });
          const dlist = await utils.parseReqFile(reqData);
          if (dlist && dlist.length) {
            pkgList = pkgList.concat(dlist);
          }
        }
        metadataFilename = reqDirFiles.join(", ");
      }
      return buildBomNSData(options, pkgList, "pypi", {
        src: path,
        filename: metadataFilename,
      });
    } else if (setupPyMode) {
      const setupPyData = fs.readFileSync(setupPy, { encoding: "utf-8" });
      pkgList = await utils.parseSetupPyFile(setupPyData);
      return buildBomNSData(options, pkgList, "pypi", {
        src: path,
        filename: "setup.py",
      });
    }
  }
  return {};
};

/**
 * Function to create bom string for Go projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createGoBom = async (path, options) => {
  let pkgList = [];
  // Is this a binary file
  let maybeBinary = false;
  try {
    maybeBinary = fs.statSync(path).isFile();
  } catch (err) {
    maybeBinary = false;
  }
  if (maybeBinary) {
    const buildInfoData = binaryLib.getGoBuildInfo(path);
    const dlist = await utils.parseGoVersionData(buildInfoData);
    if (dlist && dlist.length) {
      pkgList = pkgList.concat(dlist);
    }
    // Since this pkg list is derived from the binary mark them as used.
    const allImports = {};
    for (let mpkg of pkgList) {
      let pkgFullName = `${mpkg.group}/${mpkg.name}`;
      allImports[pkgFullName] = true;
    }
    return buildBomNSData(options, pkgList, "golang", {
      allImports,
      src: path,
      filename: path,
    });
  }

  // Read in go.sum and merge all go.sum files.
  const gosumFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "go.sum"
  );

  // If USE_GOSUM is true, generate BOM components only using go.sum.
  const useGosum = process.env.USE_GOSUM == "true";
  if (useGosum && gosumFiles.length) {
    console.warn(
      "Using go.sum to generate BOMs for go projects may return an inaccurate representation of transitive dependencies.\nSee: https://github.com/golang/go/wiki/Modules#is-gosum-a-lock-file-why-does-gosum-include-information-for-module-versions-i-am-no-longer-using\n",
      "Set USE_GOSUM=false to generate BOMs using go.mod as the dependency source of truth."
    );
    for (let f of gosumFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const gosumData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseGosumData(gosumData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "golang", {
      src: path,
      filename: gosumFiles.join(", "),
    });
  }

  // If USE_GOSUM is false, generate BOM components using go.mod.
  const gosumMap = {};
  if (gosumFiles.length) {
    for (let f of gosumFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const gosumData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseGosumData(gosumData);
      if (dlist && dlist.length) {
        dlist.forEach((pkg) => {
          gosumMap[`${pkg.group}/${pkg.name}/${pkg.version}`] = pkg._integrity;
        });
      }
    }
  }

  // Read in data from Gopkg.lock files if they exist
  const gopkgLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Gopkg.lock"
  );

  // Read in go.mod files and parse BOM components with checksums from gosumData
  const gomodFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "go.mod"
  );
  if (gomodFiles.length) {
    // Use the go list -deps and go mod why commands to generate a good quality BoM for non-docker invocations
    if (options.projectType !== "docker") {
      console.log("Executing go list -deps in", path);
      const result = spawnSync(
        "go",
        [
          "list",
          "-deps",
          "-f",
          "'{{with .Module}}{{.Path}} {{.Version}}{{end}}'",
          "./...",
        ],
        { cwd: path, encoding: "utf-8", timeout: TIMEOUT_MS }
      );
      if (result.status == 1 || result.error) {
        console.error(result.stdout, result.stderr);
      }
      const stdout = result.stdout;
      if (stdout) {
        const cmdOutput = Buffer.from(stdout).toString();
        const dlist = await utils.parseGoListDep(cmdOutput, gosumMap);
        if (dlist && dlist.length) {
          pkgList = pkgList.concat(dlist);
        }
        const allImports = {};
        let circuitBreak = false;
        console.log(
          `Attempting to detect required packages using "go mod why" command for ${pkgList.length} packages`
        );
        // Using go mod why detect required packages
        for (let apkg of pkgList) {
          if (circuitBreak) {
            break;
          }
          let pkgFullName = `${apkg.group}/${apkg.name}`;
          if (DEBUG_MODE) {
            console.log(`go mod why -m -vendor ${pkgFullName}`);
          }
          const mresult = spawnSync(
            "go",
            ["mod", "why", "-m", "-vendor", pkgFullName],
            { cwd: path, encoding: "utf-8", timeout: TIMEOUT_MS }
          );
          if (mresult.status == 1 || mresult.error) {
            if (DEBUG_MODE) {
              console.log(mresult.stdout, mresult.stderr);
            }
            circuitBreak = true;
          } else {
            const mstdout = mresult.stdout;
            if (mstdout) {
              const cmdOutput = Buffer.from(mstdout).toString();
              let whyPkg = utils.parseGoModWhy(cmdOutput);
              if (whyPkg == pkgFullName) {
                allImports[pkgFullName] = true;
              }
            }
          }
        }
        if (DEBUG_MODE) {
          console.log(`Required packages: ${Object.keys(allImports).length}`);
        }
        return buildBomNSData(options, pkgList, "golang", {
          allImports,
          src: path,
          filename: gomodFiles.join(", "),
        });
      }
    }
    // Parse the gomod files manually. The resultant BoM would be incomplete
    console.log(
      "Manually parsing go.mod files. The resultant BoM would be incomplete."
    );
    for (let f of gomodFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const gomodData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseGoModData(gomodData, gosumMap);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "golang", {
      src: path,
      filename: gomodFiles.join(", "),
    });
  } else if (gopkgLockFiles.length) {
    for (let f of gopkgLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const gopkgData = fs.readFileSync(f, {
        encoding: "utf-8",
      });
      const dlist = await utils.parseGopkgData(gopkgData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "golang", {
      src: path,
      filename: gopkgLockFiles.join(", "),
    });
  }
  return {};
};

/**
 * Function to create bom string for Rust projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createRustBom = async (path, options) => {
  let cargoLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Cargo.lock"
  );
  const cargoFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Cargo.toml"
  );
  let pkgList = [];
  const cargoMode = cargoFiles.length;
  let cargoLockMode = cargoLockFiles.length;
  if (cargoMode && !cargoLockMode) {
    for (let f of cargoFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const cargoData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseCargoTomlData(cargoData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "cargo", {
      src: path,
      filename: cargoFiles.join(", "),
    });
  }
  // Get the new lock files
  cargoLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Cargo.lock"
  );
  if (cargoLockFiles.length) {
    for (let f of cargoLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const cargoData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseCargoData(cargoData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "cargo", {
      src: path,
      filename: cargoLockFiles.join(", "),
    });
  }
  return {};
};

/**
 * Function to create bom string for Dart projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createDartBom = async (path, options) => {
  const pubFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "pubspec.lock"
  );
  const pubSpecYamlFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "pubspec.yaml"
  );
  let pkgList = [];
  if (pubFiles.length) {
    for (let f of pubFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const pubLockData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parsePubLockData(pubLockData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "pub", {
      src: path,
      filename: pubFiles.join(", "),
    });
  } else if (pubSpecYamlFiles.length) {
    for (let f of pubSpecYamlFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const pubYamlData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseYamlData(pubYamlData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "pub", {
      src: path,
      filename: pubSpecYamlFiles.join(", "),
    });
  }

  return {};
};

/**
 * Function to create bom string for cpp projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createCppBom = async (path, options) => {
  const conanLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "conan.lock"
  );
  const conanFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "conanfile.txt"
  );
  let pkgList = [];
  if (conanLockFiles.length) {
    for (let f of conanLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const conanLockData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseConanLockData(conanLockData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "conan", {
      src: path,
      filename: conanLockFiles.join(", "),
    });
  } else if (conanFiles.length) {
    for (let f of conanFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const conanData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseConanData(conanData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "conan", {
      src: path,
      filename: conanFiles.join(", "),
    });
  }

  return {};
};

/**
 * Function to create bom string for clojure projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createClojureBom = async (path, options) => {
  const ednFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "deps.edn"
  );
  const leinFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "project.clj"
  );
  let pkgList = [];
  if (leinFiles.length) {
    let LEIN_ARGS = ["deps", ":tree-data"];
    if (process.env.LEIN_ARGS) {
      LEIN_ARGS = process.env.LEIN_ARGS.split(" ");
    }
    for (let f of leinFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const basePath = pathLib.dirname(f);
      console.log("Executing", LEIN_CMD, LEIN_ARGS.join(" "), "in", basePath);
      const result = spawnSync(LEIN_CMD, LEIN_ARGS, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS,
      });
      if (result.status == 1 || result.error) {
        if (result.stderr) {
          console.error(result.stdout, result.stderr);
        }
        console.log(
          "Check if the correct version of lein is installed and available in PATH. Falling back to manual parsing."
        );
        if (DEBUG_MODE) {
          console.log(`Parsing ${f}`);
        }
        const leinData = fs.readFileSync(f, { encoding: "utf-8" });
        const dlist = utils.parseLeiningenData(leinData);
        if (dlist && dlist.length) {
          pkgList = pkgList.concat(dlist);
        }
      } else {
        const stdout = result.stdout;
        if (stdout) {
          const cmdOutput = Buffer.from(stdout).toString();
          const dlist = utils.parseLeinDep(cmdOutput);
          if (dlist && dlist.length) {
            pkgList = pkgList.concat(dlist);
          }
        }
      }
    }
    return buildBomNSData(options, pkgList, "clojars", {
      src: path,
      filename: leinFiles.join(", "),
    });
  } else if (ednFiles.length) {
    let CLJ_ARGS = ["-Stree"];
    if (process.env.CLJ_ARGS) {
      CLJ_ARGS = process.env.CLJ_ARGS.split(" ");
    }
    for (let f of ednFiles) {
      const basePath = pathLib.dirname(f);
      console.log("Executing", CLJ_CMD, CLJ_ARGS.join(" "), "in", basePath);
      const result = spawnSync(CLJ_CMD, CLJ_ARGS, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS,
      });
      if (result.status == 1 || result.error) {
        if (result.stderr) {
          console.error(result.stdout, result.stderr);
        }
        console.log(
          "Check if the correct version of clojure cli is installed and available in PATH. Falling back to manual parsing."
        );
        if (DEBUG_MODE) {
          console.log(`Parsing ${f}`);
        }
        const ednData = fs.readFileSync(f, { encoding: "utf-8" });
        const dlist = utils.parseEdnData(ednData);
        if (dlist && dlist.length) {
          pkgList = pkgList.concat(dlist);
        }
      } else {
        const stdout = result.stdout;
        if (stdout) {
          const cmdOutput = Buffer.from(stdout).toString();
          const dlist = utils.parseCljDep(cmdOutput);
          if (dlist && dlist.length) {
            pkgList = pkgList.concat(dlist);
          }
        }
      }
    }
    return buildBomNSData(options, pkgList, "clojars", {
      src: path,
      filename: ednFiles.join(", "),
    });
  }

  return {};
};

/**
 * Function to create bom string for Haskell projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createHaskellBom = async (path, options) => {
  const cabalFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "cabal.project.freeze"
  );
  let pkgList = [];
  if (cabalFiles.length) {
    for (let f of cabalFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const cabalData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseCabalData(cabalData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "hackage", {
      src: path,
      filename: cabalFiles.join(", "),
    });
  }
  return {};
};

/**
 * Function to create bom string for Elixir projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createElixirBom = async (path, options) => {
  const mixFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "mix.lock"
  );
  let pkgList = [];
  if (mixFiles.length) {
    for (let f of mixFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const mixData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseMixLockData(mixData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "hex", {
      src: path,
      filename: mixFiles.join(", "),
    });
  }
  return {};
};

/**
 * Function to create bom string for php projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createPHPBom = async (path, options) => {
  const composerJsonFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "composer.json"
  );
  let composerLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "composer.lock"
  );
  let pkgList = [];
  const composerJsonMode = composerJsonFiles.length;
  const composerLockMode = composerLockFiles.length;
  // Create a composer.lock file for each composer.json file if needed.
  if (!composerLockMode && composerJsonMode && options.installDeps) {
    const versionResult = spawnSync("composer", ["--version"], {
      encoding: "utf-8",
    });
    if (versionResult.status !== 0 || versionResult.error) {
      console.error(
        "No composer version found. Check if composer is installed and available in PATH."
      );
      console.log(versionResult.error, versionResult.stderr);
      return {};
    }
    const composerVersion = versionResult.stdout.match(/version (\d)/)[1];
    if (DEBUG_MODE) {
      console.log("Detected composer version:", composerVersion);
    }
    for (let f of composerJsonFiles) {
      const basePath = pathLib.dirname(f);
      let args = [];
      if (composerVersion > 1) {
        console.log("Generating composer.lock in", basePath);
        args = ["update", "--no-install", "--ignore-platform-reqs"];
      } else {
        console.log("Executing 'composer install' in", basePath);
        args = ["install", "--ignore-platform-reqs"];
      }
      const result = spawnSync("composer", args, {
        cwd: basePath,
        encoding: "utf-8",
      });
      if (result.status !== 0 || result.error) {
        console.error("Error running composer:");
        console.log(result.error, result.stderr);
      }
    }
  }
  composerLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "composer.lock"
  );
  if (composerLockFiles.length) {
    for (let f of composerLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      let dlist = utils.parseComposerLock(f);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "composer", {
      src: path,
      filename: composerLockFiles.join(", "),
    });
  }
  return {};
};

/**
 * Function to create bom string for ruby projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createRubyBom = async (path, options) => {
  const gemFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Gemfile"
  );
  let gemLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Gemfile.lock"
  );
  let pkgList = [];
  const gemFileMode = gemFiles.length;
  let gemLockMode = gemLockFiles.length;
  if (gemFileMode && !gemLockMode && options.installDeps) {
    for (let f of gemFiles) {
      const basePath = pathLib.dirname(f);
      console.log("Executing 'bundle install' in", basePath);
      const result = spawnSync("bundle", ["install"], {
        cwd: basePath,
        encoding: "utf-8",
      });
      if (result.status == 1 || result.error) {
        console.error(
          "Bundle install has failed. Check if bundle is installed and available in PATH."
        );
        console.log(result.error, result.stderr);
      }
    }
  }
  gemLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Gemfile.lock"
  );
  if (gemLockFiles.length) {
    for (let f of gemLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      let gemLockData = fs.readFileSync(f, { encoding: "utf-8" });
      const dlist = await utils.parseGemfileLockData(gemLockData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "gem", {
      src: path,
      filename: gemLockFiles.join(", "),
    });
  }
  return {};
};

/**
 * Function to create bom string for csharp projects
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createCsharpBom = async (path, options) => {
  let manifestFiles = [];
  const csProjFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*.csproj"
  );
  const pkgConfigFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "packages.config"
  );
  const projAssetsFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "project.assets.json"
  );
  const pkgLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "packages.lock.json"
  );
  const nupkgFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*.nupkg"
  );
  let pkgList = [];
  if (nupkgFiles.length) {
    manifestFiles = manifestFiles.concat(nupkgFiles);
    for (let nf of nupkgFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${nf}`);
      }
      const dlist = await utils.parseNupkg(nf);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  // project.assets.json parsing
  if (projAssetsFiles.length) {
    manifestFiles = manifestFiles.concat(projAssetsFiles);
    for (let af of projAssetsFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${af}`);
      }
      let pkgData = fs.readFileSync(af, { encoding: "utf-8" });
      const dlist = await utils.parseCsProjAssetsData(pkgData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  } else if (pkgLockFiles.length) {
    manifestFiles = manifestFiles.concat(pkgLockFiles);
    // packages.lock.json from nuget
    for (let af of pkgLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${af}`);
      }
      let pkgData = fs.readFileSync(af, { encoding: "utf-8" });
      const dlist = await utils.parseCsPkgLockData(pkgData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  } else if (pkgConfigFiles.length) {
    manifestFiles = manifestFiles.concat(pkgConfigFiles);
    // packages.config parsing
    for (let f of pkgConfigFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      let pkgData = fs.readFileSync(f, { encoding: "utf-8" });
      // Remove byte order mark
      if (pkgData.charCodeAt(0) === 0xfeff) {
        pkgData = pkgData.slice(1);
      }
      const dlist = await utils.parseCsPkgData(pkgData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  } else if (csProjFiles.length) {
    manifestFiles = manifestFiles.concat(csProjFiles);
    // .csproj parsing
    for (let f of csProjFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      let csProjData = fs.readFileSync(f, { encoding: "utf-8" });
      // Remove byte order mark
      if (csProjData.charCodeAt(0) === 0xfeff) {
        csProjData = csProjData.slice(1);
      }
      const dlist = await utils.parseCsProjData(csProjData);
      if (dlist && dlist.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  if (pkgList.length) {
    return buildBomNSData(options, pkgList, "nuget", {
      src: path,
      filename: manifestFiles.join(", "),
    });
  }
  return {};
};

const trimComponents = (components) => {
  const keyCache = {};
  const filteredComponents = [];
  for (let comp of components) {
    if (!keyCache[comp.purl]) {
      keyCache[comp.purl] = true;
      filteredComponents.push(comp);
    }
  }
  return filteredComponents;
};
exports.trimComponents = trimComponents;

/**
 * Function to create bom string for all languages
 *
 * @param pathList list of to the project
 * @param options Parse options from the cli
 */
const createMultiXBom = async (pathList, options) => {
  let components = [];
  let componentsXmls = [];
  let bomData = undefined;
  for (let path of pathList) {
    if (DEBUG_MODE) {
      console.log("Scanning", path);
    }
    bomData = await createNodejsBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} node.js packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "npm", "xml")
      );
    }
    bomData = await createJavaBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} java packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "maven", "xml")
      );
    }
    bomData = await createPythonBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} python packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "pypi", "xml")
      );
    }
    bomData = await createGoBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} go packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "golang", "xml")
      );
    }
    bomData = await createRustBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} rust packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "cargo", "xml")
      );
    }
    bomData = await createPHPBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} php packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(
          options,
          {},
          bomData.bomJson.components,
          "composer",
          "xml"
        )
      );
    }
    bomData = await createRubyBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} ruby packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "gem", "xml")
      );
    }
    bomData = await createCsharpBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} csharp packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "nuget", "xml")
      );
    }
    bomData = await createDartBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} pub packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "pub", "xml")
      );
    }
    bomData = await createHaskellBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} hackage packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(
          options,
          {},
          bomData.bomJson.components,
          "hackage",
          "xml"
        )
      );
    }
    bomData = await createElixirBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} mix packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "hex", "xml")
      );
    }
    bomData = await createCppBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} cpp packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "conan", "xml")
      );
    }
    bomData = await createClojureBom(path, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} clojure packages at ${path}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(
          options,
          {},
          bomData.bomJson.components,
          "clojars",
          "xml"
        )
      );
    }
  }
  if (options.lastWorkingDir && options.lastWorkingDir !== "") {
    bomData = createJarBom(options.lastWorkingDir, options);
    if (bomData && bomData.bomJson && bomData.bomJson.components) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} jar packages at ${options.lastWorkingDir}`
        );
      }
      components = components.concat(bomData.bomJson.components);
      componentsXmls = componentsXmls.concat(
        listComponents(options, {}, bomData.bomJson.components, "maven", "xml")
      );
    }
  }
  components = trimComponents(components);
  console.log(`BOM includes ${components.length} components`);
  const serialNum = "urn:uuid:" + uuidv4();
  return {
    bomXml: buildBomXml(serialNum, componentsXmls),
    bomJson: {
      bomFormat: "CycloneDX",
      specVersion: "1.4",
      serialNumber: serialNum,
      version: 1,
      metadata: addMetadata("json"),
      components,
    },
  };
};

/**
 * Function to create bom string for various languages
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
const createXBom = async (path, options) => {
  try {
    fs.accessSync(path, fs.constants.R_OK);
  } catch (err) {
    console.error(path, "is invalid");
    process.exit(1);
  }
  // node.js - package.json
  if (
    fs.existsSync(pathLib.join(path, "package.json")) ||
    fs.existsSync(pathLib.join(path, "rush.json"))
  ) {
    return await createNodejsBom(path, options);
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
    (options.multiProject ? "**/" : "") + "{build.sbt,Build.scala}*"
  );
  if (pomFiles.length || gradleFiles.length || sbtFiles.length) {
    return await createJavaBom(path, options);
  }
  // python
  const pipenvMode = fs.existsSync(pathLib.join(path, "Pipfile"));
  const poetryMode = fs.existsSync(pathLib.join(path, "poetry.lock"));
  const reqFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "requirements.txt"
  );
  const reqDirFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "requirements/*.txt"
  );
  const setupPy = pathLib.join(path, "setup.py");
  const requirementsMode =
    (reqFiles && reqFiles.length) || (reqDirFiles && reqDirFiles.length);
  const whlFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*.whl"
  );
  const setupPyMode = fs.existsSync(setupPy);
  if (
    requirementsMode ||
    pipenvMode ||
    poetryMode ||
    setupPyMode ||
    whlFiles.length
  ) {
    return await createPythonBom(path, options);
  }
  // go
  const gosumFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "go.sum"
  );
  const gomodFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "go.mod"
  );
  const gopkgLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Gopkg.lock"
  );
  if (gomodFiles.length || gosumFiles.length || gopkgLockFiles.length) {
    return await createGoBom(path, options);
  }

  // rust
  const cargoLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Cargo.lock"
  );
  const cargoFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Cargo.toml"
  );
  if (cargoLockFiles.length || cargoFiles.length) {
    return await createRustBom(path, options);
  }

  // php
  const composerJsonFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "composer.json"
  );
  const composerLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "composer.lock"
  );
  if (composerJsonFiles.length || composerLockFiles.length) {
    return await createPHPBom(path, options);
  }

  // Ruby
  const gemFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Gemfile"
  );
  const gemLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "Gemfile.lock"
  );
  if (gemFiles.length || gemLockFiles.length) {
    return await createRubyBom(path, options);
  }

  // .Net
  const csProjFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "*.csproj"
  );
  if (csProjFiles.length) {
    return await createCsharpBom(path, options);
  }

  // Dart
  const pubFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "pubspec.lock"
  );
  const pubSpecFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "pubspec.yaml"
  );
  if (pubFiles.length || pubSpecFiles.length) {
    return await createDartBom(path, options);
  }

  // Haskell
  const hackageFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "cabal.project.freeze"
  );
  if (hackageFiles.length) {
    return await createHaskellBom(path, options);
  }

  // Elixir
  const mixFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "mix.lock"
  );
  if (mixFiles.length) {
    return await createElixirBom(path, options);
  }

  // cpp
  const conanLockFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "conan.lock"
  );
  const conanFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "conanfile.txt"
  );
  if (conanLockFiles.length || conanFiles.length) {
    return await createCppBom(path, options);
  }

  // clojure
  const ednFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "deps.edn"
  );
  const leinFiles = utils.getAllFiles(
    path,
    (options.multiProject ? "**/" : "") + "project.clj"
  );
  if (ednFiles.length || leinFiles.length) {
    return await createClojureBom(path, options);
  }
};

/**
 * Function to create bom string for various languages
 *
 * @param path to the project
 * @param options Parse options from the cli
 */
exports.createBom = async (path, options) => {
  let { projectType } = options;
  if (!projectType) {
    projectType = "";
  }
  projectType = projectType.toLowerCase();
  let exportData = undefined;
  let isContainerMode = false;
  // Docker and image archive support
  if (path.endsWith(".tar") || path.endsWith(".tar.gz")) {
    exportData = await dockerLib.exportArchive(path);
    if (!exportData) {
      console.log(
        "BOM generation has failed due to problems with exporting the image"
      );
      return {};
    }
    isContainerMode = true;
  } else if (
    projectType === "docker" ||
    projectType === "podman" ||
    projectType === "oci" ||
    path.startsWith("docker.io") ||
    path.startsWith("quay.io") ||
    path.includes("@sha256") ||
    path.includes(":latest")
  ) {
    exportData = await dockerLib.exportImage(path);
    if (!exportData) {
      console.log(
        "BOM generation has failed due to problems with exporting the image"
      );
      return {};
    }
    isContainerMode = true;
  }
  if (isContainerMode) {
    options.multiProject = true;
    options.installDeps = false;
    // Force the project type to docker
    options.projectType = "docker";
    options.lastWorkingDir = exportData.lastWorkingDir;
    const bomData = await createMultiXBom(
      [...new Set(exportData.pkgPathList)],
      options
    );
    if (
      exportData.allLayersDir &&
      exportData.allLayersDir.startsWith(os.tmpdir())
    ) {
      console.log(`Cleaning up ${exportData.allLayersDir}`);
      fs.rmSync(exportData.allLayersDir, { recursive: true, force: true });
    }
    return bomData;
  }
  if (path.endsWith(".war")) {
    projectType = "java";
  }
  switch (projectType) {
    case "java":
    case "groovy":
    case "kotlin":
    case "scala":
    case "jvm":
      return await createJavaBom(path, options);
    case "nodejs":
    case "js":
    case "javascript":
    case "typescript":
    case "ts":
      return await createNodejsBom(path, options);
    case "python":
    case "py":
      return await createPythonBom(path, options);
    case "go":
    case "golang":
      return await createGoBom(path, options);
    case "rust":
    case "rust-lang":
      return await createRustBom(path, options);
    case "php":
      return await createPHPBom(path, options);
    case "ruby":
      return await createRubyBom(path, options);
    case "csharp":
    case "netcore":
    case "dotnet":
      return await createCsharpBom(path, options);
    case "dart":
    case "flutter":
    case "pub":
      return await createDartBom(path, options);
    case "haskell":
    case "hackage":
    case "cabal":
      return await createHaskellBom(path, options);
    case "elixir":
    case "hex":
    case "mix":
      return await createElixirBom(path, options);
    case "c":
    case "cpp":
    case "c++":
    case "conan":
      return await createCppBom(path, options);
    case "clojure":
    case "edn":
    case "clj":
    case "leiningen":
      return await createClojureBom(path, options);
    default:
      // In recurse mode return multi-language Bom
      // https://github.com/AppThreat/cdxgen/issues/95
      if (options.multiProject) {
        return await createMultiXBom([path], options);
      } else {
        return await createXBom(path, options);
      }
  }
};

/**
 * Method to submit the generated bom to dependency-track or AppThreat server
 *
 * @param args CLI args
 * @param bomContents BOM Xml
 */
exports.submitBom = async (args, bomContents) => {
  let serverUrl = args.serverUrl + "/api/v1/bom";
  let encodedBomContents = Buffer.from(bomContents).toString("base64");
  if (encodedBomContents.startsWith("77u/")) {
    encodedBomContents = encodedBomContents.substring(4);
  }
  const bomPayload = {
    project: args.projectId,
    projectName: args.projectName,
    projectVersion: args.projectVersion,
    autoCreate: "true",
    bom: encodedBomContents,
  };
  if (DEBUG_MODE) {
    console.log("Submitting BOM to", serverUrl);
  }
  return await got(serverUrl, {
    method: "PUT",
    headers: {
      "X-Api-Key": args.apiKey,
      "Content-Type": "application/json",
    },
    json: bomPayload,
    responseType: "json",
  }).json();
};
