/**
 * Determine whether a project language is a Go variant that should trigger golem analysis.
 *
 * @param {string} language Project language identifier.
 * @returns {boolean} True when the language maps to a Go variant.
 */
export declare function isGolemGoLanguage(language: string): boolean;
/**
 * Read and parse a golem analysis JSON report file.
 *
 * @param {string} jsonFile Path to the golem JSON report.
 * @returns {object|undefined} Parsed report object, or undefined when the file
 *   is missing or cannot be parsed.
 */
export declare function readGolemJsonFile(jsonFile: string): object | undefined;
/**
 * Invoke the golem analyzer binary over a source directory to produce a JSON report.
 *
 * Assembles the analyze invocation (callgraph mode, data-flow mode, patterns,
 * tags, tests, stdlib flags) from the options and writes the result to
 * `outputFile`.
 *
 * @param {string} src Source directory to analyze.
 * @param {string} outputFile Destination path for the JSON report.
 * @param {object} [options={}] Options controlling golem behavior.
 * @returns {boolean} True when the analysis succeeded and the report was written.
 */
export declare function runGolemAnalysis(src: string, outputFile: string, options?: object): boolean;
/**
 * Orchestrate a full golem run: execute the analyzer, read the report, and clean up.
 *
 * When `options.semanticsSlicesFile` is set the report is persisted there;
 * otherwise it is written to a temporary directory that is removed after parsing.
 *
 * @param {string} src Source directory to analyze.
 * @param {object} [options={}] Options forwarded to {@link runGolemAnalysis}.
 * @returns {object|undefined} Parsed golem report, or undefined on failure.
 */
export declare function analyzeGolemProject(src: string, options?: object): object | undefined;
/**
 * Project a golem report into CycloneDX component evidence, properties, and crypto assets.
 *
 * Aggregates import/usage/call-graph/data-flow evidence and crypto signals from
 * the report, attaching per-component properties and occurrence evidence while
 * collecting any derived cryptographic-asset components.
 *
 * @param {object} [golemReport={}] Parsed golem analysis report.
 * @param {Array<object>} [components=[]] Existing BOM components to match against.
 * @returns {{componentPropertiesMap: Object<string, Array<object>>, cryptoComponents: Array<object>, cryptoGeneratePurls: Object<string, boolean>, dataFlowFrames: Object<string, Array>, metadataProperties: Array<object>, purlLocationMap: Object<string, Array>}}
 *   Projected evidence maps and crypto components.
 */
export declare function collectGolemEvidence(golemReport?: object, components?: Array<object>): {
    componentPropertiesMap: Record<string, object[]>;
    cryptoComponents: Array<object>;
    cryptoGeneratePurls: Record<string, boolean>;
    dataFlowFrames: Record<string, any[]>;
    metadataProperties: Array<object>;
    purlLocationMap: Record<string, any[]>;
};
/**
 * Normalise a Go route path to the placeholder spelling OpenAPI — and
 * therefore the rest of the services a BOM carries — uses. Gin and iris
 * write `:id` and `*filepath`, chi and gorilla/mux write `{id}` or
 * `{id:[0-9]+}`, and Go 1.22's net/http patterns write `{id...}`; all become
 * `{id}`. Placeholders are only recognised at the start of a segment, so a
 * literal colon inside one — `/time/09:30` — is left alone. Values that are
 * not route paths, such as the `:8080` a net/http listener reports or the
 * full URL an external service call names, are returned as they are, and so
 * is echo's catch-all, whose bare `*` names no placeholder to normalise.
 *
 * @param {string} routePath Path a golem endpoint reports
 * @returns {string} The normalised path
 */
export declare function normalizeGolemRoutePath(routePath: string): string;
/**
 * Project the services and API endpoints of a golem report into evinse's
 * service map, so a Go `evinse`/`saasbom` run lists its services the way the
 * kosi (Kotlin) and dosai (.NET) collectors already do (#4498).
 *
 * golem rolls one service up per server it saw — a `gin` engine, a net/http
 * listener on `:8080` — and lists the routes registered on it, each with its
 * HTTP method and framework. It also rolls the outbound hosts the source
 * calls into services of `kind: "external"`; those carry
 * `x-trust-boundary: true`, since a host the application calls sits outside
 * its own trust boundary. The map is keyed by the golem service id, which is
 * unique per server, while `name` carries the display name.
 *
 * HTTP methods are lower-cased to match the property values the OpenAPI flow
 * emits, so a consumer grouping by `cdx:service:httpMethod` sees one value
 * per method.
 *
 * @param {object} [golemReport={}] Parsed golem analysis report.
 * @param {Object} [servicesMap={}] Service map to populate.
 * @returns {Object} The service map
 */
export declare function collectGolemServices(golemReport?: object, servicesMap?: Object): Object;
//# sourceMappingURL=golem.d.ts.map