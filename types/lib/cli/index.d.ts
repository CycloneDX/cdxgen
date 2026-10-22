export { summarizeAiInventory } from "../helpers/aiInventory.js";
/**
 * For all modules in the specified package, creates a list of
 * component objects from each one.
 *
 * @param {Object} options CLI options
 * @param {Object} allImports All imports
 * @param {Object} pkg Package object
 * @param {string} ptype Package type
 * @returns {Object[]} Array of component objects
 */
export declare function listComponents(options: Object, allImports: Object, pkg: Object, ptype?: string): Object[];
/**
 * Function to create bom string for Java jars
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 *
 * @returns {Object} BOM with namespace mapping
 */
export declare function createJarBom(path: string, options: Object): Object;
/**
 * Function to create bom string for Android apps using blint
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object|undefined} BOM object
 */
export declare function createAndroidBom(path: string, options: Object): Object | undefined;
/**
 * Function to create bom string for binaries using blint
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object|undefined} BOM object
 */
export declare function createBinaryBom(path: string, options: Object): Object | undefined;
/**
 * Function to create bom string for Java projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createJavaBom(path: string, options: Object): Promise<Object>;
export declare function createNodejsBom(path: any, options: any): Promise<Object>;
/**
 * Function to create bom string for Projects that use Pixi package manager.
 * createPixiBom is based on createPythonBom.
 * Pixi package manager utilizes many languages like python, rust, C/C++, ruby, etc.
 * It produces a Lockfile which help produce reproducible envs across operating systems.
 * This code will look at the operating system of our machine and create a BOM specific to that machine.
 *
 *
 * @param {String} path
 * @param {Object} options
 * @returns {Object | null} BOM object, or `null` when `pixi.lock` is absent and `options.installDeps` is false
 */
export declare function createPixiBom(path: string, options: Object): Object | null;
/**
 * Function to create bom string for Python projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createPythonBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for Go projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object | undefined>} Promise resolving to a BOM object or `undefined`
 */
export declare function createGoBom(path: string, options: Object): Promise<Object | undefined>;
/**
 * Function to create bom string for Rust projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object|undefined>} Promise resolving to a BOM object or undefined
 */
export declare function createRustBom(path: string, options: Object): Promise<Object | undefined>;
/**
 * Function to create bom string for Dart projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createDartBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for cpp projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object} BOM object
 */
export declare function createCppBom(path: string, options: Object): Object;
/**
 * Function to create bom string for clojure projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object} BOM object
 */
export declare function createClojureBom(path: string, options: Object): Object;
/**
 * Function to create bom string for Haskell projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object} BOM object
 */
export declare function createHaskellBom(path: string, options: Object): Object;
/**
 * Function to create bom string for Elixir projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object} BOM object
 */
export declare function createElixirBom(path: string, options: Object): Object;
/**
 * Function to create bom string for GitHub action workflows
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object} BOM object
 */
export declare function createGitHubBom(path: string, options: Object): Object;
/**
 * Function to create bom string for cloudbuild yaml
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object} BOM object
 */
export declare function createCloudBuildBom(path: string, options: Object): Object;
/**
 * Function to create obom string for the current OS using osquery
 *
 * @param {string} _path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createOSBom(_path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for Jenkins plugins
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createJenkinsBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for Helm charts
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object} BOM object
 */
export declare function createHelmBom(path: string, options: Object): Object;
/**
 * Function to create bom string for swift projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createSwiftBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for cocoa projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object | undefined>} Promise resolving to a BOM object, or `undefined` when no Podfiles are found
 */
export declare function createCocoaBom(path: string, options: Object): Promise<Object | undefined>;
/**
 * Function to create bom string for Nix flakes
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createNixBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for caxa SEA binaries
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createCaxaBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for docker compose
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createContainerSpecLikeBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for php projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Object} BOM object
 */
export declare function createPHPBom(path: string, options: Object): Object;
/**
 * Function to create bom string for ruby projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createRubyBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for csharp projects
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object|undefined>} Promise resolving to BOM object
 */
export declare function createCsharpBom(path: string, options: Object): Promise<Object | undefined>;
/**
 * Function to create BOM for VS Code / IDE extensions.
 * Supports two modes:
 * 1. Directory scan: Discovers `.vsix` files and installed extension directories
 * 2. IDE discovery: Automatically finds extensions installed by known IDEs
 *
 * @param {string} path to the project or directory to scan
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createVscodeExtensionBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create BOM for Electron ASAR archives.
 *
 * @param {string} path to a single archive or a directory to scan
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createAsarBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create BOM for installed Chrome and Chromium-based browser extensions.
 *
 * @param {string} path to the project path or a directly provided extension path
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createChromeExtensionBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom object for cryptographic certificate files
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createCryptoCertsBom(path: string, options: Object): Promise<Object>;
/**
 * Dedupe components
 *
 * @param {Object} options Options
 * @param {Array} components Components
 * @param {Object} parentComponent Parent component
 * @param {Array} dependencies Dependencies
 * @param {Array} [metadataProperties] Properties for the metadata block, from
 *   generators whose manifest has no component to carry them
 *
 * @returns {Object} Object including BOM Json
 */
export declare function dedupeBom(options: Object, components: any[], parentComponent: Object, dependencies: any[], metadataProperties?: any[]): Object;
/**
 * Function to create bom string for all languages
 *
 * @param {string[]} pathList list of to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createMultiXBom(pathList: string[], options: Object): Promise<Object>;
/**
 * Function to create a dynamic SBOM by executing a command and tracing the
 * shared libraries it loads at runtime via instrumentation.
 *
 * Components receive scope=required, evidence.identity[].methods[].technique=
 * instrumentation, and confidence 0.8 (version known) or 0.5 (version unknown).
 *
 * @param {string} path - Target path (used as working directory fallback)
 * @param {Object} options - CLI options; must include options.traceCmd
 * @returns {Promise<Object>} Promise resolving to BOM data object
 */
export declare function createDynamicBom(path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for various languages
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object|undefined>} Promise resolving to BOM object, or undefined if path is not readable
 */
export declare function createXBom(path: string, options: Object): Promise<Object | undefined>;
/**
 * Function to create a hardware BOM for the current host.
 *
 * @param {string} _path Source path (unused for live host HBOM generation)
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createHBom(_path: string, options: Object): Promise<Object>;
/**
 * Function to create bom string for various languages
 *
 * @param {string} path to the project
 * @param {Object} options Parse options from the cli
 * @returns {Promise<Object>} Promise resolving to BOM object
 */
export declare function createBom(path: string, options: Object): Promise<Object>;
/**
 * Method to submit the generated bom to dependency-track or cyclonedx server
 *
 * @param {Object} args CLI args
 * @param {Object} bomContents BOM Json
 * @return {Promise<{ token: string } | undefined>} a promise with a token (if request was successful) or undefined (in case of invalid arguments)
 * @throws {Error} if the request fails
 */
export declare function submitBom(args: Object, bomContents: Object): Promise<{
    token: string;
} | undefined>;
//# sourceMappingURL=index.d.ts.map