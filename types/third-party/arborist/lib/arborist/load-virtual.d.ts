export default VirtualLoader;
declare function VirtualLoader(cls: any): {
    new (options: any): {
        [x: string]: any;
        #rootOptionProvided: any;
        virtualTree: any;
        loadVirtual(options?: {}): Promise<any>;
        #loadRoot(s: any): Promise<any>;
        #loadFromShrinkwrap(s: any, root: any): Promise<any>;
        #checkRootEdges(s: any, root: any): boolean;
        #resolveNodes(s: any, root: any): {
            links: Map<any, any>;
            nodes: Map<string, any>;
        };
        #resolveLinks(links: any, nodes: any): Promise<void>;
        #assignBundles(nodes: any): void;
        #loadNode(location: any, sw: any, loadOverrides: any): Node;
        #loadLink(location: any, targetLoc: any, target: any): Link;
        [flagsSuspect]: boolean;
    };
    [x: string]: any;
};
import Node from "../node.js";
import Link from "../link.js";
declare const flagsSuspect: unique symbol;
//# sourceMappingURL=load-virtual.d.ts.map