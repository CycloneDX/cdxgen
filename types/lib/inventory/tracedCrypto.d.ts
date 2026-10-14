/**
 * Names the bulk cipher of a TLS cipher suite as a crypto-oid.json key, from
 * either its IANA name (TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256) or its OpenSSL
 * name (ECDHE-RSA-AES128-GCM-SHA256).
 *
 * @param {string} suiteName Cipher suite name
 * @returns {{name: string, bits: number, mode: string|undefined}|undefined} The cipher, when it has an OID
 */
export declare function suiteCipher(suiteName: string): {
    name: string;
    bits: number;
    mode: string | undefined;
} | undefined;
/**
 * Turns the CBOM safer-exec writes for a traced command into components that
 * cdxgen can merge and validate:
 *
 * - every asset gets a bom-ref, without which the assets merge into one
 * - algorithms carry their OID, and those without one are left out
 * - hybrid key-exchange groups become their classical and ML-KEM halves
 * - cipher suites become their bulk cipher, which the protocol's suites refer
 *   to by bom-ref
 * - algorithm properties keep only values the schema allows
 * - crypto libraries are left out: they are the traced library components,
 *   marked with cdx:dynamic:cryptoLibrary
 *
 * @param {Object[]} cbomComponents Components of the safer-exec CBOM
 * @returns {Object[]} Normalized cryptographic-asset components
 */
export declare function normalizeTracedCryptoComponents(cbomComponents: Object[]): Object[];
/**
 * Maps the crypto libraries safer-exec reported to the paths they were loaded
 * from.
 *
 * @param {Object[]} cryptoEntries safer-exec crypto-library and crypto-cipher audit entries
 * @returns {Map<string, {name: string, version: string}>} Crypto libraries by path
 */
export declare function cryptoLibrariesByPath(cryptoEntries: Object[]): Map<string, {
    name: string;
    version: string;
}>;
//# sourceMappingURL=tracedCrypto.d.ts.map