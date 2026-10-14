/**
 * Retrieves a CycloneDX BOM attached to an OCI image purely in JavaScript
 * without relying on the `oras` CLI tool.
 *
 * @param {string} image OCI image reference (e.g. `"registry.example.com/org/app:tag"`)
 * @param {string} [platform] OCI platform string (e.g. `"linux/amd64"`); no-op for JS implementation
 * @param {Object} [options]
 * @param {function(Buffer): void} [options.checkBytes] Called with the raw bytes of the BOM layer that is about to be returned. An error it throws is rethrown, and no other referrer is tried.
 * @returns {Promise<Object|undefined>} Parsed CycloneDX BOM JSON object, or `undefined` if not found
 */
export declare function getBomWithOras(image: string, _platform?: undefined, options?: Object): Promise<Object | undefined>;
export declare function attachBomNative(image: any, bomJson: any): Promise<string>;
//# sourceMappingURL=oci.d.ts.map