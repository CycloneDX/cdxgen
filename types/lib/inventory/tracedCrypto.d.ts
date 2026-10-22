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
 * Builds the shared certificate model for the chains servers presented in TLS
 * ≤ 1.2 handshakes, from the `chain` arrays of safer-exec's crypto result
 * (report channel, safer-exec ≥ 1.2.0; earlier releases and TLS 1.3 entries
 * carry no chain and yield nothing). The records go through the shared
 * certificate collector, so bom-refs, properties and dedup match certificates
 * found on disk. A presented chain is untrusted server input: no issuer edges
 * are inferred from it, and the certificate and public-key components link
 * through the collector as every producer's do. Each TLS protocol component
 * provides the certificates and keys presented under it — the edge safer-
 * exec's own CBOM records — which answers which servers presented a key.
 *
 * @param {Object} cryptoResult safer-exec CRYPTO result (`result.crypto`)
 * @param {Set<string>} protocolRefs bom-refs of the protocol components in the BOM;
 *   a provides edge is only emitted for a protocol that is actually present
 * @returns {{components: Object[], dependencies: Object[]}} certificate,
 *   public-key and algorithm components, and the protocol provides edges
 */
export declare function observedChainComponents(cryptoResult: Object, protocolRefs?: Set<string>): {
    components: Object[];
    dependencies: Object[];
};
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