import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  constants,
  accessSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { platform as _platform, homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import got from "got";
import { PackageURL } from "packageurl-js";
import { gte, lte } from "semver";
import { parse } from "ssri";
import { table } from "table";
import { v4 as uuidv4 } from "uuid";
import { findJSImportsExports } from "../helpers/analyzer.js";
import { collectOSCryptoLibs } from "../helpers/cbomutils.js";
import {
  collectEnvInfo,
  getBranch,
  getOriginUrl,
  gitTreeHashes,
  listFiles,
} from "../helpers/envcontext.js";
import {
  CARGO_CMD,
  CLJ_CMD,
  DEBUG_MODE,
  LEIN_CMD,
  MAX_BUFFER,
  PREFER_MAVEN_DEPS_TREE,
  PROJECT_TYPE_ALIASES,
  SWIFT_CMD,
  TIMEOUT_MS,
  addEvidenceForDotnet,
  addEvidenceForImports,
  addPlugin,
  buildGradleCommandArguments,
  buildObjectForGradleModule,
  checksumFile,
  cleanupPlugin,
  collectGradleDependencies,
  collectJarNS,
  collectMvnDependencies,
  convertJarNSToPackages,
  convertOSQueryResults,
  determineSbtVersion,
  dirNameStr,
  encodeForPurl,
  executeParallelGradleProperties,
  extractJarArchive,
  frameworksList,
  generatePixiLockFile,
  getAllFiles,
  getCppModules,
  getGradleCommand,
  getLicenses,
  getMavenCommand,
  getMvnMetadata,
  getNugetMetadata,
  getPipFrozenTree,
  getPipTreeForPackages,
  getPyMetadata,
  getPyModules,
  getSwiftPackageMetadata,
  getTimestamp,
  hasAnyProjectType,
  includeMavenTestScope,
  isFeatureEnabled,
  isPackageManagerAllowed,
  isPartialTree,
  isValidIriReference,
  parseBazelActionGraph,
  parseBazelSkyframe,
  parseBdistMetadata,
  parseBitbucketPipelinesFile,
  parseBowerJson,
  parseCabalData,
  parseCargoData,
  parseCargoDependencyData,
  parseCargoTomlData,
  parseCljDep,
  parseCloudBuildData,
  parseCmakeLikeFile,
  parseComposerLock,
  parseConanData,
  parseConanLockData,
  parseContainerFile,
  parseContainerSpecData,
  parseCsPkgData,
  parseCsPkgLockData,
  parseCsProjAssetsData,
  parseCsProjData,
  parseEdnData,
  parseGemfileLockData,
  parseGitHubWorkflowData,
  parseGoListDep,
  parseGoModData,
  parseGoModGraph,
  parseGoModWhy,
  parseGopkgData,
  parseGosumData,
  parseGradleDep,
  parseGradleProperties,
  parseHelmYamlData,
  parseLeinDep,
  parseLeiningenData,
  parseMakeDFile,
  parseMavenTree,
  parseMinJs,
  parseMixLockData,
  parseNodeShrinkwrap,
  parseNupkg,
  parseOpenapiSpecData,
  parsePackageJsonName,
  parsePaketLockData,
  parsePiplockData,
  parsePixiLockFile,
  parsePixiTomlFile,
  parsePkgJson,
  parsePkgLock,
  parsePnpmLock,
  parsePoetrylockData,
  parsePom,
  parsePrivadoFile,
  parsePubLockData,
  parsePubYamlData,
  parsePyProjectToml,
  parseReqFile,
  parseSbtLock,
  parseSbtTree,
  parseSetupPyFile,
  parseSwiftJsonTree,
  parseSwiftResolved,
  parseYarnLock,
  readZipEntry,
  recomputeScope,
  shouldFetchLicense,
  splitOutputByGradleProjects,
} from "../helpers/utils.js";
import {
  executeOsQuery,
  getBinaryBom,
  getDotnetSlices,
  getOSPackages,
} from "../managers/binary.js";
import {
  addSkippedSrcFiles,
  exportArchive,
  exportImage,
  getPkgPathList,
  parseImageName,
} from "../managers/docker.js";

let url = import.meta.url;
if (!url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
const dirName = dirNameStr;

const selfPJson = JSON.parse(
  readFileSync(join(dirName, "package.json"), "utf-8"),
);
const _version = selfPJson.version;

const isWin = _platform() === "win32";

let osQueries = {};
switch (_platform()) {
  case "win32":
    osQueries = JSON.parse(
      readFileSync(join(dirName, "data", "queries-win.json"), "utf-8"),
    );
    break;
  case "darwin":
    osQueries = JSON.parse(
      readFileSync(join(dirName, "data", "queries-darwin.json"), "utf-8"),
    );
    break;
  default:
    osQueries = JSON.parse(
      readFileSync(join(dirName, "data", "queries.json"), "utf-8"),
    );
    break;
}
const cosDbQueries = JSON.parse(
  readFileSync(join(dirName, "data", "cosdb-queries.json"), "utf-8"),
);

// Construct gradle cache directory
let GRADLE_CACHE_DIR =
  process.env.GRADLE_CACHE_DIR ||
  join(homedir(), ".gradle", "caches", "modules-2", "files-2.1");
if (process.env.GRADLE_USER_HOME) {
  GRADLE_CACHE_DIR = join(
    process.env.GRADLE_USER_HOME,
    "caches",
    "modules-2",
    "files-2.1",
  );
}

// Construct sbt cache directory
const SBT_CACHE_DIR =
  process.env.SBT_CACHE_DIR || join(homedir(), ".ivy2", "cache");

// CycloneDX Hash pattern
const HASH_PATTERN =
  "^([a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64}|[a-fA-F0-9]{96}|[a-fA-F0-9]{128})$";

/**
 * Creates a default parent component based on the directory name.
 *
 * @param {String} path Directory or file name
 * @param {String} type Package type
 * @param {Object} options CLI options
 * @returns component object
 */
const createDefaultParentComponent = (
  path,
  type = "application",
  options = {},
) => {
  // Expands any relative path such as dot
  path = resolve(path);
  // Create a parent component based on the directory name
  let dirNameStr =
    existsSync(path) && lstatSync(path).isDirectory()
      ? basename(path)
      : dirname(path);
  const tmpA = dirNameStr.split(sep);
  dirNameStr = tmpA[tmpA.length - 1];
  const compName = options.projectName || dirNameStr;
  const parentComponent = {
    group: options.projectGroup || "",
    name: compName,
    version: `${options.projectVersion}` || "latest",
    type: compName.endsWith(".tar") ? "container" : "application",
  };
  const ppurl = new PackageURL(
    type,
    parentComponent.group,
    parentComponent.name,
    parentComponent.version,
    null,
    null,
  ).toString();
  parentComponent["bom-ref"] = decodeURIComponent(ppurl);
  parentComponent["purl"] = ppurl;
  return parentComponent;
};

const determineParentComponent = (options) => {
  let parentComponent = undefined;
  if (options.parentComponent && Object.keys(options.parentComponent).length) {
    return options.parentComponent;
  }
  if (options.projectName && options.projectVersion) {
    parentComponent = {
      group: options.projectGroup || "",
      name: options.projectName,
      version: `${options.projectVersion}` || "",
      type: "application",
    };
    const ppurl = new PackageURL(
      parentComponent.type,
      parentComponent.group,
      parentComponent.name,
      parentComponent.version,
      null,
      null,
    ).toString();
    parentComponent["bom-ref"] = decodeURIComponent(ppurl);
    parentComponent["purl"] = ppurl;
  }
  return parentComponent;
};

const addToolsSection = (options, context = {}) => {
  if (options.specVersion === 1.4) {
    return [
      {
        vendor: "cyclonedx",
        name: "cdxgen",
        version: _version,
      },
    ];
  }
  let components = [];
  const tools = options.tools || context.tools || [];
  // tools can be an object or array
  if (Array.isArray(tools) && tools.length) {
    // cyclonedx-maven-plugin has the legacy tools metadata which needs to be patched
    for (const tool of tools) {
      if (!tool.type) {
        tool.type = "application";
        if (tool.vendor) {
          tool.publisher = tool.vendor;
          delete tool.vendor;
        }
      }
    }
    components = components.concat(tools);
  } else if (tools && Object.keys(tools).length && tools.components) {
    components = components.concat(tools.components);
  }
  const cdxToolComponent = {
    group: "@cyclonedx",
    name: "cdxgen",
    version: _version,
    purl: `pkg:npm/%40cyclonedx/cdxgen@${_version}`,
    type: "application",
    "bom-ref": `pkg:npm/@cyclonedx/cdxgen@${_version}`,
    author: "OWASP Foundation",
    publisher: "OWASP Foundation",
  };
  if (options.specVersion >= 1.6) {
    cdxToolComponent.authors = [{ name: "OWASP Foundation" }];
    delete cdxToolComponent.author;
  }
  components.push(cdxToolComponent);
  return { components };
};

const componentToSimpleFullName = (comp) => {
  let fullName = comp.group?.length ? `${comp.group}/${comp.name}` : comp.name;
  if (comp.version?.length) {
    fullName = `${fullName}@${comp.version}`;
  }
  return fullName;
};

// Remove unwanted properties from parent component
const cleanParentComponent = (comp) => {
  delete comp.evidence;
  delete comp._integrity;
  delete comp.license;
  delete comp.qualifiers;
  delete comp.repository;
  delete comp.homepage;
  return comp;
};

const addAuthorsSection = (options) => {
  const authors = [];
  if (options.author) {
    const oauthors = Array.isArray(options.author)
      ? options.author
      : [options.author];
    for (const aauthor of oauthors) {
      if (aauthor.trim().length < 2) {
        continue;
      }
      authors.push({ name: aauthor });
    }
  }
  return authors;
};

/**
 * Method to generate metadata.lifecycles section. We assume that we operate during "build"
 * most of the time and under "post-build" for containers.
 *
 * @param {Object} options
 * @returns {Array} Lifecycles array
 */
const addLifecyclesSection = (options) => {
  // If lifecycle was set via CLI arguments, reuse the value
  if (options.lifecycle) {
    return [{ phase: options.lifecycle }];
  }
  const lifecycles = [{ phase: options.installDeps ? "build" : "pre-build" }];
  if (options.exportData) {
    const inspectData = options.exportData.inspectData;
    if (inspectData) {
      lifecycles.push({ phase: "post-build" });
    }
  } else if (options.deep) {
    lifecycles.push({ phase: "post-build" });
  }
  if (options.projectType?.includes("os")) {
    lifecycles.push({ phase: "operations" });
  }
  return lifecycles;
};

/**
 * Method to generate the formulation section based on git metadata
 *
 * @param {Object} options
 * @param {Object} context Context
 * @returns {Array} formulation array
 */
const addFormulationSection = (options, context) => {
  const formulation = [];
  const provides = [];
  const gitBranch = getBranch();
  const originUrl = getOriginUrl();
  const gitFiles = listFiles();
  const treeHashes = gitTreeHashes();
  let parentOmniborId;
  let treeOmniborId;
  let components = [];
  const aformulation = {};
  // Reuse any existing formulation components
  // See: PR #1172
  if (context?.formulationList?.length) {
    components = components.concat(trimComponents(context.formulationList));
  }
  if (options.specVersion >= 1.6 && Object.keys(treeHashes).length === 2) {
    parentOmniborId = `gitoid:blob:sha1:${treeHashes.parent}`;
    treeOmniborId = `gitoid:blob:sha1:${treeHashes.tree}`;
    components.push({
      type: "file",
      name: "git-parent",
      description: "Git Parent Node.",
      "bom-ref": parentOmniborId,
      omniborId: [parentOmniborId],
      swhid: [`swh:1:rev:${treeHashes.parent}`],
    });
    components.push({
      type: "file",
      name: "git-tree",
      description: "Git Tree Node.",
      "bom-ref": treeOmniborId,
      omniborId: [treeOmniborId],
      swhid: [`swh:1:rev:${treeHashes.tree}`],
    });
    provides.push({
      ref: parentOmniborId,
      provides: [treeOmniborId],
    });
  }
  // Collect git related components
  if (gitBranch && gitFiles) {
    const gitFileComponents = gitFiles.map((f) =>
      options.specVersion >= 1.6
        ? {
            type: "file",
            name: f.name,
            version: f.hash,
            omniborId: [f.omniborId],
            swhid: [f.swhid],
          }
        : {
            type: "file",
            name: f.name,
            version: f.hash,
          },
    );
    components = components.concat(gitFileComponents);
    // Complete the Artifact Dependency Graph
    if (options.specVersion >= 1.6 && treeOmniborId) {
      provides.push({
        ref: treeOmniborId,
        provides: gitFiles.map((f) => f.ref),
      });
    }
  }
  // Collect build environment details
  const infoComponents = collectEnvInfo(options.path);
  if (infoComponents?.length) {
    components = components.concat(infoComponents);
  }
  // Should we include the OS crypto libraries
  if (options.includeCrypto) {
    const cryptoLibs = collectOSCryptoLibs(options);
    if (cryptoLibs?.length) {
      components = components.concat(cryptoLibs);
    }
  }
  aformulation["bom-ref"] = uuidv4();
  aformulation.components = trimComponents(components);
  let environmentVars = gitBranch?.length
    ? [{ name: "GIT_BRANCH", value: gitBranch }]
    : [];
  for (const aevar of Object.keys(process.env)) {
    if (
      (aevar.startsWith("GIT") ||
        aevar.startsWith("ANDROID") ||
        aevar.startsWith("DENO") ||
        aevar.startsWith("DOTNET") ||
        aevar.startsWith("JAVA_") ||
        aevar.startsWith("SDKMAN") ||
        aevar.startsWith("CARGO") ||
        aevar.startsWith("CONDA") ||
        aevar.startsWith("RUST")) &&
      !aevar.toLowerCase().includes("key") &&
      !aevar.toLowerCase().includes("token") &&
      !aevar.toLowerCase().includes("pass") &&
      !aevar.toLowerCase().includes("secret") &&
      !aevar.toLowerCase().includes("user") &&
      !aevar.toLowerCase().includes("email") &&
      process.env[aevar] &&
      process.env[aevar].length
    ) {
      environmentVars.push({
        name: aevar,
        value: process.env[aevar],
      });
    }
  }
  if (!environmentVars.length) {
    environmentVars = undefined;
  }
  let sourceInput = undefined;
  if (environmentVars) {
    sourceInput = { environmentVars };
  }
  const sourceWorkflow = {
    "bom-ref": uuidv4(),
    uid: uuidv4(),
    taskTypes: originUrl ? ["build", "clone"] : ["build"],
  };
  if (sourceInput) {
    sourceWorkflow.inputs = [sourceInput];
  }
  aformulation.workflows = [sourceWorkflow];
  formulation.push(aformulation);
  return { formulation, provides };
};

/**
 * Function to create metadata block
 *
 */
function addMetadata(parentComponent = {}, options = {}, context = {}) {
  // DO NOT fork this project to just change the vendor or author's name
  // Try to contribute to this project by sending PR or filing issues
  const tools = addToolsSection(options, context);
  const authors = addAuthorsSection(options);
  const lifecycles =
    options.specVersion >= 1.5 ? addLifecyclesSection(options) : undefined;
  const metadata = {
    timestamp: getTimestamp(),
    tools,
    authors,
    supplier: undefined,
  };
  if (lifecycles) {
    metadata.lifecycles = lifecycles;
  }
  if (parentComponent && Object.keys(parentComponent).length) {
    if (parentComponent) {
      cleanParentComponent(parentComponent);
      if (!parentComponent["purl"] && parentComponent["bom-ref"]) {
        parentComponent["purl"] = encodeForPurl(parentComponent["bom-ref"]);
      }
    }
    if (parentComponent?.components) {
      parentComponent.components = listComponents(
        options,
        {},
        parentComponent.components,
      );
      const parentFullName = componentToSimpleFullName(parentComponent);
      const subComponents = [];
      const addedSubComponents = {};
      for (const comp of parentComponent.components) {
        cleanParentComponent(comp);
        if (comp.name && comp.type) {
          const fullName = componentToSimpleFullName(comp);
          // Fixes #479
          // Prevent the parent component from also appearing as a sub-component
          // We cannot use purl or bom-ref here since they would not match
          // purl - could have application on one side and a different type
          // bom-ref could have qualifiers on one side
          // Ignore components that have the same name as the parent component but with latest as the version.
          // These are default components created based on directory names
          if (
            fullName !== parentFullName &&
            !(
              (comp.name === parentComponent.name ||
                comp.name === `${parentComponent.name}:latest`) &&
              comp.version === "latest"
            )
          ) {
            if (!comp["bom-ref"]) {
              comp["bom-ref"] = `pkg:${comp.type}/${decodeURIComponent(
                fullName,
              )}`;
            }
            if (!addedSubComponents[comp["bom-ref"]]) {
              subComponents.push(comp);
              addedSubComponents[comp["bom-ref"]] = true;
            }
          }
        }
      } // for
      // Avoid creating empty component.components attribute
      if (subComponents.length) {
        parentComponent.components = subComponents;
      } else {
        parentComponent.components = undefined;
      }
    }
    metadata.component = parentComponent;
  }
  if (options) {
    const mproperties = [];
    if (options.exportData) {
      const inspectData = options.exportData.inspectData;
      if (inspectData) {
        if (inspectData.Id) {
          mproperties.push({
            name: "oci:image:Id",
            value: inspectData.Id,
          });
        }
        if (
          inspectData.RepoTags &&
          Array.isArray(inspectData.RepoTags) &&
          inspectData.RepoTags.length
        ) {
          mproperties.push({
            name: "oci:image:RepoTag",
            value: inspectData.RepoTags[0],
          });
        }
        if (
          inspectData.RepoDigests &&
          Array.isArray(inspectData.RepoDigests) &&
          inspectData.RepoDigests.length
        ) {
          mproperties.push({
            name: "oci:image:RepoDigest",
            value: inspectData.RepoDigests[0],
          });
        }
        if (inspectData.Created) {
          mproperties.push({
            name: "oci:image:Created",
            value: inspectData.Created,
          });
        }
        if (inspectData.Architecture) {
          mproperties.push({
            name: "oci:image:Architecture",
            value: inspectData.Architecture,
          });
        }
        if (inspectData.Os) {
          mproperties.push({
            name: "oci:image:Os",
            value: inspectData.Os,
          });
        }
      }
      const manifestList = options.exportData.manifest;
      if (manifestList && Array.isArray(manifestList) && manifestList.length) {
        const manifest = manifestList[0] || {};
        if (manifest.Config) {
          mproperties.push({
            name: "oci:image:manifest:Config",
            value: manifest.Config,
          });
        }
        if (
          manifest.Layers &&
          Array.isArray(manifest.Layers) &&
          manifest.Layers.length
        ) {
          mproperties.push({
            name: "oci:image:manifest:Layers",
            value: manifest.Layers.join("\\n"),
          });
        }
      }
      const lastLayerConfig = options.exportData.lastLayerConfig;
      if (lastLayerConfig) {
        if (lastLayerConfig.id) {
          mproperties.push({
            name: "oci:image:lastLayer:Id",
            value: lastLayerConfig.id,
          });
        }
        if (lastLayerConfig.parent) {
          mproperties.push({
            name: "oci:image:lastLayer:ParentId",
            value: lastLayerConfig.parent,
          });
        }
        if (lastLayerConfig.created) {
          mproperties.push({
            name: "oci:image:lastLayer:Created",
            value: lastLayerConfig.created,
          });
        }
        if (lastLayerConfig.config) {
          const env = lastLayerConfig.config.Env;
          if (env && Array.isArray(env) && env.length) {
            mproperties.push({
              name: "oci:image:lastLayer:Env",
              value: env.join("\\n"),
            });
          }
          const ccmd = lastLayerConfig.config.Cmd;
          if (ccmd && Array.isArray(ccmd) && ccmd.length) {
            mproperties.push({
              name: "oci:image:lastLayer:Cmd",
              value: ccmd.join(" "),
            });
          }
        }
      }
    }
    if (options.allOSComponentTypes?.length) {
      mproperties.push({
        name: "oci:image:componentTypes",
        value: options.allOSComponentTypes.sort().join("\\n"),
      });
    }

    if (mproperties.length) {
      metadata.properties = mproperties;
    }
  }
  return metadata;
}

/**
 * Method to create external references
 *
 * @param {Array | Object} opkg
 * @returns {Array}
 */
function addExternalReferences(opkg) {
  let externalReferences = [];
  let pkgList;
  if (Array.isArray(opkg)) {
    pkgList = opkg;
  } else {
    pkgList = [opkg];
  }
  for (const pkg of pkgList) {
    if (pkg.externalReferences) {
      externalReferences = externalReferences.concat(pkg.externalReferences);
    } else {
      if (pkg.homepage?.url) {
        externalReferences.push({
          type: pkg.homepage.url.includes("git") ? "vcs" : "website",
          url: pkg.homepage.url,
        });
      }
      if (pkg.bugs?.url) {
        externalReferences.push({
          type: "issue-tracker",
          url: pkg.bugs.url,
        });
      }
      if (pkg.repository?.url) {
        externalReferences.push({
          type: "vcs",
          url: pkg.repository.url,
        });
      }
      if (pkg.distribution?.url) {
        externalReferences.push({
          type: "distribution",
          url: pkg.distribution.url,
        });
      }
    }
  }
  return externalReferences
    .map((reference) => ({ ...reference, url: reference.url.trim() }))
    .filter((reference) => isValidIriReference(reference.url));
}

/**
 * For all modules in the specified package, creates a list of
 * component objects from each one.
 *
 * @param {Object} options CLI options
 * @param {Object} allImports All imports
 * @param {Object} pkg Package object
 * @param {string} ptype Package type
 */
export function listComponents(options, allImports, pkg, ptype = "npm") {
  const compMap = {};
  const isRootPkg = ptype === "npm";
  if (Array.isArray(pkg)) {
    pkg.forEach((p) => {
      addComponent(options, allImports, p, ptype, compMap, false);
    });
  } else {
    addComponent(options, allImports, pkg, ptype, compMap, isRootPkg);
  }

  return Object.keys(compMap).map((k) => compMap[k]);
}

/**
 * Given the specified package, create a CycloneDX component and add it to the list.
 */
function addComponent(
  options,
  allImports,
  pkg,
  ptype,
  compMap,
  isRootPkg = false,
) {
  if (!pkg || pkg.extraneous) {
    return;
  }
  if (!isRootPkg) {
    const pkgIdentifier = parsePackageJsonName(pkg.name);
    const author = pkg.author || undefined;
    const publisher = pkg.publisher || undefined;
    let group = pkg.group || pkgIdentifier.scope;
    // Create empty group
    group = group || "";
    const name = pkgIdentifier.fullName || pkg.name || "";
    // name is mandatory
    if (!name) {
      return;
    }
    // Do we need this still?
    if (
      !ptype &&
      ["jar", "war", "ear", "pom"].includes(pkg?.qualifiers?.type)
    ) {
      ptype = "maven";
    }
    const version = pkg.version || "";
    const licenses = pkg.licenses || getLicenses(pkg);
    let purl =
      pkg.purl ||
      new PackageURL(
        ptype,
        encodeForPurl(group),
        encodeForPurl(name),
        version,
        pkg.qualifiers,
        encodeForPurl(pkg.subpath),
      );
    let purlString = purl.toString();
    // There is no purl for cryptographic-asset
    if (ptype === "cryptographic-asset") {
      purl = undefined;
      purlString = undefined;
    }
    const description = pkg.description || undefined;
    let compScope = pkg.scope;
    if (allImports) {
      const impPkgs = Object.keys(allImports);
      if (
        impPkgs.includes(name) ||
        impPkgs.includes(`${group}/${name}`) ||
        impPkgs.includes(`@${group}/${name}`) ||
        impPkgs.includes(group) ||
        impPkgs.includes(`@${group}`)
      ) {
        compScope = "required";
      } else if (impPkgs.length && compScope !== "excluded") {
        compScope = "optional";
      }
    }
    const component = {
      author,
      publisher,
      group,
      name,
      version,
      description,
      scope: compScope,
      hashes: [],
      licenses,
      purl: purlString,
      externalReferences: addExternalReferences(pkg),
    };

    component["type"] = determinePackageType(pkg);
    component["bom-ref"] = decodeURIComponent(purlString);
    if (
      component.externalReferences === undefined ||
      component.externalReferences.length === 0
    ) {
      delete component.externalReferences;
    }
    if (options.specVersion < 1.6) {
      delete component.omniborId;
      delete component.swhid;
    }
    processHashes(pkg, component);
    // Retain evidence
    if (
      options.specVersion >= 1.5 &&
      pkg.evidence &&
      Object.keys(pkg.evidence).length
    ) {
      component.evidence = pkg.evidence;
      // Convert evidence.identity section to an array for 1.6 and above
      if (
        options.specVersion >= 1.6 &&
        pkg.evidence &&
        pkg.evidence.identity &&
        !Array.isArray(pkg.evidence.identity)
      ) {
        component.evidence.identity = [pkg.evidence.identity];
      }
    }
    // Upgrade authors section
    if (options.specVersion >= 1.6 && component.author) {
      const authorsList = [];
      for (const aauthor of component.author.split(",")) {
        authorsList.push({ name: aauthor });
      }
      component.authors = authorsList;
      delete component.author;
    }
    // Retain any tags
    if (
      options.specVersion >= 1.6 &&
      pkg.tags &&
      Object.keys(pkg.tags).length
    ) {
      component.tags = pkg.tags;
    }
    // Retain any component properties and crypto properties
    if (pkg.properties?.length) {
      component.properties = pkg.properties;
    }
    if (pkg.cryptoProperties?.length) {
      component.cryptoProperties = pkg.cryptoProperties;
    }
    // Retain nested components
    if (pkg.components) {
      component.components = pkg.components;
    }
    if (compMap[component.purl]) return; //remove cycles
    compMap[component.purl] = component;
  }
  if (pkg.dependencies) {
    Object.keys(pkg.dependencies)
      .map((x) => pkg.dependencies[x])
      .filter((x) => typeof x !== "string") //remove cycles
      .map((x) => addComponent(options, allImports, x, ptype, compMap, false));
  }
}

/**
 * If the author has described the module as a 'framework', the take their
 * word for it, otherwise, identify the module as a 'library'.
 */
function determinePackageType(pkg) {
  // Retain the exact component type in certain cases.
  if (
    [
      "container",
      "platform",
      "operating-system",
      "device",
      "device-driver",
      "firmware",
      "file",
      "machine-learning-model",
      "data",
      "cryptographic-asset",
    ].includes(pkg.type)
  ) {
    return pkg.type;
  }
  if (pkg.type === "application") {
    if (pkg?.name?.endsWith(".tar")) {
      return "container";
    }
    return pkg.type;
  }
  if (pkg.purl) {
    try {
      const purl = PackageURL.fromString(pkg.purl);
      if (purl.type) {
        if (["docker", "oci", "container"].includes(purl.type)) {
          return "container";
        }
        if (["github"].includes(purl.type)) {
          return "application";
        }
      }
      for (const cf of frameworksList.all) {
        if (
          pkg.purl.startsWith(cf) ||
          purl.namespace?.includes(cf) ||
          purl.name.toLowerCase().includes(cf)
        ) {
          return "framework";
        }
      }
    } catch (e) {
      // continue regardless of error
    }
  } else if (pkg.group) {
    if (["actions"].includes(pkg.group)) {
      return "application";
    }
  }
  if (Object.prototype.hasOwnProperty.call(pkg, "description")) {
    if (pkg.description?.toLowerCase().includes("framework")) {
      return "framework";
    }
  }
  if (Object.prototype.hasOwnProperty.call(pkg, "keywords")) {
    for (const keyword of pkg.keywords) {
      if (keyword && keyword.toLowerCase() === "framework") {
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
  if (pkg.hashes) {
    // This attribute would be available when we read a bom json directly
    // Eg: cyclonedx-maven-plugin. See: Bugs: #172, #175
    for (const ahash of pkg.hashes) {
      addComponentHash(ahash.alg, ahash.content, component);
    }
  } else if (pkg._shasum) {
    const ahash = { alg: "SHA-1", content: pkg._shasum };
    component.hashes.push(ahash);
  } else if (pkg._integrity) {
    const integrity = parse(pkg._integrity) || {};
    // Components may have multiple hashes with various lengths. Check each one
    // that is supported by the CycloneDX specification.
    if (Object.prototype.hasOwnProperty.call(integrity, "sha512")) {
      addComponentHash("SHA-512", integrity.sha512[0].digest, component);
    }
    if (Object.prototype.hasOwnProperty.call(integrity, "sha384")) {
      addComponentHash("SHA-384", integrity.sha384[0].digest, component);
    }
    if (Object.prototype.hasOwnProperty.call(integrity, "sha256")) {
      addComponentHash("SHA-256", integrity.sha256[0].digest, component);
    }
    if (Object.prototype.hasOwnProperty.call(integrity, "sha1")) {
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
  let hash;
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
  const ahash = { alg: alg, content: hash };
  component.hashes.push(ahash);
}

/**
 * Return the BOM in json format including any namespace mapping
 *
 * @param {Object} options Options
 * @param {Object} pkgInfo Package information
 * @param {string} ptype Package type
 * @param {Object} context Context
 *
 * @returns {Object} BOM with namespace mapping
 */
const buildBomNSData = (options, pkgInfo, ptype, context) => {
  const bomNSData = {
    bomJson: undefined,
    bomJsonFiles: undefined,
    nsMapping: undefined,
    dependencies: undefined,
    parentComponent: undefined,
  };
  const serialNum = `urn:uuid:${uuidv4()}`;
  let allImports = {};
  if (context?.allImports) {
    allImports = context.allImports;
  }
  const nsMapping = context.nsMapping || {};
  const dependencies = context.dependencies || [];
  const parentComponent =
    determineParentComponent(options) || context.parentComponent;
  const metadata = addMetadata(parentComponent, options, context);
  const components = listComponents(options, allImports, pkgInfo, ptype);
  if (components && (components.length || parentComponent)) {
    // CycloneDX Json Template
    const jsonTpl = {
      bomFormat: "CycloneDX",
      specVersion: `${options.specVersion || "1.5"}`,
      serialNumber: serialNum,
      version: 1,
      metadata: metadata,
      components,
      dependencies,
    };
    const formulationData =
      options.includeFormulation && options.specVersion >= 1.5
        ? addFormulationSection(options, context)
        : undefined;
    if (formulationData) {
      jsonTpl.formulation = formulationData.formulation;
    }
    bomNSData.bomJson = jsonTpl;
    bomNSData.nsMapping = nsMapping;
    bomNSData.dependencies = dependencies;
    bomNSData.parentComponent = parentComponent;
  }
  return bomNSData;
};

/**
 * Function to create bom string for Java jars
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 *
 * @returns {Object} BOM with namespace mapping
 */
export async function createJarBom(path, options) {
  let pkgList = [];
  let jarFiles;
  let nsMapping = {};
  const parentComponent = createDefaultParentComponent(path, "maven", options);
  if (options.useGradleCache) {
    nsMapping = await collectGradleDependencies(
      getGradleCommand(path, null),
      path,
      false,
      true,
    );
  } else if (options.useMavenCache) {
    nsMapping = await collectMvnDependencies(
      getMavenCommand(path, null),
      null,
      false,
      true,
    );
  }
  if (path.endsWith(".jar")) {
    jarFiles = [resolve(path)];
  } else {
    jarFiles = getAllFiles(
      path,
      `${options.multiProject ? "**/" : ""}*.[jw]ar`,
      options,
    );
  }
  // Jenkins plugins
  const hpiFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.hpi`,
    options,
  );
  if (hpiFiles.length) {
    jarFiles = jarFiles.concat(hpiFiles);
  }
  const tempDir = mkdtempSync(join(tmpdir(), "jar-deps-"));
  for (const jar of jarFiles) {
    if (DEBUG_MODE) {
      console.log(`Parsing ${jar}`);
    }
    const dlist = await extractJarArchive(jar, tempDir);
    if (dlist?.length) {
      pkgList = pkgList.concat(dlist);
    }
    if (pkgList.length) {
      pkgList = await getMvnMetadata(pkgList);
    }
  }
  // Clean up
  if (tempDir?.startsWith(tmpdir()) && rmSync) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  pkgList = pkgList.concat(convertJarNSToPackages(nsMapping));
  return buildBomNSData(options, pkgList, "maven", {
    src: path,
    parentComponent,
  });
}

/**
 * Function to create bom string for Android apps using blint
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createAndroidBom(path, options) {
  return createBinaryBom(path, options);
}

/**
 * Function to create bom string for binaries using blint
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createBinaryBom(path, options) {
  const tempDir = mkdtempSync(join(tmpdir(), "blint-tmp-"));
  const binaryBomFile = join(tempDir, "bom.json");
  getBinaryBom(path, binaryBomFile, options.deep);
  if (existsSync(binaryBomFile)) {
    const binaryBom = JSON.parse(
      readFileSync(binaryBomFile, { encoding: "utf-8" }),
    );
    return {
      bomJson: binaryBom,
      dependencies: binaryBom.dependencies,
      parentComponent: binaryBom.parentComponent,
    };
  }
  return undefined;
}

/**
 * Function to create bom string for Java projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createJavaBom(path, options) {
  let jarNSMapping = {};
  let pkgList = [];
  let dependencies = [];
  // cyclone-dx-maven plugin creates a component for the app under metadata
  // This is subsequently referred to in the dependencies list
  let parentComponent = {};
  // Support for tracking all the tools that created the BOM
  // For java, this would correctly include the cyclonedx maven plugin.
  let tools = undefined;
  let possible_misses = false;
  let mavenDepsTreeInfoShown = false;
  // war/ear mode
  if (path.endsWith(".war") || path.endsWith(".jar")) {
    // Check if the file exists
    if (existsSync(path)) {
      if (DEBUG_MODE) {
        console.log(`Retrieving packages from ${path}`);
      }
      const tempDir = mkdtempSync(join(tmpdir(), "war-deps-"));
      jarNSMapping = await collectJarNS(tempDir);
      pkgList = await extractJarArchive(path, tempDir, jarNSMapping);
      if (pkgList.length) {
        pkgList = await getMvnMetadata(pkgList);
      }
      // Clean up
      if (tempDir?.startsWith(tmpdir()) && rmSync) {
        console.log(`Cleaning up ${tempDir}`);
        rmSync(tempDir, { recursive: true, force: true });
      }
    } else {
      console.log(`${path} doesn't exist`);
    }
    return buildBomNSData(options, pkgList, "maven", {
      src: dirname(path),
      filename: path,
      nsMapping: jarNSMapping,
      dependencies,
      parentComponent,
    });
  }
  // maven - pom.xml
  const pomFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}pom.xml`,
    options,
  );
  let bomJsonFiles = [];
  if (
    pomFiles?.length &&
    isPackageManagerAllowed("maven", ["bazel", "sbt", "gradle"], options)
  ) {
    let result = undefined;
    const cdxMavenPlugin =
      process.env.CDX_MAVEN_PLUGIN ||
      "org.cyclonedx:cyclonedx-maven-plugin:2.8.0";
    const cdxMavenGoal = process.env.CDX_MAVEN_GOAL || "makeAggregateBom";
    let mvnArgs = [
      "-fn",
      `${cdxMavenPlugin}:${cdxMavenGoal}`,
      "-DoutputName=bom",
    ];
    if (includeMavenTestScope) {
      mvnArgs.push("-DincludeTestScope=true");
    }
    // By using quiet mode we can reduce the maxBuffer used and avoid crashes
    if (!DEBUG_MODE) {
      mvnArgs.push("-q");
    }
    // Support for passing additional settings and profile to maven
    if (process.env.MVN_ARGS) {
      const addArgs = process.env.MVN_ARGS.split(" ");
      mvnArgs = mvnArgs.concat(addArgs);
    }
    // specVersion 1.4 doesn't support externalReferences.type=disribution-intake
    // so we need to run the plugin with the correct version
    if (options.specVersion === 1.4) {
      mvnArgs = mvnArgs.concat("-DschemaVersion=1.4");
    }
    const firstPom = pomFiles.length ? pomFiles[0] : undefined;
    let mavenCmd = getMavenCommand(path, path);
    for (const f of pomFiles) {
      const basePath = dirname(f);
      const settingsXml = join(basePath, "settings.xml");
      if (existsSync(settingsXml)) {
        console.log(
          `maven settings.xml found in ${basePath}. Please set the MVN_ARGS environment variable based on the full mvn build command used for this project.\nExample: MVN_ARGS='--settings ${settingsXml}'`,
        );
      }
      if (mavenCmd?.endsWith("mvn")) {
        mavenCmd = getMavenCommand(basePath, path);
      }
      // Should we attempt to resolve class names
      if (options.resolveClass || options.deep) {
        const tmpjarNSMapping = await collectMvnDependencies(
          mavenCmd,
          basePath,
          true,
          false,
        );
        if (tmpjarNSMapping && Object.keys(tmpjarNSMapping).length) {
          jarNSMapping = { ...jarNSMapping, ...tmpjarNSMapping };
        }
      }
      // Use the cyclonedx maven plugin if there is no preference for maven deps tree
      if (!PREFER_MAVEN_DEPS_TREE) {
        if (!mavenDepsTreeInfoShown && DEBUG_MODE) {
          console.log(
            "cdxgen now supports generating SBOM with only the maven cli without the need for the cyclonedx-maven plugin. This mode works better in enterprise environments and in multi-module projects.",
          );
          console.log(
            "Set the environment variable PREFER_MAVEN_DEPS_TREE to true to enable this.",
          );
          mavenDepsTreeInfoShown = true;
        }
        console.log(
          `Executing '${mavenCmd} ${mvnArgs.join(" ")}' in`,
          basePath,
        );
        result = spawnSync(mavenCmd, mvnArgs, {
          cwd: basePath,
          shell: true,
          encoding: "utf-8",
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
        });
        // Check if the cyclonedx plugin created the required bom.json file
        // Sometimes the plugin fails silently for complex maven projects
        bomJsonFiles = getAllFiles(path, "**/target/*.json", options);
        // Check if the bom json files got created in a directory other than target
        if (!bomJsonFiles.length) {
          bomJsonFiles = getAllFiles(
            path,
            "target/**/*{cdx,bom}*.json",
            options,
          );
        }
      }
      // Also check if the user has a preference for maven deps tree command
      if (
        PREFER_MAVEN_DEPS_TREE ||
        !bomJsonFiles.length ||
        result?.status !== 0 ||
        result?.error
      ) {
        const tempDir = mkdtempSync(join(tmpdir(), "cdxmvn-"));
        const tempMvnTree = join(tempDir, "mvn-tree.txt");
        const tempMvnParentTree = join(tempDir, "mvn-parent-tree.txt");
        let mvnTreeArgs = ["dependency:tree", `-DoutputFile=${tempMvnTree}`];
        if (process.env.MVN_ARGS) {
          const addArgs = process.env.MVN_ARGS.split(" ");
          mvnTreeArgs = mvnTreeArgs.concat(addArgs);
        }
        // Automatically use settings.xml to improve the success for fallback
        if (existsSync(settingsXml)) {
          mvnTreeArgs.push("-s");
          mvnTreeArgs.push(settingsXml);
        }
        // For the first pom alone, we need to execute first in non-recursive mode to capture
        // the parent component. Then, we execute all of them in recursive mode
        if (f === firstPom) {
          result = spawnSync(
            "mvn",
            ["dependency:tree", "-N", `-DoutputFile=${tempMvnParentTree}`],
            {
              cwd: basePath,
              shell: true,
              encoding: "utf-8",
              timeout: TIMEOUT_MS,
              maxBuffer: MAX_BUFFER,
            },
          );
          if (result.status === 0) {
            if (existsSync(tempMvnParentTree)) {
              const mvnTreeString = readFileSync(tempMvnParentTree, {
                encoding: "utf-8",
              });
              const parsedList = parseMavenTree(mvnTreeString, f);
              const dlist = parsedList.pkgList;
              const tmpParentComponent = dlist.splice(0, 1)[0];
              tmpParentComponent.type = "application";
              parentComponent = tmpParentComponent;
              parentComponent.components = [];
            }
          }
        }
        console.log(`Executing 'mvn ${mvnTreeArgs.join(" ")}' in ${basePath}`);
        // Prefer the built-in maven
        result = spawnSync(
          PREFER_MAVEN_DEPS_TREE ? "mvn" : mavenCmd,
          mvnTreeArgs,
          {
            cwd: basePath,
            shell: true,
            encoding: "utf-8",
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_BUFFER,
          },
        );
        if (result.status !== 0 || result.error) {
          possible_misses = true;
          // Our approach to recursively invoking the maven plugin for each sub-module is bound to result in failures
          // These could be due to a range of reasons that are covered below.
          if (pomFiles.length === 1 || DEBUG_MODE || PREFER_MAVEN_DEPS_TREE) {
            console.error(result.stdout, result.stderr);
            console.log("The above build errors could be due to:\n");
            if (
              result.stdout &&
              (result.stdout.includes("Non-resolvable parent POM") ||
                result.stdout.includes("points at wrong local POM"))
            ) {
              console.log(
                "1. Check if the pom.xml contains valid settings for parent and modules. Some projects can be built only from a specific directory.",
              );
            } else if (
              result.stdout &&
              (result.stdout.includes("Could not resolve dependencies") ||
                result.stdout.includes("no dependency information available") ||
                result.stdout.includes(
                  "The following artifacts could not be resolved",
                ))
            ) {
              console.log(
                "1. Try building the project with 'mvn package -Dmaven.test.skip=true' using the correct version of Java and maven before invoking cdxgen.",
              );
            } else if (
              result.stdout?.includes(
                "Could not resolve target platform specification",
              )
            ) {
              console.log(
                "1. Some projects can be built only from the root directory. Invoke cdxgen with --no-recurse option",
              );
            } else {
              console.log(
                "1. Java version requirement: cdxgen container image bundles Java 23 with maven 3.9 which might be incompatible. Try running cdxgen with the custom JDK11-based image `ghcr.io/cyclonedx/cdxgen-java:v11`.",
              );
            }
            console.log(
              "2. Private dependencies cannot be downloaded: Check if any additional arguments must be passed to maven and set them via MVN_ARGS environment variable.",
            );
            console.log(
              "3. Check if all required environment variables including any maven profile arguments are passed correctly to this tool.",
            );
          }
          // Do not fall back to methods that can produce incomplete results when failOnError is set
          options.failOnError && process.exit(1);
          console.log(
            "\nFalling back to parsing pom.xml files. Only direct dependencies would get included!",
          );
          const dlist = parsePom(f);
          if (dlist?.length) {
            pkgList = pkgList.concat(dlist);
          }
        } else {
          if (existsSync(tempMvnTree)) {
            const mvnTreeString = readFileSync(tempMvnTree, {
              encoding: "utf-8",
            });
            const parsedList = parseMavenTree(mvnTreeString, f);
            const dlist = parsedList.pkgList;
            const tmpParentComponent = dlist.splice(0, 1)[0];
            tmpParentComponent.type = "application";
            if (dlist?.length) {
              pkgList = pkgList.concat(dlist);
            }
            // Retain the parent hierarchy
            if (!Object.keys(parentComponent).length) {
              parentComponent = tmpParentComponent;
              parentComponent.components = [];
            } else {
              parentComponent.components.push(tmpParentComponent);
            }
            if (parsedList.dependenciesList && parsedList.dependenciesList) {
              dependencies = mergeDependencies(
                dependencies,
                parsedList.dependenciesList,
                tmpParentComponent,
              );
            }
            unlinkSync(tempMvnTree);
          }
        }
      }
    } // for
    // Locate and parse all bom.json files from the maven plugin
    if (!PREFER_MAVEN_DEPS_TREE) {
      for (const abjson of bomJsonFiles) {
        let bomJsonObj = undefined;
        try {
          if (DEBUG_MODE) {
            console.log(`Extracting data from generated bom file ${abjson}`);
          }
          bomJsonObj = JSON.parse(
            readFileSync(abjson, {
              encoding: "utf-8",
            }),
          );
          if (bomJsonObj) {
            if (
              !tools &&
              bomJsonObj.metadata &&
              bomJsonObj.metadata.tools &&
              Array.isArray(bomJsonObj.metadata.tools)
            ) {
              tools = bomJsonObj.metadata.tools;
            }
            if (
              bomJsonObj.metadata?.component &&
              !Object.keys(parentComponent).length
            ) {
              parentComponent = bomJsonObj.metadata.component;
              options.parentComponent = parentComponent;
            }
            if (bomJsonObj.components) {
              // Inject evidence into the components. #994
              if (options.specVersion >= 1.5) {
                // maven would usually generate a target directory closest to the pom.xml
                // I am sure there would be cases where this assumption is not true :)
                const srcPomFile = join(dirname(abjson), "..", "pom.xml");
                for (const acomp of bomJsonObj.components) {
                  if (!acomp.evidence) {
                    acomp.evidence = {
                      identity: {
                        field: "purl",
                        confidence: 0.8,
                        methods: [
                          {
                            technique: "manifest-analysis",
                            confidence: 0.8,
                            value: srcPomFile,
                          },
                        ],
                      },
                    };
                  }
                  if (!acomp.properties) {
                    acomp.properties = [];
                  }
                  acomp.properties.push({
                    name: "SrcFile",
                    value: srcPomFile,
                  });
                }
              }
              pkgList = pkgList.concat(bomJsonObj.components);
            }
            if (bomJsonObj.dependencies) {
              dependencies = mergeDependencies(
                dependencies,
                bomJsonObj.dependencies,
                parentComponent,
              );
            }
          }
        } catch (err) {
          if (options.failOnError || DEBUG_MODE) {
            console.log(err);
            options.failOnError && process.exit(1);
          }
        }
      }
    }
    if (possible_misses) {
      if (!DEBUG_MODE) {
        console.warn(
          "Multiple errors occurred while building this project with maven. The SBOM is therefore incomplete!",
        );
      } else if (!PREFER_MAVEN_DEPS_TREE) {
        console.log(
          "Try generating an SBOM with the maven dependency tree plugin. Set the environment variable PREFER_MAVEN_DEPS_TREE to true to enable this.",
        );
      }
    }
  }
  // gradle
  const gradleFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}build.gradle*`,
    options,
  );
  const allProjects = [];
  const allProjectsAddedPurls = [];
  const rootDependsOn = new Set();
  const gradleModules = new Map();
  // Determine the root path for gradle
  // Fixes gradle invocation for microservices-demo
  let gradleRootPath = path;
  if (
    gradleFiles?.length &&
    !existsSync(join(path, "settings.gradle")) &&
    !existsSync(join(path, "settings.gradle.kts")) &&
    !existsSync(join(path, "build.gradle")) &&
    !existsSync(join(path, "build.gradle.kts"))
  ) {
    gradleRootPath = dirname(gradleFiles[0]);
  }
  // Execute gradle properties
  if (
    gradleFiles?.length &&
    isPackageManagerAllowed("gradle", ["maven", "bazel", "sbt"], options)
  ) {
    let rootProjects = [null];
    let allProjectsStr = [];
    let rootGradleModule = {};
    if (process.env.GRADLE_INCLUDED_BUILDS) {
      rootProjects = rootProjects.concat(
        process.env.GRADLE_INCLUDED_BUILDS.split(","),
      );
    }
    const parallelPropTaskOut = executeParallelGradleProperties(
      gradleRootPath,
      rootProjects,
    );
    const splitPropTaskOut = splitOutputByGradleProjects(parallelPropTaskOut, [
      "properties",
    ]);

    for (const [key, propTaskOut] of splitPropTaskOut.entries()) {
      const retMap = parseGradleProperties(propTaskOut);
      const rootProject = retMap.rootProject;
      if (rootProject) {
        const rootComponent = await buildObjectForGradleModule(
          rootProject,
          retMap.metadata,
        );
        gradleModules.set(key, rootComponent);
        if (!rootProjects.includes(key)) {
          if (rootGradleModule.name) {
            console.error(
              "Found more than 1 root-components! Maybe you made a mistake in the name of an included-build module?",
            );
            throw new Error(
              "Found more than 1 root-components! Maybe you made a mistake in the name of an included-build module?",
            );
          }
          rootGradleModule = rootComponent;
        } else if (!allProjectsAddedPurls.includes(rootComponent["purl"])) {
          allProjects.push(rootComponent);
          rootDependsOn.add(rootComponent["bom-ref"]);
          allProjectsAddedPurls.push(rootComponent["purl"]);
        }
        allProjectsStr = allProjectsStr.concat(retMap.projects);
      }
    }
    parentComponent = rootGradleModule;
    // Get the sub-project properties and set the root dependencies
    if (allProjectsStr?.length) {
      const modulesToSkip = process.env.GRADLE_SKIP_MODULES
        ? process.env.GRADLE_SKIP_MODULES.split(",")
        : [];

      const parallelPropTaskOut = executeParallelGradleProperties(
        gradleRootPath,
        allProjectsStr.filter((module) => !modulesToSkip.includes(module)),
      );
      const splitPropTaskOut = splitOutputByGradleProjects(
        parallelPropTaskOut,
        ["properties"],
      );

      for (const subProject of allProjectsStr) {
        const retMap = parseGradleProperties(
          splitPropTaskOut.get(subProject),
          subProject,
        );
        const rootSubProject = retMap.rootProject;
        if (rootSubProject) {
          const rootSubProjectObj = await buildObjectForGradleModule(
            rootSubProject === "root" ? subProject : rootSubProject,
            retMap.metadata,
          );
          if (!allProjectsAddedPurls.includes(rootSubProjectObj["purl"])) {
            allProjects.push(rootSubProjectObj);
            rootDependsOn.add(rootSubProjectObj["bom-ref"]);
            allProjectsAddedPurls.push(rootSubProjectObj["purl"]);
          }
          gradleModules.set(subProject, rootSubProjectObj);
        }
      }
      // Bug #317 fix
      parentComponent.components = allProjects.flatMap((s) => {
        delete s.qualifiers;
        delete s.evidence;
        return s;
      });
      dependencies.push({
        ref: parentComponent["bom-ref"],
        dependsOn: [...rootDependsOn].sort(),
      });
    }
  }
  if (
    gradleFiles?.length &&
    options.installDeps &&
    isPackageManagerAllowed("gradle", ["maven", "bazel", "sbt"], options)
  ) {
    allProjects.push(parentComponent);
    const gradleCmd = getGradleCommand(gradleRootPath, null);
    const gradleDepTask = process.env.GRADLE_DEPENDENCY_TASK
      ? process.env.GRADLE_DEPENDENCY_TASK
      : "dependencies";

    const gradleSubCommands = [];
    let modulesToSkip = process.env.GRADLE_SKIP_MODULES
      ? process.env.GRADLE_SKIP_MODULES.split(",")
      : [];
    if (process.env.GRADLE_SKIP_MODULE_DEPENDENCIES) {
      modulesToSkip = modulesToSkip.concat(
        process.env.GRADLE_SKIP_MODULE_DEPENDENCIES.split(","),
      );
    }
    if (!modulesToSkip.includes("root")) {
      gradleSubCommands.push(gradleDepTask);
    }
    for (const [key, sp] of gradleModules) {
      //create single command for dependencies tasks on all subprojects
      if (sp.purl !== parentComponent.purl && !modulesToSkip.includes(key)) {
        gradleSubCommands.push(`${key}:${gradleDepTask}`);
      }
    }
    const gradleArguments = buildGradleCommandArguments(
      process.env.GRADLE_ARGS ? process.env.GRADLE_ARGS.split(" ") : [],
      gradleSubCommands,
      process.env.GRADLE_ARGS_DEPENDENCIES
        ? process.env.GRADLE_ARGS_DEPENDENCIES.split(" ")
        : [],
    );
    console.log(
      "Executing",
      gradleCmd,
      gradleArguments.join(" "),
      "in",
      gradleRootPath,
    );
    const sresult = spawnSync(gradleCmd, gradleArguments, {
      cwd: gradleRootPath,
      encoding: "utf-8",
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });

    if (sresult.status !== 0 || sresult.error) {
      if (options.failOnError || DEBUG_MODE) {
        console.error(sresult.stdout, sresult.stderr);
      }
      options.failOnError && process.exit(1);
    }
    const sstdout = sresult.stdout;
    if (sstdout) {
      const cmdOutput = Buffer.from(sstdout).toString();
      const perProjectOutput = splitOutputByGradleProjects(cmdOutput, [
        gradleDepTask,
      ]);
      for (const key of gradleModules.keys()) {
        const parsedList = await parseGradleDep(
          perProjectOutput.has(key) ? perProjectOutput.get(key) : "",
          key,
          gradleModules,
          gradleRootPath,
        );
        const dlist = parsedList.pkgList;
        if (parsedList.dependenciesList && parsedList.dependenciesList) {
          dependencies = mergeDependencies(
            dependencies,
            parsedList.dependenciesList,
            parentComponent,
          );
        }
        if (dlist?.length) {
          if (DEBUG_MODE) {
            console.log(
              "Found",
              dlist.length,
              "packages in gradle project",
              key,
            );
          }
          pkgList = pkgList.concat(dlist);
        }
      }
    }
    if (pkgList.length) {
      if (parentComponent.components?.length) {
        for (const subProj of parentComponent.components) {
          pkgList = pkgList.filter(
            (pkg) =>
              pkg["bom-ref"] !== subProj["bom-ref"] &&
              pkg["bom-ref"] !== parentComponent["bom-ref"],
          );
        }
      }
      console.log(
        "Obtained",
        pkgList.length,
        "from this gradle project. De-duping this list ...",
      );
    } else {
      console.log(
        "No packages found. Set the environment variable 'CDXGEN_DEBUG_MODE=debug' to troubleshoot any gradle related errors.",
      );
      options.failOnError && process.exit(1);
    }
    // Should we attempt to resolve class names
    if (options.resolveClass || options.deep) {
      const tmpjarNSMapping = await collectJarNS(GRADLE_CACHE_DIR);
      if (tmpjarNSMapping && Object.keys(tmpjarNSMapping).length) {
        jarNSMapping = { ...jarNSMapping, ...tmpjarNSMapping };
      }
    }
  }

  // Bazel
  // Look for the BUILD file only in the root directory
  // NOTE: This can match BUILD files used by perl, so could lead to errors in some projects
  const bazelFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}{WORKSPACE{,.bazel},MODULE.bazel}`,
    options,
  );
  if (
    bazelFiles?.length &&
    !hasAnyProjectType(["docker", "oci", "container", "os"], options, false) &&
    isPackageManagerAllowed("bazel", ["maven", "gradle", "sbt"], options)
  ) {
    let BAZEL_CMD = "bazel";
    if (process.env.BAZEL_HOME) {
      BAZEL_CMD = join(process.env.BAZEL_HOME, "bin", "bazel");
    }
    for (const f of bazelFiles) {
      const basePath = dirname(f);
      // Invoke bazel build first
      const bazelTarget = process.env.BAZEL_TARGET || "//...";
      let bArgs = [
        ...(process.env?.BAZEL_ARGS?.split(" ") || []),
        "build",
        bazelTarget,
      ];
      // Automatically load any bazelrc file
      if (!process.env.BAZEL_ARGS && existsSync(join(basePath, ".bazelrc"))) {
        bArgs = ["--bazelrc=.bazelrc", "build", bazelTarget];
      }
      console.log("Executing", BAZEL_CMD, bArgs.join(" "), "in", basePath);
      let result = spawnSync(BAZEL_CMD, bArgs, {
        cwd: basePath,
        shell: true,
        encoding: "utf-8",
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });
      if (result.status !== 0 || result.error) {
        if (result.stderr) {
          console.error(result.stdout, result.stderr);
        }
        console.log(
          "1. Check if bazel is installed and available in PATH.\n2. Try building your app with bazel prior to invoking cdxgen",
        );
        options.failOnError && process.exit(1);
      } else {
        const target = process.env.BAZEL_TARGET || "//...";
        let query = [...(process.env?.BAZEL_ARGS?.split(" ") || [])];
        let bazelParser;
        // Automatically load any bazelrc file
        if (!process.env.BAZEL_ARGS && existsSync(join(basePath, ".bazelrc"))) {
          query = ["--bazelrc=.bazelrc"];
        }
        if (["true", "1"].includes(process.env.BAZEL_USE_ACTION_GRAPH)) {
          query = query.concat(["aquery", `outputs('.*.jar',deps(${target}))`]);
          bazelParser = parseBazelActionGraph;
        } else {
          query = query.concat([
            "aquery",
            "--output=textproto",
            "--skyframe_state",
          ]);
          bazelParser = parseBazelSkyframe;
        }
        console.log("Executing", BAZEL_CMD, `${query.join(" ")} in`, basePath);
        result = spawnSync(BAZEL_CMD, query, {
          cwd: basePath,
          encoding: "utf-8",
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
        });
        if (result.status !== 0 || result.error) {
          console.error(result.stdout, result.stderr);
          options.failOnError && process.exit(1);
        }
        const stdout = result.stdout;
        if (stdout) {
          const cmdOutput = Buffer.from(stdout).toString();
          const dlist = bazelParser(cmdOutput);
          if (dlist?.length) {
            pkgList = pkgList.concat(dlist);
          } else {
            console.log(
              "No packages were detected.\n1. Build your project using bazel build command before running cdxgen\n2. Try running the bazel aquery command manually to see if skyframe state can be retrieved.",
            );
            console.log(
              "If your project requires a different query, please file a bug at cyclonedx/cdxgen repo!",
            );
            options.failOnError && process.exit(1);
          }
        } else {
          console.log("Bazel unexpectedly didn't produce any output");
          options.failOnError && process.exit(1);
        }
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
  let sbtProjectFiles = getAllFiles(
    path,
    `${
      options.multiProject ? "**/" : ""
    }project/{build.properties,*.sbt,*.scala}`,
    options,
  );

  let sbtProjects = [];
  for (const i in sbtProjectFiles) {
    // parent dir of sbtProjectFile is the `project` directory
    // parent dir of `project` is the sbt root project directory
    const baseDir = dirname(dirname(sbtProjectFiles[i]));
    sbtProjects = sbtProjects.concat(baseDir);
  }

  // Fallback in case sbt's project directory is non-existent
  if (!sbtProjects.length) {
    sbtProjectFiles = getAllFiles(
      path,
      `${options.multiProject ? "**/" : ""}*.sbt`,
      options,
    );
    for (const i in sbtProjectFiles) {
      const baseDir = dirname(sbtProjectFiles[i]);
      sbtProjects = sbtProjects.concat(baseDir);
    }
  }
  // eliminate duplicates and ignore project directories
  sbtProjects = [...new Set(sbtProjects)].filter(
    (p) => !p.endsWith(`${sep}project`) && !p.includes(`target${sep}`),
  );
  const sbtLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}build.sbt.lock`,
    options,
  );

  if (
    sbtProjects?.length &&
    isPackageManagerAllowed("sbt", ["bazel", "maven", "gradle"], options)
  ) {
    // If the project use sbt lock files
    if (sbtLockFiles?.length) {
      for (const f of sbtLockFiles) {
        const dlist = parseSbtLock(f);
        if (dlist?.length) {
          pkgList = pkgList.concat(dlist);
        }
      }
    } else {
      const SBT_CMD = process.env.SBT_CMD || "sbt";
      let sbtVersion = determineSbtVersion(path);
      // If can't find sbt version at the root of repository then search in
      // sbt project array too because sometimes the project folder isn't at
      // root of repository
      if (sbtVersion == null) {
        for (const i in sbtProjects) {
          sbtVersion = determineSbtVersion(sbtProjects[i]);
          if (sbtVersion != null) {
            break;
          }
        }
      }
      if (DEBUG_MODE) {
        console.log(`Detected sbt version: ${sbtVersion}`);
      }
      // Introduced in 1.2.0 https://www.scala-sbt.org/1.x/docs/sbt-1.2-Release-Notes.html#addPluginSbtFile+command,
      // however working properly for real only since 1.3.4: https://github.com/sbt/sbt/releases/tag/v1.3.4
      const standalonePluginFile =
        sbtVersion != null &&
        gte(sbtVersion, "1.3.4") &&
        lte(sbtVersion, "1.4.0");
      const useSlashSyntax = !sbtVersion || gte(sbtVersion, "1.5.0");
      const isDependencyTreeBuiltIn =
        sbtVersion != null && gte(sbtVersion, "1.4.0");
      const tempDir = mkdtempSync(join(tmpdir(), "cdxsbt-"));
      const tempSbtgDir = mkdtempSync(join(tmpdir(), "cdxsbtg-"));
      mkdirSync(tempSbtgDir, { recursive: true });
      // Create temporary plugins file
      const tempSbtPlugins = join(tempSbtgDir, "dep-plugins.sbt");

      // Requires a custom version of `sbt-dependency-graph` that
      // supports `--append` for `toFile` subtask.
      let sbtPluginDefinition = `\naddSbtPlugin("io.shiftleft" % "sbt-dependency-graph" % "0.10.0-append-to-file3")\n`;
      if (isDependencyTreeBuiltIn) {
        sbtPluginDefinition = "\naddDependencyTreePlugin\n";
        if (DEBUG_MODE) {
          console.log("Using addDependencyTreePlugin as the custom plugin");
        }
      }
      writeFileSync(tempSbtPlugins, sbtPluginDefinition);
      for (const i in sbtProjects) {
        const basePath = sbtProjects[i];
        const dlFile = join(tempDir, `dl-${i}.tmp`);
        let sbtArgs = [];
        let pluginFile = null;
        if (standalonePluginFile) {
          sbtArgs = [
            `-addPluginSbtFile=${tempSbtPlugins}`,
            `"dependencyList::toFile ${dlFile} --force"`,
          ];
        } else {
          // write to the existing plugins file
          if (useSlashSyntax) {
            sbtArgs = [
              `'set ThisBuild / asciiGraphWidth := 400' "dependencyTree / toFile ${dlFile} --force"`,
            ];
          } else {
            sbtArgs = [
              `'set asciiGraphWidth in ThisBuild := 400' "dependencyTree::toFile ${dlFile} --force"`,
            ];
          }
          pluginFile = addPlugin(basePath, sbtPluginDefinition);
        }
        console.log(
          "Executing",
          SBT_CMD,
          sbtArgs.join(" "),
          "in",
          basePath,
          "using plugins",
          tempSbtgDir,
        );
        // Note that the command has to be invoked with `shell: true` to properly execut sbt
        const result = spawnSync(SBT_CMD, sbtArgs, {
          cwd: basePath,
          shell: true,
          encoding: "utf-8",
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
        });
        if (result.status !== 0 || result.error) {
          console.error(result.stdout, result.stderr);
          console.log(
            "1. Check if scala and sbt is installed and available in PATH. Only scala 2.10 + sbt 0.13.6+ and 2.12 + sbt 1.0+ is supported for now.",
          );
          console.log(
            "2. Check if the plugin net.virtual-void:sbt-dependency-graph 0.10.0-RC1 can be used in the environment",
          );
          console.log(
            "3. Consider creating a lockfile using sbt-dependency-lock plugin. See https://github.com/stringbean/sbt-dependency-lock",
          );
          options.failOnError && process.exit(1);
        }
        if (!standalonePluginFile) {
          cleanupPlugin(basePath, pluginFile);
        }
        if (existsSync(dlFile)) {
          const retMap = parseSbtTree(dlFile);
          if (retMap.pkgList?.length) {
            const tmpParentComponent = retMap.pkgList.splice(0, 1)[0];
            tmpParentComponent.type = "application";
            pkgList = pkgList.concat(retMap.pkgList);
            if (!parentComponent || !Object.keys(parentComponent).length) {
              parentComponent = tmpParentComponent;
            }
          }
          if (retMap.dependenciesList) {
            dependencies = mergeDependencies(
              dependencies,
              retMap.dependenciesList,
              parentComponent,
            );
          }
        } else {
          if (options.failOnError || DEBUG_MODE) {
            console.log(`sbt dependencyList did not yield ${dlFile}`);
          }
          options.failOnError && process.exit(1);
        }
      }

      // Cleanup
      unlinkSync(tempSbtPlugins);
    } // else

    if (DEBUG_MODE) {
      console.log(`Found ${pkgList.length} packages`);
    }
    // Should we attempt to resolve class names
    if (options.resolveClass || options.deep) {
      const tmpjarNSMapping = await collectJarNS(SBT_CACHE_DIR);
      if (tmpjarNSMapping && Object.keys(tmpjarNSMapping).length) {
        jarNSMapping = { ...jarNSMapping, ...tmpjarNSMapping };
      }
    }
  }
  pkgList = trimComponents(pkgList);
  pkgList = await getMvnMetadata(pkgList, jarNSMapping, options.deep);
  return buildBomNSData(options, pkgList, "maven", {
    src: path,
    nsMapping: jarNSMapping,
    dependencies,
    parentComponent,
    tools,
  });
}

/**
 * Function to create bom string for Node.js projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createNodejsBom(path, options) {
  let pkgList = [];
  let manifestFiles = [];
  let dependencies = [];
  let parentComponent = {};
  const parentSubComponents = [];
  let ppurl = "";
  // Docker mode requires special handling
  if (hasAnyProjectType(["docker", "oci", "container", "os"], options, false)) {
    const pkgJsonFiles = getAllFiles(path, "**/package.json", options);
    // Are there any package.json files in the container?
    if (pkgJsonFiles.length) {
      for (const pj of pkgJsonFiles) {
        const dlist = await parsePkgJson(pj);
        if (dlist?.length) {
          pkgList = pkgList.concat(dlist);
        }
      }
      return buildBomNSData(options, pkgList, "npm", {
        allImports: {},
        src: path,
        filename: "package.json",
        parentComponent,
      });
    }
  }
  let allImports = {};
  let allExports = {};
  if (
    !hasAnyProjectType(["docker", "oci", "container", "os"], options, false) &&
    !options.noBabel
  ) {
    if (DEBUG_MODE) {
      console.log(
        `Performing babel-based package usage analysis with source code at ${path}`,
      );
    }
    const retData = await findJSImportsExports(path, options.deep);
    allImports = retData.allImports;
    allExports = retData.allExports;
  }
  let yarnLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}yarn.lock`,
    options,
  );
  const shrinkwrapFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}npm-shrinkwrap.json`,
    options,
  );
  let pkgLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}package-lock.json`,
    options,
  );
  if (shrinkwrapFiles.length) {
    pkgLockFiles = pkgLockFiles.concat(shrinkwrapFiles);
  }
  let pnpmLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}pnpm-lock.yaml`,
    options,
  );
  const minJsFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*min.js`,
    options,
  );
  const bowerFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}bower.json`,
    options,
  );
  // Parse min js files
  if (minJsFiles?.length) {
    manifestFiles = manifestFiles.concat(minJsFiles);
    for (const f of minJsFiles) {
      const dlist = await parseMinJs(f);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  // Parse bower json files
  if (bowerFiles?.length) {
    manifestFiles = manifestFiles.concat(bowerFiles);
    for (const f of bowerFiles) {
      const dlist = await parseBowerJson(f);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  const pkgJsonLockFile = getAllFiles(path, "package-lock.json", options);
  const pkgJsonFile = getAllFiles(path, "package.json", options);
  const yarnLockFile = getAllFiles(path, "yarn.lock", options);
  const pnpmLockFile = getAllFiles(path, "pnpm-lock.yaml", options);
  if (
    pkgJsonLockFile?.length === 0 &&
    yarnLockFile?.length === 0 &&
    pnpmLockFile?.length === 0 &&
    pkgJsonFile?.length === 1 &&
    options.installDeps
  ) {
    let pkgMgr = "npm";
    const supPkgMgrs = ["npm", "yarn", "yarnpkg", "pnpm", "pnpx"];
    const pkgData = JSON.parse(readFileSync(`${path}/package.json`, "utf8"));
    const mgrData = pkgData.packageManager;
    let mgr = "";
    let installArgs = ["install"];
    if (mgrData) {
      mgr = mgrData.split("@")[0];
    }
    if (supPkgMgrs.includes(mgr)) {
      pkgMgr = mgr;
    }
    // Support for passing additional args to the install command
    if (process.env[`${pkgMgr.toUpperCase()}_INSTALL_ARGS`]) {
      const addArgs =
        process.env[`${pkgMgr.toUpperCase()}_INSTALL_ARGS`].split(" ");
      installArgs = installArgs.concat(addArgs);
    }
    console.log(`Executing '${pkgMgr} ${installArgs.join(" ")}' in`, path);
    const result = spawnSync(pkgMgr, installArgs, {
      cwd: path,
      encoding: "utf-8",
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    if (result.status !== 0 || result.error) {
      console.error(
        `${pkgMgr} install has failed. Check if ${pkgMgr} is installed and available in PATH.`,
      );
      if (DEBUG_MODE && result.stdout) {
        console.log(result.stdout);
      }
      if (result.stderr) {
        console.log(result.stderr);
      }
      options.failOnError && process.exit(1);
    }
    pkgLockFiles = getAllFiles(
      path,
      `${options.multiProject ? "**/" : ""}package-lock.json`,
      options,
    );
    pnpmLockFiles = getAllFiles(
      path,
      `${options.multiProject ? "**/" : ""}pnpm-lock.yaml`,
      options,
    );
    yarnLockFiles = getAllFiles(
      path,
      `${options.multiProject ? "**/" : ""}yarn.lock`,
      options,
    );
  }
  if (
    pnpmLockFiles?.length &&
    isPackageManagerAllowed("pnpm", ["npm", "yarn", "rush"], options)
  ) {
    manifestFiles = manifestFiles.concat(pnpmLockFiles);
    for (const f of pnpmLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const basePath = dirname(f);
      // Determine the parent component
      const packageJsonF = join(basePath, "package.json");
      if (!Object.keys(parentComponent).length) {
        if (existsSync(packageJsonF)) {
          const pcs = await parsePkgJson(packageJsonF, true);
          if (pcs.length) {
            parentComponent = pcs[0];
            parentComponent.type = "application";
            ppurl = new PackageURL(
              "npm",
              options.projectGroup || parentComponent.group,
              parentComponent.name,
              options.projectVersion || parentComponent.version,
              null,
              null,
            ).toString();
            parentComponent["bom-ref"] = decodeURIComponent(ppurl);
            parentComponent["purl"] = ppurl;
          }
        } else {
          let dirName = dirname(f);
          const tmpA = dirName.split(sep);
          dirName = tmpA[tmpA.length - 1];
          parentComponent = {
            group: "",
            name: dirName,
            type: "application",
          };
          ppurl = new PackageURL(
            "npm",
            options.projectGroup || parentComponent.group,
            options.projectName || parentComponent.name,
            options.projectVersion || parentComponent.version,
            null,
            null,
          ).toString();
          parentComponent["bom-ref"] = decodeURIComponent(ppurl);
          parentComponent["purl"] = ppurl;
        }
      }
      // Parse the pnpm file
      const parsedList = await parsePnpmLock(f, parentComponent);
      const dlist = parsedList.pkgList;
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
      if (parsedList?.parentSubComponents?.length) {
        parentComponent.components = parsedList.parentSubComponents;
      }
      if (parsedList.dependenciesList && parsedList.dependenciesList) {
        dependencies = mergeDependencies(
          dependencies,
          parsedList.dependenciesList,
          parentComponent,
        );
      }
    }
  }
  if (
    pkgLockFiles?.length &&
    isPackageManagerAllowed("npm", ["pnpm", "yarn"], options)
  ) {
    manifestFiles = manifestFiles.concat(pkgLockFiles);
    for (const f of pkgLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      // Parse package-lock.json if available
      const parsedList = await parsePkgLock(f, options);
      const dlist = parsedList.pkgList;
      const tmpParentComponent = dlist.splice(0, 1)[0] || {};
      tmpParentComponent.type = "application";
      if (!Object.keys(parentComponent).length) {
        parentComponent = tmpParentComponent;
      } else {
        parentSubComponents.push(tmpParentComponent);
      }
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
      if (parsedList.dependenciesList && parsedList.dependenciesList) {
        dependencies = mergeDependencies(
          dependencies,
          parsedList.dependenciesList,
          parentComponent,
        );
      }
    }
  }
  if (
    existsSync(join(path, "rush.json")) &&
    isPackageManagerAllowed("rush", ["npm", "yarn", "pnpm"], options)
  ) {
    // Rush.js creates node_modules inside common/temp directory
    const nmDir = join(path, "common", "temp", "node_modules");
    // Do rush install if we don't have node_modules directory
    if (!existsSync(nmDir)) {
      console.log("Executing 'rush install --no-link'", path);
      const result = spawnSync(
        "rush",
        ["install", "--no-link", "--bypass-policy"],
        {
          cwd: path,
          encoding: "utf-8",
        },
      );
      if (result.status === 1 || result.error) {
        console.error(result.stdout, result.stderr);
        options.failOnError && process.exit(1);
      }
    }
    // Look for shrinkwrap file
    const swFile = join(
      path,
      "tools",
      "build-tasks",
      ".rush",
      "temp",
      "shrinkwrap-deps.json",
    );
    const pnpmLock = join(path, "common", "config", "rush", "pnpm-lock.yaml");
    if (existsSync(swFile)) {
      let pkgList = await parseNodeShrinkwrap(swFile);
      if (allImports && Object.keys(allImports).length) {
        pkgList = await addEvidenceForImports(
          pkgList,
          allImports,
          allExports,
          options.deep,
        );
      }
      return buildBomNSData(options, pkgList, "npm", {
        allImports,
        src: path,
        filename: "shrinkwrap-deps.json",
      });
    }
    if (existsSync(pnpmLock)) {
      let pkgList = await parsePnpmLock(pnpmLock);
      if (allImports && Object.keys(allImports).length) {
        pkgList = await addEvidenceForImports(
          pkgList,
          allImports,
          allExports,
          options.deep,
        );
      }
      return buildBomNSData(options, pkgList, "npm", {
        allImports,
        allExports,
        src: path,
        filename: "pnpm-lock.yaml",
      });
    }
    console.log(
      "Neither shrinkwrap file: ",
      swFile,
      " nor pnpm lockfile",
      pnpmLock,
      "was found!",
    );
    options.failOnError && process.exit(1);
  }
  if (
    yarnLockFiles?.length &&
    isPackageManagerAllowed("yarn", ["npm", "pnpm"], options)
  ) {
    manifestFiles = manifestFiles.concat(yarnLockFiles);
    for (const f of yarnLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const basePath = dirname(f);
      // Determine the parent component
      const packageJsonF = join(basePath, "package.json");
      if (existsSync(packageJsonF)) {
        const pcs = await parsePkgJson(packageJsonF, true);
        if (pcs.length) {
          const tmpParentComponent = pcs[0];
          tmpParentComponent.type = "application";
          ppurl = new PackageURL(
            "npm",
            options.projectGroup || tmpParentComponent.group,
            tmpParentComponent.name,
            options.projectVersion || tmpParentComponent.version,
            null,
            null,
          ).toString();
          tmpParentComponent["bom-ref"] = decodeURIComponent(ppurl);
          tmpParentComponent["purl"] = ppurl;
          if (!Object.keys(parentComponent).length) {
            parentComponent = tmpParentComponent;
          } else {
            parentSubComponents.push(tmpParentComponent);
          }
        }
      } else {
        let dirName = dirname(f);
        const tmpA = dirName.split(sep);
        dirName = tmpA[tmpA.length - 1];
        const tmpParentComponent = {
          group: options.projectGroup || "",
          name: options.projectName || dirName,
          type: "application",
        };
        ppurl = new PackageURL(
          "npm",
          tmpParentComponent.group,
          tmpParentComponent.name,
          options.projectVersion || tmpParentComponent.version,
          null,
          null,
        ).toString();
        tmpParentComponent["bom-ref"] = decodeURIComponent(ppurl);
        tmpParentComponent["purl"] = ppurl;
        if (!Object.keys(parentComponent).length) {
          parentComponent = tmpParentComponent;
        } else {
          parentSubComponents.push(tmpParentComponent);
        }
      }
      // Parse yarn.lock if available. This check is after rush.json since
      // rush.js could include yarn.lock :(
      const parsedList = await parseYarnLock(f);
      const dlist = parsedList.pkgList;
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
      const rdeplist = [];
      if (parsedList.dependenciesList && parsedList.dependenciesList) {
        // Inject parent component to the dependency tree to make it complete
        // In case of yarn, yarn list command lists every root package as a direct dependency
        // The same logic is matched with this for loop although this is incorrect since even dev dependencies would get included here
        for (const dobj of parsedList.dependenciesList) {
          rdeplist.push(dobj.ref);
        }
        // Fixes: 212. Handle case where there are no package.json to determine the parent package
        // Bug fix: We need to consistently override the parent component group, name and version here
        if (Object.keys(parentComponent).length && parentComponent.name) {
          const ppurl = new PackageURL(
            "npm",
            options.projectGroup || parentComponent.group,
            parentComponent.name,
            options.projectVersion || parentComponent.version,
            null,
            null,
          ).toString();
          parsedList.dependenciesList.push({
            ref: decodeURIComponent(ppurl),
            dependsOn: [...new Set(rdeplist)].sort(),
          });
        }
        dependencies = mergeDependencies(
          dependencies,
          parsedList.dependenciesList,
          parentComponent,
        );
      }
    }
  }
  // We might reach here if the project has no lock files
  // Eg: juice-shop
  if (!pkgList.length && existsSync(join(path, "node_modules"))) {
    const pkgJsonFiles = getAllFiles(
      join(path, "node_modules"),
      "**/package.json",
      options,
    );
    manifestFiles = manifestFiles.concat(pkgJsonFiles);
    for (const pkgjf of pkgJsonFiles) {
      const dlist = await parsePkgJson(pkgjf);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    if (!parentComponent || !Object.keys(parentComponent).length) {
      if (existsSync(join(path, "package.json"))) {
        const pcs = await parsePkgJson(join(path, "package.json"), true);
        if (pcs.length) {
          parentComponent = pcs[0];
          parentComponent.type = "application";
          ppurl = new PackageURL(
            "npm",
            options.projectGroup || parentComponent.group,
            parentComponent.name,
            options.projectVersion || parentComponent.version,
            null,
            null,
          ).toString();
          parentComponent["bom-ref"] = decodeURIComponent(ppurl);
          parentComponent["purl"] = ppurl;
        }
      }
    }
  }
  // Retain the components of parent component
  if (parentSubComponents.length) {
    parentComponent.components = parentSubComponents;
  }
  // We need to set this to force our version to be used rather than the directory name based one.
  options.parentComponent = parentComponent;
  if (allImports && Object.keys(allImports).length) {
    pkgList = await addEvidenceForImports(
      pkgList,
      allImports,
      allExports,
      options.deep,
    );
  }
  return buildBomNSData(options, pkgList, "npm", {
    src: path,
    filename: manifestFiles.join(", "),
    dependencies,
    parentComponent,
  });
}

/**
 * Function to create bom string for Projects that use Pixi package manager.
 * createPixiBom is based on createPythonBom.
 * Pixi package manager utilizes many languages like python, rust, C/C++, ruby, etc.
 * It produces a Lockfile which help produce reproducible envs across operating systems.
 * This code will look at the operating system of our machine and create a BOM specific to that machine.
 *
 *
 * @param {String} path
 * @param {Object} options
 */
export function createPixiBom(path, options) {
  const allImports = {};
  let metadataFilename = "";
  let dependencies = [];
  let pkgList = [];
  let formulationList = [];
  let parentComponent = createDefaultParentComponent(path, "pypi", options);
  let PixiLockData = {};

  const pixiToml = join(path, "pixi.toml");

  // if pixi.toml file found then we
  // Add parentComponent Details
  const pixiTomlMode = existsSync(pixiToml);
  if (pixiTomlMode) {
    parentComponent = parsePixiTomlFile(pixiToml);
    parentComponent.type = "application";
    const ppurl = new PackageURL(
      "pixi",
      parentComponent.group || "",
      parentComponent.name,
      parentComponent.version || "latest",
      null,
      null,
    ).toString();
    parentComponent["bom-ref"] = decodeURIComponent(ppurl);
    parentComponent["purl"] = ppurl;
  }

  const pixiLockFile = join(path, "pixi.lock");
  const pixiFilesMode = existsSync(pixiLockFile);
  if (pixiFilesMode) {
    // Instead of what we do in createPythonBOM
    // where we install packages and run `getPipFrozenTree`
    // here I assume `pixi.lock` file to contain the accuracte version information
    // across all platforms
    PixiLockData = parsePixiLockFile(pixiLockFile, path);
    metadataFilename = "pixi.lock";
  } else {
    if (options.installDeps) {
      generatePixiLockFile(path);

      const pixiLockFile = join(path, "pixi.lock");
      if (!existsSync(pixiLockFile) && DEBUG_MODE) {
        console.log(
          "Unexpected Error tried to generate pixi.lock file but failed.",
        );
        console.log("This will result in creations of empty BOM.");
      }
      PixiLockData = parsePixiLockFile(pixiLockFile);
      metadataFilename = "pixi.lock";
    } else {
      // If no pixi.lock and installDeps is false
      // then return None and let `createPythonBOM()` handle generation of BOM.
      return null;
    }
  }

  pkgList = PixiLockData.pkgList;
  formulationList = PixiLockData.formulationList;
  dependencies = PixiLockData.dependencies;

  return buildBomNSData(options, pkgList, "pypi", {
    allImports,
    src: path,
    filename: metadataFilename,
    dependencies,
    parentComponent,
    formulationList,
  });
}

/**
 * Function to create bom string for Python projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createPythonBom(path, options) {
  let allImports = {};
  let metadataFilename = "";
  let dependencies = [];
  let pkgList = [];
  let formulationList = [];
  const tempDir = mkdtempSync(join(tmpdir(), "cdxgen-venv-"));
  let parentComponent = createDefaultParentComponent(path, "pypi", options);
  const pipenvMode = existsSync(join(path, "Pipfile"));

  // If pixi is used then just return that as output instead
  const pixiLockFile = join(path, "pixi.lock");
  const pixiFilesMode = existsSync(pixiLockFile);
  const pixiToml = join(path, "pixi.toml");
  const pixiTomlMode = existsSync(pixiToml);
  if (pixiTomlMode || pixiFilesMode) {
    const BomNSData = createPixiBom(path, options);
    if (BomNSData) {
      return BomNSData;
    }
  }

  let poetryFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}poetry.lock`,
    options,
  );
  const pdmLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}pdm.lock`,
    options,
  );
  if (pdmLockFiles?.length) {
    poetryFiles = poetryFiles.concat(pdmLockFiles);
  }
  let reqFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*requirements*.txt`,
    options,
  );
  reqFiles = reqFiles.filter(
    (f) => !f.includes(join("mercurial", "helptext", "internals")),
  );
  const reqDirFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}requirements/*.txt`,
    options,
  );
  const metadataFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/site-packages/**/" : ""}METADATA`,
    options,
  );
  const whlFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.whl`,
    options,
  );
  const eggInfoFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.egg-info`,
    options,
  );

  const pyProjectFile = join(path, "pyproject.toml");
  const pyProjectMode = existsSync(pyProjectFile);
  if (pyProjectMode) {
    const tmpParentComponent = parsePyProjectToml(pyProjectFile);
    if (tmpParentComponent?.name) {
      // Bug fix. Version could be missing in pyproject.toml
      if (!tmpParentComponent.version && parentComponent.version) {
        tmpParentComponent.version = parentComponent.version;
      }
      parentComponent = tmpParentComponent;
      delete parentComponent.homepage;
      delete parentComponent.repository;
      parentComponent.type = "application";
      const ppurl = new PackageURL(
        "pypi",
        parentComponent.group || "",
        parentComponent.name,
        parentComponent.version || "latest",
        null,
        null,
      ).toString();
      parentComponent["bom-ref"] = decodeURIComponent(ppurl);
      parentComponent["purl"] = ppurl;
    }
  }
  const requirementsMode = reqFiles?.length || reqDirFiles?.length;
  const poetryMode = poetryFiles?.length;
  const setupPy = join(path, "setup.py");
  const setupPyMode = existsSync(setupPy);
  // Poetry sets up its own virtual env containing site-packages so
  // we give preference to poetry lock file. Issue# 129
  if (poetryMode) {
    for (const f of poetryFiles) {
      const basePath = dirname(f);
      const lockData = readFileSync(f, { encoding: "utf-8" });
      let retMap = await parsePoetrylockData(lockData, f);
      if (retMap.pkgList?.length) {
        pkgList = pkgList.concat(retMap.pkgList);
        pkgList = trimComponents(pkgList);
      }
      if (retMap.dependenciesList?.length) {
        dependencies = mergeDependencies(
          dependencies,
          retMap.dependenciesList,
          parentComponent,
        );
      }
      // Retrieve the tree using virtualenv in deep mode and as a fallback
      // This is a slow operation
      if (options.deep || !dependencies.length) {
        retMap = getPipFrozenTree(basePath, f, tempDir, parentComponent);
        if (retMap.pkgList?.length) {
          pkgList = pkgList.concat(retMap.pkgList);
        }
        if (retMap.formulationList?.length) {
          formulationList = formulationList.concat(retMap.formulationList);
        }
        if (retMap.dependenciesList) {
          dependencies = mergeDependencies(
            dependencies,
            retMap.dependenciesList,
            parentComponent,
          );
        }
      }
      if (retMap.rootList) {
        const parentDependsOn = new Set();
        // Complete the dependency tree by making parent component depend on the first level
        for (const p of retMap.rootList) {
          parentDependsOn.add(`pkg:pypi/${p.name.toLowerCase()}@${p.version}`);
        }
        const pdependencies = {
          ref: parentComponent["bom-ref"],
          dependsOn: [...parentDependsOn].sort(),
        };
        dependencies.splice(0, 0, pdependencies);
      }
    }
    options.parentComponent = parentComponent;
  } // poetryMode
  if (metadataFiles?.length) {
    // dist-info directories
    for (const mf of metadataFiles) {
      const mData = readFileSync(mf, {
        encoding: "utf-8",
      });
      const dlist = parseBdistMetadata(mData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  // .whl files. Zip file containing dist-info directory
  if (whlFiles?.length) {
    for (const wf of whlFiles) {
      const mData = await readZipEntry(wf, "METADATA");
      if (mData) {
        const dlist = parseBdistMetadata(mData);
        if (dlist?.length) {
          pkgList = pkgList.concat(dlist);
        }
      }
    }
  }
  // .egg-info files
  if (eggInfoFiles?.length) {
    for (const ef of eggInfoFiles) {
      const dlist = parseBdistMetadata(readFileSync(ef, { encoding: "utf-8" }));
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  if (requirementsMode || pipenvMode) {
    if (pipenvMode) {
      spawnSync("pipenv", ["install"], { cwd: path, encoding: "utf-8" });
      const piplockFile = join(path, "Pipfile.lock");
      if (existsSync(piplockFile)) {
        const lockData = JSON.parse(readFileSync(piplockFile));
        const dlist = await parsePiplockData(lockData);
        if (dlist?.length) {
          pkgList = pkgList.concat(dlist);
        }
      } else {
        console.error("Pipfile.lock not found at", path);
        options.failOnError && process.exit(1);
      }
    } else if (requirementsMode) {
      metadataFilename = "requirements.txt";
      if (reqFiles?.length) {
        if (options.installDeps && DEBUG_MODE) {
          console.log(
            "cdxgen will now attempt to generate an SBOM for 'build' lifecycle phase for Python. This would take some time ...\nTo speed up this step, invoke cdxgen from within a virtual environment with all the dependencies installed.\nAlternatively, pass the argument '--lifecycle pre-build' to generate a faster but less precise SBOM.",
          );
        }
        for (const f of reqFiles) {
          const basePath = dirname(f);
          let reqData = undefined;
          let frozen = false;
          // Attempt to pip freeze in a virtualenv to improve precision
          if (options.installDeps) {
            // If there are multiple requirements files then the tree is getting constructed for each one
            // adding to the delay.
            const pkgMap = getPipFrozenTree(
              basePath,
              f,
              tempDir,
              parentComponent,
            );
            if (pkgMap.pkgList?.length) {
              pkgList = pkgList.concat(pkgMap.pkgList);
              frozen = pkgMap.frozen;
            }
            if (pkgMap.formulationList?.length) {
              formulationList = formulationList.concat(pkgMap.formulationList);
            }
            if (pkgMap.dependenciesList) {
              dependencies = mergeDependencies(
                dependencies,
                pkgMap.dependenciesList,
                parentComponent,
              );
            }
          }
          // Fallback to parsing manually
          if (!pkgList.length || !frozen) {
            if (DEBUG_MODE) {
              console.log(
                `Manually parsing ${f}. The result would include only direct dependencies.`,
              );
            }
            reqData = readFileSync(f, { encoding: "utf-8" });
            const dlist = await parseReqFile(reqData, true);
            if (dlist?.length) {
              pkgList = pkgList.concat(dlist);
            }
          }
        } // for
        metadataFilename = reqFiles.join(", ");
      } else if (reqDirFiles?.length) {
        for (const j in reqDirFiles) {
          const f = reqDirFiles[j];
          const reqData = readFileSync(f, { encoding: "utf-8" });
          const dlist = await parseReqFile(reqData, false);
          if (dlist?.length) {
            pkgList = pkgList.concat(dlist);
          }
        }
        metadataFilename = reqDirFiles.join(", ");
      }
    }
  }
  // Use atom in requirements, setup.py and pyproject.toml mode
  if (requirementsMode || setupPyMode || pyProjectMode || options.deep) {
    /**
     * The order of preference is pyproject.toml (newer) and then setup.py
     */
    if (options.installDeps) {
      let pkgMap = undefined;
      if (pyProjectMode && !poetryMode) {
        pkgMap = getPipFrozenTree(
          path,
          pyProjectFile,
          tempDir,
          parentComponent,
        );
      } else if (setupPyMode) {
        pkgMap = getPipFrozenTree(path, setupPy, tempDir, parentComponent);
      } else if (!poetryMode) {
        pkgMap = getPipFrozenTree(path, undefined, tempDir, parentComponent);
      }

      // Get the imported modules and a dedupe list of packages
      const parentDependsOn = new Set();

      // ATOM parsedeps block
      // Atom parsedeps slices can be used to identify packages that are not declared in manifests
      // Since it is a slow operation, we only use it as a fallback or in deep mode
      // This change was made in 10.9.2 release onwards
      if (options.deep || !pkgList.length) {
        const retMap = await getPyModules(path, pkgList, options);
        // We need to patch the existing package list to add ImportedModules for evinse to work
        if (retMap.modList?.length) {
          const iSymbolsMap = {};
          retMap.modList.forEach((v) => {
            iSymbolsMap[v.name] = v.importedSymbols;
            iSymbolsMap[v.name.replace(/_/g, "-")] = v.importedSymbols;
          });
          for (const apkg of pkgList) {
            if (iSymbolsMap[apkg.name]) {
              apkg.scope = "required";
              apkg.properties = apkg.properties || [];
              apkg.properties.push({
                name: "ImportedModules",
                value: iSymbolsMap[apkg.name],
              });
            }
          }
        }
        if (retMap.pkgList?.length) {
          pkgList = pkgList.concat(retMap.pkgList);
          for (const p of retMap.pkgList) {
            if (
              !p.version ||
              (parentComponent &&
                p.name === parentComponent.name &&
                (p.version === parentComponent.version ||
                  p.version === "latest"))
            ) {
              continue;
            }
            parentDependsOn.add(
              `pkg:pypi/${p.name.toLowerCase()}@${p.version}`,
            );
          }
        }
        if (retMap.dependenciesList) {
          dependencies = mergeDependencies(
            dependencies,
            retMap.dependenciesList,
            parentComponent,
          );
        }
        if (retMap.allImports) {
          allImports = { ...allImports, ...retMap.allImports };
        }
      }
      // ATOM parsedeps block
      if (pkgMap) {
        // Complete the dependency tree by making parent component depend on the first level
        for (const p of pkgMap.rootList) {
          if (
            parentComponent &&
            p.name === parentComponent.name &&
            (p.version === parentComponent.version || p.version === "latest")
          ) {
            continue;
          }
          parentDependsOn.add(`pkg:pypi/${p.name.toLowerCase()}@${p.version}`);
        }
        if (pkgMap?.pkgList?.length) {
          pkgList = pkgList.concat(pkgMap.pkgList);
        }
        if (pkgMap?.formulationList?.length) {
          formulationList = formulationList.concat(pkgMap.formulationList);
        }
        if (pkgMap?.dependenciesList) {
          dependencies = mergeDependencies(
            dependencies,
            pkgMap.dependenciesList,
            parentComponent,
          );
        }
      }
      let parentPresent = false;
      for (const d of dependencies) {
        if (d.ref === parentComponent["bom-ref"]) {
          parentPresent = true;
          break;
        }
      }
      if (!parentPresent) {
        const pdependencies = {
          ref: parentComponent["bom-ref"],
          dependsOn: Array.from(parentDependsOn).filter(
            (r) => parentComponent && r !== parentComponent["bom-ref"],
          ),
        };
        dependencies.splice(0, 0, pdependencies);
      }
    }
  }

  // Final fallback is to manually parse setup.py if we still
  // have an empty list
  if (!pkgList.length && setupPyMode) {
    const setupPyData = readFileSync(setupPy, { encoding: "utf-8" });
    const dlist = await parseSetupPyFile(setupPyData);
    if (dlist?.length) {
      pkgList = pkgList.concat(dlist);
    }
  }
  // Check and complete the dependency tree
  if (
    isFeatureEnabled(options, "safe-pip-install") &&
    pkgList.length &&
    isPartialTree(dependencies, pkgList.length)
  ) {
    // Trim the current package list first
    pkgList = trimComponents(pkgList);
    console.log(
      `Attempting to recover the pip dependency tree from ${pkgList.length} packages. Please wait ...`,
    );
    const newPkgMap = getPipTreeForPackages(
      path,
      pkgList,
      tempDir,
      parentComponent,
    );
    if (DEBUG_MODE && newPkgMap.failedPkgList.length) {
      if (newPkgMap.failedPkgList.length < pkgList.length) {
        console.log(
          `${newPkgMap.failedPkgList.length} packages failed to install.`,
        );
      }
    }
    if (newPkgMap?.pkgList?.length) {
      pkgList = pkgList.concat(newPkgMap.pkgList);
      pkgList = trimComponents(pkgList);
    }
    if (newPkgMap.dependenciesList) {
      dependencies = mergeDependencies(
        dependencies,
        newPkgMap.dependenciesList,
        parentComponent,
      );
      if (DEBUG_MODE && dependencies.length > 1) {
        console.log("Recovered", dependencies.length, "dependencies.");
      }
    }
  }
  // Clean up
  if (tempDir?.startsWith(tmpdir()) && rmSync) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  // Re-compute the component scope
  pkgList = recomputeScope(pkgList, dependencies);
  if (shouldFetchLicense()) {
    pkgList = await getPyMetadata(pkgList, false);
  }
  return buildBomNSData(options, pkgList, "pypi", {
    allImports,
    src: path,
    filename: metadataFilename,
    dependencies,
    parentComponent,
    formulationList,
  });
}

/**
 * Function to create bom string for Go projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createGoBom(path, options) {
  let pkgList = [];
  let dependencies = [];
  const allImports = {};
  let parentComponent = createDefaultParentComponent(path, "golang", options);
  // Is this a binary file
  let maybeBinary;
  try {
    maybeBinary = statSync(path).isFile();
  } catch (err) {
    maybeBinary = false;
  }
  if (maybeBinary || options?.lifecycle?.includes("post-build")) {
    return createBinaryBom(path, options);
  }

  // Read in go.sum and merge all go.sum files.
  const gosumFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}go.sum`,
    options,
  );

  // If USE_GOSUM is true|1, generate BOM components only using go.sum.
  const useGosum =
    process.env.USE_GOSUM && ["true", "1"].includes(process.env.USE_GOSUM);
  if (useGosum && gosumFiles.length) {
    console.warn(
      "Using go.sum to generate BOMs for go projects may return an inaccurate representation of transitive dependencies.\nSee: https://github.com/golang/go/wiki/Modules#is-gosum-a-lock-file-why-does-gosum-include-information-for-module-versions-i-am-no-longer-using\n",
      "Set USE_GOSUM=false to generate BOMs using go.mod as the dependency source of truth.",
    );
    for (const f of gosumFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const gosumData = readFileSync(f, { encoding: "utf-8" });
      const dlist = await parseGosumData(gosumData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    const doneList = {};
    let circuitBreak = false;
    if (DEBUG_MODE) {
      console.log(
        `Attempting to detect required packages using "go mod why" command for ${pkgList.length} packages`,
      );
    }
    // Using go mod why detect required packages
    for (const apkg of pkgList) {
      if (circuitBreak) {
        break;
      }
      const pkgFullName = `${apkg.name}`;
      if (apkg.scope === "required") {
        allImports[pkgFullName] = true;
        continue;
      }
      if (
        apkg.scope === "optional" ||
        allImports[pkgFullName] ||
        doneList[pkgFullName]
      ) {
        continue;
      }
      if (DEBUG_MODE) {
        console.log(`go mod why -m -vendor ${pkgFullName}`);
      }
      const mresult = spawnSync(
        "go",
        ["mod", "why", "-m", "-vendor", pkgFullName],
        {
          cwd: path,
          encoding: "utf-8",
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
        },
      );
      if (mresult.status !== 0 || mresult.error) {
        if (DEBUG_MODE) {
          if (mresult.stdout) {
            console.log(mresult.stdout);
          }
          if (mresult.stderr) {
            console.log(mresult.stderr);
          }
        }
        circuitBreak = true;
      } else {
        const mstdout = mresult.stdout;
        if (mstdout) {
          const cmdOutput = Buffer.from(mstdout).toString();
          const whyPkg = parseGoModWhy(cmdOutput);
          // whyPkg would include this package string
          // github.com/golang/protobuf/proto github.com/golang/protobuf
          // golang.org/x/tools/cmd/goimports golang.org/x/tools
          if (whyPkg?.includes(pkgFullName)) {
            allImports[pkgFullName] = true;
          }
          doneList[pkgFullName] = true;
        }
      }
    }
    if (DEBUG_MODE) {
      console.log(`Required packages: ${Object.keys(allImports).length}`);
    }
    return buildBomNSData(options, pkgList, "golang", {
      src: path,
      dependencies,
      parentComponent,
      filename: gosumFiles.join(", "),
    });
  }

  // If USE_GOSUM is false, generate BOM components using go.mod.
  const gosumMap = {};
  if (gosumFiles.length) {
    for (const f of gosumFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const gosumData = readFileSync(f, { encoding: "utf-8" });
      const dlist = await parseGosumData(gosumData);
      if (dlist?.length) {
        dlist.forEach((pkg) => {
          gosumMap[`${pkg.name}@${pkg.version}`] = pkg._integrity;
        });
      }
    }
  }

  // Read in data from Gopkg.lock files if they exist
  const gopkgLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Gopkg.lock`,
    options,
  );

  // Read in go.mod files and parse BOM components with checksums from gosumData
  const gomodFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}go.mod`,
    options,
  );
  if (gomodFiles.length) {
    let shouldManuallyParse = false;
    // Use the go list -deps and go mod why commands to generate a good quality BOM for non-docker invocations
    if (
      !hasAnyProjectType(["docker", "oci", "container", "os"], options, false)
    ) {
      for (const f of gomodFiles) {
        const basePath = dirname(f);
        // Ignore vendor packages
        if (
          basePath.includes("/vendor/") ||
          basePath.includes("/build/") ||
          basePath.includes("/test-fixtures/")
        ) {
          continue;
        }
        // First we execute the go list -deps command which gives the correct list of dependencies
        if (DEBUG_MODE) {
          console.log("Executing go list -deps in", basePath);
        }
        let result = spawnSync(
          "go",
          [
            "list",
            "-deps",
            "-f",
            "'{{with .Module}}{{.Path}} {{.Version}} {{.Indirect}} {{.GoMod}} {{.GoVersion}} {{.Main}}{{end}}'",
            "./...",
          ],
          {
            cwd: basePath,
            encoding: "utf-8",
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_BUFFER,
          },
        );
        if (result.status !== 0 || result.error) {
          // go list -deps command may not work when private packages are involved
          // So we support a fallback to only operate with go mod graph command output in such instances
          console.log("go list -deps command has failed for", basePath);
          shouldManuallyParse = true;
          if (DEBUG_MODE && result.stdout) {
            console.log(result.stdout);
          }
          if (DEBUG_MODE && result.stderr) {
            console.log(result.stderr);
          }
          options.failOnError && process.exit(1);
        }
        const stdout = result.stdout;
        if (stdout) {
          let cmdOutput = Buffer.from(stdout).toString();
          const retMap = await parseGoListDep(cmdOutput, gosumMap);
          if (retMap.pkgList?.length) {
            pkgList = pkgList.concat(retMap.pkgList);
          }
          // We treat the main module as our parent
          if (
            retMap.parentComponent &&
            Object.keys(retMap.parentComponent).length
          ) {
            parentComponent = retMap.parentComponent;
            parentComponent.type = "application";
          }
          if (DEBUG_MODE) {
            console.log("Executing go mod graph in", basePath);
          }
          // Next we use the go mod graph command to construct the dependency tree
          result = spawnSync("go", ["mod", "graph"], {
            cwd: basePath,
            encoding: "utf-8",
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_BUFFER,
          });
          // Check if got a mod graph successfully
          if (result.status !== 0 || result.error) {
            console.log("go mod graph command has failed.");
            if (DEBUG_MODE && result.stdout) {
              console.log(result.stdout);
              if (result?.stdout.includes("unrecognized import path")) {
                console.log(
                  "go couldn't download all the modules, including any private modules. Dependency tree would be missing.",
                );
              }
            }
            if (DEBUG_MODE && result.stderr) {
              console.log(result.stderr);
            }
            options.failOnError && process.exit(1);
          }
          if (result.stdout) {
            cmdOutput = Buffer.from(result.stdout).toString();
            const retMap = await parseGoModGraph(
              cmdOutput,
              f,
              gosumMap,
              pkgList,
              parentComponent,
            );
            if (retMap.pkgList?.length) {
              pkgList = pkgList.concat(retMap.pkgList);
              pkgList = trimComponents(pkgList);
            }
            if (retMap.dependenciesList?.length) {
              dependencies = mergeDependencies(
                dependencies,
                retMap.dependenciesList,
                parentComponent,
              );
            }
            // Retain the parent component hierarchy
            if (Object.keys(retMap.parentComponent).length) {
              parentComponent.components = parentComponent.components || [];
              parentComponent.components.push(retMap.parentComponent);
            }
          }
        } else {
          if (DEBUG_MODE) {
            console.log("Executing go mod graph in", basePath);
          }
          // Next we use the go mod graph command to construct the dependency tree
          result = spawnSync("go", ["mod", "graph"], {
            cwd: basePath,
            encoding: "utf-8",
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_BUFFER,
          });
          if (result.stdout) {
            const cmdOutput = Buffer.from(result.stdout).toString();
            // The arguments to parseGoModGraph are slightly different to force inclusion of all packages
            const retMap = await parseGoModGraph(
              cmdOutput,
              f,
              gosumMap,
              [],
              {},
            );
            if (retMap.pkgList?.length) {
              pkgList = pkgList.concat(retMap.pkgList);
              pkgList = trimComponents(pkgList);
            }
            if (retMap.dependenciesList?.length) {
              dependencies = mergeDependencies(
                dependencies,
                retMap.dependenciesList,
                parentComponent,
              );
            }
            // Retain the parent component hierarchy
            if (Object.keys(retMap.parentComponent).length) {
              if (gomodFiles.length === 1) {
                parentComponent = retMap.parentComponent;
              } else {
                parentComponent.components = parentComponent.components || [];
                parentComponent.components.push(retMap.parentComponent);
              }
            }
          } else {
            shouldManuallyParse = true;
            console.log(
              "1. Check if the correct version of golang is installed. Try building the application using go build or make command to troubleshoot.",
            );
            console.log(
              "2. If the application uses private go modules, ensure the environment variable GOPRIVATE is set with the comma-separated repo names.\nEnsure $HOME/.netrc file contains a valid username and password for the private repos.",
            );
            console.log(
              "3. Alternatively, consider generating a post-build SBOM from the built binary using blint. Use the official container image and invoke cdxgen with the arguments `-t binary --lifecycle post-build`.",
            );
            options.failOnError && process.exit(1);
          }
        }
      }
      if (pkgList.length && !shouldManuallyParse) {
        return buildBomNSData(options, pkgList, "golang", {
          allImports,
          dependencies,
          parentComponent,
          src: path,
          filename: gomodFiles.join(", "),
        });
      }
    }
    // Parse the gomod files manually. The resultant BOM would be incomplete
    if (
      !hasAnyProjectType(["docker", "oci", "container", "os"], options, false)
    ) {
      console.log(
        "Manually parsing go.mod files. The resultant BOM would be incomplete.",
      );
    }
    for (const f of gomodFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const gomodData = readFileSync(f, { encoding: "utf-8" });
      const retMap = await parseGoModData(gomodData, gosumMap);
      if (retMap?.pkgList?.length) {
        pkgList = pkgList.concat(retMap.pkgList);
      }
      // Retain the parent component hierarchy
      if (Object.keys(retMap.parentComponent).length) {
        if (gomodFiles.length === 1) {
          parentComponent = retMap.parentComponent;
        } else {
          parentComponent.components = parentComponent.components || [];
          parentComponent.components.push(retMap.parentComponent);
        }
        if (retMap?.rootList?.length) {
          const thisParentDependsOn = [
            {
              ref: retMap.parentComponent["bom-ref"],
              dependsOn: [
                ...new Set(retMap.rootList.map((c) => c["bom-ref"])),
              ].sort(),
            },
          ];
          dependencies = mergeDependencies(
            dependencies,
            thisParentDependsOn,
            parentComponent,
          );
        }
      }
    }
    return buildBomNSData(options, pkgList, "golang", {
      src: path,
      dependencies,
      parentComponent,
      filename: gomodFiles.join(", "),
    });
  }
  if (gopkgLockFiles.length) {
    for (const f of gopkgLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const gopkgData = readFileSync(f, {
        encoding: "utf-8",
      });
      const dlist = await parseGopkgData(gopkgData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "golang", {
      src: path,
      dependencies,
      parentComponent,
      filename: gopkgLockFiles.join(", "),
    });
  }
  return {};
}

/**
 * Function to create bom string for Rust projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createRustBom(path, options) {
  let pkgList = [];
  let parentComponent = {};
  // Is this a binary file
  let maybeBinary;
  try {
    maybeBinary = statSync(path).isFile();
  } catch (err) {
    maybeBinary = false;
  }
  if (maybeBinary || options?.lifecycle?.includes("post-build")) {
    return createBinaryBom(path, options);
  }

  // This function assumes that the given path is prioritized, i.e that the
  // Cargo.toml-file directly inside the directory `path` (or the one in the
  // shortest distance from the `path` directory) will be the first returned
  // object. If that assumption is broken, the parent component may be
  // inaccurate.
  const cargoFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Cargo.toml`,
    options,
  );
  // Attempt to build or generate lock files automatically
  for (const f of cargoFiles) {
    // If there are no cargo.lock files, we can attempt a cargo install when
    //    options.deep is true or options.lifecycle == build or post-build with installDeps
    // Why the need for installDeps? It currently defaults to true, so let's obey if someone wants no installs
    if (
      options.deep === true ||
      (options.installDeps &&
        !existsSync(f.replace(".toml", ".lock")) &&
        ["build", "post-build"].includes(options.lifecycle))
    ) {
      const basePath = dirname(f);
      const cargoArgs = options.deep
        ? ["check", "--all-features", "--manifest-path", f]
        : ["generate-lockfile", "--manifest-path", f];
      if (!DEBUG_MODE) {
        cargoArgs.push("--quiet");
      }
      if (DEBUG_MODE) {
        console.log(
          "Executing ",
          CARGO_CMD,
          cargoArgs.join(" "),
          "in",
          basePath,
        );
      }
      const cargoInstallResult = spawnSync(CARGO_CMD, cargoArgs, {
        cwd: basePath,
        encoding: "utf-8",
        shell: isWin,
      });
      if (cargoInstallResult.status !== 0 || cargoInstallResult.error) {
        console.error("Error running the cargo command");
        console.log(cargoInstallResult.error, cargoInstallResult.stderr);
        options.failOnError && process.exit(1);
      }
    }
  }
  // After running cargo check, .d files would get created
  const makeDFiles = getAllFiles(path, "target/**/*.d", options);
  let pkgFilesMap = {};
  for (const dfile of makeDFiles) {
    pkgFilesMap = { ...pkgFilesMap, ...parseMakeDFile(dfile) };
  }
  const cargoLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Cargo.lock`,
    options,
  );
  const cargoLockMode = cargoLockFiles.length;
  for (const f of cargoFiles) {
    if (DEBUG_MODE) {
      console.log(`Parsing ${f}`);
    }
    const dlist = await parseCargoTomlData(f, cargoLockMode, pkgFilesMap);
    if (dlist?.length) {
      if (!cargoLockMode) {
        pkgList = pkgList.concat(dlist);
      } else {
        if (!Object.keys(parentComponent).length) {
          parentComponent = dlist[0];
          parentComponent.type = "application";
          parentComponent.components = [];
          if (DEBUG_MODE) {
            console.log(
              `Assigning parent component "${parentComponent.name}" from ${f}`,
            );
          }
        } else {
          parentComponent.components.push(dlist[0]);
        }
      }
    }
  }
  let dependencyTree = [];
  if (cargoLockMode) {
    for (const f of cargoLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const dlist = await parseCargoData(f, false, pkgFilesMap);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }

      if (DEBUG_MODE) {
        console.log(`Constructing dependency tree from ${f}`);
      }
      const cargoLockData = readFileSync(f, { encoding: "utf-8" });
      const fileDependencylist = parseCargoDependencyData(cargoLockData);
      if (fileDependencylist?.length) {
        dependencyTree = mergeDependencies(
          dependencyTree,
          fileDependencylist,
          parentComponent,
        );
      }
    }
  }
  return buildBomNSData(options, pkgList, "cargo", {
    src: path,
    filename: cargoLockFiles.join(", "),
    dependencies: dependencyTree,
    parentComponent,
  });
}

/**
 * Function to create bom string for Dart projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createDartBom(path, options) {
  const pubFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}pubspec.lock`,
    options,
  );
  const pubSpecYamlFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}pubspec.yaml`,
    options,
  );
  let pkgList = [];
  if (pubFiles.length) {
    for (const f of pubFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const pubLockData = readFileSync(f, { encoding: "utf-8" });
      const dlist = await parsePubLockData(pubLockData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "pub", {
      src: path,
      filename: pubFiles.join(", "),
    });
  }
  if (pubSpecYamlFiles.length) {
    for (const f of pubSpecYamlFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const pubYamlData = readFileSync(f, { encoding: "utf-8" });
      const dlist = parsePubYamlData(pubYamlData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "pub", {
      src: path,
      filename: pubSpecYamlFiles.join(", "),
    });
  }

  return {};
}

/**
 * Function to create bom string for cpp projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createCppBom(path, options) {
  let parentComponent = undefined;
  let dependencies = [];
  const addedParentComponentsMap = {};
  const conanLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}conan.lock`,
    options,
  );
  const conanFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}conanfile.txt`,
    options,
  );
  let cmakeLikeFiles = [];
  const mesonBuildFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}meson.build`,
    options,
  );
  if (mesonBuildFiles?.length) {
    cmakeLikeFiles = cmakeLikeFiles.concat(mesonBuildFiles);
  }
  cmakeLikeFiles = cmakeLikeFiles.concat(
    getAllFiles(
      path,
      `${options.multiProject ? "**/" : ""}CMakeLists.txt`,
      options,
    ),
  );
  const cmakeFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.cmake`,
    options,
  );
  if (cmakeFiles?.length) {
    cmakeLikeFiles = cmakeLikeFiles.concat(cmakeFiles);
  }
  let pkgList = [];
  if (conanLockFiles.length) {
    for (const f of conanLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const conanLockData = readFileSync(f, { encoding: "utf-8" });
      const dlist = parseConanLockData(conanLockData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  } else if (conanFiles.length) {
    for (const f of conanFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const conanData = readFileSync(f, { encoding: "utf-8" });
      const dlist = parseConanData(conanData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  if (cmakeLikeFiles.length) {
    for (const f of cmakeLikeFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const basePath = dirname(f);
      const retMap = parseCmakeLikeFile(f, "generic");
      if (retMap.pkgList?.length) {
        pkgList = pkgList.concat(retMap.pkgList);
      }
      if (
        basePath === path &&
        retMap.parentComponent &&
        Object.keys(retMap.parentComponent).length
      ) {
        if (!parentComponent) {
          parentComponent = retMap.parentComponent;
        } else {
          parentComponent.components = parentComponent.components || [];
          if (!addedParentComponentsMap[retMap.parentComponent.name]) {
            parentComponent.components.push(retMap.parentComponent);
            addedParentComponentsMap[retMap.parentComponent.name] = true;
          }
        }
      } else if (
        retMap.parentComponent &&
        Object.keys(retMap.parentComponent).length &&
        !addedParentComponentsMap[retMap.parentComponent.name]
      ) {
        retMap.parentComponent.type = "library";
        pkgList.push(retMap.parentComponent);
      }
      // Retain the dependency tree from cmake
      if (retMap.dependenciesList) {
        if (dependencies.length) {
          dependencies = mergeDependencies(
            dependencies,
            retMap.dependenciesList,
            parentComponent,
          );
        } else {
          dependencies = retMap.dependenciesList;
        }
      }
    }
  }
  // The need for java >= 21 with atom is causing confusions since there could be C projects
  // inside of other project types. So we currently limit this analyis only when -t argument
  // is used.
  if (
    !hasAnyProjectType(["docker", "oci", "container", "os"], options, false) &&
    (!options.createMultiXBom || options.deep)
  ) {
    let osPkgsList = [];
    // Case 1: Development libraries installed in this OS environment might be used for build
    // We collect OS packages with the word dev in the name using osquery here
    // rpm, deb and ebuild are supported
    // TODO: For archlinux and alpine users we need a different mechanism to collect this information
    for (const queryCategory of Object.keys(cosDbQueries)) {
      const queryObj = cosDbQueries[queryCategory];
      const results = executeOsQuery(queryObj.query);
      const dlist = convertOSQueryResults(
        queryCategory,
        queryObj,
        results,
        true,
      );
      if (dlist?.length) {
        osPkgsList = osPkgsList.concat(dlist);
      }
    }
    // Now we check with atom and attempt to detect all external modules via usages
    // We pass the current list of packages so that we enhance the current list and replace
    // components inadvertently. For example, we might resolved a name, version and url information already via cmake
    const retMap = getCppModules(path, options, osPkgsList, pkgList);
    if (retMap.pkgList?.length) {
      pkgList = pkgList.concat(retMap.pkgList);
    }
    if (retMap.dependenciesList) {
      if (dependencies.length) {
        dependencies = mergeDependencies(
          dependencies,
          retMap.dependenciesList,
          parentComponent,
        );
      } else {
        dependencies = retMap.dependenciesList;
      }
    }
    if (!parentComponent) {
      parentComponent = retMap.parentComponent;
    } else {
      parentComponent.components = parentComponent.components || [];
      if (!addedParentComponentsMap[retMap.parentComponent.name]) {
        parentComponent.components.push(retMap.parentComponent);
        addedParentComponentsMap[retMap.parentComponent.name] = true;
      }
    }
  }
  if (!options.createMultiXBom) {
    if (!parentComponent) {
      parentComponent = createDefaultParentComponent(path, "generic", options);
    }
    options.parentComponent = parentComponent;
  }
  return buildBomNSData(options, pkgList, "generic", {
    src: path,
    parentComponent,
    dependencies,
  });
}

/**
 * Function to create bom string for clojure projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createClojureBom(path, options) {
  const ednFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}deps.edn`,
    options,
  );
  const leinFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}project.clj`,
    options,
  );
  let pkgList = [];
  if (leinFiles.length) {
    let LEIN_ARGS = ["deps", ":tree-data"];
    if (process.env.LEIN_ARGS) {
      LEIN_ARGS = process.env.LEIN_ARGS.split(" ");
    }
    for (const f of leinFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const basePath = dirname(f);
      console.log("Executing", LEIN_CMD, LEIN_ARGS.join(" "), "in", basePath);
      const result = spawnSync(LEIN_CMD, LEIN_ARGS, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });
      if (result.status !== 0 || result.error) {
        if (result.stderr) {
          console.error(result.stdout, result.stderr);
          options.failOnError && process.exit(1);
        }
        console.log(
          "Check if the correct version of lein is installed and available in PATH. Falling back to manual parsing.",
        );
        if (DEBUG_MODE) {
          console.log(`Parsing ${f}`);
        }
        const leinData = readFileSync(f, { encoding: "utf-8" });
        const dlist = parseLeiningenData(leinData);
        if (dlist?.length) {
          pkgList = pkgList.concat(dlist);
        }
      } else {
        const stdout = result.stdout;
        if (stdout) {
          const cmdOutput = Buffer.from(stdout).toString();
          const dlist = parseLeinDep(cmdOutput);
          if (dlist?.length) {
            pkgList = pkgList.concat(dlist);
          }
        } else {
          console.error("lein unexpectedly didn't return any output");
          options.failOnError && process.exit(1);
        }
      }
    }
    return buildBomNSData(options, pkgList, "clojars", {
      src: path,
      filename: leinFiles.join(", "),
    });
  }
  if (ednFiles.length) {
    let CLJ_ARGS = ["-Stree"];
    if (process.env.CLJ_ARGS) {
      CLJ_ARGS = process.env.CLJ_ARGS.split(" ");
    }
    for (const f of ednFiles) {
      const basePath = dirname(f);
      console.log("Executing", CLJ_CMD, CLJ_ARGS.join(" "), "in", basePath);
      const result = spawnSync(CLJ_CMD, CLJ_ARGS, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });
      if (result.status !== 0 || result.error) {
        if (result.stderr) {
          console.error(result.stdout, result.stderr);
          options.failOnError && process.exit(1);
        }
        console.log(
          "Check if the correct version of clojure cli is installed and available in PATH. Falling back to manual parsing.",
        );
        if (DEBUG_MODE) {
          console.log(`Parsing ${f}`);
        }
        const ednData = readFileSync(f, { encoding: "utf-8" });
        const dlist = parseEdnData(ednData);
        if (dlist?.length) {
          pkgList = pkgList.concat(dlist);
        }
      } else {
        const stdout = result.stdout;
        if (stdout) {
          const cmdOutput = Buffer.from(stdout).toString();
          const dlist = parseCljDep(cmdOutput);
          if (dlist?.length) {
            pkgList = pkgList.concat(dlist);
          }
        } else {
          console.error("clj unexpectedly didn't return any output");
          options.failOnError && process.exit(1);
        }
      }
    }
    return buildBomNSData(options, pkgList, "clojars", {
      src: path,
      filename: ednFiles.join(", "),
    });
  }

  return {};
}

/**
 * Function to create bom string for Haskell projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createHaskellBom(path, options) {
  const cabalFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}cabal.project.freeze`,
    options,
  );
  let pkgList = [];
  if (cabalFiles.length) {
    for (const f of cabalFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const cabalData = readFileSync(f, { encoding: "utf-8" });
      const dlist = parseCabalData(cabalData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "hackage", {
      src: path,
      filename: cabalFiles.join(", "),
    });
  }
  return {};
}

/**
 * Function to create bom string for Elixir projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createElixirBom(path, options) {
  const mixFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}mix.lock`,
    options,
  );
  let pkgList = [];
  if (mixFiles.length) {
    for (const f of mixFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const mixData = readFileSync(f, { encoding: "utf-8" });
      const dlist = parseMixLockData(mixData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "hex", {
      src: path,
      filename: mixFiles.join(", "),
    });
  }
  return {};
}

/**
 * Function to create bom string for GitHub action workflows
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createGitHubBom(path, options) {
  const ghactionFiles = getAllFiles(
    path,
    ".github/workflows/" + "*.yml",
    options,
  );
  let pkgList = [];
  if (ghactionFiles.length) {
    for (const f of ghactionFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const ghwData = readFileSync(f, { encoding: "utf-8" });
      const dlist = parseGitHubWorkflowData(ghwData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "github", {
      src: path,
      filename: ghactionFiles.join(", "),
    });
  }
  return {};
}

/**
 * Function to create bom string for cloudbuild yaml
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createCloudBuildBom(path, options) {
  const cbFiles = getAllFiles(path, "cloudbuild.yml", options);
  let pkgList = [];
  if (cbFiles.length) {
    for (const f of cbFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const cbwData = readFileSync(f, { encoding: "utf-8" });
      const dlist = parseCloudBuildData(cbwData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "cloudbuild", {
      src: path,
      filename: cbFiles.join(", "),
    });
  }
  return {};
}

/**
 * Function to create obom string for the current OS using osquery
 *
 * @param {string} _path to the project
 * @param {Object} options Parse options from the cli
 */
export function createOSBom(_path, options) {
  console.warn(
    "About to generate OBOM for the current OS installation. This will take several minutes ...",
  );
  let pkgList = [];
  let bomData = {};
  let parentComponent = {};
  for (const queryCategory of Object.keys(osQueries)) {
    const queryObj = osQueries[queryCategory];
    const results = executeOsQuery(queryObj.query);
    const dlist = convertOSQueryResults(
      queryCategory,
      queryObj,
      results,
      false,
    );
    if (dlist?.length) {
      if (!Object.keys(parentComponent).length) {
        parentComponent = dlist.splice(0, 1)[0];
      }
      pkgList = pkgList.concat(
        dlist.sort((a, b) => a.name.localeCompare(b.name)),
      );
    }
  } // for
  if (pkgList.length) {
    bomData = buildBomNSData(options, pkgList, "", {
      src: "",
      filename: "",
      parentComponent,
    });
  }
  options.bomData = bomData;
  options.multiProject = true;
  options.installDeps = false;
  options.parentComponent = parentComponent;
  // Force the project type to os
  options.projectType = ["os"];
  options.lastWorkingDir = undefined;
  options.allLayersExplodedDir = isWin ? "C:\\" : "";
  const exportData = {
    lastWorkingDir: undefined,
    allLayersDir: options.allLayersExplodedDir,
    allLayersExplodedDir: options.allLayersExplodedDir,
  };
  const pkgPathList = [];
  if (options.deep) {
    getPkgPathList(exportData, undefined);
  }
  return createMultiXBom(pkgPathList, options);
}

/**
 * Function to create bom string for Jenkins plugins
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createJenkinsBom(path, options) {
  let pkgList = [];
  const hpiFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.hpi`,
    options,
  );
  const tempDir = mkdtempSync(join(tmpdir(), "hpi-deps-"));
  if (hpiFiles.length) {
    for (const f of hpiFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const dlist = await extractJarArchive(f, tempDir);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  const jsFiles = getAllFiles(tempDir, "**/*.js", options);
  if (jsFiles.length) {
    for (const f of jsFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const dlist = await parseMinJs(f);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  // Clean up
  if (tempDir?.startsWith(tmpdir()) && rmSync) {
    console.log(`Cleaning up ${tempDir}`);
    rmSync(tempDir, { recursive: true, force: true });
  }
  return buildBomNSData(options, pkgList, "maven", {
    src: path,
    filename: hpiFiles.join(", "),
    nsMapping: {},
  });
}

/**
 * Function to create bom string for Helm charts
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createHelmBom(path, options) {
  let pkgList = [];
  const yamlFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.yaml`,
    options,
  );
  if (yamlFiles.length) {
    for (const f of yamlFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const helmData = readFileSync(f, { encoding: "utf-8" });
      const dlist = parseHelmYamlData(helmData);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
    return buildBomNSData(options, pkgList, "helm", {
      src: path,
      filename: yamlFiles.join(", "),
    });
  }
  return {};
}

/**
 * Function to create bom string for swift projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createSwiftBom(path, options) {
  const swiftFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Package*.swift`,
    options,
  );
  const pkgResolvedFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Package.resolved`,
    options,
  );
  let pkgList = [];
  let dependencies = [];
  let parentComponent = {};
  const completedPath = [];
  if (pkgResolvedFiles.length) {
    for (const f of pkgResolvedFiles) {
      if (!parentComponent || !Object.keys(parentComponent).length) {
        parentComponent = createDefaultParentComponent(f, "swift", options);
      }
      if (DEBUG_MODE) {
        console.log("Parsing", f);
      }
      const dlist = parseSwiftResolved(f);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
    }
  }
  if (swiftFiles.length) {
    for (const f of swiftFiles) {
      const basePath = dirname(f);
      if (completedPath.includes(basePath)) {
        continue;
      }
      let treeData = undefined;
      let packageArgs = ["package", "show-dependencies", "--format", "json"];
      let swiftCommand = SWIFT_CMD;
      if (swiftCommand.startsWith("xcrun")) {
        swiftCommand = "xcrun";
        packageArgs = ["swift"].concat(packageArgs);
      }
      if (DEBUG_MODE) {
        console.log(
          `Executing '${swiftCommand} ${packageArgs.join(" ")}' in`,
          basePath,
        );
      }
      const result = spawnSync(swiftCommand, packageArgs, {
        cwd: basePath,
        encoding: "utf-8",
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });
      if (result.status === 0 && result.stdout) {
        completedPath.push(basePath);
        treeData = Buffer.from(result.stdout).toString();
        const retData = parseSwiftJsonTree(treeData, f);
        if (retData.pkgList?.length) {
          parentComponent = retData.pkgList.splice(0, 1)[0];
          parentComponent.type = "application";
          pkgList = pkgList.concat(retData.pkgList);
        }
        if (retData.dependenciesList) {
          dependencies = mergeDependencies(
            dependencies,
            retData.dependenciesList,
            parentComponent,
          );
        }
      } else {
        if (DEBUG_MODE) {
          console.log(
            "Please install swift from https://www.swift.org/download/ or use the cdxgen container image",
          );
        }
        console.error(result.stderr);
        options.failOnError && process.exit(1);
      }
    }
  }
  if (shouldFetchLicense()) {
    pkgList = await getSwiftPackageMetadata(pkgList);
  }
  return buildBomNSData(options, pkgList, "swift", {
    src: path,
    filename: swiftFiles.join(", "),
    parentComponent,
    dependencies,
  });
}

/**
 * Function to create bom string for docker compose
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createContainerSpecLikeBom(path, options) {
  let services = [];
  const ociSpecs = [];
  let components = [];
  let parentComponent = {};
  let dependencies = [];
  const doneimages = [];
  const skippedImageSrcs = [];
  const doneservices = [];
  const origProjectType = options.projectType;
  let dcFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.yml`,
    options,
  );
  const dfFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*Dockerfile*`,
    options,
  );
  const bbPipelineFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}bitbucket-pipelines.yml`,
    options,
  );
  const cfFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*Containerfile*`,
    options,
  );
  const yamlFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.yaml`,
    options,
  );
  let oapiFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}open*.json`,
    options,
  );
  const oapiYamlFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}open*.yaml`,
    options,
  );
  if (oapiYamlFiles?.length) {
    oapiFiles = oapiFiles.concat(oapiYamlFiles);
  }
  if (yamlFiles.length) {
    dcFiles = dcFiles.concat(yamlFiles);
  }
  // Privado.ai json files
  const privadoFiles = getAllFiles(path, ".privado/" + "*.json", options);

  // Parse yaml manifest files, dockerfiles, containerfiles or bitbucket pipeline files
  if (
    dcFiles.length ||
    dfFiles.length ||
    cfFiles.length ||
    bbPipelineFiles.length
  ) {
    for (const f of [...dcFiles, ...dfFiles, ...cfFiles, ...bbPipelineFiles]) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }

      const dData = readFileSync(f, { encoding: "utf-8" });
      let imgList = [];
      // parse yaml manifest files
      if (f.endsWith("bitbucket-pipelines.yml")) {
        imgList = parseBitbucketPipelinesFile(dData);
      } else if (f.endsWith(".yml") || f.endsWith(".yaml")) {
        imgList = parseContainerSpecData(dData);
      } else {
        imgList = parseContainerFile(dData);
      }

      if (imgList?.length) {
        if (DEBUG_MODE) {
          console.log("Images identified in", f, "are", imgList);
        }
        for (const img of imgList) {
          const commonProperties = [
            {
              name: "SrcFile",
              value: f,
            },
          ];
          if (img.image) {
            commonProperties.push({
              name: "oci:SrcImage",
              value: img.image,
            });
          }
          if (img.service) {
            commonProperties.push({
              name: "ServiceName",
              value: img.service,
            });
          }

          // img could have .service, .ociSpec or .image
          if (img.ociSpec) {
            console.log(
              `NOTE: ${img.ociSpec} needs to built using docker or podman and referred with a name to get included in this SBOM.`,
            );
            ociSpecs.push({
              group: "",
              name: img.ociSpec,
              version: "latest",
              properties: commonProperties,
            });
          }
          if (img.service) {
            let version = "latest";
            let name = img.service;
            if (img.service.includes(":")) {
              const tmpA = img.service.split(":");
              if (tmpA && tmpA.length === 2) {
                name = tmpA[0];
                version = tmpA[1];
              }
            }
            const servbomRef = `urn:service:${name}:${version}`;
            if (!doneservices.includes(servbomRef)) {
              services.push({
                "bom-ref": servbomRef,
                name: name,
                version: version,
                group: "",
                properties: commonProperties,
              });
              doneservices.push(servbomRef);
            }
          }
          if (img.image) {
            if (doneimages.includes(img.image)) {
              if (DEBUG_MODE) {
                console.log(
                  "Skipping image as it's already been processed",
                  img.image,
                );
              }

              skippedImageSrcs.push({ image: img.image, src: f });

              continue;
            }
            if (DEBUG_MODE) {
              console.log(`Parsing image ${img.image}`);
            }
            const imageObj = parseImageName(img.image);

            const pkg = {
              name: imageObj.name,
              group: imageObj.group,
              version:
                imageObj.tag ||
                (imageObj.digest ? `sha256:${imageObj.digest}` : "latest"),
              qualifiers: {},
              properties: commonProperties,
              type: "container",
            };
            if (imageObj.registry) {
              // Skip adding repository_url if the registry or repo contains variables.
              if (
                imageObj.registry.includes("${") ||
                imageObj.repo.includes("${")
              ) {
                if (DEBUG_MODE) {
                  console.warn(
                    "Skipping adding repository_url qualifier as it contains variables, which are not yet supported",
                    img.image,
                  );
                }
              } else {
                pkg["qualifiers"]["repository_url"] =
                  `${imageObj.registry}/${imageObj.repo}`;
              }
            }
            if (imageObj.platform) {
              pkg["qualifiers"]["platform"] = imageObj.platform;
            }
            if (imageObj.tag) {
              pkg["qualifiers"]["tag"] = imageObj.tag;
            }
            // Create an entry for the oci image
            const imageBomData = buildBomNSData(options, [pkg], "oci", {
              src: img.image,
              filename: f,
              nsMapping: {},
            });
            if (imageBomData?.bomJson?.components) {
              components = components.concat(imageBomData.bomJson.components);
            }
            const bomData = await createBom(img.image, {
              projectType: ["oci"],
            });
            doneimages.push(img.image);
            if (bomData) {
              if (bomData.components?.length) {
                // Inject properties
                for (const co of bomData.components) {
                  co.properties = commonProperties;
                }
                components = components.concat(bomData.components);
              }
            }
          } // img.image
        } // for img
      }
    } // for

    // Add additional SrcFile property to skipped image components
    addSkippedSrcFiles(skippedImageSrcs, components);
  } // if
  // Parse openapi files
  if (oapiFiles.length) {
    for (const af of oapiFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${af}`);
      }
      const oaData = readFileSync(af, { encoding: "utf-8" });
      const servlist = parseOpenapiSpecData(oaData);
      if (servlist?.length) {
        // Inject SrcFile property
        for (const se of servlist) {
          se.properties = [
            {
              name: "SrcFile",
              value: af,
            },
          ];
        }
        services = services.concat(servlist);
      }
    }
  }
  // Parse privado files
  if (privadoFiles.length) {
    console.log(
      "Enriching your SBOM with information from privado.ai scan reports",
    );
    let rows = [["Classification", "Flow"]];
    const config = {
      header: {
        alignment: "center",
        content: "Data Privacy Insights from privado.ai",
      },
      columns: [{ width: 50 }, { width: 10 }],
    };
    for (const f of privadoFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const servlist = parsePrivadoFile(f);
      services = services.concat(servlist);
      if (servlist.length) {
        const aservice = servlist[0];
        if (aservice.data) {
          for (const d of aservice.data) {
            rows.push([d.classification, d.flow]);
          }
          console.log(table(rows, config));
        }
        if (aservice.endpoints) {
          rows = [["Leaky Endpoints"]];
          for (const e of aservice.endpoints) {
            rows.push([e]);
          }
          console.log(
            table(rows, {
              columnDefault: {
                width: 50,
              },
            }),
          );
        }
      }
    }
  }
  if (origProjectType?.includes("universal")) {
    // In case of universal, repeat to collect multiX Boms
    const mbomData = await createMultiXBom(path, {
      projectType: [],
      multiProject: true,
      excludeType: options.excludeType,
    });
    if (mbomData) {
      if (mbomData.components?.length) {
        components = components.concat(mbomData.components);
      }
      // We need to retain the parentComponent. See #527
      // Parent component returned by multi X search is usually good
      parentComponent = mbomData.parentComponent;
      options.parentComponent = parentComponent;
      if (mbomData.bomJson) {
        if (mbomData.bomJson.dependencies) {
          dependencies = mergeDependencies(
            dependencies,
            mbomData.bomJson.dependencies,
            parentComponent,
          );
        }
        if (mbomData.bomJson.services) {
          services = services.concat(mbomData.bomJson.services);
        }
      }
      if (DEBUG_MODE) {
        console.log(
          `Received ${components.length} unfiltered components ${dependencies.length} dependencies so far.`,
        );
      }
    }
  }
  options.services = services;
  options.ociSpecs = ociSpecs;
  return dedupeBom(options, components, parentComponent, dependencies);
}

/**
 * Function to create bom string for php projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export function createPHPBom(path, options) {
  let dependencies = [];
  let parentComponent = {};
  const composerJsonFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}composer.json`,
    options,
  );
  if (!options.exclude) {
    options.exclude = [];
  }
  // Ignore vendor directories for lock files
  options.exclude.push("**/vendor/**");
  let composerLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}composer.lock`,
    options,
  );
  let pkgList = [];
  const composerJsonMode = composerJsonFiles.length;
  const composerLockMode = composerLockFiles.length;
  // Create a composer.lock file for each composer.json file if needed.
  if (!composerLockMode && composerJsonMode && options.installDeps) {
    if (DEBUG_MODE) {
      console.log("About to invoke composer --version");
    }
    const versionResult = spawnSync("composer", ["--version"], {
      encoding: "utf-8",
    });
    if (versionResult.status !== 0 || versionResult.error) {
      console.error(
        "No composer version found. Check if composer is installed and available in PATH.",
      );
      if (DEBUG_MODE) {
        console.log(versionResult.error, versionResult.stderr);
      }
      options.failOnError && process.exit(1);
    }
    let composerVersion = undefined;
    if (DEBUG_MODE) {
      console.log("Parsing version", versionResult.stdout);
    }
    let tmpV = undefined;
    if (versionResult?.stdout) {
      tmpV = versionResult.stdout.split(" ");
    }
    if (tmpV && tmpV.length > 1) {
      composerVersion = tmpV[1];
    }
    for (const f of composerJsonFiles) {
      const basePath = dirname(f);
      let args = [];
      if (composerVersion && !composerVersion.startsWith("1")) {
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
        options.failOnError && process.exit(1);
      }
    }
  }
  composerLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}composer.lock`,
    options,
  );
  if (composerLockFiles.length) {
    for (const f of composerLockFiles) {
      const basePath = dirname(f);
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      let rootRequires = [];
      // Is there a composer.json to find the parent component
      if (
        !Object.keys(parentComponent).length &&
        existsSync(join(basePath, "composer.json"))
      ) {
        const composerData = JSON.parse(
          readFileSync(join(basePath, "composer.json"), { encoding: "utf-8" }),
        );
        rootRequires = composerData.require;
        const pkgName = composerData.name;
        if (pkgName) {
          parentComponent.group = dirname(pkgName);
          if (parentComponent.group === ".") {
            parentComponent.group = "";
          }
          parentComponent.name = basename(pkgName);
          parentComponent.type = "application";
          parentComponent.version = composerData.version || "latest";
          parentComponent["bom-ref"] = decodeURIComponent(
            new PackageURL(
              "composer",
              parentComponent.group,
              parentComponent.name,
              parentComponent.version,
              null,
              null,
            ).toString(),
          );
        }
      }
      const retMap = parseComposerLock(f, rootRequires);
      if (retMap.pkgList?.length) {
        pkgList = pkgList.concat(retMap.pkgList);
      }
      if (retMap.dependenciesList) {
        if (!Object.keys(parentComponent).length) {
          parentComponent = createDefaultParentComponent(
            path,
            "composer",
            options,
          );
        }
        // Complete the dependency tree by making parent component depend on the first level
        const pdependencies = {
          ref: parentComponent["bom-ref"],
          dependsOn: [
            ...new Set(retMap.rootList.map((p) => p["bom-ref"])),
          ].sort(),
        };
        dependencies = mergeDependencies(
          dependencies,
          [pdependencies, ...retMap.dependenciesList],
          parentComponent,
        );
      }
    }
    return buildBomNSData(options, pkgList, "composer", {
      src: path,
      filename: composerLockFiles.join(", "),
      dependencies,
      parentComponent,
    });
  }
  return {};
}

/**
 * Function to create bom string for ruby projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createRubyBom(path, options) {
  const gemFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Gemfile`,
    options,
  );
  let gemLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Gemfile*.lock`,
    options,
  );
  let pkgList = [];
  let dependencies = [];
  let rootList = [];
  const parentComponent = createDefaultParentComponent(path, "gem", options);
  const gemFileMode = gemFiles.length;
  const gemLockMode = gemLockFiles.length;
  if (gemFileMode && !gemLockMode && options.installDeps) {
    for (const f of gemFiles) {
      const basePath = dirname(f);
      console.log("Executing 'bundle install' in", basePath);
      const result = spawnSync("bundle", ["install"], {
        cwd: basePath,
        encoding: "utf-8",
      });
      if (result.status !== 0 || result.error) {
        console.error(
          "Bundle install has failed. Check if bundle is installed and available in PATH.",
        );
        console.log(result.error, result.stderr);
        options.failOnError && process.exit(1);
      }
    }
  }
  gemLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Gemfile*.lock`,
    options,
  );
  if (gemLockFiles.length) {
    for (const f of gemLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const gemLockData = readFileSync(f, { encoding: "utf-8" });
      const retMap = await parseGemfileLockData(gemLockData, f);
      if (retMap.pkgList?.length) {
        pkgList = pkgList.concat(retMap.pkgList);
        pkgList = trimComponents(pkgList);
      }
      if (retMap.dependenciesList?.length) {
        dependencies = mergeDependencies(
          dependencies,
          retMap.dependenciesList,
          parentComponent,
        );
      }
      if (retMap.rootList?.length) {
        rootList = rootList.concat(retMap.rootList);
      }
    }
  }
  if (rootList.length) {
    dependencies = mergeDependencies(
      dependencies,
      [
        {
          ref: parentComponent["bom-ref"],
          dependsOn: [...new Set(rootList)].sort(),
        },
      ],
      parentComponent,
    );
  }
  return buildBomNSData(options, pkgList, "gem", {
    src: path,
    dependencies,
    parentComponent,
    filename: gemLockFiles.join(", "),
  });
}

/**
 * Function to create bom string for csharp projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createCsharpBom(path, options) {
  let manifestFiles = [];
  let pkgData = undefined;
  let dependencies = [];
  if (options?.lifecycle?.includes("post-build")) {
    return createBinaryBom(path, options);
  }
  let parentComponent = createDefaultParentComponent(path, "nuget", options);
  const slnFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.sln`,
    options,
  );
  let csProjFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.csproj`,
    options,
  );
  csProjFiles = csProjFiles.concat(
    getAllFiles(path, `${options.multiProject ? "**/" : ""}*.vbproj`, options),
  );
  csProjFiles = csProjFiles.concat(
    getAllFiles(path, `${options.multiProject ? "**/" : ""}*.vcxproj`, options),
  );
  csProjFiles = csProjFiles.concat(
    getAllFiles(path, `${options.multiProject ? "**/" : ""}*.fsproj`, options),
  );
  const pkgConfigFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}packages.config`,
    options,
  );
  let projAssetsFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}project.assets.json`,
    options,
  );
  let pkgLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}packages.lock.json`,
    options,
  );
  const paketLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}paket.lock`,
    options,
  );
  let nupkgFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.nupkg`,
    options,
  );
  // Support for detecting and suggesting build tools for this project
  // We parse all the .csproj files to collect the target framework strings
  if (isFeatureEnabled(options, "suggest-build-tools")) {
    const targetFrameworks = new Set();
    for (const f of csProjFiles) {
      const csProjData = readFileSync(f, { encoding: "utf-8" });
      const retMap = parseCsProjData(csProjData, f, {});
      if (retMap?.parentComponent?.properties) {
        retMap.parentComponent.properties
          .filter(
            (p) =>
              p.name === "cdx:dotnet:target_framework" && p.value.trim().length,
          )
          .forEach((p) => {
            p.value
              .split(";")
              .filter((v) => v.trim().length && !v.startsWith("$("))
              .forEach((v) => {
                targetFrameworks.add(v);
              });
          });
      }
    }
    console.log("Target frameworks found:", Array.from(targetFrameworks));
  }
  // Support for automatic restore for .Net projects
  if (
    options.installDeps &&
    !projAssetsFiles.length &&
    !pkgLockFiles.length &&
    !paketLockFiles.length
  ) {
    const filesToRestore = slnFiles.concat(csProjFiles);
    for (const f of filesToRestore) {
      const buildCmd = options.projectType?.includes("dotnet-framework")
        ? "nuget"
        : "dotnet";
      const buildArgs = options.projectType?.includes("dotnet-framework")
        ? [
            "restore",
            "-NonInteractive",
            "-Recursive",
            "-PackageSaveMode",
            "nuspec;nupkg",
            "-Verbosity",
            "quiet",
          ]
        : ["restore", "--force", "--ignore-failed-sources", f];
      if (DEBUG_MODE) {
        const basePath = dirname(f);
        console.log(
          `Executing '${buildCmd} ${buildArgs.join(" ")}' in ${basePath}`,
        );
      }
      const result = spawnSync(buildCmd, buildArgs, {
        cwd: path,
        encoding: "utf-8",
        env: { ...process.env, DOTNET_ROLL_FORWARD: "Major" },
      });
      if (DEBUG_MODE && (result.status !== 0 || result.error)) {
        if (result?.stderr?.includes("To install missing framework")) {
          console.log(
            "This project requires a specific version of dotnet sdk to be installed. The cdxgen container image bundles dotnet SDK 8.0, which might be incompatible.",
          );
          console.log(
            "Try using the custom `ghcr.io/cyclonedx/cdxgen-dotnet6:v11` or `ghcr.io/cyclonedx/cdxgen-dotnet7:v11` container images.",
          );
        } else {
          console.error(
            `Restore has failed. Check if ${buildCmd} is installed and available in PATH.`,
          );
          console.log(
            "Authenticate with any private registries such as Azure Artifacts feed before running cdxgen.",
          );
          if (process.env?.CDXGEN_IN_CONTAINER !== "true") {
            console.log(
              "Alternatively, try using the custom `ghcr.io/cyclonedx/cdxgen-dotnet6:v11` container image, which bundles nuget (mono) and a range of dotnet SDKs.",
            );
          }
        }
        console.log(result.stdout, result.stderr);
        options.failOnError && process.exit(1);
      }
    }
    // Collect the assets, lock, and nupkg files generated from restore
    projAssetsFiles = getAllFiles(
      path,
      `${options.multiProject ? "**/" : ""}project.assets.json`,
      options,
    );
    pkgLockFiles = getAllFiles(
      path,
      `${options.multiProject ? "**/" : ""}packages.lock.json`,
      options,
    );
    nupkgFiles = getAllFiles(
      path,
      `${options.multiProject ? "**/" : ""}*.nupkg`,
      options,
    );
  }
  let pkgList = [];
  const parentDependsOn = new Set();
  if (nupkgFiles.length && projAssetsFiles.length === 0) {
    manifestFiles = manifestFiles.concat(nupkgFiles);
    // When parsing nupkg files, only version ranges will be specified under dependencies
    // To resolve the version, we need to track the mapping between name and resolved versions here
    let dependenciesMap = {};
    const pkgNameVersions = {};
    for (const nf of nupkgFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${nf}`);
      }
      const retMap = await parseNupkg(nf);
      if (retMap?.pkgList.length) {
        pkgList = pkgList.concat(retMap.pkgList);
        for (const d of retMap.pkgList) {
          parentDependsOn.add(d["bom-ref"]);
          pkgNameVersions[d.name] = d.version;
        }
      }
      if (retMap?.dependenciesMap) {
        dependenciesMap = { ...dependenciesMap, ...retMap.dependenciesMap };
      }
    } // end for
    for (const k of Object.keys(dependenciesMap)) {
      const dependsOn = dependenciesMap[k].map(
        (p) => `pkg:nuget/${p}@${pkgNameVersions[p] || "latest"}`,
      );
      dependencies.push({ ref: k, dependsOn: [...new Set(dependsOn)].sort() });
    }
  }
  // project.assets.json parsing
  if (projAssetsFiles.length) {
    manifestFiles = manifestFiles.concat(projAssetsFiles);
    for (const af of projAssetsFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${af}`);
      }
      pkgData = readFileSync(af, { encoding: "utf-8" });
      const results = parseCsProjAssetsData(pkgData, af);
      const deps = results["dependenciesList"];
      const dlist = results["pkgList"];
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
      if (deps?.length) {
        dependencies = mergeDependencies(dependencies, deps, parentComponent);
      }
    }
    // We are now in a scenario where the restore operation didn't yield correct project.assets.json files.
    // This usually happens when restore was performed with an incorrect version of the SDK.
    if (!pkgList.length || dependencies.length < 2) {
      console.log(
        "Unable to obtain the correct dependency tree from the project.assets.json files. Ensure the correct version of the dotnet SDK was installed and used.",
      );
      console.log(
        "1. Create a global.json file in the project directory to specify the required version of the dotnet SDK.",
      );
      console.log(
        "2. Use the environment variable `DOTNET_ROLL_FORWARD` to roll forward to a closest available SDK such as .Net core or dotnet 6.",
      );
      console.log(
        "3. If the project uses the legacy .Net Framework 4.6/4.7/4.8, it might require execution on Windows.",
      );
      console.log(
        "Alternatively, try using the custom `ghcr.io/cyclonedx/cdxgen-dotnet:v11` container image, which bundles a range of dotnet SDKs.",
      );
      options.failOnError && process.exit(1);
    }
  } else if (pkgLockFiles.length) {
    manifestFiles = manifestFiles.concat(pkgLockFiles);
    // packages.lock.json from nuget
    for (const af of pkgLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${af}`);
      }
      pkgData = readFileSync(af, { encoding: "utf-8" });
      const results = parseCsPkgLockData(pkgData, af);
      const deps = results["dependenciesList"];
      const dlist = results["pkgList"];
      const rootList = results["rootList"];
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
      if (deps?.length) {
        dependencies = mergeDependencies(dependencies, deps, parentComponent);
      }
      // Keep track of the direct dependencies so that we can construct one complete
      // list after processing all lock files
      if (rootList?.length) {
        for (const p of rootList) {
          parentDependsOn.add(p["bom-ref"]);
        }
      }
    }
  } else if (pkgConfigFiles.length) {
    manifestFiles = manifestFiles.concat(pkgConfigFiles);
    // packages.config parsing
    for (const f of pkgConfigFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      pkgData = readFileSync(f, { encoding: "utf-8" });
      const dlist = parseCsPkgData(pkgData, f);
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
        for (const d of dlist) {
          parentDependsOn.add(d["bom-ref"]);
        }
      }
    }
  }
  if (paketLockFiles.length) {
    manifestFiles = manifestFiles.concat(paketLockFiles);
    // paket.lock parsing
    for (const f of paketLockFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      pkgData = readFileSync(f, { encoding: "utf-8" });
      const results = parsePaketLockData(pkgData, f);
      const dlist = results.pkgList;
      const deps = results.dependenciesList;
      if (dlist?.length) {
        pkgList = pkgList.concat(dlist);
      }
      if (deps?.length) {
        dependencies = mergeDependencies(dependencies, deps, parentComponent);
      }
    }
  }
  if (
    options.projectType?.includes("dotnet-framework") ||
    (!pkgList.length && csProjFiles.length && !nupkgFiles.length)
  ) {
    manifestFiles = manifestFiles.concat(csProjFiles);
    // Parsing csproj is quite error prone. Some project files may not have versions specified
    // To work around this, we make use of the version from the existing list
    const pkgNameVersions = {};
    for (const p of pkgList) {
      if (p.version) {
        pkgNameVersions[p.name] = p.version;
      }
    }
    // .csproj parsing
    for (const f of csProjFiles) {
      if (DEBUG_MODE) {
        console.log(`Parsing ${f}`);
      }
      const csProjData = readFileSync(f, { encoding: "utf-8" });
      const retMap = parseCsProjData(csProjData, f, pkgNameVersions);
      if (retMap?.parentComponent?.purl) {
        // If there are multiple project files, track the parent components using nested components
        if (csProjFiles.length > 1) {
          if (!parentComponent.components) {
            parentComponent.components = [];
          }
          parentComponent.components.push(retMap.parentComponent);
        } else {
          // There is only one project file. Make it the parent.
          parentComponent = retMap.parentComponent;
        }
      }
      if (retMap?.pkgList?.length) {
        pkgList = pkgList.concat(retMap.pkgList);
      }
      if (retMap.dependencies?.length) {
        dependencies = mergeDependencies(
          dependencies,
          retMap.dependencies,
          parentComponent,
        );
      }
    }
    if (pkgList.length && !options.projectType?.includes("dotnet-framework")) {
      console.log(
        `Found ${pkgList.length} components by parsing the ${csProjFiles.length} csproj files. The resulting SBOM will be incomplete.`,
      );
      options.failOnError && process.exit(1);
    }
  }
  if (pkgList.length) {
    pkgList = trimComponents(pkgList);
    // Perform deep analysis using dosai
    if (options.deep) {
      const slicesFile = resolve(
        options.depsSlicesFile || join(tmpdir(), "dosai.json"),
      );
      // Create the slices file if it doesn't exist
      if (!existsSync(slicesFile)) {
        const sliceResult = getDotnetSlices(resolve(path), resolve(slicesFile));
        if (!sliceResult && DEBUG_MODE) {
          console.log(
            "Slicing with dosai was unsuccessful. Check the errors reported in the logs above.",
          );
        }
      }
      pkgList = addEvidenceForDotnet(pkgList, slicesFile, options);
    }
  }
  // Parent dependency tree
  if (parentDependsOn.size && parentComponent && parentComponent["bom-ref"]) {
    dependencies.splice(0, 0, {
      ref: parentComponent["bom-ref"],
      dependsOn: Array.from(parentDependsOn).sort(),
    });
  }
  if (shouldFetchLicense()) {
    const retMap = await getNugetMetadata(pkgList, dependencies);
    if (retMap.dependencies?.length) {
      dependencies = mergeDependencies(
        dependencies,
        retMap.dependencies,
        parentComponent,
      );
    }
    pkgList = trimComponents(pkgList);
  }
  return buildBomNSData(options, pkgList, "nuget", {
    src: path,
    filename: manifestFiles.join(", "),
    dependencies,
    parentComponent,
  });
}

/**
 * Function to create bom object for cryptographic certificate files
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createCryptoCertsBom(path, options) {
  const pkgList = [];
  const certFiles = getAllFiles(
    path,
    `${
      options.multiProject ? "**/" : ""
    }*.{p12,jks,jceks,bks,keystore,key,pem,cer,gpg,pub}`,
    options,
  );
  for (const f of certFiles) {
    const name = basename(f);
    const fileHash = await checksumFile("sha256", f);
    const apkg = {
      name,
      type: "cryptographic-asset",
      version: fileHash,
      "bom-ref": `crypto/certificate/${name}@sha256:${fileHash}`,
      cryptoProperties: {
        assetType: "certificate",
        algorithmProperties: {
          executionEnvironment: "unknown",
          implementationPlatform: "unknown",
        },
      },
      properties: [{ name: "SrcFile", value: f }],
    };
    pkgList.push(apkg);
  }
  return {
    bomJson: {
      components: pkgList,
    },
  };
}

export function mergeDependencies(
  dependencies,
  newDependencies,
  parentComponent = {},
) {
  if (!parentComponent && DEBUG_MODE) {
    console.log(
      "Unable to determine parent component. Dependencies will be flattened.",
    );
  }
  let providesFound = false;
  const deps_map = {};
  const provides_map = {};
  const parentRef = parentComponent?.["bom-ref"]
    ? parentComponent["bom-ref"]
    : undefined;
  const combinedDeps = dependencies.concat(newDependencies || []);
  for (const adep of combinedDeps) {
    if (!deps_map[adep.ref]) {
      deps_map[adep.ref] = new Set();
    }
    if (!provides_map[adep.ref]) {
      provides_map[adep.ref] = new Set();
    }
    if (adep["dependsOn"]) {
      for (const eachDepends of adep["dependsOn"]) {
        if (parentRef) {
          if (eachDepends.toLowerCase() !== parentRef.toLowerCase()) {
            deps_map[adep.ref].add(eachDepends);
          }
        } else {
          deps_map[adep.ref].add(eachDepends);
        }
      }
    }
    if (adep["provides"]) {
      providesFound = true;
      for (const eachProvides of adep["provides"]) {
        if (
          parentRef &&
          eachProvides.toLowerCase() !== parentRef.toLowerCase()
        ) {
          provides_map[adep.ref].add(eachProvides);
        }
      }
    }
  }
  const retlist = [];
  for (const akey of Object.keys(deps_map)) {
    if (providesFound) {
      retlist.push({
        ref: akey,
        dependsOn: Array.from(deps_map[akey]).sort(),
        provides: Array.from(provides_map[akey]).sort(),
      });
    } else {
      retlist.push({
        ref: akey,
        dependsOn: Array.from(deps_map[akey]).sort(),
      });
    }
  }
  return retlist;
}

/**
 * Trim duplicate components by retaining all the properties
 *
 * @param {Array} components Components
 *
 * @returns {Array} Filtered components
 */
export function trimComponents(components) {
  const keyCache = {};
  const filteredComponents = [];
  for (const comp of components) {
    const key = comp.purl || comp["bom-ref"] || comp.name + comp.version;
    if (!keyCache[key]) {
      keyCache[key] = comp;
    } else {
      const existingComponent = keyCache[key];
      // We need to retain any properties that differ
      if (comp.properties) {
        if (existingComponent.properties) {
          for (const newprop of comp.properties) {
            if (
              !existingComponent.properties.find(
                (prop) =>
                  prop.name === newprop.name && prop.value === newprop.value,
              )
            ) {
              existingComponent.properties.push(newprop);
            }
          }
        } else {
          existingComponent.properties = comp.properties;
        }
      }
      // If the component is required in any of the child projects, then make it required
      if (
        existingComponent?.scope !== "required" &&
        comp?.scope === "required"
      ) {
        existingComponent.scope = "required";
      }
    }
  }
  for (const akey of Object.keys(keyCache)) {
    filteredComponents.push(keyCache[akey]);
  }
  return filteredComponents;
}

/**
 * Dedupe components
 *
 * @param {Object} options Options
 * @param {Array} components Components
 * @param {Object} parentComponent Parent component
 * @param {Array} dependencies Dependencies
 *
 * @returns {Object} Object including BOM Json
 */
export function dedupeBom(options, components, parentComponent, dependencies) {
  if (!components) {
    return {};
  }
  if (!dependencies) {
    dependencies = [];
  }
  components = trimComponents(components);
  if (DEBUG_MODE) {
    console.log(
      `Obtained ${components.length} components and ${dependencies.length} dependencies after dedupe.`,
    );
  }
  const serialNum = `urn:uuid:${uuidv4()}`;
  return {
    options,
    parentComponent,
    components,
    bomJson: {
      bomFormat: "CycloneDX",
      specVersion: `${options.specVersion || 1.5}`,
      serialNumber: serialNum,
      version: 1,
      metadata: addMetadata(parentComponent, options, {}),
      components,
      services: options.services || [],
      dependencies,
    },
  };
}

/**
 * Function to create bom string for all languages
 *
 * @param {string[]} pathList list of to the project
 * @param {Object} options Parse options from the cli
 */
export async function createMultiXBom(pathList, options) {
  let components = [];
  let dependencies = [];
  let bomData = undefined;
  let parentComponent = determineParentComponent(options) || {};
  let parentSubComponents = [];
  options.createMultiXBom = true;
  // Convert single path to an array
  if (!Array.isArray(pathList)) {
    pathList = pathList.split(",");
  }
  if (
    options.projectType &&
    hasAnyProjectType(["oci"], options, false) &&
    options.allLayersExplodedDir
  ) {
    const { osPackages, dependenciesList, allTypes } = getOSPackages(
      options.allLayersExplodedDir,
    );
    if (DEBUG_MODE) {
      console.log(
        `Found ${osPackages.length} OS packages at ${options.allLayersExplodedDir}`,
      );
    }
    if (allTypes?.length) {
      options.allOSComponentTypes = allTypes;
    }
    components = components.concat(osPackages);
    if (dependenciesList?.length) {
      dependencies = dependencies.concat(dependenciesList);
    }
    if (parentComponent && Object.keys(parentComponent).length) {
      // Make the parent oci image depend on all os components
      const parentDependsOn = new Set(osPackages.map((p) => p["bom-ref"]));
      dependencies.splice(0, 0, {
        ref: parentComponent["bom-ref"],
        dependsOn: Array.from(parentDependsOn).sort(),
      });
    }
  }
  if (hasAnyProjectType(["os"], options, false) && options.bomData) {
    bomData = options.bomData;
    if (bomData?.bomJson?.components) {
      if (DEBUG_MODE) {
        console.log(`Found ${bomData.bomJson.components.length} OS components`);
      }
      components = components.concat(bomData.bomJson.components);
    }
  }
  for (const path of pathList) {
    if (DEBUG_MODE) {
      console.log("Scanning", path);
    }
    // Node.js
    if (hasAnyProjectType(["oci", "js"], options)) {
      bomData = await createNodejsBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} npm packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
        // Retain metadata.component.components
        if (bomData.parentComponent.components?.length) {
          parentSubComponents = parentSubComponents.concat(
            bomData.parentComponent.components,
          );
        }
      }
    }
    // Java
    if (hasAnyProjectType(["oci", "java"], options)) {
      bomData = await createJavaBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} java packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
        // Retain metadata.component.components
        if (bomData.parentComponent.components?.length) {
          parentSubComponents = parentSubComponents.concat(
            bomData.parentComponent.components,
          );
        }
      }
    }
    if (hasAnyProjectType(["oci", "py"], options)) {
      bomData = await createPythonBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} python packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "go"], options)) {
      bomData = await createGoBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} go packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "rust"], options)) {
      bomData = await createRustBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} rust packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
        // Retain metadata.component.components
        if (bomData.parentComponent?.components?.length) {
          parentSubComponents = parentSubComponents.concat(
            bomData.parentComponent.components,
          );
        }
      }
    }
    if (hasAnyProjectType(["oci", "php"], options)) {
      bomData = createPHPBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} php packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "ruby"], options)) {
      bomData = await createRubyBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} ruby packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = mergeDependencies(
          dependencies,
          bomData.bomJson.dependencies,
          bomData.parentComponent,
        );
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "csharp"], options)) {
      bomData = await createCsharpBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} csharp packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "dart"], options)) {
      bomData = await createDartBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} pub packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "haskell"], options)) {
      bomData = createHaskellBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} hackage packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "elixir"], options)) {
      bomData = createElixirBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} mix packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "c"], options)) {
      bomData = createCppBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} cpp packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "clojure"], options)) {
      bomData = createClojureBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} clojure packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "github"], options)) {
      bomData = createGitHubBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} GitHub action packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "cloudbuild"], options)) {
      bomData = createCloudBuildBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} CloudBuild configuration at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "swift"], options)) {
      bomData = await createSwiftBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} Swift packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    if (hasAnyProjectType(["oci", "jar", "war", "ear"], options)) {
      bomData = await createJarBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} jar packages at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
        dependencies = dependencies.concat(bomData.bomJson.dependencies);
        if (
          bomData.parentComponent &&
          Object.keys(bomData.parentComponent).length
        ) {
          parentSubComponents.push(bomData.parentComponent);
        }
      }
    }
    // Collect any crypto keys
    if (options.specVersion >= 1.6 && options.includeCrypto) {
      bomData = await createCryptoCertsBom(path, options);
      if (bomData?.bomJson?.components?.length) {
        if (DEBUG_MODE) {
          console.log(
            `Found ${bomData.bomJson.components.length} crypto assets at ${path}`,
          );
        }
        components = components.concat(bomData.bomJson.components);
      }
    }
  } // for
  if (
    options.lastWorkingDir &&
    options.lastWorkingDir !== "" &&
    !options.lastWorkingDir.includes("/opt/") &&
    !options.lastWorkingDir.includes("/home/")
  ) {
    bomData = createJarBom(options.lastWorkingDir, options);
    if (bomData?.bomJson?.components?.length) {
      if (DEBUG_MODE) {
        console.log(
          `Found ${bomData.bomJson.components.length} jar packages at ${options.lastWorkingDir}`,
        );
      }
      components = components.concat(bomData.bomJson.components);
      dependencies = dependencies.concat(bomData.bomJson.dependencies);
      if (
        bomData.parentComponent &&
        Object.keys(bomData.parentComponent).length
      ) {
        parentSubComponents.push(bomData.parentComponent);
      }
    }
  }
  // Retain the components of parent component
  if (parentSubComponents.length) {
    if (!parentComponent || !Object.keys(parentComponent).length) {
      parentComponent = parentSubComponents[0];
    }
    // Our naive approach to appending to sub-components could result in same parent being included as a child
    // This is filtered out here
    parentSubComponents = parentSubComponents.filter(
      (c) => c["bom-ref"] !== parentComponent["bom-ref"],
    );
    parentComponent.components = trimComponents(parentSubComponents);
    if (
      parentComponent.components.length === 1 &&
      parentComponent.components[0].name === parentComponent.name &&
      !parentComponent.purl.startsWith("pkg:container")
    ) {
      parentComponent = parentComponent.components[0];
      delete parentComponent.components;
    }
  }
  // some cleanup, but not complete
  for (const path of pathList) {
    if (path.startsWith(join(tmpdir(), "docker-images-"))) {
      if (rmSync) {
        rmSync(path, { recursive: true, force: true });
      }
    }
  }
  return dedupeBom(options, components, parentComponent, dependencies);
}

/**
 * Function to create bom string for various languages
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createXBom(path, options) {
  try {
    accessSync(path, constants.R_OK);
  } catch (err) {
    return undefined;
  }
  // node.js - package.json
  if (
    existsSync(join(path, "package.json")) ||
    existsSync(join(path, "rush.json")) ||
    existsSync(join(path, "yarn.lock"))
  ) {
    return await createNodejsBom(path, options);
  }
  // maven - pom.xml
  const pomFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}pom.xml`,
    options,
  );
  // gradle
  const gradleFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}build.gradle*`,
    options,
  );
  // scala sbt
  const sbtFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}{build.sbt,Build.scala}*`,
    options,
  );
  if (pomFiles.length || gradleFiles.length || sbtFiles.length) {
    return await createJavaBom(path, options);
  }
  // python
  const pipenvMode = existsSync(join(path, "Pipfile"));
  const poetryMode = existsSync(join(path, "poetry.lock"));
  const pyProjectMode = !poetryMode && existsSync(join(path, "pyproject.toml"));
  const setupPyMode = existsSync(join(path, "setup.py"));
  if (pipenvMode || poetryMode || pyProjectMode || setupPyMode) {
    return await createPythonBom(path, options);
  }
  const reqFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*requirements*.txt`,
    options,
  );
  const reqDirFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}requirements/*.txt`,
    options,
  );
  const requirementsMode = reqFiles?.length || reqDirFiles?.length;
  const whlFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.whl`,
    options,
  );
  if (requirementsMode || whlFiles.length) {
    return await createPythonBom(path, options);
  }
  // go
  const gosumFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}go.sum`,
    options,
  );
  const gomodFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}go.mod`,
    options,
  );
  const gopkgLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Gopkg.lock`,
    options,
  );
  if (gomodFiles.length || gosumFiles.length || gopkgLockFiles.length) {
    return await createGoBom(path, options);
  }

  // rust
  const cargoLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Cargo.lock`,
    options,
  );
  const cargoFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Cargo.toml`,
    options,
  );
  if (cargoLockFiles.length || cargoFiles.length) {
    return await createRustBom(path, options);
  }

  // php
  const composerJsonFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}composer.json`,
    options,
  );
  const composerLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}composer.lock`,
    options,
  );
  if (composerJsonFiles.length || composerLockFiles.length) {
    return createPHPBom(path, options);
  }

  // Ruby
  const gemFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Gemfile`,
    options,
  );
  const gemLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Gemfile*.lock`,
    options,
  );
  if (gemFiles.length || gemLockFiles.length) {
    return await createRubyBom(path, options);
  }

  // .Net
  let csProjFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.csproj`,
    options,
  );
  csProjFiles = csProjFiles.concat(
    getAllFiles(path, `${options.multiProject ? "**/" : ""}*.vbproj`, options),
  );
  csProjFiles = csProjFiles.concat(
    getAllFiles(path, `${options.multiProject ? "**/" : ""}*.fsproj`, options),
  );
  if (csProjFiles.length) {
    return await createCsharpBom(path, options);
  }

  // Dart
  const pubFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}pubspec.lock`,
    options,
  );
  const pubSpecFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}pubspec.yaml`,
    options,
  );
  if (pubFiles.length || pubSpecFiles.length) {
    return await createDartBom(path, options);
  }

  // Haskell
  const hackageFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}cabal.project.freeze`,
    options,
  );
  if (hackageFiles.length) {
    return createHaskellBom(path, options);
  }

  // Elixir
  const mixFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}mix.lock`,
    options,
  );
  if (mixFiles.length) {
    return createElixirBom(path, options);
  }

  // cpp
  const conanLockFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}conan.lock`,
    options,
  );
  const conanFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}conanfile.txt`,
    options,
  );
  const cmakeListFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}CMakeLists.txt`,
    options,
  );
  const mesonBuildFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}meson.build`,
    options,
  );
  if (
    conanLockFiles.length ||
    conanFiles.length ||
    cmakeListFiles.length ||
    mesonBuildFiles.length
  ) {
    return createCppBom(path, options);
  }

  // clojure
  const ednFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}deps.edn`,
    options,
  );
  const leinFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}project.clj`,
    options,
  );
  if (ednFiles.length || leinFiles.length) {
    return createClojureBom(path, options);
  }

  // GitHub actions
  const ghactionFiles = getAllFiles(
    path,
    ".github/workflows/" + "*.yml",
    options,
  );
  if (ghactionFiles.length) {
    return createGitHubBom(path, options);
  }

  // Jenkins plugins
  const hpiFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*.hpi`,
    options,
  );
  if (hpiFiles.length) {
    return await createJenkinsBom(path, options);
  }

  // Helm charts
  const chartFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Chart.yaml`,
    options,
  );
  const yamlFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}values.yaml`,
    options,
  );
  if (chartFiles.length || yamlFiles.length) {
    return createHelmBom(path, options);
  }

  // Docker compose, dockerfile, containerfile, kubernetes and skaffold
  const dcFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}docker-compose*.yml`,
    options,
  );
  const dfFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*Dockerfile*`,
    options,
  );
  const cfFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}*Containerfile*`,
    options,
  );
  const skFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}skaffold.yaml`,
    options,
  );
  const deplFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}deployment.yaml`,
    options,
  );
  if (
    dcFiles.length ||
    dfFiles.length ||
    cfFiles.length ||
    skFiles.length ||
    deplFiles.length
  ) {
    return await createContainerSpecLikeBom(path, options);
  }

  // Google CloudBuild
  const cbFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}cloudbuild.yaml`,
    options,
  );
  if (cbFiles.length) {
    return createCloudBuildBom(path, options);
  }

  // Swift
  const swiftFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Package*.swift`,
    options,
  );
  const pkgResolvedFiles = getAllFiles(
    path,
    `${options.multiProject ? "**/" : ""}Package.resolved`,
    options,
  );
  if (swiftFiles.length || pkgResolvedFiles.length) {
    return await createSwiftBom(path, options);
  }
}

/**
 * Function to create bom string for various languages
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 */
export async function createBom(path, options) {
  let { projectType } = options;
  if (!projectType) {
    projectType = [];
  }
  let exportData = undefined;
  let isContainerMode = false;
  // Docker and image archive support
  // TODO: Support any source archive
  if (path.endsWith(".tar") || path.endsWith(".tar.gz")) {
    exportData = await exportArchive(path);
    if (!exportData) {
      console.log(
        `OS BOM generation has failed due to problems with exporting the image ${path}`,
      );
      return {};
    }
    isContainerMode = true;
  } else if (
    (options.projectType &&
      !options.projectType?.includes("universal") &&
      hasAnyProjectType(["oci"], options, false)) ||
    path.startsWith("docker.io") ||
    path.startsWith("quay.io") ||
    path.startsWith("ghcr.io") ||
    path.startsWith("mcr.microsoft.com") ||
    path.includes("@sha256") ||
    path.includes(":latest")
  ) {
    exportData = await exportImage(path);
    if (exportData) {
      isContainerMode = true;
    } else {
      if (DEBUG_MODE) {
        console.log(path, "doesn't appear to be a valid container image.");
      }
    }
  } else if (
    !options.projectType?.includes("universal") &&
    hasAnyProjectType(["oci-dir"], options, false)
  ) {
    isContainerMode = true;
    exportData = {
      inspectData: undefined,
      lastWorkingDir: "",
      allLayersDir: path,
      allLayersExplodedDir: path,
    };
    if (existsSync(join(path, "all-layers"))) {
      exportData.allLayersDir = join(path, "all-layers");
    }
    exportData.pkgPathList = getPkgPathList(exportData, undefined);
  }
  if (isContainerMode) {
    options.multiProject = true;
    options.installDeps = false;
    // Force the project type to oci
    options.projectType = ["oci"];
    // Pass the original path
    options.path = path;
    options.parentComponent = {};
    // Create parent component based on the inspect config
    const inspectData = exportData?.inspectData;
    if (
      inspectData?.RepoDigests &&
      inspectData.RepoTags &&
      Array.isArray(inspectData.RepoDigests) &&
      Array.isArray(inspectData.RepoTags) &&
      inspectData.RepoDigests.length &&
      inspectData.RepoTags.length
    ) {
      const repoTag = inspectData.RepoTags[0];
      if (repoTag) {
        const tmpA = repoTag.split(":");
        if (tmpA && tmpA.length === 2) {
          options.parentComponent = {
            name: tmpA[0],
            version: tmpA[1],
            type: "container",
            purl: `pkg:oci/${inspectData.RepoDigests[0]}`,
            _integrity: inspectData.RepoDigests[0].replace(
              "sha256:",
              "sha256-",
            ),
          };
          options.parentComponent["bom-ref"] = decodeURIComponent(
            options.parentComponent.purl,
          );
        }
      } else if (inspectData.Id) {
        options.parentComponent = {
          name: inspectData.RepoDigests[0].split("@")[0],
          version: inspectData.RepoDigests[0]
            .split("@")[1]
            .replace("sha256:", ""),
          type: "container",
          purl: `pkg:oci/${inspectData.RepoDigests[0]}`,
          _integrity: inspectData.RepoDigests[0].replace("sha256:", "sha256-"),
        };
        options.parentComponent["bom-ref"] = decodeURIComponent(
          options.parentComponent.purl,
        );
      }
    } else {
      options.parentComponent = createDefaultParentComponent(
        path,
        "container",
        options,
      );
    }
    // Pass the entire export data about the image layers
    options.exportData = exportData;
    options.lastWorkingDir = exportData?.lastWorkingDir;
    options.allLayersExplodedDir = exportData?.allLayersExplodedDir;
    return await createMultiXBom(
      [...new Set(exportData?.pkgPathList)],
      options,
    );
  }
  if (path.endsWith(".war")) {
    projectType = ["java"];
  }
  if (projectType.length > 1) {
    console.log("Generate BOM for project types:", projectType.join(", "));
    return await createMultiXBom(path, options);
  }
  // Use the project type alias to return any singular BOM
  if (PROJECT_TYPE_ALIASES["java"].includes(projectType[0])) {
    return await createJavaBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["android"].includes(projectType[0])) {
    return createAndroidBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["js"].includes(projectType[0])) {
    return await createNodejsBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["py"].includes(projectType[0])) {
    return await createPythonBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["go"].includes(projectType[0])) {
    return await createGoBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["rust"].includes(projectType[0])) {
    return await createRustBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["php"].includes(projectType[0])) {
    return createPHPBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["ruby"].includes(projectType[0])) {
    return await createRubyBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["csharp"].includes(projectType[0])) {
    return await createCsharpBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["dart"].includes(projectType[0])) {
    return await createDartBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["haskell"].includes(projectType[0])) {
    return createHaskellBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["elixir"].includes(projectType[0])) {
    return createElixirBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["c"].includes(projectType[0])) {
    return createCppBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["clojure"].includes(projectType[0])) {
    return createClojureBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["github"].includes(projectType[0])) {
    return createGitHubBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["os"].includes(projectType[0])) {
    return await createOSBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["jenkins"].includes(projectType[0])) {
    return await createJenkinsBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["helm"].includes(projectType[0])) {
    return createHelmBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["helm-index"].includes(projectType[0])) {
    return createHelmBom(
      join(homedir(), ".cache", "helm", "repository"),
      options,
    );
  }
  if (PROJECT_TYPE_ALIASES["universal"].includes(projectType[0])) {
    return await createContainerSpecLikeBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["cloudbuild"].includes(projectType[0])) {
    return createCloudBuildBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["swift"].includes(projectType[0])) {
    return await createSwiftBom(path, options);
  }
  if (PROJECT_TYPE_ALIASES["binary"].includes(projectType[0])) {
    return createBinaryBom(path, options);
  }
  switch (projectType[0]) {
    case "jar":
      return createJarBom(path, options);
    case "gradle-index":
    case "gradle-cache":
      options.useGradleCache = true;
      return createJarBom(GRADLE_CACHE_DIR, options);
    case "sbt-index":
    case "sbt-cache":
      options.useSbtCache = true;
      return createJarBom(SBT_CACHE_DIR, options);
    case "maven-index":
    case "maven-cache":
    case "maven-repo":
      options.useMavenCache = true;
      return createJarBom(
        process.env.MAVEN_CACHE_DIR || join(homedir(), ".m2", "repository"),
        options,
      );
    default:
      // In recurse mode return multi-language Bom
      // https://github.com/cyclonedx/cdxgen/issues/95
      if (options.multiProject) {
        return await createMultiXBom(path, options);
      }
      return await createXBom(path, options);
  }
}

/**
 * Method to submit the generated bom to dependency-track or cyclonedx server
 *
 * @param {Object} args CLI args
 * @param {Object} bomContents BOM Json
 * @return {Promise<{ token: string } | { errors: string[] } | undefined>} a promise with a token (if request was successful), a body with errors (if request failed) or undefined (in case of invalid arguments)
 */
export async function submitBom(args, bomContents) {
  const serverUrl = `${args.serverUrl.replace(/\/$/, "")}/api/v1/bom`;
  let encodedBomContents = Buffer.from(JSON.stringify(bomContents)).toString(
    "base64",
  );
  if (encodedBomContents.startsWith("77u/")) {
    encodedBomContents = encodedBomContents.substring(4);
  }
  const bomPayload = {
    autoCreate: "true",
    bom: encodedBomContents,
  };
  const projectVersion = args.projectVersion || "master";
  if (
    typeof args.projectId !== "undefined" ||
    (typeof args.projectName !== "undefined" &&
      typeof projectVersion !== "undefined")
  ) {
    if (typeof args.projectId !== "undefined") {
      bomPayload.project = args.projectId;
    }
    if (typeof args.projectName !== "undefined") {
      bomPayload.projectName = args.projectName;
    }
    if (typeof projectVersion !== "undefined") {
      bomPayload.projectVersion = projectVersion;
    }
  } else {
    console.log(
      "projectId, projectName and projectVersion, or all three must be provided.",
    );
    return;
  }
  if (
    typeof args.parentProjectId !== "undefined" ||
    typeof args.parentUUID !== "undefined"
  ) {
    bomPayload.parentUUID = args.parentProjectId || args.parentUUID;
  }
  if (DEBUG_MODE) {
    console.log(
      "Submitting BOM to",
      serverUrl,
      "params",
      args.projectName,
      projectVersion,
    );
  }
  try {
    if (DEBUG_MODE && args.skipDtTlsCheck) {
      console.log(
        "Calling ",
        serverUrl,
        "with --skip-dt-tls-check argument: Skip DT TLS check.",
      );
    }
    return await got(serverUrl, {
      method: "PUT",
      https: {
        rejectUnauthorized: !args.skipDtTlsCheck,
      },
      headers: {
        "X-Api-Key": args.apiKey,
        "Content-Type": "application/json",
        "user-agent": `@CycloneDX/cdxgen ${_version}`,
      },
      json: bomPayload,
      responseType: "json",
    }).json();
  } catch (error) {
    if (error.response && error.response.statusCode === 401) {
      // Unauthorized
      console.log(
        "Received Unauthorized error. Check the API key used is valid and has necessary permissions to create projects and upload bom.",
      );
    } else if (error.response && error.response.statusCode === 405) {
      console.log(
        "Method PUT not allowed on Dependency-Track server. Trying with POST ...",
      );
      // Method not allowed errors
      try {
        return await got(serverUrl, {
          method: "POST",
          https: {
            rejectUnauthorized: !args.skipDtTlsCheck,
          },
          headers: {
            "X-Api-Key": args.apiKey,
            "Content-Type": "application/json",
            "user-agent": `@CycloneDX/cdxgen ${_version}`,
          },
          json: bomPayload,
          responseType: "json",
        }).json();
      } catch (error) {
        if (DEBUG_MODE) {
          console.log(
            "Unable to submit the SBOM to the Dependency-Track server using POST method",
            error,
          );
        } else {
          console.log(
            "Unable to submit the SBOM to the Dependency-Track server using POST method",
          );
        }
      }
    } else {
      if (DEBUG_MODE) {
        console.log(
          "Unable to submit the SBOM to the Dependency-Track server using POST method",
          error,
        );
      } else {
        console.log("Unable to submit the SBOM to the Dependency-Track server");
      }
    }
    return error.response?.body;
  }
}
