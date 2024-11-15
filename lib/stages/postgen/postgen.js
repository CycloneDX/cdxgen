import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { PackageURL } from "packageurl-js";
import {
  DEBUG_MODE,
  dirNameStr,
  getTimestamp,
  hasAnyProjectType,
} from "../../helpers/utils.js";
import { extractTags, findBomType, textualMetadata } from "./annotator.js";

/**
 * Filter and enhance BOM post generation.
 *
 * @param {Object} bomNSData BOM with namespaces object
 * @param {Object} options CLI options
 *
 * @returns {Object} Modified bomNSData
 */
export function postProcess(bomNSData, options) {
  let jsonPayload = bomNSData.bomJson;
  if (
    typeof bomNSData.bomJson === "string" ||
    bomNSData.bomJson instanceof String
  ) {
    jsonPayload = JSON.parse(bomNSData.bomJson);
  }

  bomNSData.bomJson = filterBom(jsonPayload, options);
  bomNSData.bomJson = applyStandards(bomNSData.bomJson, options);
  bomNSData.bomJson = applyMetadata(bomNSData.bomJson, options);
  // Support for automatic annotations
  if (options.specVersion >= 1.6) {
    bomNSData.bomJson = annotate(bomNSData.bomJson, options);
  }
  cleanupEnv(options);
  return bomNSData;
}

/**
 * Apply additional metadata based on components
 *
 * @param {Object} bomJson BOM JSON Object
 * @param {Object} _options CLI options
 *
 * @returns {Object} Filtered BOM JSON
 */
export function applyMetadata(bomJson, _options) {
  if (!bomJson?.components) {
    return bomJson;
  }
  const bomPkgTypes = new Set();
  const bomPkgNamespaces = new Set();
  for (const comp of bomJson.components) {
    if (comp.purl) {
      try {
        const purlObj = PackageURL.fromString(comp.purl);
        if (purlObj?.type) {
          bomPkgTypes.add(purlObj.type);
        }
        if (purlObj?.namespace) {
          bomPkgNamespaces.add(purlObj.namespace);
        }
      } catch (e) {
        // ignore
      }
    }
  }
  if (!bomJson.metadata.properties) {
    bomJson.metadata.properties = [];
  }
  if (bomPkgTypes.size) {
    bomJson.metadata.properties.push({
      name: "cdx:bom:componentTypes",
      value: Array.from(bomPkgTypes).sort().join("\\n"),
    });
  }
  if (bomPkgNamespaces.size) {
    bomJson.metadata.properties.push({
      name: "cdx:bom:componentNamespaces",
      value: Array.from(bomPkgNamespaces).sort().join("\\n"),
    });
  }
  return bomJson;
}

/**
 * Apply definitions.standards based on options
 *
 * @param {Object} bomJson BOM JSON Object
 * @param {Object} options CLI options
 *
 * @returns {Object} Filtered BOM JSON
 */
export function applyStandards(bomJson, options) {
  if (options.standard && Array.isArray(options.standard)) {
    for (const astandard of options.standard) {
      const templateFile = join(
        dirNameStr,
        "data",
        "templates",
        `${astandard}.cdx.json`,
      );
      if (existsSync(templateFile)) {
        const templateData = JSON.parse(readFileSync(templateFile, "utf-8"));
        if (templateData?.metadata?.licenses) {
          if (!bomJson.metadata.licenses) {
            bomJson.metadata.licenses = [];
          }
          bomJson.metadata.licenses = bomJson.metadata.licenses.concat(
            templateData.metadata.licenses,
          );
        }
        if (templateData?.definitions?.standards) {
          if (!bomJson.definitions) {
            bomJson.definitions = { standards: [] };
          }
          bomJson.definitions.standards = bomJson.definitions.standards.concat(
            templateData.definitions.standards,
          );
        }
      }
    }
  }
  return bomJson;
}

/**
 * Method to get the purl identity confidence.
 *
 * @param comp Component
 * @returns {undefined|number} Max of all the available purl identity confidence or undefined
 */
function getIdentityConfidence(comp) {
  if (!comp.evidence) {
    return undefined;
  }
  let confidence;
  for (const aidentity of comp?.evidence?.identity || []) {
    if (aidentity?.field === "purl") {
      if (confidence === undefined) {
        confidence = aidentity.confidence || 0;
      } else {
        confidence = Math.max(aidentity.confidence, confidence);
      }
    }
  }
  return confidence;
}

/**
 * Method to get the list of techniques used for identity.
 *
 * @param comp Component
 * @returns {Set|undefined} Set of technique. evidence.identity.methods.technique
 */
function getIdentityTechniques(comp) {
  if (!comp.evidence) {
    return undefined;
  }
  const techniques = new Set();
  for (const aidentity of comp?.evidence?.identity || []) {
    if (aidentity?.field === "purl") {
      for (const amethod of aidentity.methods || []) {
        techniques.add(amethod?.technique);
      }
    }
  }
  return techniques;
}

/**
 * Filter BOM based on options
 *
 * @param {Object} bomJson BOM JSON Object
 * @param {Object} options CLI options
 *
 * @returns {Object} Filtered BOM JSON
 */
export function filterBom(bomJson, options) {
  const newPkgMap = {};
  let filtered = false;
  let anyFiltered = false;
  if (!bomJson?.components) {
    return bomJson;
  }
  for (const comp of bomJson.components) {
    // minimum confidence filter
    if (options?.minConfidence > 0) {
      const confidence = Math.min(options.minConfidence, 1);
      const identityConfidence = getIdentityConfidence(comp);
      if (identityConfidence !== undefined && identityConfidence < confidence) {
        filtered = true;
        continue;
      }
    }
    // identity technique filter
    if (options?.technique?.length && !options.technique.includes("auto")) {
      const allowedTechniques = new Set(
        Array.isArray(options.technique)
          ? options.technique
          : [options.technique],
      );
      const usedTechniques = getIdentityTechniques(comp);
      if (
        usedTechniques &&
        !usedTechniques.intersection(allowedTechniques).size
      ) {
        filtered = true;
        continue;
      }
    }
    if (
      options.requiredOnly &&
      comp.scope &&
      ["optional", "excluded"].includes(comp.scope)
    ) {
      filtered = true;
    } else if (options.only?.length) {
      if (!Array.isArray(options.only)) {
        options.only = [options.only];
      }
      let purlfiltered = false;
      for (const filterstr of options.only) {
        if (
          filterstr.length &&
          !comp.purl.toLowerCase().includes(filterstr.toLowerCase())
        ) {
          filtered = true;
          purlfiltered = true;
        }
      }
      if (!purlfiltered) {
        newPkgMap[comp["bom-ref"]] = comp;
      }
    } else if (options.filter?.length) {
      if (!Array.isArray(options.filter)) {
        options.filter = [options.filter];
      }
      let purlfiltered = false;
      for (const filterstr of options.filter) {
        // Check the purl
        if (
          filterstr.length &&
          comp.purl.toLowerCase().includes(filterstr.toLowerCase())
        ) {
          filtered = true;
          purlfiltered = true;
          continue;
        }
        // Look for any properties value matching the string
        const properties = comp.properties || [];
        for (const aprop of properties) {
          if (
            filterstr.length &&
            aprop &&
            aprop.value &&
            aprop.value.toLowerCase().includes(filterstr.toLowerCase())
          ) {
            filtered = true;
            purlfiltered = true;
          }
        }
      }
      if (!purlfiltered) {
        newPkgMap[comp["bom-ref"]] = comp;
      }
    } else {
      newPkgMap[comp["bom-ref"]] = comp;
    }
  }
  if (filtered) {
    if (!anyFiltered) {
      anyFiltered = true;
    }
    const newcomponents = [];
    const newdependencies = [];
    for (const aref of Object.keys(newPkgMap).sort()) {
      newcomponents.push(newPkgMap[aref]);
    }
    if (bomJson.metadata?.component?.["bom-ref"]) {
      newPkgMap[bomJson.metadata.component["bom-ref"]] =
        bomJson.metadata.component;
    }
    if (bomJson.metadata?.component?.components) {
      for (const comp of bomJson.metadata.component.components) {
        newPkgMap[comp["bom-ref"]] = comp;
      }
    }
    for (const adep of bomJson.dependencies) {
      if (newPkgMap[adep.ref]) {
        const newdepson = (adep.dependsOn || []).filter((d) => newPkgMap[d]);
        const obj = {
          ref: adep.ref,
          dependsOn: newdepson,
        };
        // Filter provides array if needed
        if (adep.provides?.length) {
          obj.provides = adep.provides.filter((d) => newPkgMap[d]);
        }
        newdependencies.push(obj);
      }
    }
    bomJson.components = newcomponents;
    bomJson.dependencies = newdependencies;
    // We set the compositions.aggregate to incomplete by default
    if (
      options.specVersion >= 1.5 &&
      options.autoCompositions &&
      bomJson.metadata &&
      bomJson.metadata.component
    ) {
      if (!bomJson.compositions) {
        bomJson.compositions = [];
      }
      bomJson.compositions.push({
        "bom-ref": bomJson.metadata.component["bom-ref"],
        aggregate: options.only ? "incomplete_first_party_only" : "incomplete",
      });
    }
  }
  if (!anyFiltered && DEBUG_MODE) {
    if (
      options.requiredOnly &&
      !options.deep &&
      hasAnyProjectType(["python"], options, false)
    ) {
      console.log(
        "Try running cdxgen with --deep argument to identify component usages with atom.",
      );
    } else if (
      options.requiredOnly &&
      options.noBabel &&
      hasAnyProjectType(["js"], options, false)
    ) {
      console.log(
        "Enable babel by removing the --no-babel argument to improve usage detection.",
      );
    }
  }
  return bomJson;
}

/**
 * Clean up
 */
export function cleanupEnv(_options) {
  if (process.env?.PIP_TARGET?.startsWith(tmpdir())) {
    rmSync(process.env.PIP_TARGET, { recursive: true, force: true });
  }
}

function stripBomLink(serialNumber, version, ref) {
  return ref.replace(`${serialNumber}/${version - 1}/`, "");
}

/**
 * Annotate the document with annotator
 *
 * @param {Object} bomJson BOM JSON Object
 * @param {Object} options CLI options
 *
 * @returns {Object} Annotated BOM JSON
 */
export function annotate(bomJson, options) {
  if (!bomJson?.components) {
    return bomJson;
  }
  const bomAnnotations = bomJson?.annotations || [];
  const cdxgenAnnotator = bomJson.metadata.tools.components.filter(
    (c) => c.name === "cdxgen",
  );
  if (!cdxgenAnnotator.length) {
    return bomJson;
  }
  const { bomType } = findBomType(bomJson);
  const requiresContextTuning = [
    "deep-learning",
    "machine-learning",
    "ml",
    "ml-deep",
    "ml-tiny",
  ].includes(options?.profile);
  const requiresContextTrimming =
    (requiresContextTuning && ["saasbom"].includes(bomType.toLowerCase())) ||
    ["ml-tiny"].includes(options?.profile);
  // Construct the bom-link prefix to use for context tuning
  const bomLinkPrefix = `${bomJson.serialNumber}/${bomJson.version}/`;
  const metadataAnnotations = textualMetadata(bomJson);
  let parentBomRef;
  if (requiresContextTuning && bomJson.metadata?.component?.["bom-ref"]) {
    bomJson.metadata.component["bom-ref"] =
      `${bomLinkPrefix}${stripBomLink(bomJson.serialNumber, bomJson.version, bomJson.metadata.component["bom-ref"])}`;
    parentBomRef = bomJson.metadata.component["bom-ref"];
  }
  if (metadataAnnotations && parentBomRef) {
    bomAnnotations.push({
      "bom-ref": "metadata-annotations",
      subjects: [parentBomRef],
      annotator: {
        component: cdxgenAnnotator[0],
      },
      timestamp: getTimestamp(),
      text: metadataAnnotations,
    });
  }
  bomJson.annotations = bomAnnotations;
  // Shall we trim the metadata section
  if (requiresContextTrimming) {
    if (bomJson?.metadata?.component?.components) {
      bomJson.metadata.component.components = undefined;
    }
    if (bomJson?.metadata?.component?.["bom-ref"]) {
      bomJson.metadata.component["bom-ref"] = undefined;
    }
    if (bomJson?.metadata?.component?.properties) {
      bomJson.metadata.component.properties = undefined;
    }
    if (bomJson?.metadata?.properties) {
      bomJson.metadata.properties = undefined;
    }
  }
  // Tag the components
  for (const comp of bomJson.components) {
    const tags = extractTags(comp, bomType, bomJson.metadata?.component?.type);
    if (tags?.length) {
      comp.tags = tags;
    }
    if (requiresContextTuning) {
      comp["bom-ref"] =
        `${bomLinkPrefix}${stripBomLink(bomJson.serialNumber, bomJson.version, comp["bom-ref"])}`;
      comp.description = undefined;
      comp.properties = undefined;
      comp.evidence = undefined;
    }
    if (requiresContextTrimming) {
      comp.authors = undefined;
      comp.supplier = undefined;
      comp.publisher = undefined;
      comp["bom-ref"] = undefined;
      comp.externalReferences = undefined;
      comp.description = undefined;
      comp.properties = undefined;
      comp.evidence = undefined;
    }
  }
  // For tiny models, we can remove the dependencies section
  if (requiresContextTrimming) {
    bomJson.dependencies = undefined;
    if (bomType.toLowerCase() === "saasbom") {
      bomJson.components = undefined;
      let i = 0;
      for (const aserv of bomJson.services) {
        aserv.name = `service-${i++}`;
      }
    }
  }
  // Problem: information such as the dependency tree are specific to an sbom
  // To prevent the models from incorrectly learning about the trees, we automatically convert all bom-ref
  // references to [bom-link](https://cyclonedx.org/capabilities/bomlink/) format
  if (requiresContextTuning && bomJson?.dependencies?.length) {
    const newDeps = [];
    for (const dep of bomJson.dependencies) {
      const newRef = `${bomLinkPrefix}${stripBomLink(bomJson.serialNumber, bomJson.version, dep.ref)}`;
      const newDependsOn = [];
      for (const adon of dep.dependsOn) {
        newDependsOn.push(
          `${bomLinkPrefix}${stripBomLink(bomJson.serialNumber, bomJson.version, adon)}`,
        );
      }
      newDeps.push({
        ref: newRef,
        dependsOn: newDependsOn.sort(),
      });
    }
    // Overwrite the dependencies
    bomJson.dependencies = newDeps;
  }
  return bomJson;
}
