import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PackageURL } from "packageurl-js";
import { dirNameStr } from "./utils.js";

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
  cleanupEnv(options);
  return bomNSData;
}

/**
 * Apply additional metadata based on components
 *
 * @param {Object} bomJson BOM JSON Object
 * @param {Object} options CLI options
 *
 * @returns {Object} Filtered BOM JSON
 */
export function applyMetadata(bomJson, options) {
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
  if (!bomJson?.components) {
    return bomJson;
  }
  for (const comp of bomJson.components) {
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
    const newcomponents = [];
    const newdependencies = [];
    for (const aref of Object.keys(newPkgMap).sort()) {
      newcomponents.push(newPkgMap[aref]);
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
  return bomJson;
}

/**
 * Clean up
 */
export function cleanupEnv(options) {
  if (process.env?.PIP_TARGET?.startsWith(tmpdir())) {
    rmSync(process.env.PIP_TARGET, { recursive: true, force: true });
  }
}
