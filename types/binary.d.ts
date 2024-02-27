export function getGoBuildInfo(src: any): string;
export function getCargoAuditableInfo(src: any): string;
export function getOSPackages(src: any): {
    osPackages: any[];
    dependenciesList: {
        ref: any;
        dependsOn: any[];
    }[];
    allTypes: any[];
};
export function executeOsQuery(query: any): any;
export function getDotnetSlices(src: string, slicesFile: string): boolean;
//# sourceMappingURL=binary.d.ts.map