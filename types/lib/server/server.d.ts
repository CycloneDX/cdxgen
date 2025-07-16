/**
 * Checks the given hostname against the allowed list.
 *
 * @param {string} hostname Host name to check
 * @returns {boolean} true if the hostname in its entirety is allowed. false otherwise.
 */
export function isAllowedHost(hostname: string): boolean;
/**
 * Checks the given path string to belong to a drive in Windows.
 *
 * @param {string} p Path string to check
 * @returns {boolean} true if the windows path belongs to a drive. false otherwise (device names)
 */
export function isAllowedWinPath(p: string): boolean;
/**
 * Checks the given path against the allowed list.
 *
 * @param {string} p Path string to check
 * @returns {boolean} true if the path is present in the allowed paths. false otherwise.
 */
export function isAllowedPath(p: string): boolean;
/**
 * Method to safely parse value passed via the query string or body.
 *
 * @param {string|number|Array<string|number>} raw
 * @returns {string|number|boolean|Array<string|number|boolean>}
 * @throws {TypeError} if raw (or any array element) isn’t string or number
 */
export function parseValue(raw: string | number | Array<string | number>): string | number | boolean | Array<string | number | boolean>;
export function parseQueryString(q: any, body?: {}, options?: {}): {};
export function configureServer(cdxgenServer: any): void;
export function start(options: any): void;
//# sourceMappingURL=server.d.ts.map