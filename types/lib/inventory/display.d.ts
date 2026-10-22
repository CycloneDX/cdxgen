/**
 * Build operator-facing AI-BOM summary lines.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {string[]} formatted AI-BOM summary lines
 */
export declare function buildAiBomInsightLines(bomJson: Object): string[];
/**
 * Print operator-facing AI-BOM summary lines.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 */
export declare function printAiBomInsights(bomJson: Object): void;
/**
 * Build AI-BOM pedigree lines for REPL inspection.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {string[]} formatted pedigree lines
 */
export declare function buildAiBomPedigreeLines(bomJson: Object): string[];
/**
 * Print AI-BOM pedigree lines.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 */
export declare function printAiBomPedigree(bomJson: Object): void;
/**
 * Build AI-BOM model variant lines for REPL inspection.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {string[]} formatted variant lines
 */
export declare function buildAiBomVariantLines(bomJson: Object): string[];
/**
 * Print AI-BOM model variant lines.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 */
export declare function printAiBomVariants(bomJson: Object): void;
/**
 * Build AI-BOM dataset usage lines for REPL inspection.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {string[]} formatted dataset lines
 */
export declare function buildAiBomDatasetLines(bomJson: Object): string[];
/**
 * Print AI-BOM dataset usage lines.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 */
export declare function printAiBomDatasets(bomJson: Object): void;
/**
 * Builds the summary and provenance lines printed after the component table.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @param {string[]|undefined} filterTypes Optional list of component types to include
 * @param {string|undefined} summaryText Optional summary message to print after the table
 * @param {number} displayedProvenanceCount Number of displayed components with registry provenance
 * @returns {string[]} Summary lines to print
 */
export declare const buildTableSummaryLines: (bomJson: Object, filterTypes: string[] | undefined, summaryText: string | undefined, displayedProvenanceCount?: number) => string[];
/**
 * Builds legend lines for dependency tree marker icons.
 *
 * @param {string[]} treeGraphics Dependency tree lines
 * @returns {string[]} Legend lines to print after the tree output
 */
export declare const buildDependencyTreeLegendLines: (treeGraphics: string[]) => string[];
/**
 * Aggregate recorded activities into a summary payload with mode and status counts.
 *
 * @param {Object[]} activities Recorded activity objects with a status field
 * @param {boolean} [dryRunMode] Whether the run was a dry run; defaults to the global dry-run flag
 * @returns {Object} Payload containing the activities, mode ("dry-run" or "debug"), and summary counts
 */
export declare function buildActivitySummaryPayload(activities: Object[], dryRunMode?: boolean): Object;
/**
 * Serialize an activity summary into report lines for the given report type.
 *
 * Produces a single pretty-printed JSON document for "json", newline-delimited
 * JSON records (a summary record followed by one record per activity) for
 * "jsonl", and no lines otherwise.
 *
 * @param {Object[]} activities Recorded activity objects
 * @param {string} [reportType] Report format: "json" or "jsonl"
 * @param {boolean} [dryRunMode] Whether the run was a dry run; defaults to the global dry-run flag
 * @returns {string[]} Serialized report lines; empty when the report type is unsupported
 */
export declare function serializeActivitySummary(activities: Object[], reportType?: string, dryRunMode?: boolean): string[];
/**
 * Prints the BOM components as a streaming table to the console.
 * Delegates to {@link printOSTable} automatically when the BOM metadata indicates
 * an operating-system or platform component type.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @param {string[]} [filterTypes] Optional list of component types to include; all types shown when omitted
 * @param {string} [highlight] Optional string to highlight in the output
 * @param {string} [summaryText] Optional summary message to print after the table
 * @returns {void}
 */
export declare function printTable(bomJson: Object, filterTypes?: string[], highlight?: string, summaryText?: string): void;
/**
 * Prints OS package components from the BOM as a formatted streaming table.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {void}
 */
export declare function printOSTable(bomJson: Object): void;
/**
 * Prints the services listed in the BOM as a formatted table.
 * Includes endpoint URLs, authentication flag, and cross-trust-boundary flag.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {void}
 */
export declare function printServices(bomJson: Object): void;
/**
 * Prints the formulation components from the BOM as a formatted table.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {void}
 */
export declare function printFormulation(bomJson: Object): void;
/**
 * Prints component evidence occurrences (file locations) as a streaming table.
 * Only components that have `evidence.occurrences` are included.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {void}
 */
export declare function printOccurrences(bomJson: Object): void;
/**
 * Prints the call stack evidence for each component in the BOM as a formatted table.
 * Only components that have `evidence.callstack.frames` are included.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {void}
 */
export declare function printCallStack(bomJson: Object): void;
/**
 * Prints the dependency tree from the BOM as an ASCII tree diagram.
 * Uses the `table` library for small trees and plain console output for larger ones.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object containing a `dependencies` array
 * @param {string} [mode="dependsOn"] Dependency relation to traverse (`"dependsOn"` or `"provides"`)
 * @param {string} [highlight] Optional string to highlight in the tree output
 * @returns {void}
 */
export declare function printDependencyTree(bomJson: Object, mode?: string, highlight?: string): void;
/**
 * Builds printable dependency tree lines from a BOM dependency graph.
 * Produces a spanning forest so shared children are rendered once, while
 * disconnected or cyclic subgraphs are still emitted as dangling trees.
 *
 * @param {Object[]} dependencies CycloneDX dependency objects
 * @param {string} [mode="dependsOn"] Dependency relation to traverse
 * @returns {string[]} Dependency tree lines ready for console rendering
 */
export declare const buildDependencyTreeLines: (dependencies: Object[], mode?: string) => string[];
/**
 * Prints a table of reachable components derived from a reachability slices file.
 * Aggregates per-purl reachable-flow counts and sorts them descending.
 *
 * @param {Object} sliceArtefacts Slice artefact paths, must include `reachablesSlicesFile`
 * @returns {void}
 */
export declare function printReachables(sliceArtefacts: Object): void;
/**
 * Prints a formatted table of CycloneDX vulnerability objects.
 *
 * @param {Object[]} vulnerabilities Array of CycloneDX vulnerability objects
 * @returns {void}
 */
export declare function printVulnerabilities(vulnerabilities: Object[]): void;
/**
 * Prints an OWASP donation banner when running in a CI environment.
 * The banner is suppressed when `options.noBanner` is set or the repository
 * belongs to the cdxgen project itself.
 *
 * @param {Object} options CLI options
 * @returns {void}
 */
export declare function printSponsorBanner(options: Object): void;
/**
 * Prints a BOM summary table including generator tool names, component package types,
 * and component namespaces extracted from BOM metadata properties.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {void}
 */
export declare function printSummary(bomJson: Object): void;
/**
 * Print the recorded activity summary to the console.
 *
 * For "json"/"jsonl" report types the serialized lines are printed verbatim;
 * otherwise a human-readable console summary with status counts is shown.
 *
 * @param {string} [reportType] Report format: "json", "jsonl", or undefined for console output
 * @returns {void}
 */
export declare function printActivitySummary(reportType?: string): void;
export type EnvAuditFinding = {
    type: string;
    variable: string;
    severity: string;
    message: string;
    mitigation: string;
};
/**
 * Prints a grouped secure-mode environment audit call-out panel.
 *
 * @param {EnvAuditFinding[]} envAuditFindings Audit findings to display
 * @returns {void}
 */
export declare function printEnvironmentAuditFindings(envAuditFindings?: EnvAuditFinding[]): void;
/**
 * Runs the pre-generation environment audit and renders the results as formatted
 * tables to the console. Called when the --env-audit CLI flag is set.
 *
 * @param {string} filePath Project path being scanned
 * @param {Object} config Loaded .cdxgenrc / config-file values
 * @param {Object} options Effective CLI options
 * @param {EnvAuditFinding[]} envAuditFindings Audit findings to display
 */
export declare function displaySelfThreatModel(filePath: string, config: Object, options: Object, envAuditFindings: EnvAuditFinding[]): void;
/**
 * Print a table of the BOM's certificate components: role, name, issuer,
 * expiry, the SPKI prefix and how many locations each certificate appears
 * in, with a marker when the audit flagged it.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @returns {void}
 */
export declare function printCertificatesTable(bomJson: Object): void;
/**
 * Print the issuer chain above a certificate and the certificates issued
 * under it, walking the verified `dependsOn` edges.
 *
 * @param {Object} bomJson CycloneDX BOM JSON object
 * @param {string} selector bom-ref, SPKI hex prefix or certificate ref prefix
 * @returns {void}
 */
export declare function printCertificateChain(bomJson: Object, selector: string): void;
//# sourceMappingURL=display.d.ts.map