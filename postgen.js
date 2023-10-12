export const postProcess = (bomNSData, options) => {
  let jsonPayload = bomNSData.bomJson;
  if (
    typeof bomNSData.bomJson === "string" ||
    bomNSData.bomJson instanceof String
  ) {
    jsonPayload = JSON.parse(bomNSData.bomJson);
  }
  bomNSData.bomJson = filterBom(jsonPayload, options);
  return bomNSData;
};

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
    } else if (options.only && Array.isArray(options.only)) {
      let purlfiltered = false;
      for (const filterstr of options.only) {
        if (filterstr.length && !comp.purl.toLowerCase().includes(filterstr)) {
          filtered = true;
          purlfiltered = true;
          continue;
        }
      }
      if (!purlfiltered) {
        newPkgMap[comp["bom-ref"]] = comp;
      }
    } else if (options.filter && Array.isArray(options.filter)) {
      let purlfiltered = false;
      for (const filterstr of options.filter) {
        if (filterstr.length && comp.purl.toLowerCase().includes(filterstr)) {
          filtered = true;
          purlfiltered = true;
          continue;
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
