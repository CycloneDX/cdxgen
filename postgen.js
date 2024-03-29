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
        const obj = {
          ref: adep.ref,
          dependsOn: newdepson
        };
        // Filter provides array if needed
        if (adep.provides && adep.provides.length) {
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
        aggregate: options.only ? "incomplete_first_party_only" : "incomplete"
      });
    }
  }
  return bomJson;
};
