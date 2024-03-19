/**
 * Enhance the generated BOM with filters, compatibility patches etc
 *
 * @param {Object} bomNSData BOM with namespaces data
 * @param {Object} options CLI or server options
 *
 * @returns {Object} bomNSData Enhanced BOM from post processing
 */
export const postProcess = (bomNSData, options) => {
  let jsonPayload = bomNSData.bomJson;
  if (
    typeof bomNSData.bomJson === "string" ||
    bomNSData.bomJson instanceof String
  ) {
    jsonPayload = JSON.parse(bomNSData.bomJson);
  }
  bomNSData.bomJson = filterBom(jsonPayload, options);
  // Make things compatible with dependency track
  if (options["make-dt-compatible"] || (options.serverUrl && options.apiKey)) {
    bomNSData.bomJson = compatibilityPass(bomNSData.bomJson);
  }
  return bomNSData;
};

/**
 * Filter BOM json
 *
 * @param {Object} BOM json object
 * @param {options} CLI or server options
 *
 * @returns {Object} Filtered BOM data
 */
export const filterBom = (bomJson, options) => {
  const newPkgMap = {};
  let filtered = false;
  for (const comp of bomJson.components) {
    if (
      options.requiredOnly &&
      comp.scope &&
      ["optional", "excluded"].includes(comp.scope)
    ) {
      filtered = true;
      continue;
    } else if (options.only && options.only.length) {
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
          continue;
        }
      }
      if (!purlfiltered) {
        newPkgMap[comp["bom-ref"]] = comp;
      }
    } else if (options.filter && options.filter.length) {
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
            continue;
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
        newdependencies.push({
          ref: adep.ref,
          dependsOn: newdepson
        });
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
        aggregate: options.only ? "incomplete_first_party_only" : "incomplete"
      });
    }
  }
  return bomJson;
};

/**
 * Ensure compatibility with dependency track
 *
 * @param {Object} BOM json object
 *
 * @returns {Object} Modified BOM data
 */
export const compatibilityPass = (bomJson) => {
  // Is it a namespace or name confusion
  // See: https://github.com/CycloneDX/cdxgen/issues/897
  if (
    bomJson.metadata.component &&
    bomJson.metadata.component.purl &&
    bomJson.metadata.component.purl.startsWith("pkg:golang")
  ) {
    if (bomJson.metadata.component["bom-ref"]) {
      bomJson.metadata.component.purl = bomJson.metadata.component["bom-ref"];
    }
  }
  for (const comp of bomJson.components) {
    if (comp && comp.purl && comp.purl.startsWith("pkg:golang")) {
      if (comp["bom-ref"].startsWith("pkg:golang")) {
        comp.purl = comp["bom-ref"];
      }
    }
  }
  return bomJson;
};
