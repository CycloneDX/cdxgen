/**
 * Parse command diagnostic values carried as `cdx:hbom:evidence:commandDiagnostic` properties.
 *
 * @param {Object} bomJson CycloneDX HBOM document
 * @returns {Object[]} Parsed command diagnostic objects, skipping unparseable entries
 */
export declare function getHbomCommandDiagnostics(bomJson: Object): Object[];
/**
 * Summarize HBOM command diagnostics by issue kind with counts and identifiers.
 *
 * @param {Object} bomJson CycloneDX HBOM document
 * @returns {Object} Summary with per-issue counts, sorted command/id/hint lists, and a `requiresPrivilegedEnrichment` flag
 */
export declare function getHbomCommandDiagnosticSummary(bomJson: Object): Object;
/**
 * Determine whether a BOM carries HBOM markers (`cdx:hbom:*` properties).
 *
 * @param {Object} bomJson CycloneDX BOM document
 * @returns {boolean} `true` when the BOM looks like an HBOM
 */
export declare function isHbomLikeBom(bomJson: Object): boolean;
/**
 * Explain how the permission-denied enrichments of an HBOM can be recovered.
 *
 * Windows never uses sudo: the elevated-only batch needs an already-elevated
 * session, and a network logon is denied every WMI query.
 *
 * @param {string|undefined} platform `cdx:hbom:platform` of the HBOM
 * @returns {string} Guidance for the platform; the Linux wording for any other platform
 */
export declare function getHbomPrivilegeGuidance(platform: string | undefined): string;
/**
 * Return a component's `cdx:hbom:hardwareClass` property value.
 *
 * @param {Object} component CycloneDX component
 * @returns {string|undefined} Hardware class value when present
 */
export declare function getHbomHardwareClass(component: Object): string | undefined;
/**
 * Count components per `cdx:hbom:hardwareClass`, sorted by count descending.
 *
 * @param {Object[]} [components=[]] CycloneDX components
 * @returns {{hardwareClass: string, count: number}[]} Sorted hardware class counts
 */
export declare function getHbomHardwareClassCounts(components?: Object[]): {
    hardwareClass: string;
    count: number;
}[];
/**
 * Format the top hardware-class counts as a `class (count)` comma-separated string.
 *
 * @param {{hardwareClass: string, count: number}[]} [hardwareClassCounts=[]] Hardware class counts
 * @returns {string} Summary string covering at most five entries
 */
export declare function formatHbomHardwareClassSummary(hardwareClassCounts?: {
    hardwareClass: string;
    count: number;
}[]): string;
/**
 * Build an overall HBOM summary from metadata, components, evidence, and diagnostics.
 *
 * @param {Object} bomJson CycloneDX HBOM document
 * @returns {Object} HBOM summary with collector profile, platform, architecture, hardware class counts, evidence counts, and command diagnostic details
 */
export declare function getHbomSummary(bomJson: Object): Object;
//# sourceMappingURL=hbomAnalysis.d.ts.map