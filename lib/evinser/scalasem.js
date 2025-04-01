function buildNSCache(components) {
  const typePurlsCache = {};
  for (const comp of components) {
    if (!comp.purl || !comp.properties) {
      continue;
    }
    const nsProps = comp.properties.filter((p) => p.name === "Namespaces");
    if (nsProps.length) {
      const nsList = nsProps[0].value?.split("\n");
      for (const ns of nsList) {
        const sns = ns.split("$")[0];
        if (!typePurlsCache[sns]) {
          typePurlsCache[sns] = new Set();
        }
        typePurlsCache[sns].add(comp.purl);
      }
    }
  }
  return typePurlsCache;
}

export function findPurlLocations(components, semanticsSlice) {
  const purlLocationsSet = {};
  if (!semanticsSlice || !Object.keys(semanticsSlice).length) {
    return {};
  }
  const typePurlsCache = buildNSCache(components);
  for (const key of Object.keys(semanticsSlice)) {
    if (key === "config" || !key.endsWith(".scala")) {
      continue;
    }
    const values = semanticsSlice[key];
    const usedTypes = values?.usedTypes || [];
    for (const t of usedTypes) {
      const simpleType = t.split("$")[0];
      const matchPurls = typePurlsCache[simpleType];
      if (matchPurls) {
        for (const apurl of Array.from(matchPurls)) {
          if (!purlLocationsSet[apurl]) {
            purlLocationsSet[apurl] = new Set();
          }
          purlLocationsSet[apurl].add(values.sourceFile || key);
        }
      }
    }
  }
  const purlLocationMap = {};
  for (const apurl of Object.keys(purlLocationsSet)) {
    purlLocationMap[apurl] = Array.from(purlLocationsSet[apurl]).sort();
  }
  return { purlLocationMap };
}
