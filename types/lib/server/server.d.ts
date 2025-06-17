export function isAllowedHost(hostname: any): any;
export function isAllowedPath(p: any): any;
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