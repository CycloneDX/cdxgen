import { getPropertyValue } from "./inventoryStats.js";

function getPropertyValues(propertiesOrObject, propertyName) {
  const properties = Array.isArray(propertiesOrObject)
    ? propertiesOrObject
    : Array.isArray(propertiesOrObject?.properties)
      ? propertiesOrObject.properties
      : [];
  return properties
    .filter((property) => property?.name === propertyName)
    .map((property) => property.value)
    .filter(
      (value) => value !== undefined && value !== null && `${value}` !== "",
    );
}

function safeParseDiagnosticValue(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    const parsedValue = JSON.parse(value);
    if (!parsedValue || typeof parsedValue !== "object") {
      return undefined;
    }
    return parsedValue;
  } catch {
    return undefined;
  }
}

function uniqueSortedStrings(values = []) {
  return [
    ...new Set(values.map((value) => `${value}`.trim()).filter(Boolean)),
  ].sort((firstValue, secondValue) => firstValue.localeCompare(secondValue));
}

function getDiagnosticIdentifiers(commandDiagnostics = []) {
  return uniqueSortedStrings(
    commandDiagnostics
      .map((entry) => entry.id ?? entry.command)
      .filter((value) => value !== undefined && value !== null),
  );
}

const HBOM_KNOWN_COMMAND_DIAGNOSTIC_ISSUES = new Set([
  "missing-command",
  "permission-denied",
  "partial-support",
  "timeout",
]);

/**
 * Parse command diagnostic values carried as `cdx:hbom:evidence:commandDiagnostic` properties.
 *
 * @param {Object} bomJson CycloneDX HBOM document
 * @returns {Object[]} Parsed command diagnostic objects, skipping unparseable entries
 */
export function getHbomCommandDiagnostics(bomJson) {
  return getPropertyValues(bomJson, "cdx:hbom:evidence:commandDiagnostic")
    .map((value) => safeParseDiagnosticValue(value))
    .filter(Boolean);
}

/**
 * Summarize HBOM command diagnostics by issue kind with counts and identifiers.
 *
 * @param {Object} bomJson CycloneDX HBOM document
 * @returns {Object} Summary with per-issue counts, sorted command/id/hint lists, and a `requiresPrivilegedEnrichment` flag
 */
export function getHbomCommandDiagnosticSummary(bomJson) {
  const commandDiagnostics = getHbomCommandDiagnostics(bomJson);
  const missingCommandDiagnostics = commandDiagnostics.filter(
    (entry) => entry.issue === "missing-command",
  );
  const permissionDeniedDiagnostics = commandDiagnostics.filter(
    (entry) => entry.issue === "permission-denied",
  );
  const partialSupportDiagnostics = commandDiagnostics.filter(
    (entry) => entry.issue === "partial-support",
  );
  const timeoutDiagnostics = commandDiagnostics.filter(
    (entry) => entry.issue === "timeout",
  );
  const commandErrorDiagnostics = commandDiagnostics.filter((entry) => {
    const issue = `${entry.issue ?? ""}`.trim();
    return !!issue && !HBOM_KNOWN_COMMAND_DIAGNOSTIC_ISSUES.has(issue);
  });
  const installHints = uniqueSortedStrings(
    missingCommandDiagnostics
      .map((entry) => entry.installHint)
      .filter((value) => value !== undefined && value !== null),
  );
  const privilegeHints = uniqueSortedStrings(
    permissionDeniedDiagnostics
      .map((entry) => entry.privilegeHint)
      .filter((value) => value !== undefined && value !== null),
  );
  const missingCommands = uniqueSortedStrings(
    missingCommandDiagnostics
      .map((entry) => entry.command ?? entry.id)
      .filter((value) => value !== undefined && value !== null),
  );
  const permissionDeniedCommands = uniqueSortedStrings(
    permissionDeniedDiagnostics
      .map((entry) => entry.command ?? entry.id)
      .filter((value) => value !== undefined && value !== null),
  );
  const diagnosticIssues = uniqueSortedStrings(
    commandDiagnostics
      .map((entry) => entry.issue)
      .filter((value) => value !== undefined && value !== null),
  );

  return {
    actionableDiagnosticCount:
      missingCommandDiagnostics.length + permissionDeniedDiagnostics.length,
    commandDiagnosticCount: commandDiagnostics.length,
    commandDiagnostics,
    commandErrorCount: commandErrorDiagnostics.length,
    commandErrorIds: getDiagnosticIdentifiers(commandErrorDiagnostics),
    diagnosticIssues,
    installHintCount: installHints.length,
    installHints,
    missingCommandCount: missingCommandDiagnostics.length,
    missingCommandIds: getDiagnosticIdentifiers(missingCommandDiagnostics),
    missingCommands,
    partialSupportCount: partialSupportDiagnostics.length,
    partialSupportIds: getDiagnosticIdentifiers(partialSupportDiagnostics),
    permissionDeniedCommands,
    permissionDeniedCount: permissionDeniedDiagnostics.length,
    permissionDeniedIds: getDiagnosticIdentifiers(permissionDeniedDiagnostics),
    privilegeHintCount: privilegeHints.length,
    privilegeHints,
    requiresPrivilegedEnrichment:
      permissionDeniedDiagnostics.length > 0 && privilegeHints.length > 0,
    timeoutIds: getDiagnosticIdentifiers(timeoutDiagnostics),
    timeoutCount: timeoutDiagnostics.length,
  };
}

/**
 * Determine whether a BOM carries HBOM markers (`cdx:hbom:*` properties).
 *
 * @param {Object} bomJson CycloneDX BOM document
 * @returns {boolean} `true` when the BOM looks like an HBOM
 */
export function isHbomLikeBom(bomJson) {
  if (!bomJson) {
    return false;
  }
  if (
    getPropertyValues(bomJson, "cdx:hbom:collectorProfile").length ||
    getPropertyValues(bomJson, "cdx:hbom:targetPlatform").length ||
    (bomJson?.properties || []).some((property) =>
      `${property?.name || ""}`.startsWith("cdx:hbom:"),
    )
  ) {
    return true;
  }
  if (
    (bomJson?.metadata?.component?.properties || []).some((property) =>
      `${property?.name || ""}`.startsWith("cdx:hbom:"),
    )
  ) {
    return true;
  }
  return (bomJson?.components || []).some((component) =>
    (component?.properties || []).some(
      (property) =>
        property?.name === "cdx:hbom:hardwareClass" ||
        `${property?.name || ""}`.startsWith("cdx:hbom:"),
    ),
  );
}

/**
 * Explain how the permission-denied enrichments of an HBOM can be recovered.
 *
 * Windows never uses sudo: the elevated-only batch needs an already-elevated
 * session, and a network logon is denied every WMI query.
 *
 * @param {string|undefined} platform `cdx:hbom:platform` of the HBOM
 * @returns {string} Guidance for the platform; the Linux wording for any other platform
 */
export function getHbomPrivilegeGuidance(platform) {
  if (`${platform ?? ""}`.toLowerCase() === "windows") {
    return "Some Windows enrichments were denied. Run HBOM from a local session (a non-administrator over SSH or WinRM is denied every WMI query) and, for the TPM, BitLocker, storage-reliability and Secure Boot data, from an elevated (Run as administrator) prompt with --privileged. HBOM never prompts for elevation.";
  }
  return "Some Linux enrichments can likely succeed only with --privileged and a target environment that allows non-interactive sudo.";
}

/**
 * Return a component's `cdx:hbom:hardwareClass` property value.
 *
 * @param {Object} component CycloneDX component
 * @returns {string|undefined} Hardware class value when present
 */
export function getHbomHardwareClass(component) {
  return getPropertyValue(component, "cdx:hbom:hardwareClass");
}

/**
 * Count components per `cdx:hbom:hardwareClass`, sorted by count descending.
 *
 * @param {Object[]} [components=[]] CycloneDX components
 * @returns {{hardwareClass: string, count: number}[]} Sorted hardware class counts
 */
export function getHbomHardwareClassCounts(components = []) {
  const counts = new Map();
  for (const component of components || []) {
    const hardwareClass = getHbomHardwareClass(component);
    if (!hardwareClass) {
      continue;
    }
    counts.set(hardwareClass, (counts.get(hardwareClass) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([hardwareClass, count]) => ({ hardwareClass, count }))
    .sort(
      (firstEntry, secondEntry) =>
        secondEntry.count - firstEntry.count ||
        firstEntry.hardwareClass.localeCompare(secondEntry.hardwareClass),
    );
}

/**
 * Format the top hardware-class counts as a `class (count)` comma-separated string.
 *
 * @param {{hardwareClass: string, count: number}[]} [hardwareClassCounts=[]] Hardware class counts
 * @returns {string} Summary string covering at most five entries
 */
export function formatHbomHardwareClassSummary(hardwareClassCounts = []) {
  return hardwareClassCounts
    .slice(0, 5)
    .map(({ hardwareClass, count }) => `${hardwareClass} (${count})`)
    .join(", ");
}

/**
 * Build an overall HBOM summary from metadata, components, evidence, and diagnostics.
 *
 * @param {Object} bomJson CycloneDX HBOM document
 * @returns {Object} HBOM summary with collector profile, platform, architecture, hardware class counts, evidence counts, and command diagnostic details
 */
export function getHbomSummary(bomJson) {
  const metadataComponent = bomJson?.metadata?.component;
  const hardwareClassCounts = getHbomHardwareClassCounts(
    bomJson?.components || [],
  );
  const commandDiagnosticSummary = getHbomCommandDiagnosticSummary(bomJson);
  const evidenceCommands = getPropertyValues(
    bomJson,
    "cdx:hbom:evidence:command",
  );
  const evidenceFiles = getPropertyValues(bomJson, "cdx:hbom:evidence:file");
  const commandCountValue = getPropertyValue(
    bomJson,
    "cdx:hbom:evidence:commandCount",
  );
  const fileCountValue = getPropertyValue(
    bomJson,
    "cdx:hbom:evidence:fileCount",
  );
  const evidenceCommandCount = Number.parseInt(
    `${commandCountValue ?? evidenceCommands.length}`,
    10,
  );
  const evidenceFileCount = Number.parseInt(
    `${fileCountValue ?? evidenceFiles.length}`,
    10,
  );

  return {
    actionableDiagnosticCount:
      commandDiagnosticSummary.actionableDiagnosticCount,
    architecture:
      getPropertyValue(metadataComponent, "cdx:hbom:architecture") ||
      getPropertyValue(bomJson, "cdx:hbom:targetArchitecture") ||
      getPropertyValue(bomJson, "cdx:hbom:architecture"),
    collectorProfile: getPropertyValue(bomJson, "cdx:hbom:collectorProfile"),
    commandDiagnosticCount: commandDiagnosticSummary.commandDiagnosticCount,
    commandDiagnostics: commandDiagnosticSummary.commandDiagnostics,
    commandErrorCount: commandDiagnosticSummary.commandErrorCount,
    commandErrorIds: commandDiagnosticSummary.commandErrorIds,
    componentCount: (bomJson?.components || []).length,
    diagnosticIssues: commandDiagnosticSummary.diagnosticIssues,
    evidenceCommandCount: Number.isNaN(evidenceCommandCount)
      ? evidenceCommands.length
      : evidenceCommandCount,
    evidenceCommands,
    evidenceFileCount: Number.isNaN(evidenceFileCount)
      ? evidenceFiles.length
      : evidenceFileCount,
    evidenceFiles,
    hardwareClassCount: hardwareClassCounts.length,
    hardwareClassCounts,
    identifierPolicy:
      getPropertyValue(metadataComponent, "cdx:hbom:identifierPolicy") ||
      getPropertyValue(bomJson, "cdx:hbom:identifierPolicy"),
    installHintCount: commandDiagnosticSummary.installHintCount,
    installHints: commandDiagnosticSummary.installHints,
    manufacturer: metadataComponent?.manufacturer?.name,
    metadataName: metadataComponent?.name,
    metadataType: metadataComponent?.type,
    missingCommandCount: commandDiagnosticSummary.missingCommandCount,
    missingCommandIds: commandDiagnosticSummary.missingCommandIds,
    missingCommands: commandDiagnosticSummary.missingCommands,
    partialSupportCount: commandDiagnosticSummary.partialSupportCount,
    partialSupportIds: commandDiagnosticSummary.partialSupportIds,
    platform:
      getPropertyValue(metadataComponent, "cdx:hbom:platform") ||
      getPropertyValue(bomJson, "cdx:hbom:targetPlatform") ||
      getPropertyValue(bomJson, "cdx:hbom:platform"),
    permissionDeniedCommands: commandDiagnosticSummary.permissionDeniedCommands,
    permissionDeniedCount: commandDiagnosticSummary.permissionDeniedCount,
    permissionDeniedIds: commandDiagnosticSummary.permissionDeniedIds,
    privilegeHintCount: commandDiagnosticSummary.privilegeHintCount,
    privilegeHints: commandDiagnosticSummary.privilegeHints,
    requiresPrivilegedEnrichment:
      commandDiagnosticSummary.requiresPrivilegedEnrichment,
    timeoutIds: commandDiagnosticSummary.timeoutIds,
    timeoutCount: commandDiagnosticSummary.timeoutCount,
    topHardwareClasses: hardwareClassCounts.slice(0, 5),
  };
}
