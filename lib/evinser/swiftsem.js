import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import process from "node:process";
import { runSwiftCommand } from "../helpers/envcontext.js";
import { DEBUG_MODE, getAllFiles } from "../helpers/utils.js";
import { executeSourcekitten } from "../managers/binary.js";

// Swift entity kinds
// https://github.com/swiftlang/swift/blob/main/tools/SourceKit/docs/SwiftSupport.txt
const SWIFT_ENTITY_KINDS = {
  IMPORT_CLANG: "source.lang.swift.import.module.clang",
  IMPORT_SWIFT: "source.lang.swift.import.module.swift",
  IMPORT_SOURCE: "source.lang.swift.import.sourcefile",
  DECL_EXTN_STRUCT: "source.lang.swift.decl.extension.struct",
  DECL_EXTN_CLASS: "source.lang.swift.decl.extension.class",
  DECL_EXTN_ENUM: "source.lang.swift.decl.extension.enum",
  DECL_FREE: "source.lang.swift.decl.function.free",
  REF_FREE: "source.lang.swift.ref.function.free",
  DECL_METHOD_INSTANCE: "source.lang.swift.decl.function.method.instance",
  REF_METHOD_INSTANCE: "source.lang.swift.ref.function.method.instance",
  DECL_METHOD_STATIC: "source.lang.swift.decl.function.method.static",
  REF_METHOD_STATIC: "source.lang.swift.ref.function.method.static",
  DECL_CONSTRUCTOR: "source.lang.swift.decl.function.constructor",
  REF_CONSTRUCTOR: "source.lang.swift.ref.function.constructor",
  DECL_DESTRUCTOR: "source.lang.swift.decl.function.destructor",
  REF_DESTRUCTOR: "source.lang.swift.ref.function.destructor",
  DECL_OPERATOR: "source.lang.swift.decl.function.operator",
  REF_OPERATOR: "source.lang.swift.ref.function.operator",
  DECL_SUBSCRIPT: "source.lang.swift.decl.function.subscript",
  REF_SUBSCRIPT: "source.lang.swift.ref.function.subscript",
  DECL_GETTER: "source.lang.swift.decl.function.accessor.getter",
  REF_GETTER: "source.lang.swift.ref.function.accessor.getter",
  DECL_SETTER: "source.lang.swift.decl.function.accessor.setter",
  REF_SETTER: "source.lang.swift.ref.function.accessor.setter",
  DECL_CLASS: "source.lang.swift.decl.class",
  REF_CLASS: "source.lang.swift.ref.class",
  DECL_STRUCT: "source.lang.swift.decl.struct",
  REF_STRUCT: "source.lang.swift.ref.struct",
  DECL_ENUM: "source.lang.swift.decl.enum",
  REF_ENUM: "source.lang.swift.ref.enum",
  DECL_ENUM_ELEMENT: "source.lang.swift.decl.enumelement",
  REF_ENUM_ELEMENT: "source.lang.swift.ref.enumelement",
  DECL_PROTOCOL: "source.lang.swift.decl.protocol",
  REF_PROTOCOL: "source.lang.swift.ref.protocol",
  DECL_TYPE_ALIAS: "source.lang.swift.decl.typealias",
  REF_TYPE_ALIAS: "source.lang.swift.ref.typealias",
  DECL_VAR_GLOBAL: "source.lang.swift.decl.var.global",
  REF_VAR_GLOBAL: "source.lang.swift.ref.var.global",
  DECL_VAR_INSTANCE: "source.lang.swift.decl.var.instance",
  REF_VAR_INSTANCE: "source.lang.swift.ref.var.instance",
  DECL_VAR_STATIC: "source.lang.swift.decl.var.static",
  REF_VAR_STATIC: "source.lang.swift.ref.var.static",
  DECL_VAR_LOCAL: "source.lang.swift.decl.var.local",
  REF_VAR_LOCAL: "source.lang.swift.ref.var.local",
};

// Array of standard types that can be ignored
const IGNORABLE_TYPES = [
  "Bool",
  "Error?",
  "AnyObject",
  "()",
  "Any?",
  "Void",
  "[String]",
  "String?",
  "String",
];

/**
 * Retrieve the structure information of a .swift file in json format
 *
 * @param {String} filePath Path to .swift file
 *
 * @returns {undefined|Object} JSON representation of the swift file or undefined.
 */
export function getStructure(filePath) {
  return executeSourcekitten(["structure", "--file", filePath]);
}

/**
 * Parse the data from the structure command
 *
 * @param {Object} structureJson Json from the structure command
 * @returns {Object|undefined} Parsed value
 */
export function parseStructure(structureJson) {
  if (
    !structureJson ||
    structureJson["key.diagnostic_stage"] !==
      "source.diagnostic.stage.swift.parse" ||
    !structureJson["key.substructure"]
  ) {
    return undefined;
  }
  const metadata = {};
  const refTypes = new Set();
  collectStructureTypes(structureJson["key.substructure"], refTypes);
  if (refTypes.size) {
    metadata["referredTypes"] = Array.from(refTypes).sort();
  }
  return metadata;
}

/**
 * Recursively collect referred types from the sub-structure
 *
 * @param substructures {Object} Sub structures
 * @param refTypes {Set<String>} Identified reference types
 */
function collectStructureTypes(substructures, refTypes) {
  if (!substructures || !Array.isArray(substructures)) {
    return;
  }
  for (const asubstruct of substructures) {
    if (
      asubstruct["key.typename"] &&
      !IGNORABLE_TYPES.includes(asubstruct["key.typename"])
    ) {
      refTypes.add(asubstruct["key.typename"]);
    }
    if (asubstruct["key.inheritedtypes"]) {
      for (const inheritedType of asubstruct["key.inheritedtypes"]) {
        if (!IGNORABLE_TYPES.includes(inheritedType["key.name"])) {
          refTypes.add(inheritedType["key.name"]);
        }
      }
    }
    // Recurse
    if (asubstruct["key.substructure"]) {
      collectStructureTypes(asubstruct["key.substructure"], refTypes);
    }
  }

  if (substructures["key.substructure"]) {
    collectStructureTypes(substructures["key.substructure"], refTypes);
  }
}

/**
 * Method to perform swift build in verbose mode.
 *
 * @param {String} basePath Path
 * @returns {undefined|String} Verbose build output
 */
export function verboseBuild(basePath) {
  // Clean first
  runSwiftCommand(basePath, ["package", "clean"]);
  return runSwiftCommand(basePath, ["build", "-c", "debug", "--verbose"]);
}

/**
 * Method to parse the verbose swift build output to identify key compiler parameters.
 *
 * @param {String} buildOutput Verbose build output
 * @returns {Object} compiler build parameters
 */
export function extractCompilerParamsFromBuild(buildOutput) {
  const params = {};
  if (!buildOutput) {
    return params;
  }
  buildOutput.split("\n").forEach((l) => {
    l = l.replace("\r", "");
    if (!l.includes("swiftc") && !l.includes("-sdk")) {
      return;
    }
    const parts = l.split(" ");
    if (!parts.length) {
      return;
    }
    // Boolean arguments
    for (const arg of [
      "-parse-as-library",
      "-incremental",
      "-track-system-dependencies",
      "-suppress-remarks",
      "-suppress-warnings",
      "-enable-objc-interop",
      "-stack-check",
      "-empty-abi-descriptor",
      "-disable-clang-spi",
    ]) {
      const firstArgIndex = parts.indexOf(arg);
      if (firstArgIndex !== -1) {
        if (!params[arg]) {
          params[arg] = new Set();
        }
      }
    }
    // Some arguments need values
    for (const arg of [
      "-sdk",
      "-F",
      "-I",
      "-L",
      "-vfsoverlay",
      "-external-plugin-path",
      "-plugin-path",
    ]) {
      const firstArgIndex = parts.indexOf(arg);
      const lastArgIndex = parts.lastIndexOf(arg);
      if (firstArgIndex !== -1 && lastArgIndex !== firstArgIndex) {
        if (!params[arg]) {
          params[arg] = new Set();
        }
        params[arg].add(parts[firstArgIndex + 1]);
      }
      if (lastArgIndex !== -1 && parts.length > lastArgIndex + 1) {
        if (!params[arg]) {
          params[arg] = new Set();
        }
        params[arg].add(parts[lastArgIndex + 1]);
      }
    }
  });
  let compilerArgs = process?.env?.SWIFT_COMPILER_EXTRA_ARGS || "";
  for (const key of Object.keys(params)) {
    for (const v of Array.from(params[key])) {
      compilerArgs = `${compilerArgs} ${key} ${v}`;
    }
  }
  return { params, compilerArgs: compilerArgs.trim() };
}

/**
 * Method to index a swift file and extract metadata
 *
 * @param {String} filePath Path to .swift file
 * @param {String} compilerArgs Compiler arguments extracted from verbose build log
 * @returns {undefined|Object} metadata
 */
export function index(filePath, compilerArgs) {
  return executeSourcekitten([
    "index",
    "--file",
    filePath,
    "--",
    ...compilerArgs.split(" "),
    filePath,
  ]);
}

/**
 * Parse the data from the index command
 *
 * @param {Object} indexJson Json from the index command
 * @returns {Object|undefined} Parsed value
 */
export function parseIndex(indexJson) {
  if (!indexJson) {
    return undefined;
  }
  // Some modules can be in both swift and clang
  const swiftModules = new Set();
  const clangModules = new Set();
  collectIndexedModules(
    indexJson["key.dependencies"],
    swiftModules,
    clangModules,
  );
  // Maps the given symbols with this obfuscated version
  const obfuscatedSymbols = {};
  // Line numbers where the given symbols are found
  const symbolLocations = {};
  buildIndexedObfuscatedSymbols(
    indexJson["key.entities"],
    obfuscatedSymbols,
    symbolLocations,
  );
  return {
    swiftModules: Array.from(swiftModules).sort(),
    clangModules: Array.from(clangModules).sort(),
    obfuscatedSymbols,
    symbolLocations,
  };
}

/**
 * Recursively collect the swift and llvm modules from the index data
 *
 * @param dependencies {Array} dependencies array as per the index command
 * @param swiftModules {Set<String>} Swift modules used
 * @param clangModules {Set<String>} clang modules
 */
function collectIndexedModules(dependencies, swiftModules, clangModules) {
  for (const adep of dependencies) {
    if (adep["key.kind"] === SWIFT_ENTITY_KINDS.IMPORT_SWIFT) {
      swiftModules.add(adep["key.name"]);
    } else if (adep["key.kind"] === SWIFT_ENTITY_KINDS.IMPORT_CLANG) {
      clangModules.add(adep["key.name"]);
    }
    if (adep["key.dependencies"]) {
      collectIndexedModules(
        adep["key.dependencies"],
        swiftModules,
        clangModules,
      );
    }
  }
}

/**
 * Recursively collect the obfuscated symbols from the index data
 *
 * @param entities {Array} Entities found in the index data
 * @param obfuscatedSymbols {Object} Obfuscated symbols map
 * @param symbolLocations {Object} Symbol locations
 */
function buildIndexedObfuscatedSymbols(
  entities,
  obfuscatedSymbols,
  symbolLocations,
) {
  if (!entities) {
    return;
  }
  for (const aentity of entities) {
    if (aentity["key.name"] && aentity["key.usr"]) {
      obfuscatedSymbols[aentity["key.name"]] = aentity["key.usr"];
    }
    if (aentity["key.line"]) {
      const symbolLocationsKey = aentity["key.name"] || aentity["key.usr"];
      if (!symbolLocations[symbolLocationsKey]) {
        symbolLocations[symbolLocationsKey] = [];
      }
      if (!symbolLocations[symbolLocationsKey].includes(aentity["key.line"])) {
        symbolLocations[symbolLocationsKey].push(aentity["key.line"]);
      }
    }
    if (aentity["key.entities"]) {
      buildIndexedObfuscatedSymbols(
        aentity["key.entities"],
        obfuscatedSymbols,
        symbolLocations,
      );
    }
  }
}

/**
 * Method to execute dump-package package command.
 *
 * @param {String} basePath Path
 * @returns {undefined|Object} Output from dump-package command
 */
export function dumpPackage(basePath) {
  const cmdOutput = runSwiftCommand(basePath, ["package", "dump-package"]);
  if (!cmdOutput) {
    return undefined;
  }
  return JSON.parse(cmdOutput);
}

/**
 * Parse the data from dump-package command
 *
 * @param {Object} dumpJson Json from dump-package command
 * @returns {Object|undefined} Parsed value
 */
export function parseDumpPackage(dumpJson) {
  if (!dumpJson) {
    return undefined;
  }
  const metadata = {
    rootModule: dumpJson?.name,
    rootDir: dumpJson?.packageKind?.root,
    platforms: dumpJson?.platforms,
  };
  const rootPkgDependencies = [];
  if (dumpJson.targets) {
    for (const atarget of dumpJson.targets) {
      const ref = atarget.name.replace("+", "_");
      if (atarget.dependencies) {
        const dependsOn = atarget.dependencies
          .map((v) => v?.byName?.[0].replace("+", "_"))
          .filter((v) => v !== undefined);
        rootPkgDependencies.push({
          ref,
          dependsOn,
        });
      }
    }
  }
  metadata.dependencies = rootPkgDependencies;
  return metadata;
}

/**
 * Retrieve the module information of the swift project
 *
 * @param {String} moduleName Module name
 * @param {String} compilerArgs Compiler arguments extracted from verbose build log
 * @returns {undefined|Object} JSON representation of the swift module or undefined.
 */
export function moduleInfo(moduleName, compilerArgs) {
  return executeSourcekitten([
    "module-info",
    "--module",
    moduleName,
    "--",
    ...compilerArgs.split(" "),
  ]);
}

/**
 * Parse the data from module-info command to replicate the swift interface
 *
 * @param {Object} moduleInfoJson Json from module-info command
 * @returns {Object|undefined} Parsed classes, protocols, enums and their functions
 */
export function parseModuleInfo(moduleInfoJson) {
  if (!moduleInfoJson || !moduleInfoJson["key.annotations"]) {
    return undefined;
  }
  const classes = new Set();
  const protocols = new Set();
  const enums = new Set();
  const obfuscationMap = {};
  const classMethods = {};
  const protocolMethods = {};
  // Collect the classes, protocols and enums first
  for (const annot of moduleInfoJson["key.annotations"] || []) {
    switch (annot["key.kind"]) {
      case SWIFT_ENTITY_KINDS.REF_CLASS:
        classes.add(annot["key.name"]);
        break;
      case SWIFT_ENTITY_KINDS.REF_PROTOCOL:
        protocols.add(annot["key.name"]);
        break;
      case SWIFT_ENTITY_KINDS.REF_ENUM:
        enums.add(annot["key.name"]);
        break;
    }
    // Build the obfuscation map
    if (
      [
        SWIFT_ENTITY_KINDS.REF_CLASS,
        SWIFT_ENTITY_KINDS.REF_PROTOCOL,
        SWIFT_ENTITY_KINDS.REF_ENUM,
      ].includes(annot["key.kind"])
    ) {
      obfuscationMap[annot["key.name"]] = annot["key.usr"];
    }
  }
  // Collect the class and protocol functions
  for (const aentity of moduleInfoJson["key.entities"] || []) {
    if (
      aentity["key.entities"] &&
      [
        SWIFT_ENTITY_KINDS.DECL_CLASS,
        SWIFT_ENTITY_KINDS.DECL_PROTOCOL,
      ].includes(aentity["key.kind"])
    ) {
      for (const centities of aentity["key.entities"] || []) {
        if (
          [SWIFT_ENTITY_KINDS.DECL_METHOD_INSTANCE].includes(
            centities["key.kind"],
          )
        ) {
          switch (aentity["key.kind"]) {
            case SWIFT_ENTITY_KINDS.DECL_CLASS:
              if (!classMethods[aentity["key.name"]]) {
                classMethods[aentity["key.name"]] = [];
              }
              classMethods[aentity["key.name"]].push(centities["key.name"]);
              break;
            case SWIFT_ENTITY_KINDS.DECL_PROTOCOL:
              if (!protocolMethods[aentity["key.name"]]) {
                protocolMethods[aentity["key.name"]] = [];
              }
              protocolMethods[aentity["key.name"]].push(centities["key.name"]);
              break;
          }
          obfuscationMap[centities["key.name"]] = centities["key.usr"];
        }
      }
    }
  }
  // Collect the imported modules
  const importedModules = moduleInfoJson?.["key.sourcetext"]
    .split("\n")
    .filter((l) => l.startsWith("import "))
    .map((l) => l.replace("\r", "").replace("import ", ""))
    .sort();
  return {
    classes: Array.from(classes).sort(),
    protocols: Array.from(protocols).sort(),
    enums: Array.from(enums).sort(),
    obfuscationMap,
    classMethods,
    protocolMethods,
    importedModules,
  };
}

/**
 * Method to collect the build symbols from the output file maps generated by swift build.
 *
 * @param {String} basePath Path
 * @param {Object} options CLI options
 * @returns {Object} symbols map
 */
export function collectBuildSymbols(basePath, options) {
  const outputFileMaps = getAllFiles(
    basePath,
    ".build/**/debug/**/output-file-map.json",
    options,
  );
  const symbolsMap = {};
  for (const afilemap of outputFileMaps) {
    const metadata = parseOutputFileMap(afilemap);
    // Skip testing modules
    if (metadata.moduleName.endsWith("Tests")) {
      continue;
    }
    symbolsMap[metadata.moduleName] = metadata.moduleSymbols;
  }
  return symbolsMap;
}

/**
 * Method to parse output file map to identify the module and their symbols.
 * This list is imprecise when compared with the data from module-info command.
 *
 * @param filemap {String} File name
 * @returns {Object} parsed module metadata
 */
export function parseOutputFileMap(filemap) {
  const moduleName = basename(dirname(filemap)).replace(".build", "");
  const fileMapObj = JSON.parse(readFileSync(filemap, { encoding: "utf-8" }));
  // Module symbols could be class or protocol names
  const moduleSymbols = [];
  for (const akey of Object.keys(fileMapObj)) {
    if (akey.length) {
      const symbolName = basename(
        fileMapObj[akey]["swift-dependencies"],
      ).replace(".swiftdeps", "");
      moduleSymbols.push(symbolName.replace("+", "_"));
    }
  }
  return { moduleName, moduleSymbols };
}

/**
 * Create a precise semantics slices file for a swift project.
 *
 * @param basePath basePath Path
 * @param options options CLI options
 */
export function createSemanticsSlices(basePath, options) {
  let compilerArgs = process?.env?.SWIFT_COMPILER_ARGS;
  let sdkArgs = process?.env?.SWIFT_SDK_ARGS;
  const pkgSwiftFiles = getAllFiles(
    basePath,
    `${options.multiProject ? "**/" : ""}Package*.swift`,
    options,
  );
  if (!pkgSwiftFiles.length) {
    return undefined;
  }
  if (!compilerArgs || !sdkArgs) {
    // We begin by performing a clean verbose debug build to learn the compiler arguments needed for a successful build
    // We do this because most users would not know the compiler arguments themselves!
    // FIXME: This needs to be improved to support monorepos with multiple Package.swift files
    const paramsObj = extractCompilerParamsFromBuild(verboseBuild(basePath));
    // Our auto-detection attempt has failed.
    if (!paramsObj) {
      if (process.env?.CDXGEN_IN_CONTAINER !== "true") {
        console.log(
          "Automatic swift build has failed. Check if the appropriate version of swift is installed. Try using the cdxgen container image, which bundles the latest Swift 6 compiler.",
        );
      } else {
        console.log(
          "Automatic swift build has failed. Check if this project is compatible with Swift 5/6 that is bundled with the cdxgen container image.",
        );
      }
      return;
    }
    compilerArgs = paramsObj.compilerArgs;
    if (paramsObj?.params?.["-sdk"]) {
      sdkArgs = Array.from(paramsObj.params["-sdk"]).join(" ");
    }
    if (!sdkArgs) {
      console.log(
        "TIP: Unable to detect the swift sdk needed to build this project. Try running the swift build command to check if this project builds successfully.",
      );
      console.log(
        "Check whether the project requires xcodebuild to build. Such projects are currently unsupported.",
      );
      return;
    }
  }
  // Success we now have the compiler and sdk arguments
  if (DEBUG_MODE) {
    console.log("Detected swift compiler arguments", compilerArgs);
  }
  // Package.swift file contains useful information needed to understand the semantic context
  // Let's use the dump-package command to retriev this information in json format
  const packageMetadata = parseDumpPackage(dumpPackage(basePath));
  // Our attempt to build must have yielded some output file maps.
  // These can be used to understand the symbols offered by each of the dependency
  const buildSymbols = collectBuildSymbols(basePath, options);
  // Now let's attempt to learn about each module (internal and external) in detail
  // Information about the classes, protocols, enums, and methods exported by each module is valuable
  const moduleInfos = {};
  const allModules = new Set([
    packageMetadata.rootModule,
    ...(packageMetadata?.dependencies || []).map((d) => d.ref),
    ...Object.keys(buildSymbols),
  ]);
  for (const moduleName of Array.from(allModules)) {
    // Skip the testing modules
    if (moduleName.endsWith("Tests")) {
      continue;
    }
    const moduleInfoObj = parseModuleInfo(moduleInfo(moduleName, compilerArgs));
    if (moduleInfoObj) {
      moduleInfos[moduleName] = moduleInfoObj;
    } else {
      console.log(
        "Unable to obtain the semantic context for the module",
        moduleName,
      );
    }
  }
  // Finally, let's do some structural analysis of swift source codes
  const swiftFiles = getAllFiles(basePath, "**/*.swift", options);
  const fileStructures = {};
  const fileIndexes = {};
  for (const afile of swiftFiles) {
    // Skip testing and Package.swift
    if (afile.includes("Tests") || afile.endsWith("Package.swift")) {
      continue;
    }
    fileStructures[afile] = parseStructure(getStructure(afile));
    fileIndexes[afile] = parseIndex(index(afile, compilerArgs));
  }
  return {
    packageMetadata,
    buildSymbols,
    moduleInfos,
    fileStructures,
    fileIndexes,
  };
}
