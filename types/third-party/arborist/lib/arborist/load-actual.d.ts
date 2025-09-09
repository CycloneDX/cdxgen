export default ActualLoader;
declare function ActualLoader(cls: any): {
    new (options: any): {
        [x: string]: any;
        #actualTree: any;
        #actualTreeLoaded: Set<any>;
        #actualTreePromise: any;
        #cache: Map<any, any>;
        #filter: any;
        #topNodes: Set<any>;
        #transplantFilter: any;
        actualTree: any;
        loadActual(options?: {}): Promise<any>;
        #loadActual(options: any): Promise<any>;
        #transplant(root: any): void;
        #loadFSNode({ path, parent, real, root, loadOverrides, useRootOverrides, }: {
            path: any;
            parent: any;
            real: any;
            root: any;
            loadOverrides: any;
            useRootOverrides: any;
        }): Promise<any>;
        #newNode(options: any): Node;
        #newLink(options: any): Promise<Link>;
        #loadFSTree(node: any): any;
        #loadFSChildren(node: any): Promise<any>;
        #findMissingEdges(): Promise<void>;
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