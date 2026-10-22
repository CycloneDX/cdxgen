/**
 * An internationalized hostname: mapped to its A-label form with UTS #46
 * processing, held to the ASCII hostname rules, and every A-label decoded
 * back and checked for the characters IDNA allows.
 *
 * @param {string} hostname Hostname, possibly holding non-ASCII labels
 * @returns {boolean} Whether it is a valid IDN hostname
 */
export declare const isValidIdnHostname: (hostname: string) => boolean;
/**
 * Whether a value is a valid RFC 6531 email address (`idn-email`): a dot-atom
 * or quoted local part, where non-ASCII characters are allowed, then `@` and
 * an internationalized hostname or a bracketed IPv4/IPv6 literal.
 *
 * @param {string} value Candidate email address
 * @returns {boolean} true when the value is a valid address
 */
export declare const isValidIdnEmail: (value: string) => boolean;
//# sourceMappingURL=email.d.ts.map