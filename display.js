import { existsSync, readFileSync } from "node:fs";
import { createStream, table } from "table";

// https://github.com/yangshun/tree-node-cli/blob/master/src/index.js
const SYMBOLS_ANSI = {
  BRANCH: "├── ",
  EMPTY: "",
  INDENT: "  ",
  LAST_BRANCH: "└── ",
  VERTICAL: "│ ",
};

const MAX_TREE_DEPTH = 6;

export const printTable = (bomJson, filterTypes = undefined) => {
  if (!bomJson || !bomJson.components) {
    return;
  }
  if (
    bomJson.metadata?.component &&
    ["operating-system", "platform"].includes(bomJson.metadata.component.type)
  ) {
    return printOSTable(bomJson);
  }
  const config = {
    columnDefault: {
      width: 30,
    },
    columnCount: 4,
    columns: [
      { width: 25 },
      { width: 35 },
      { width: 25, alignment: "right" },
      { width: 15 },
    ],
  };
  const stream = createStream(config);
  stream.write([
    filterTypes?.includes("cryptographic-asset")
      ? "Asset Type / Group"
      : "Group",
    "Name",
    filterTypes?.includes("cryptographic-asset") ? "Version / oid" : "Version",
    "Scope",
  ]);
  for (const comp of bomJson.components) {
    if (filterTypes && !filterTypes.includes(comp.type)) {
      continue;
    }
    if (comp.type === "cryptographic-asset") {
      stream.write([
        comp.cryptoProperties?.assetType || comp.group || "",
        comp.name,
        `\x1b[1;35m${comp.cryptoProperties?.oid || ""}\x1b[0m`,
        comp.scope || "",
      ]);
    } else {
      stream.write([
        comp.group || "",
        comp.name,
        `\x1b[1;35m${comp.version || ""}\x1b[0m`,
        comp.scope || "",
      ]);
    }
  }
  console.log();
  if (!filterTypes) {
    console.log(
      "BOM includes",
      bomJson.components.length,
      "components and",
      bomJson.dependencies.length,
      "dependencies",
    );
  } else {
    console.log(`Components filtered based on type: ${filterTypes.join(", ")}`);
  }
};
const formatProps = (props) => {
  const retList = [];
  for (const p of props) {
    retList.push(`\x1b[0;32m${p.name}\x1b[0m ${p.value}`);
  }
  return retList.join("\n");
};
export const printOSTable = (bomJson) => {
  const config = {
    columnDefault: {
      width: 50,
    },
    columnCount: 3,
    columns: [{ width: 20 }, { width: 40 }, { width: 50 }],
  };
  const stream = createStream(config);
  stream.write(["Type", "Title", "Properties"]);
  for (const comp of bomJson.components) {
    stream.write([
      comp.type,
      `\x1b[1;35m${comp.name.replace(/\+/g, " ").replace(/--/g, "::")}\x1b[0m`,
      formatProps(comp.properties || []),
    ]);
  }
  console.log();
};
export const printServices = (bomJson) => {
  const data = [["Name", "Endpoints", "Authenticated", "X Trust Boundary"]];
  if (!bomJson || !bomJson.services) {
    return;
  }
  for (const aservice of bomJson.services) {
    data.push([
      aservice.name || "",
      aservice.endpoints ? aservice.endpoints.join("\n") : "",
      aservice.authenticated ? "\x1b[1;35mYes\x1b[0m" : "",
      aservice.xTrustBoundary ? "\x1b[1;35mYes\x1b[0m" : "",
    ]);
  }
  const config = {
    header: {
      alignment: "center",
      content: "List of Services\nGenerated with \u2665  by cdxgen",
    },
  };
  if (data.length > 1) {
    console.log(table(data, config));
  }
};

const locationComparator = (a, b) => {
  if (a && b && a.includes("#") && b.includes("#")) {
    const tmpA = a.split("#");
    const tmpB = b.split("#");
    if (tmpA.length === 2 && tmpB.length === 2) {
      if (tmpA[0] === tmpB[0]) {
        return tmpA[1] - tmpB[1];
      }
    }
  }
  return a.localeCompare(b);
};

export const printOccurrences = (bomJson) => {
  const data = [["Group", "Name", "Version", "Occurrences"]];
  if (!bomJson || !bomJson.components) {
    return;
  }
  for (const comp of bomJson.components) {
    if (!comp.evidence || !comp.evidence.occurrences) {
      continue;
    }
    data.push([
      comp.group || "",
      comp.name,
      comp.version || "",
      comp.evidence.occurrences
        .map((l) => l.location)
        .sort(locationComparator)
        .join("\n"),
    ]);
  }
  const config = {
    header: {
      alignment: "center",
      content: "Component Evidence\nGenerated with \u2665  by cdxgen",
    },
  };
  if (data.length > 1) {
    console.log(table(data, config));
  }
};
export const printCallStack = (bomJson) => {
  const data = [["Group", "Name", "Version", "Call Stack"]];
  if (!bomJson || !bomJson.components) {
    return;
  }
  for (const comp of bomJson.components) {
    if (
      !comp.evidence ||
      !comp.evidence.callstack ||
      !comp.evidence.callstack.frames
    ) {
      continue;
    }
    const frames = Array.from(
      new Set(
        comp.evidence.callstack.frames.map(
          (c) => `${c.fullFilename}${c.line ? `#${c.line}` : ""}`,
        ),
      ),
    ).sort(locationComparator);
    const frameDisplay = [frames[0]];
    if (frames.length > 1) {
      for (let i = 1; i < frames.length - 1; i++) {
        frameDisplay.push(`${SYMBOLS_ANSI.BRANCH} ${frames[i]}`);
      }
      frameDisplay.push(
        `${SYMBOLS_ANSI.LAST_BRANCH} ${frames[frames.length - 1]}`,
      );
    }
    data.push([
      comp.group || "",
      comp.name,
      comp.version || "",
      frameDisplay.join("\n"),
    ]);
  }
  const config = {
    header: {
      alignment: "center",
      content:
        "Component Call Stack Evidence\nGenerated with \u2665  by cdxgen",
    },
  };
  if (data.length > 1) {
    console.log(table(data, config));
  }
};
export const printDependencyTree = (bomJson, mode = "dependsOn") => {
  const dependencies = bomJson.dependencies || [];
  if (!dependencies.length) {
    return;
  }
  const depMap = {};
  const shownList = [];
  for (const d of dependencies) {
    if (d[mode]?.length) {
      depMap[d.ref] = d[mode].sort();
    } else {
      if (mode === "provides") {
        shownList.push(d.ref);
      }
    }
  }
  const treeGraphics = [];
  recursePrint(depMap, dependencies, 0, shownList, treeGraphics);
  // table library is too slow for display large lists.
  // Fixes #491
  if (treeGraphics.length && treeGraphics.length < 100) {
    const treeType =
      mode && mode === "provides" ? "Crypto Implementation" : "Dependency";
    const config = {
      header: {
        alignment: "center",
        content: `${treeType} Tree\nGenerated with \u2665  by cdxgen`,
      },
    };
    console.log(table([[treeGraphics.join("\n")]], config));
  } else {
    console.log(treeGraphics.join("\n"));
  }
};

const levelPrefix = (level, isLast) => {
  if (level === 0) {
    return SYMBOLS_ANSI.EMPTY;
  }
  let prefix = `${isLast ? SYMBOLS_ANSI.LAST_BRANCH : SYMBOLS_ANSI.BRANCH}`;
  for (let i = 0; i < level - 1; i++) {
    prefix = `${
      isLast
        ? SYMBOLS_ANSI.LAST_BRANCH.replace(" ", "─")
        : SYMBOLS_ANSI.VERTICAL
    }${isLast ? "" : SYMBOLS_ANSI.INDENT}${prefix}`;
  }
  return prefix;
};

const isReallyRoot = (depMap, refStr) => {
  for (const k of Object.keys(depMap)) {
    const dependsOn = depMap[k] || [];
    if (
      dependsOn.includes(refStr) ||
      dependsOn.includes(refStr.toLowerCase())
    ) {
      return false;
    }
  }
  return true;
};

const recursePrint = (depMap, subtree, level, shownList, treeGraphics) => {
  const listToUse = Array.isArray(subtree) ? subtree : [subtree];
  for (let i = 0; i < listToUse.length; i++) {
    const l = listToUse[i];
    const refStr = l.ref || l;
    if (
      (level === 0 &&
        isReallyRoot(depMap, refStr) &&
        !shownList.includes(refStr.toLowerCase())) ||
      level > 0
    ) {
      treeGraphics.push(
        `${levelPrefix(level, i === listToUse.length - 1)}${refStr}`,
      );
      shownList.push(refStr.toLowerCase());
      if (l && depMap[refStr]) {
        if (level < MAX_TREE_DEPTH) {
          recursePrint(
            depMap,
            depMap[refStr],
            level + 1,
            shownList,
            treeGraphics,
          );
        }
      }
    }
  }
};

export const printReachables = (sliceArtefacts) => {
  const reachablesSlicesFile = sliceArtefacts.reachablesSlicesFile;
  if (!existsSync(reachablesSlicesFile)) {
    return;
  }
  const purlCounts = {};
  const reachablesSlices = JSON.parse(
    readFileSync(reachablesSlicesFile, "utf-8"),
  );
  for (const areachable of reachablesSlices.reachables || []) {
    const purls = areachable.purls || [];
    for (const apurl of purls) {
      purlCounts[apurl] = (purlCounts[apurl] || 0) + 1;
    }
  }
  const sortedPurls = Object.fromEntries(
    Object.entries(purlCounts).sort(([, a], [, b]) => b - a),
  );
  const data = [["Package URL", "Reachable Flows"]];
  for (const apurl of Object.keys(sortedPurls)) {
    data.push([apurl, `${sortedPurls[apurl]}`]);
  }
  const config = {
    header: {
      alignment: "center",
      content: "Reachable Components\nGenerated with \u2665  by cdxgen",
    },
  };
  if (data.length > 1) {
    console.log(table(data, config));
  }
};
