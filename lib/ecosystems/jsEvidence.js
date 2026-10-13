// JavaScript/TypeScript evidence collection.
//
// This lives in lib/ecosystems/ rather than lib/inventory/evidenceUtils.js
// because it is npm-specific throughout: node_modules resolution, package.json
// parsing, and the `cdx:npm:bin/` import convention. Keeping it here lets it
// import parsers-js directly instead of having parsePkgJson threaded in as an
// injected helper from the CLI.

import { dirname, isAbsolute, join, resolve } from "node:path";

import { safeExistsSync } from "../core/fs.js";
import { createOccurrenceEvidence } from "../inventory/evidenceUtils.js";
import { isPkgTypeOnlyImport, setNpmTypeOnlyProperty } from "./npmutils.js";
import { parsePkgJson } from "./parsers-js.js";

const NPM_BIN_IMPORT_PREFIX = "cdx:npm:bin/";

function getNpmBinPropertyValues(pkg, propertyName) {
  if (!Array.isArray(pkg?.properties)) {
    return [];
  }
  return pkg.properties
    .filter((property) => property.name === propertyName && property.value)
    .map((property) => String(property.value));
}

function splitNpmBinPropertyList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getNpmPackageBinCommandNames(pkg) {
  const binNames = new Set();
  if (pkg?.bin && typeof pkg.bin === "object") {
    for (const binName of Object.keys(pkg.bin)) {
      binNames.add(binName);
    }
  } else if (typeof pkg?.bin === "string") {
    binNames.add(pkg.name);
  }
  for (const binValue of getNpmBinPropertyValues(pkg, "cdx:npm:bin")) {
    for (const binName of splitNpmBinPropertyList(binValue)) {
      binNames.add(binName);
    }
  }
  for (const binPathValue of getNpmBinPropertyValues(pkg, "cdx:npm:binPaths")) {
    for (const binPath of splitNpmBinPropertyList(binPathValue)) {
      const normalizedBinPath = binPath.replaceAll("\\", "/");
      const binName = normalizedBinPath.split("/").filter(Boolean).pop();
      if (binName) {
        binNames.add(binName);
      }
    }
  }
  return binNames;
}

function getNpmBinCommandEvidenceKeys(allImports, pkg) {
  const binCommandNames = getNpmPackageBinCommandNames(pkg);
  if (!binCommandNames.size) {
    return [];
  }
  return Object.keys(allImports || {}).filter(
    (importName) =>
      importName.startsWith(NPM_BIN_IMPORT_PREFIX) &&
      binCommandNames.has(importName.slice(NPM_BIN_IMPORT_PREFIX.length)),
  );
}

function applyNpmBinCommandEvidence(pkg, allImports) {
  const binEvidenceKeys = getNpmBinCommandEvidenceKeys(allImports, pkg);
  if (!binEvidenceKeys.length) {
    return;
  }
  pkg.scope = "required";
  const seenOccurrenceLocations = new Set(
    (pkg.evidence?.occurrences || []).map(
      (occurrence) =>
        `${occurrence.location}${occurrence.line ? `#${occurrence.line}` : ""}`,
    ),
  );
  for (const binEvidenceKey of binEvidenceKeys) {
    for (const evidence of allImports[binEvidenceKey] || []) {
      if (!evidence?.fileName) {
        continue;
      }
      const occurrence = createOccurrenceEvidence(evidence.fileName, {
        ...(evidence.lineNumber ? { line: evidence.lineNumber } : {}),
      });
      if (!occurrence) {
        continue;
      }
      const occurrenceLocation = `${occurrence.location}${occurrence.line ? `#${occurrence.line}` : ""}`;
      if (seenOccurrenceLocations.has(occurrenceLocation)) {
        continue;
      }
      pkg.evidence = pkg.evidence || {};
      pkg.evidence.occurrences = pkg.evidence.occurrences || [];
      pkg.evidence.occurrences.push(occurrence);
      seenOccurrenceLocations.add(occurrenceLocation);
    }
  }
}

/**
 * Fill in a component's missing npm metadata (description, author, license,
 * homepage, repository) from the package.json of the copy installed under the
 * scanned project's node_modules.
 *
 * `internal:LocalNodeModulesPath` is either an absolute path (pnpm virtual
 * store) or an arborist `node.location`, which is relative to the directory of
 * the lock file the component was parsed from - recorded on the component as
 * `internal:SrcFile` - and never to the directory cdxgen was invoked from.
 * Resolving it against the working directory instead would let a same-named
 * package in an unrelated node_modules pose as the metadata source, whatever
 * its version, and an unrelated package.json without a license would wipe the
 * license the component already had (#4443).
 *
 * @param {object} pkg Package component to enrich in place.
 */
async function fillMissingMetadataFromLocalNodeModules(pkg) {
  if (pkg.description || !Array.isArray(pkg.properties)) {
    return;
  }
  const propValue = (propName) =>
    pkg.properties.find((property) => property.name === propName)?.value;
  const localNodeModulesPath = propValue("internal:LocalNodeModulesPath");
  if (!localNodeModulesPath) {
    return;
  }
  let pkgJsonFile;
  if (isAbsolute(localNodeModulesPath)) {
    pkgJsonFile = join(localNodeModulesPath, "package.json");
  } else {
    // Relative arborist locations are anchored to the lock file's directory.
    // Without that anchor there is no trustworthy base, so skip the lookup
    // rather than resolve against the working directory.
    const srcFile = propValue("internal:SrcFile");
    if (!srcFile) {
      return;
    }
    pkgJsonFile = resolve(
      dirname(srcFile),
      localNodeModulesPath,
      "package.json",
    );
  }
  if (!safeExistsSync(pkgJsonFile)) {
    return;
  }
  const lnmPkgList = await parsePkgJson(pkgJsonFile, true);
  const lnmMetadata = lnmPkgList?.length === 1 ? lnmPkgList[0] : undefined;
  if (!lnmMetadata || !Object.keys(lnmMetadata).length) {
    return;
  }
  // The installed copy must describe the same release as the component; a
  // version mismatch means the file belongs to a different build of the
  // package and none of its metadata can be trusted for this component.
  if (pkg.version && lnmMetadata.version !== pkg.version) {
    return;
  }
  if (!pkg.description && lnmMetadata.description) {
    pkg.description = lnmMetadata.description;
  }
  if (!pkg.author && lnmMetadata.author) {
    pkg.author = lnmMetadata.author;
  }
  if (!pkg.license && lnmMetadata.license) {
    pkg.license = lnmMetadata.license;
  }
  if (!pkg.homepage && lnmMetadata.homepage) {
    pkg.homepage = lnmMetadata.homepage;
  }
  if (!pkg.repository && lnmMetadata.repository) {
    pkg.repository = lnmMetadata.repository;
  }
}

/**
 * Attach JS/TS import and export usage evidence to matching package components.
 *
 * For each component, resolves its module aliases (including the deno jsr
 * specifier), records imported/exported modules as properties, attaches
 * occurrence evidence, and promotes the component scope to "required" when the
 * package is used. A package with no observed usage keeps the scope its
 * manifest parser assigned: static import analysis cannot see packages loaded
 * from configuration, bundler entrypoints, stylesheets, or plugins, so a
 * missing import is not evidence that a package is optional.
 *
 * @param {Array<object>} pkgList Package components to enrich.
 * @param {object} allImports Map of import specifier to usage evidence objects.
 * @param {object} allExports Map of export specifier to export evidence objects.
 * @param {boolean} deep When true, fill in missing description/author/license
 *   metadata from the local node_modules copy of each package.
 * @returns {Promise<Array<object>>} The enriched package list (same reference as pkgList).
 */
export async function addEvidenceForImports(
  pkgList,
  allImports,
  allExports,
  deep,
) {
  const impPkgs = Object.keys(allImports);
  const exportedPkgs = Object.keys(allExports);
  for (const pkg of pkgList) {
    const { group, name } = pkg;
    // Evidence belonging to a type must be associated with the package
    if (group === "@types") {
      continue;
    }
    // Capture metadata such as description from local node_modules in deep
    // mode. This must not live inside the alias loop below: an alias that
    // matches an import ends that loop with a break, and metadata enrichment
    // must not depend on which aliases the source happens to import.
    if (deep) {
      await fillMissingMetadataFromLocalNodeModules(pkg);
    }
    const aliases = group?.length
      ? [name, `${group}/${name}`, `@${group}/${name}`]
      : [name];
    // Deno jsr packages are published under the `@jsr` npm-compat scope
    // (e.g. `@jsr/std__assert`) but are imported in source using their
    // original jsr specifier (e.g. `@std/assert`). Match occurrence evidence
    // against that specifier too, recovered from the `cdx:deno:jsrKey`
    // property recorded during deno.lock parsing.
    const jsrKey = (pkg.properties || []).find(
      (p) => p.name === "cdx:deno:jsrKey",
    )?.value;
    if (jsrKey) {
      const atIndex = jsrKey.lastIndexOf("@");
      const jsrSpecifier = atIndex > 0 ? jsrKey.substring(0, atIndex) : jsrKey;
      if (jsrSpecifier && !aliases.includes(jsrSpecifier)) {
        aliases.push(jsrSpecifier);
      }
    }
    for (const alias of aliases) {
      const isWasmAlias = /\.wasm([?#].*)?$/i.test(alias);
      const all_includes = impPkgs.filter(
        (find_pkg) =>
          find_pkg.startsWith(alias) &&
          (find_pkg.length === alias.length || find_pkg[alias.length] === "/"),
      );
      const all_exports = exportedPkgs.filter((find_pkg) =>
        find_pkg.startsWith(alias),
      );
      if (all_exports?.length) {
        let exportedModules = new Set(isWasmAlias ? [] : all_exports);
        pkg.properties = pkg.properties || [];
        for (const subevidence of all_exports) {
          const evidences = allExports[subevidence];
          for (const evidence of evidences) {
            if (evidence && Object.keys(evidence).length) {
              if (isWasmAlias) {
                for (const wasmImportedModule of evidence.importedModules ||
                  []) {
                  if (wasmImportedModule?.length) {
                    exportedModules.add(wasmImportedModule);
                  }
                }
              }
              if (evidence.exportedModules.length > 1) {
                for (const aexpsubm of evidence.exportedModules) {
                  // Be selective on the submodule names
                  if (
                    !evidence.importedAs
                      .toLowerCase()
                      .includes(aexpsubm.toLowerCase()) &&
                    !alias.endsWith(aexpsubm)
                  ) {
                    // Store both the short and long form of the exported sub modules
                    if (aexpsubm.length > 3) {
                      exportedModules.add(aexpsubm);
                    }
                    exportedModules.add(
                      `${evidence.importedAs.replace("./", "")}/${aexpsubm}`,
                    );
                  }
                }
              }
            }
          }
        }
        exportedModules = Array.from(exportedModules);
        if (exportedModules.length) {
          pkg.properties.push({
            name: "internal:ExportedModules",
            value: exportedModules.join(","),
          });
        }
      }
      // Identify all the imported modules of a component
      if (impPkgs.includes(alias) || all_includes.length) {
        let importedModules = new Set();
        let wasmExportedModules = new Set();
        const seenOccurrenceLocations = new Set();
        // A package imported only for its types is erased at compile time.
        // Scoping it excluded here, rather than when the BOM is assembled,
        // keeps propagateRequiredScopeFromDependencies from promoting what it
        // depends on. A package whose bin command is used is still required.
        if (
          isPkgTypeOnlyImport(allImports, group, name) &&
          !getNpmBinCommandEvidenceKeys(allImports, pkg).length
        ) {
          pkg.scope = "excluded";
          setNpmTypeOnlyProperty(pkg);
        } else {
          pkg.scope = "required";
        }
        for (const subevidence of all_includes) {
          const evidences = allImports[subevidence];
          for (const evidence of evidences) {
            if (evidence && Object.keys(evidence).length && evidence.fileName) {
              const occurrence = createOccurrenceEvidence(evidence.fileName, {
                ...(evidence.lineNumber ? { line: evidence.lineNumber } : {}),
              });
              if (occurrence) {
                pkg.evidence = pkg.evidence || {};
                pkg.evidence.occurrences = pkg.evidence.occurrences || [];
                const occurrenceLocation = `${occurrence.location}${occurrence.line ? `#${occurrence.line}` : ""}`;
                if (!seenOccurrenceLocations.has(occurrenceLocation)) {
                  pkg.evidence.occurrences.push(occurrence);
                  seenOccurrenceLocations.add(occurrenceLocation);
                }
              }
              importedModules.add(evidence.importedAs);
              for (const importedSm of evidence.importedModules || []) {
                if (!importedSm) {
                  continue;
                }
                if (isWasmAlias) {
                  wasmExportedModules.add(importedSm);
                }
                // Store both the short and long form of the imported sub modules
                if (importedSm.length > 3) {
                  importedModules.add(importedSm);
                }
                importedModules.add(`${evidence.importedAs}/${importedSm}`);
              }
            }
          }
        }
        importedModules = Array.from(importedModules);
        wasmExportedModules = Array.from(wasmExportedModules);
        if (importedModules.length) {
          pkg.properties = pkg.properties || [];
          pkg.properties.push({
            name: "internal:ImportedModules",
            value: importedModules.join(","),
          });
        }
        if (isWasmAlias && wasmExportedModules.length) {
          pkg.properties = pkg.properties || [];
          if (
            !pkg.properties.some((p) => p.name === "internal:ExportedModules")
          ) {
            pkg.properties.push({
              name: "internal:ExportedModules",
              value: wasmExportedModules.join(","),
            });
          }
        }
        break;
      }
    } // for alias
    // Trim the properties
    applyNpmBinCommandEvidence(pkg, allImports);
    pkg.properties = pkg.properties.filter(
      (p) => p.name !== "internal:LocalNodeModulesPath",
    );
  } // for pkg
  return pkgList;
}
