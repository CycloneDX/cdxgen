/**
 * Parse a certificate notValidAfter value.
 *
 * @param {*} value timestamp or date-only string
 * @returns {number|undefined} epoch milliseconds, or undefined when the value
 *   does not parse
 */
export declare function parseCertificateEndMillis(value: any): number | undefined;
export declare function loadRules(rulesDir: any): Promise<any[]>;
/**
 * Evaluate a single rule against the BOM using JSONata
 * @param {Object} rule - Parsed rule object
 * @param {Object} bomJson - Full CycloneDX BOM object
 * @returns {Promise<Array>} Array of matched findings
 */
export declare function evaluateRule(rule: Object, bomJson: Object, options?: {}): Promise<any[]>;
/**
 * Evaluate all rules against a BOM
 */
export declare function evaluateRules(rules: any, bomJson: any, options?: {}): Promise<any[]>;
//# sourceMappingURL=ruleEngine.d.ts.map