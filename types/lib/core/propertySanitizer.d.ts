/**
 * Recursively sanitize structured values before embedding them in a BOM.
 *
 * @param {unknown} value structured value
 * @returns {unknown} sanitized value
 */
export declare function sanitizeStructuredValueForBom(value: unknown): unknown;
/**
 * Sanitize a URL value for safe BOM emission.
 *
 * @param {string} value URL value
 * @returns {string} sanitized URL
 */
export declare function sanitizeBomUrl(value: string): string;
/**
 * Percent-encode what an RFC 3986 URI reference cannot hold as it is, so a
 * route template or URL can be emitted where CycloneDX expects an
 * iri-reference, such as `services[].endpoints[]`. The braces of a route
 * template, spaces, `<>`, `[]` outside an IPv6 host, `|`, `^`, non-ASCII
 * characters and a `%` that starts no escape are encoded:
 * `/users/{id}` becomes `/users/%7Bid%7D`. The scheme and authority of an
 * absolute URL are kept as written, the query and fragment stay a query and
 * fragment, and existing escapes are kept, so encoding twice changes
 * nothing. Nothing is removed; strip credentials with {@link sanitizeBomUrl}
 * first.
 *
 * @param {unknown} value Route template, path or URL
 * @returns {string} The encoded reference
 */
export declare function encodeUriReference(value: unknown): string;
/**
 * Whether a value carries a token shape the BOM sanitizer redacts: cloud
 * access keys, bearer tokens, GitHub, Slack and npm tokens, JWTs and the
 * like. Callers that cannot splice a `[redacted]` marker into the value, such
 * as a URL path segment, use it to drop the value instead.
 *
 * @param {unknown} value Value to check
 * @returns {boolean} true when the value holds an inline credential
 */
export declare function hasInlineCredential(value: unknown): boolean;
/**
 * Sanitize a property value before serializing it into BOM properties.
 *
 * @param {string} name property name
 * @param {unknown} value property value
 * @returns {string|unknown} sanitized property value
 */
export declare function sanitizeBomPropertyValue(name: string, value: unknown): string | unknown;
//# sourceMappingURL=propertySanitizer.d.ts.map