/**
 * Strict JSON reading for signed documents.
 *
 * JSF signs the RFC 8785 (JCS) form of a document, and JCS is defined over
 * I-JSON (RFC 7493) input. `JSON.parse` and lenient UTF-8 decoding accept
 * things I-JSON rules out, and each lets two parsers read different values
 * from the same signed bytes:
 *
 * - a member name repeated within one object, where `JSON.parse` keeps the last
 *   value and other parsers keep the first or refuse the document;
 * - a number an IEEE 754 double cannot hold exactly, which JavaScript rounds
 *   while arbitrary-precision parsers keep every digit;
 * - bytes that are not UTF-8, which lenient decoders turn into U+FFFD while
 *   others refuse them or read another encoding;
 * - an unpaired UTF-16 surrogate escape, which some parsers keep and others
 *   replace.
 *
 * {@link parseStrictJson} rejects all of them, so the values a verifier checks
 * are the values every consumer of the document reads.
 */
/**
 * Raised when JSON text is well-formed but breaks one of the rules above.
 */
export declare class StrictJsonError extends Error {
    pointer: string;
    /**
     * @param {string} message - Description of the problem
     * @param {string} pointer - RFC 6901 JSON Pointer to the offending member or value
     */
    constructor(message: string, pointer: string);
}
/**
 * Parses JSON the way `JSON.parse` does, but refuses bytes that are not UTF-8,
 * repeated member names within an object, numbers that an IEEE 754 double
 * cannot hold exactly, and unpaired UTF-16 surrogates.
 *
 * Pass the raw bytes of a document rather than text decoded elsewhere, so that
 * invalid UTF-8 is detected instead of being replaced by U+FFFD.
 *
 * @param {string|Uint8Array} input - JSON text, or its UTF-8 bytes
 * @returns {any} - The parsed value
 * @throws {SyntaxError} When the text is not JSON
 * @throws {StrictJsonError} When the input breaks one of the rules above
 */
export declare function parseStrictJson(input: string | Uint8Array): any;
//# sourceMappingURL=strictJson.d.ts.map