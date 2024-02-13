/**
 * For all modules in the specified package, creates a list of
 * component objects from each one.
 *
 * @param {Object} options CLI options
 * @param {Object} allImports All imports
 * @param {Object} pkg Package object
 * @param {string} ptype Package type
 */
export function listComponents(options: any, allImports: any, pkg: any, ptype?: string): any[];
/**
 * Method to submit the generated bom to dependency-track or cyclonedx server
 *
 * @param {Object} args CLI args
 * @param {Object} bomContents BOM Json
 */
export function submitBom(args: any, bomContents: any): Promise<any>;
export function createJarBom(path: string, options: any): any;
export function createJavaBom(path: string, options: any): Promise<any>;
export function createNodejsBom(path: string, options: any): Promise<any>;
export function createPythonBom(path: string, options: any): Promise<any>;
export function createGoBom(path: string, options: any): Promise<any>;
export function createRustBom(path: string, options: any): Promise<any>;
export function createDartBom(path: string, options: any): Promise<any>;
export function createCppBom(path: string, options: any): any;
export function createClojureBom(path: string, options: any): any;
export function createHaskellBom(path: string, options: any): any;
export function createElixirBom(path: string, options: any): any;
export function createGitHubBom(path: string, options: any): any;
export function createCloudBuildBom(path: string, options: any): any;
export function createOSBom(path: string, options: any): Promise<any>;
export function createJenkinsBom(path: string, options: any): Promise<any>;
export function createHelmBom(path: string, options: any): any;
export function createSwiftBom(path: string, options: any): Promise<any>;
export function createContainerSpecLikeBom(path: string, options: any): any;
export function createPHPBom(path: string, options: any): any;
export function createRubyBom(path: string, options: any): Promise<any>;
export function createCsharpBom(path: string, options: any): Promise<any>;
export function mergeDependencies(dependencies: any, newDependencies: any, parentComponent?: {}): {
    ref: string;
    dependsOn: any[];
}[];
export function trimComponents(components: any): any[];
export function dedupeBom(options: any, components: any[], parentComponent: any, dependencies: any[]): any;
export function createMultiXBom(pathList: string, options: any): Promise<any>;
export function createXBom(path: string, options: any): any;
export function createBom(path: string, options: any): any;
//# sourceMappingURL=index.d.ts.map