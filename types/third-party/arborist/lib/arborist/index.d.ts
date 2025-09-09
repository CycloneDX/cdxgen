export default Arborist;
declare class Arborist {
    constructor(options?: {});
    options: {
        Arborist: Function;
        binLinks: boolean;
        cache: any;
        dryRun: boolean;
        formatPackageLock: boolean;
        force: boolean;
        global: boolean;
        ignoreScripts: boolean;
        installStrategy: any;
        lockfileVersion: any;
        packageLockOnly: boolean;
        path: any;
        rebuildBundle: boolean;
        replaceRegistryHost: any;
        savePrefix: unknown;
        scriptShell: any;
        workspaces: any;
        workspacesEnabled: boolean;
        nodeVersion: string;
    };
    replaceRegistryHost: any;
    cache: string;
    diff: any;
    path: string;
    workspaceNodes(tree: any, workspaces: any): any[];
    workspaceDependencySet(tree: any, workspaces: any, includeWorkspaceRoot: any): Set<any>;
    excludeWorkspacesDependencySet(tree: any): Set<any>;
    dedupe(options?: {}): Promise<any>;
    [_setWorkspaces](node: any): Promise<any>;
}
declare const _setWorkspaces: unique symbol;
//# sourceMappingURL=index.d.ts.map