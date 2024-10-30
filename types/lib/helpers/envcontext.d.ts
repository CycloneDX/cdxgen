/**
 * Retrieves a git config item
 * @param {string} configKey Git config key
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export function getGitConfig(configKey: string, dir: string): any;
/**
 * Retrieves the git origin url
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export function getOriginUrl(dir: string): any;
/**
 * Retrieves the git branch name
 * @param {string} configKey Git config key
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export function getBranch(_configKey: any, dir: string): any;
/**
 * Retrieves the tree and parent hash for a git repo
 * @param {string} dir repo directory
 *
 * @returns Output from git cat-file or undefined
 */
export function gitTreeHashes(dir: string): {};
/**
 * Retrieves the files list from git
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export function listFiles(dir: string): any[];
/**
 * Execute a git command
 *
 * @param {string} dir Repo directory
 * @param {Array} args arguments to git command
 *
 * @returns Output from the git command
 */
export function execGitCommand(dir: string, args: any[]): any;
/**
 * Collect Java version and installed modules
 *
 * @param {string} dir Working directory
 * @returns Object containing the java details
 */
export function collectJavaInfo(dir: string): {
    type: string;
    name: string;
    version: any;
    description: any;
    properties: {
        name: string;
        value: any;
    }[];
};
/**
 * Collect dotnet version
 *
 * @param {string} dir Working directory
 * @returns Object containing dotnet details
 */
export function collectDotnetInfo(dir: string): {
    type: string;
    name: string;
    version: any;
    description: any;
};
/**
 * Collect python version
 *
 * @param {string} dir Working directory
 * @returns Object containing python details
 */
export function collectPythonInfo(dir: string): {
    type: string;
    name: string;
    version: any;
    description: any;
};
/**
 * Collect node version
 *
 * @param {string} dir Working directory
 * @returns Object containing node details
 */
export function collectNodeInfo(dir: string): {
    type: string;
    name: string;
    version: any;
    description: any;
};
/**
 * Collect gcc version
 *
 * @param {string} dir Working directory
 * @returns Object containing gcc details
 */
export function collectGccInfo(dir: string): {
    type: string;
    name: string;
    version: any;
    description: any;
};
/**
 * Collect rust version
 *
 * @param {string} dir Working directory
 * @returns Object containing rust details
 */
export function collectRustInfo(dir: string): {
    type: string;
    name: string;
    version: any;
    description: any;
};
/**
 * Collect go version
 *
 * @param {string} dir Working directory
 * @returns Object containing go details
 */
export function collectGoInfo(dir: string): {
    type: string;
    name: string;
    version: any;
};
/**
 * Collect swift version
 *
 * @param {string} dir Working directory
 * @returns Object containing swift details
 */
export function collectSwiftInfo(dir: string): {
    type: string;
    name: string;
    version: any;
};
/**
 * Method to run a swift command
 *
 * @param {String} dir Working directory
 * @param {Array} args Command arguments
 * @returns Object containing swift details
 */
export function runSwiftCommand(dir: string, args: any[]): any;
export function collectEnvInfo(dir: any): {
    type: string;
    name: string;
    version: any;
    description: any;
    properties: {
        name: string;
        value: any;
    }[];
}[];
/**
 * Method to check if sdkman is available.
 */
export function isSdkmanAvailable(): boolean;
/**
 * Method to check if nvm is available.
 */
export function isNvmAvailable(): boolean;
/**
 * Method to check if a given sdkman tool is installed and available.
 *
 * @param {String} toolType Tool type such as java, gradle, maven etc.
 * @param {String} toolName Tool name with version. Eg: 22.0.2-tem
 *
 * @returns {Boolean} true if the tool is available. false otherwise.
 */
export function isSdkmanToolAvailable(toolType: string, toolName: string): boolean;
/**
 * Method to install and use a given sdkman tool.
 *
 * @param {String} toolType Tool type such as java, gradle, maven etc.
 * @param {String} toolName Tool name with version. Eg: 22.0.2-tem
 *
 * @returns {Boolean} true if the tool is available. false otherwise.
 */
export function installSdkmanTool(toolType: string, toolName: string): boolean;
/**
 * Method to check if a given nvm tool is installed and available.
 *
 * @param {String} toolName Tool name with version. Eg: 22.0.2-tem
 *
 * @returns {String} path of nvm if present, otherwise false
 */
export function getNvmToolDirectory(toolName: string): string;
/**
 * Method to return nvm tool path
 *
 * @param {String} toolVersion Tool name with version. Eg: 22.0.2-tem
 *
 * @returns {String} path of the tool if not found installs and then returns paths. false if encounters an error.
 */
export function getOrInstallNvmTool(toolVersion: string): string;
export const GIT_COMMAND: any;
export namespace SDKMAN_JAVA_TOOL_ALIASES {
    let java8: any;
    let java11: any;
    let java17: any;
    let java21: any;
    let java22: any;
    let java23: any;
}
//# sourceMappingURL=envcontext.d.ts.map