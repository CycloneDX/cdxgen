import { isIPv4, isIPv6 } from "node:net";
import { domainToASCII, domainToUnicode } from "node:url";

/**
 * Validation of RFC 6531 internationalized email addresses: the JSON Schema
 * `idn-email` format the CycloneDX schemas assert on contact addresses.
 *
 * It follows what `cdxrs validate` (jsonschema-rs) accepts, so the JS and Rust
 * validators agree on the addresses BOMs actually carry, internationalized
 * ones included. Two deliberate differences keep this small:
 * - a `Display Name <address>` string is not an address here, as RFC 6531
 *   says; jsonschema-rs tolerates it, but cdxgen never emits one and the
 *   source parsers must not mistake one for an email;
 * - the RFC 5892 contextual rules and the RFC 5893 bidi rule are not applied,
 *   so a few exotic internationalized domains are accepted that cdxrs
 *   rejects. No valid domain is rejected for that.
 *
 * Every check is a bounded pass over the input with no backtracking regular
 * expression.
 */

const LOCAL_PART_MAX_LENGTH = 64;
const HOSTNAME_MAX_LENGTH = 253;
const LABEL_MAX_LENGTH = 63;
const ATEXT_SPECIALS = "!#$%&'*+-/=?^_`{|}~";
// Appended before IDNA conversion so a numeric last label is not read as an
// IPv4 address by the WHATWG host parser behind `domainToASCII`.
const CONVERSION_SUFFIX = ".invalid";
// What an internationalized label may hold: letters, combining marks and
// decimal digits (RFC 5892 PVALID, by general category), plus the characters
// RFC 5892 makes PVALID by exception, such as the Catalan middle dot.
const IDNA_LABEL_CHAR = /^[\p{L}\p{Mn}\p{Mc}\p{Nd}]$/u;
const IDNA_EXCEPTIONS = new Set([
  "·",
  "͵",
  "׳",
  "״",
  "۽",
  "۾",
  "་",
  "‌",
  "‍",
  "〇",
  "・",
]);
const COMBINING_MARK = /^\p{M}$/u;

/**
 * @param {string} text Text to inspect
 * @returns {boolean} Whether the text holds only ASCII
 */
const isAscii = (text) => {
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) > 0x7f) {
      return false;
    }
  }
  return true;
};

/**
 * @param {number} code Code point
 * @returns {boolean} Whether the code point is an ASCII letter or digit
 */
const isAsciiAlphanumeric = (code) =>
  (code >= 0x30 && code <= 0x39) ||
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a);

/**
 * RFC 5322 `atext`, widened by RFC 6531 to every non-ASCII code point.
 *
 * @param {string} char One code point
 * @returns {boolean} Whether it may appear in an unquoted local part atom
 */
const isAtext = (char) => {
  const code = char.codePointAt(0);
  return (
    code > 0x7f || isAsciiAlphanumeric(code) || ATEXT_SPECIALS.includes(char)
  );
};

/**
 * The content of a quoted local part: printable ASCII other than `"` and `\`,
 * non-ASCII, spaces and tabs, and backslash-escaped printable characters.
 *
 * @param {string} text Quoted local part without its surrounding quotes
 * @returns {boolean} Whether the quoted content is valid
 */
const isQuotedContent = (text) => {
  const chars = [...text];
  for (let index = 0; index < chars.length; index++) {
    const code = chars[index].codePointAt(0);
    if (code === 0x5c) {
      index++;
      const escaped = chars[index]?.codePointAt(0);
      if (escaped === undefined || escaped < 0x21 || escaped === 0x7f) {
        return false;
      }
    } else if (code < 0x20 || code === 0x22 || code === 0x7f) {
      if (code !== 0x09) {
        return false;
      }
    }
  }
  return true;
};

/**
 * A dot-atom (`atext` atoms joined by single dots) or a quoted string, at
 * most 64 characters.
 *
 * @param {string} localPart Text before the last `@`
 * @returns {boolean} Whether it is a valid local part
 */
const isValidLocalPart = (localPart) => {
  if (!localPart || [...localPart].length > LOCAL_PART_MAX_LENGTH) {
    return false;
  }
  if (
    localPart.length >= 2 &&
    localPart.startsWith('"') &&
    localPart.endsWith('"')
  ) {
    // An empty quoted local part (`""@example.com`) is valid per RFC 5321.
    return isQuotedContent(localPart.slice(1, -1));
  }
  return localPart
    .split(".")
    .every((atom) => atom.length > 0 && [...atom].every(isAtext));
};

/**
 * An RFC 1123 label in ASCII (A-label) form.
 *
 * @param {string} label ASCII label
 * @returns {boolean} Whether the label is valid
 */
const isValidAsciiLabel = (label) => {
  if (
    !label ||
    label.length > LABEL_MAX_LENGTH ||
    label.startsWith("-") ||
    label.endsWith("-")
  ) {
    return false;
  }
  for (let index = 0; index < label.length; index++) {
    const code = label.charCodeAt(index);
    if (!isAsciiAlphanumeric(code) && code !== 0x2d) {
      return false;
    }
  }
  // Hyphens in the third and fourth positions are reserved for A-labels.
  return label.slice(2, 4) !== "--" || label.toLowerCase().startsWith("xn--");
};

/**
 * The Unicode form of a label, as `domainToUnicode` returns it.
 *
 * @param {string} label Unicode label
 * @returns {boolean} Whether the label is valid
 */
const isValidUnicodeLabel = (label) => {
  // `domainToUnicode` leaves an undecodable A-label as it was.
  if (label.toLowerCase().startsWith("xn--")) {
    return false;
  }
  if (isAscii(label)) {
    return true;
  }
  if (
    label.startsWith("-") ||
    label.endsWith("-") ||
    label.slice(2, 4) === "--"
  ) {
    return false;
  }
  const chars = [...label];
  return (
    !COMBINING_MARK.test(chars[0]) &&
    chars.every(
      (char) =>
        char.charCodeAt(0) <= 0x7f ||
        IDNA_EXCEPTIONS.has(char) ||
        IDNA_LABEL_CHAR.test(char),
    )
  );
};

/**
 * An internationalized hostname: mapped to its A-label form with UTS #46
 * processing, held to the ASCII hostname rules, and every A-label decoded
 * back and checked for the characters IDNA allows.
 *
 * @param {string} hostname Hostname, possibly holding non-ASCII labels
 * @returns {boolean} Whether it is a valid IDN hostname
 */
export const isValidIdnHostname = (hostname) => {
  if (typeof hostname !== "string" || !hostname) {
    return false;
  }
  for (let index = 0; index < hostname.length; index++) {
    // Controls and spaces never belong in a hostname; the WHATWG parser
    // behind `domainToASCII` would silently strip tabs and newlines.
    const code = hostname.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return false;
    }
  }
  let ascii = hostname;
  if (!isAscii(hostname)) {
    const converted = domainToASCII(`${hostname}${CONVERSION_SUFFIX}`);
    if (!converted.endsWith(CONVERSION_SUFFIX)) {
      return false;
    }
    ascii = converted.slice(0, -CONVERSION_SUFFIX.length);
  }
  if (
    !ascii ||
    ascii.length > HOSTNAME_MAX_LENGTH ||
    ascii.endsWith(".") ||
    !ascii.split(".").every(isValidAsciiLabel)
  ) {
    return false;
  }
  if (!/(^|\.)xn--/i.test(ascii)) {
    return true;
  }
  const unicode = domainToUnicode(`${ascii}${CONVERSION_SUFFIX}`);
  return (
    unicode.endsWith(CONVERSION_SUFFIX) &&
    unicode
      .slice(0, -CONVERSION_SUFFIX.length)
      .split(".")
      .every(isValidUnicodeLabel)
  );
};

/**
 * @param {string} domain Text after the last `@`
 * @returns {boolean} Whether it is a valid hostname or address literal
 */
const isValidEmailDomain = (domain) => {
  if (domain.startsWith("[") && domain.endsWith("]")) {
    const literal = domain.slice(1, -1);
    // RFC 5321 address-literal tags are case-insensitive.
    if (literal.slice(0, 5).toLowerCase() === "ipv6:") {
      return isIPv6(literal.slice(5));
    }
    return isIPv4(literal);
  }
  return isValidIdnHostname(domain);
};

/**
 * Whether a value is a valid RFC 6531 email address (`idn-email`): a dot-atom
 * or quoted local part, where non-ASCII characters are allowed, then `@` and
 * an internationalized hostname or a bracketed IPv4/IPv6 literal.
 *
 * @param {string} value Candidate email address
 * @returns {boolean} true when the value is a valid address
 */
export const isValidIdnEmail = (value) => {
  if (typeof value !== "string") {
    return false;
  }
  // A domain never holds `@`; a quoted local part may.
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1) {
    return false;
  }
  return (
    isValidLocalPart(value.slice(0, separator)) &&
    isValidEmailDomain(value.slice(separator + 1))
  );
};
