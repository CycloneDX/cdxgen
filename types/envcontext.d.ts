export function getGitConfig(configKey: string, dir: string): string;
export function getOriginUrl(dir: string): string;
export function getBranch(configKey: string, dir: string): string;
export function listFiles(dir: string): any[];
export function execGitCommand(dir: string, args: any[]): string;
export function collectJavaInfo(dir: string): {
    type: string;
    name: string;
    version: string;
    description: string;
    properties: {
        name: string;
        value: any;
    }[];
};
export function collectDotnetInfo(dir: string): {
    type: string;
    name: string;
    version: string;
    description: any;
};
export function collectPythonInfo(dir: string): {
    type: string;
    name: string;
    version: string;
    description: any;
};
export function collectNodeInfo(dir: string): {
    type: string;
    name: string;
    version: string;
    description: string;
};
export function collectGccInfo(dir: string): {
    type: string;
    name: string;
    version: string;
    description: any;
};
export function collectRustInfo(dir: string): {
    type: string;
    name: string;
    version: string;
    description: string;
};
export function collectGoInfo(dir: string): {
    type: string;
    name: string;
    version: string;
};
export function collectEnvInfo(dir: any): {
    type: string;
    name: string;
    version: string;
    description: string;
    properties: {
        name: string;
        value: any;
    }[];
}[];
//# sourceMappingURL=envcontext.d.ts.map