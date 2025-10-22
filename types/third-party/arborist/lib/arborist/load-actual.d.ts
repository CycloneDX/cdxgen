export default ActualLoader;
declare function ActualLoader(cls: any): {
    new (options: any): {
        [x: string]: any;
        "__#private@#actualTree": any;
        "__#private@#actualTreeLoaded": Set<any>;
        "__#private@#actualTreePromise": any;
        "__#private@#cache": Map<any, any>;
        "__#private@#filter": any;
        "__#private@#topNodes": Set<any>;
        "__#private@#transplantFilter": any;
        actualTree: any;
        loadActual(options?: {}): Promise<any>;
        "__#private@#loadActual"(options: any): Promise<any>;
        "__#private@#transplant"(root: any): void;
        "__#private@#loadFSNode"({ path, parent, real, root, loadOverrides, useRootOverrides, }: {
            path: any;
            parent: any;
            real: any;
            root: any;
            loadOverrides: any;
            useRootOverrides: any;
        }): Promise<any>;
        "__#private@#newNode"(options: any): Node;
        "__#private@#newLink"(options: any): Promise<Link>;
        "__#private@#loadFSTree"(node: any): any;
        "__#private@#loadFSChildren"(node: any): Promise<any>;
        "__#private@#findMissingEdges"(): Promise<void>;
        [_rpcache]: Map<string, string>;
        [_stcache]: Map<any, any>;
    };
    [x: string]: any;
};
import Node from "../node.js";
import Link from "../link.js";
declare const _rpcache: unique symbol;
declare const _stcache: unique symbol;
//# sourceMappingURL=load-actual.d.ts.map