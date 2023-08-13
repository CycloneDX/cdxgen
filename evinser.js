import {
  executeAtom,
  getMavenCommand,
  collectMvnDependencies
} from "./utils.js";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import * as db from "./db.js";
import { PackageURL } from "packageurl-js";
import { Op } from "sequelize";
const DB_NAME = "evinser.db";
const typesPurlCache = {};

/**
 * Function to create the db for the libraries referred in the sbom.
 *
 * @param {string} dbPath DB Path
 * @param {object} Command line options
 */
export const prepareDB = async (dbPath, options) => {
  const dirPath = options._[0] || ".";
  const bomJsonFile = options.input;
  if (!fs.existsSync(bomJsonFile)) {
    console.log("Bom file doesn't exist");
    return;
  }
  const bomJson = JSON.parse(fs.readFileSync(bomJsonFile, "utf8"));
  const components = bomJson.components || [];
  const { sequelize, Namespaces, Usages, DataFlows } = await db.createOrLoad(
    DB_NAME,
    dbPath
  );
  let hasMavenPkgs = false;
  // We need to slice only non-maven packages
  const purlsToSlice = {};
  const purlsJars = {};
  let usagesSlice = undefined;
  for (const comp of components) {
    if (!comp.purl) {
      continue;
    }
    usagesSlice = await Usages.findByPk(comp.purl);
    const namespaceSlice = await Namespaces.findByPk(comp.purl);
    if ((!usagesSlice && !namespaceSlice) || options.force) {
      if (comp.purl.startsWith("pkg:maven")) {
        hasMavenPkgs = true;
      } else if (isSlicingRequired(comp.purl)) {
        purlsToSlice[comp.purl] = true;
      }
    }
  }
  // If there are maven packages we collect and store the namespaces
  if (!options.skipMavenCollector && hasMavenPkgs) {
    console.log("About to collect dependencies from maven for", dirPath);
    const mavenCmd = getMavenCommand(dirPath, dirPath);
    // collect all jars including from the cache if data-flow mode is enabled
    const jarNSMapping = collectMvnDependencies(
      mavenCmd,
      dirPath,
      false,
      options.withDeepJarCollector
    );
    if (jarNSMapping) {
      for (const purl of Object.keys(jarNSMapping)) {
        purlsJars[purl] = jarNSMapping[purl].jarFile;
        await Namespaces.findOrCreate({
          where: { purl },
          defaults: {
            purl,
            data: JSON.stringify(
              {
                pom: jarNSMapping[purl].pom,
                namespaces: jarNSMapping[purl].namespaces
              },
              null,
              2
            )
          }
        });
      }
    }
  }
  for (const purl of Object.keys(purlsToSlice)) {
    await createAndStoreSlice(purl, purlsJars, Usages);
  }
  return { sequelize, Namespaces, Usages, DataFlows };
};

export const createAndStoreSlice = async (purl, purlsJars, Usages) => {
  const retMap = createSlice(purl, purlsJars[purl], "usages");
  let sliceData = undefined;
  if (retMap && retMap.slicesFile && fs.existsSync(retMap.slicesFile)) {
    sliceData = await Usages.findOrCreate({
      where: { purl },
      defaults: {
        purl,
        data: fs.readFileSync(retMap.slicesFile, "utf-8")
      }
    });
  }
  if (retMap && retMap.tempDir && retMap.tempDir.startsWith(tmpdir())) {
    fs.rmSync(retMap.tempDir, { recursive: true, force: true });
  }
  return sliceData;
};

export const createSlice = (purlOrLanguage, filePath, sliceType = "usages") => {
  if (!filePath) {
    return;
  }
  console.log(`Create ${sliceType} slice for ${purlOrLanguage} ${filePath}`);
  const language = purlOrLanguage.startsWith("pkg:")
    ? purlToLanguage(purlOrLanguage, filePath)
    : purlOrLanguage;
  if (!language) {
    return undefined;
  }
  const tempDir = fs.mkdtempSync(path.join(tmpdir(), `atom-${sliceType}-`));
  const atomFile = path.join(tempDir, "app.atom");
  const slicesFile = path.join(tempDir, `${sliceType}.json`);
  const args = [
    sliceType,
    "-l",
    language,
    "-o",
    path.resolve(atomFile),
    "--slice-outfile",
    path.resolve(slicesFile)
  ];
  // For projects with several layers, slice depth needs to be increased from the default 7 to 15 or 20
  // This would increase the time but would yield more deeper paths
  if (sliceType == "data-flow" && process.env.ATOM_SLICE_DEPTH) {
    args.push("--slice-depth");
    args.push(process.env.ATOM_SLICE_DEPTH);
  }
  args.push(path.resolve(filePath));
  executeAtom(filePath, args);
  return {
    tempDir,
    slicesFile,
    atomFile
  };
};

export const purlToLanguage = (purl, filePath) => {
  let language = undefined;
  const purlObj = PackageURL.fromString(purl);
  switch (purlObj.type) {
    case "maven":
      language = filePath && filePath.endsWith(".jar") ? "jar" : "java";
      break;
    case "npm":
      language = "javascript";
      break;
    case "pypi":
      language = "python";
      break;
  }
  return language;
};

/**
 * Function to analyze the project
 *
 * @param {object} dbObjMap DB and model instances
 * @param {object} Command line options
 */
export const analyzeProject = async (dbObjMap, options) => {
  const dirPath = options._[0] || ".";
  const language = options.language;
  let usageSlice = undefined;
  let dataFlowSlice = undefined;
  let usagesSlicesFile = undefined;
  let dataFlowsSlicesFile = undefined;
  let purlLocationMap = {};
  let dataFlowFrames = {};
  let servicesMap = {};
  let retMap = createSlice(language, dirPath, "usages");
  if (retMap && retMap.slicesFile && fs.existsSync(retMap.slicesFile)) {
    usageSlice = JSON.parse(fs.readFileSync(retMap.slicesFile, "utf-8"));
    usagesSlicesFile = retMap.slicesFile;
  }
  if (usageSlice && Object.keys(usageSlice).length) {
    const retMap = await parseObjectSlices(
      language,
      usageSlice,
      dbObjMap,
      servicesMap
    );
    purlLocationMap = retMap.purlLocationMap;
    servicesMap = retMap.servicesMap;
  }
  if (options.withDataFlow) {
    retMap = createSlice(language, dirPath, "data-flow");
    if (retMap && retMap.slicesFile && fs.existsSync(retMap.slicesFile)) {
      dataFlowsSlicesFile = retMap.slicesFile;
      dataFlowSlice = JSON.parse(fs.readFileSync(retMap.slicesFile, "utf-8"));
    }
  }
  if (dataFlowSlice && Object.keys(dataFlowSlice).length) {
    dataFlowFrames = await collectDataFlowFrames(
      language,
      dataFlowSlice,
      dbObjMap
    );
  }
  return {
    atomFile: retMap.atomFile,
    usagesSlicesFile,
    dataFlowsSlicesFile,
    purlLocationMap,
    servicesMap,
    dataFlowFrames,
    tempDir: retMap.tempDir
  };
};

export const parseObjectSlices = async (
  language,
  usageSlice,
  dbObjMap,
  servicesMap = {}
) => {
  const purlLocationMap = {};
  if (!usageSlice || !Object.keys(usageSlice).length) {
    return purlLocationMap;
  }
  for (const slice of [
    ...(usageSlice.objectSlices || []),
    ...(usageSlice.userDefinedTypes || [])
  ]) {
    // Skip the library code typically without filename
    if (
      !slice.fileName ||
      !slice.fileName.trim().length ||
      slice.fileName === "<empty>"
    ) {
      continue;
    }
    const locationKey = `${slice.fileName}${
      slice.lineNumber ? "#" + slice.lineNumber : ""
    }`;
    const purlsSet = await parseSliceUsages(language, slice.usages, dbObjMap);
    if (purlsSet && purlsSet.length) {
      for (const apurl of purlsSet) {
        if (!purlLocationMap[apurl]) {
          purlLocationMap[apurl] = new Set();
        }
        purlLocationMap[apurl].add(locationKey);
      }
    }
    servicesMap = Object.assign(
      {},
      servicesMap,
      detectServicesFromUsages(language, slice, servicesMap)
    );
  }
  return {
    purlLocationMap,
    servicesMap
  };
};

/**
 * The implementation of this function is based on the logic proposed in the atom slices specification
 * https://github.com/AppThreat/atom/blob/main/specification/docs/slices.md#use
 *
 * @param {string} language Application language
 * @param {array} usages Usages array for each objectSlice
 * @param {object} dbObjMap DB Models
 * @returns
 */
export const parseSliceUsages = async (language, usages, dbObjMap) => {
  if (!usages || !usages.length) {
    return undefined;
  }
  const purlsSet = new Set();
  const typesToLookup = new Set();
  for (const ausage of usages) {
    // First capture the types in the targetObj and definedBy
    for (const atype of [
      ausage?.targetObj?.typeFullName,
      ausage?.targetObj?.resolvedMethod,
      ausage?.definedBy?.typeFullName,
      ausage?.definedBy?.resolvedMethod,
      ...(ausage?.fields || []).map((f) => f?.typeFullName)
    ]) {
      if (!isFilterableType(language, atype)) {
        typesToLookup.add(atype);
        typesToLookup.add(getClassTypeFromSignature(language, atype));
      }
    }
    // Now capture full method signatures from invokedCalls, argToCalls including the paramtypes
    for (const acall of []
      .concat(ausage?.invokedCalls || [])
      .concat(ausage?.argToCalls || [])
      .concat(ausage?.procedures || [])) {
      if (!isFilterableType(language, acall?.resolvedMethod)) {
        typesToLookup.add(acall?.resolvedMethod);
        typesToLookup.add(
          getClassTypeFromSignature(language, acall?.resolvedMethod)
        );
      }
      for (const aparamType of acall?.paramTypes || []) {
        if (!isFilterableType(language, aparamType)) {
          typesToLookup.add(aparamType);
          typesToLookup.add(getClassTypeFromSignature(language, aparamType));
        }
      }
    }
  }
  for (const atype of typesToLookup) {
    if (isFilterableType(language, atype)) {
      continue;
    }
    // Hit the cache first
    if (typesPurlCache[atype]) {
      purlsSet.add(typesPurlCache[atype]);
      continue;
    }
    // Check the namespaces db
    const nsHits = await dbObjMap.Namespaces.findAll({
      attributes: ["purl"],
      where: {
        data: {
          [Op.like]: `%${atype}%`
        }
      }
    });
    if (nsHits && nsHits.length) {
      for (const ns of nsHits) {
        purlsSet.add(ns.purl);
        typesPurlCache[atype] = ns.purl;
      }
    }
  }
  return Array.from(purlsSet);
};

export const isFilterableType = (language, typeFullName) => {
  if (
    !typeFullName ||
    ["ANY", "UNKNOWN", "VOID"].includes(typeFullName.toUpperCase())
  ) {
    return true;
  }
  if (
    typeFullName.startsWith("<operator") ||
    typeFullName.startsWith("<unresolved")
  ) {
    return true;
  }
  if (language && ["java", "jar"].includes(language)) {
    if (
      !typeFullName.includes(".") ||
      typeFullName.startsWith("@") ||
      typeFullName.startsWith("java.") ||
      typeFullName.startsWith("sun.") ||
      typeFullName.startsWith("jdk.") ||
      typeFullName.startsWith("org.w3c.") ||
      typeFullName.startsWith("org.xml.") ||
      typeFullName.startsWith("javax.xml.")
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Method to detect services from annotation objects in the usage slice
 *
 * @param {string} language Application language
 * @param {array} usages Usages array for each objectSlice
 * @param {object} servicesMap Existing service map
 */
export const detectServicesFromUsages = (language, slice, servicesMap = {}) => {
  const usages = slice.usages;
  if (!usages || !["java", "jar"].includes(language)) {
    return [];
  }
  for (const usage of usages) {
    const targetObj = usage?.targetObj;
    const definedBy = usage?.definedBy;
    let endpoints = undefined;
    let authenticated = undefined;
    if (
      targetObj &&
      targetObj?.label === "ANNOTATION" &&
      targetObj?.resolvedMethod
    ) {
      endpoints = extractEndpoints(language, targetObj?.resolvedMethod);
      if (targetObj?.resolvedMethod.includes("auth")) {
        authenticated = true;
      }
    } else if (
      definedBy &&
      definedBy?.label === "ANNOTATION" &&
      definedBy?.resolvedMethod
    ) {
      endpoints = extractEndpoints(language, definedBy?.resolvedMethod);
      if (definedBy?.resolvedMethod.includes("auth")) {
        authenticated = true;
      }
    }
    if (endpoints) {
      const serviceName = constructServiceName(language, slice);
      if (!servicesMap[serviceName]) {
        servicesMap[serviceName] = {
          endpoints: new Set(),
          authenticated,
          xTrustBoundary: authenticated === true ? true : undefined
        };
      }
      for (const endpoint of endpoints) {
        servicesMap[serviceName].endpoints.add(endpoint);
      }
    }
  }
  return servicesMap;
};

export const constructServiceName = (language, slice) => {
  let serviceName = "service";
  if (slice?.fullName) {
    serviceName = slice.fullName.split(":")[0].replace(/\./g, "-");
  } else if (slice?.fileName) {
    serviceName = path.basename(slice.fileName).split(".")[0];
  }
  if (!serviceName.endsWith("service")) {
    serviceName = serviceName + "-service";
  }
  return serviceName;
};

export const extractEndpoints = (language, code) => {
  if (!code) {
    return undefined;
  }
  let endpoints = undefined;
  switch (language) {
    case "java":
    case "jar":
      if (code.startsWith("@") && code.includes("(")) {
        let tmpA = code.split("(");
        if (tmpA.length > 1) {
          tmpA = tmpA[1].split(")")[0];
          if (tmpA.includes("{")) {
            tmpA = tmpA.split("{");
            tmpA = tmpA[tmpA.length - 1].split("}")[0];
          } else if (tmpA.includes(",")) {
            tmpA = tmpA.split(",")[0];
          }
          if (tmpA.includes("=")) {
            tmpA = tmpA.split("=").reverse()[0];
          }
          tmpA = tmpA.replace(/"/g, "").replace(/ /g, "");
          endpoints = tmpA.split(",");
          return endpoints;
        }
      }
      break;
    default:
      break;
  }
  return endpoints;
};

/**
 * Function to determine if slicing is required for the given language's dependencies.
 * For performance reasons, we make java operate only with namespaces
 *
 * @param {string} purl
 * @returns
 */
export const isSlicingRequired = (purl) => {
  const language = purlToLanguage(purl);
  return ["javascript", "python"].includes(language);
};

/**
 * Method to create the SBoM with evidence file called evinse file.
 *
 * @param {object} sliceArtefacts Various artefacts from the slice operation
 * @param {object} options Command line options
 * @returns
 */
export const createEvinseFile = (sliceArtefacts, options) => {
  const {
    tempDir,
    usagesSlicesFile,
    dataFlowsSlicesFile,
    purlLocationMap,
    servicesMap,
    dataFlowFrames
  } = sliceArtefacts;
  const bomFile = options.input;
  const evinseOutFile = options.output;
  const bomJson = JSON.parse(fs.readFileSync(bomFile, "utf8"));
  const components = bomJson.components || [];
  let occEvidencePresent = false;
  let csEvidencePresent = false;
  for (const comp of components) {
    if (!comp.purl) {
      continue;
    }
    const locationOccurrences = Array.from(
      purlLocationMap[comp.purl] || []
    ).sort();
    if (locationOccurrences.length) {
      if (!comp.evidence) {
        comp.evidence = {};
      }
      if (!comp.evidence.occurrences) {
        comp.evidence.occurrences = locationOccurrences
          .filter((l) => !!l)
          .map((l) => ({
            location: l
          }));
        occEvidencePresent = true;
      }
    }
    const dfFrames = dataFlowFrames[comp.purl];
    if (dfFrames && dfFrames.length) {
      if (!comp.evidence) {
        comp.evidence = {};
      }
      if (!comp.evidence.callstack) {
        comp.evidence.callstack = {};
      }
      if (!comp.evidence.callstack.frames) {
        comp.evidence.callstack.frames = framePicker(dfFrames);
        csEvidencePresent = true;
      }
    }
  } // for
  if (servicesMap && Object.keys(servicesMap).length) {
    const services = [];
    for (const serviceName of Object.keys(servicesMap)) {
      services.push({
        name: serviceName,
        endpoints: Array.from(servicesMap[serviceName].endpoints),
        authenticated: servicesMap[serviceName].authenticated,
        "x-trust-boundary": servicesMap[serviceName].xTrustBoundary
      });
    }
    bomJson.services = services;
  }
  if (options.annotate) {
    if (!bomJson.annotations) {
      bomJson.annotations = [];
    }
    if (usagesSlicesFile && fs.existsSync(usagesSlicesFile)) {
      bomJson.annotations.push({
        subjects: [bomJson.serialNumber],
        annotator: { component: bomJson.metadata.tools.components[0] },
        timestamp: new Date().toISOString(),
        text: fs.readFileSync(usagesSlicesFile, "utf8")
      });
    }
    if (dataFlowsSlicesFile && fs.existsSync(dataFlowsSlicesFile)) {
      bomJson.annotations.push({
        subjects: [bomJson.serialNumber],
        annotator: { component: bomJson.metadata.tools.components[0] },
        timestamp: new Date().toISOString(),
        text: fs.readFileSync(dataFlowsSlicesFile, "utf8")
      });
    }
  }
  // Increment the version
  bomJson.version = (bomJson.version || 1) + 1;
  // Set the current timestamp to indicate this is newer
  bomJson.metadata.timestamp = new Date().toISOString();
  fs.writeFileSync(evinseOutFile, JSON.stringify(bomJson, null, 2));
  if (occEvidencePresent || csEvidencePresent) {
    console.log(evinseOutFile, "created successfully.");
  } else {
    console.log(
      "Unable to identify component evidence for the input SBoM. Only java, javascript and python projects are supported by evinse."
    );
  }
  if (tempDir && tempDir.startsWith(tmpdir())) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return bomJson;
};

/**
 * Method to convert dataflow slice into usable callstack frames
 * Implemented based on the logic proposed here - https://github.com/AppThreat/atom/blob/main/specification/docs/slices.md#data-flow-slice
 *
 * @param {string} language Application language
 * @param {object} dataFlowSlice Data flow slice object from atom
 * @param {object} dbObjMap DB models
 */
export const collectDataFlowFrames = async (
  language,
  dataFlowSlice,
  dbObjMap
) => {
  const nodes = dataFlowSlice?.graph?.nodes || [];
  // Cache the nodes based on the id to improve lookup
  const nodeCache = {};
  // purl key and an array of frames array
  // CycloneDX 1.5 currently accepts only 1 frame as evidence
  // so this method is more future-proof
  const dfFrames = {};
  for (const n of nodes) {
    // Skip operator calls
    if (n.name && n.name.startsWith("<operator")) {
      continue;
    }
    nodeCache[n.id] = n;
  }
  const paths = dataFlowSlice?.paths || [];
  for (const apath of paths) {
    let aframe = [];
    let referredPurls = new Set();
    for (const nid of apath) {
      const theNode = nodeCache[nid];
      if (!theNode) {
        continue;
      }
      const typeFullName = theNode.typeFullName;
      if (!isFilterableType(language, typeFullName)) {
        // Hit the cache first
        if (typesPurlCache[typeFullName]) {
          referredPurls.add(typesPurlCache[typeFullName]);
        } else {
          // Check the namespaces db
          const nsHits = await dbObjMap.Namespaces.findAll({
            attributes: ["purl"],
            where: {
              data: {
                [Op.like]: `%${typeFullName}%`
              }
            }
          });
          if (nsHits && nsHits.length) {
            for (const ns of nsHits) {
              referredPurls.add(ns.purl);
              typesPurlCache[typeFullName] = ns.purl;
            }
          } else {
            console.log("Unable to identify purl for", typeFullName);
          }
        }
      }
      aframe.push({
        package: theNode.parentPackageName || "",
        module: theNode.parentClassName || "",
        function: theNode.parentMethodName || "",
        line: theNode.lineNumber || "",
        column: theNode.columnNumber || "",
        fullFilename: theNode.parentFileName || ""
      });
    }
    referredPurls = Array.from(referredPurls);
    if (referredPurls.length) {
      for (const apurl of referredPurls) {
        if (!dfFrames[apurl]) {
          dfFrames[apurl] = [];
        }
        // Store this frame as an evidence for this purl
        dfFrames[apurl].push(aframe);
      }
    }
  }
  return dfFrames;
};

/**
 * Method to pick a callstack frame as an evidence. This method is required since CycloneDX 1.5 accepts only a single frame as evidence.
 *
 * @param {array} dfFrames Data flow frames
 * @returns
 */
export const framePicker = (dfFrames) => {
  if (!dfFrames || !dfFrames.length) {
    return undefined;
  }
  let aframe = dfFrames[0];
  if (dfFrames.length > 1) {
    for (let i = 1; i < dfFrames.length - 1; i++) {
      if (dfFrames[i].length > 2) {
        aframe = dfFrames[i];
      }
    }
  }
  return aframe;
};

export const getClassTypeFromSignature = (language, typeFullName) => {
  if (["java", "jar"].includes(language) && typeFullName.includes(":")) {
    typeFullName = typeFullName.split(":")[0];
    const tmpA = typeFullName.split(".");
    tmpA.pop();
    typeFullName = tmpA.join(".");
  }
  if (typeFullName.startsWith("<unresolved")) {
    return undefined;
  }
  if (typeFullName.includes("$")) {
    typeFullName = typeFullName.split("$")[0];
  }
  return typeFullName;
};
