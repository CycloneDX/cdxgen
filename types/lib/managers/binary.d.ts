export function getGoBuildInfo(src: any): string;
export function getCargoAuditableInfo(src: any): string;
/**
 * Execute sourcekitten plugin with the given arguments
 *
 * @param args {Array} Arguments
 * @returns {undefined|Object} Command output
 */
export function executeSourcekitten(args: any[]): undefined | any;
export function getOSPackages(src: any): {
    osPackages: any[];
    dependenciesList: {
        ref: any;
        dependsOn: any[];
    }[];
    allTypes: any[];
};
export function executeOsQuery(query: any): any;
/**
 * Method to execute dosai to create slices for dotnet
 *
 * @param {string} src Source Path
 * @param {string} slicesFile Slices file name
 * @returns boolean
 */
export function getDotnetSlices(src: string, slicesFile: string): boolean;
/**
 * Method to generate binary SBOM using blint
 *
 * @param {string} src Path to binary or its directory
 * @param {string} binaryBomFile Path to binary
 * @param {boolean} deepMode Deep mode flag
 *
 * @return {boolean} Result of the generation
 */
export function getBinaryBom(src: string, binaryBomFile: string, deepMode: boolean): boolean;
//# sourceMappingURL=binary.d.ts.map