export default VirtualLoader;
declare function VirtualLoader(cls: any): {
    new (options: any): {
        [x: string]: any;
        "__#private@#rootOptionProvided": any;
        virtualTree: any;
        loadVirtual(options?: {}): Promise<any>;
        "__#private@#loadRoot"(s: any): Promise<any>;
        "__#private@#loadFromShrinkwrap"(s: any, root: any): Promise<any>;
        "__#private@#checkRootEdges"(s: any, root: any): boolean;
        "__#private@#resolveNodes"(s: any, root: any): {
            links: Map<any, any>;
            nodes: Map<string, any>;
        };
        "__#private@#resolveLinks"(links: any, nodes: any): Promise<void>;
        "__#private@#assignBundles"(nodes: any): void;
        "__#private@#loadNode"(location: any, sw: any, loadOverrides: any): Node;
        "__#private@#loadLink"(location: any, targetLoc: any, target: any): Link;
        [flagsSuspect]: boolean;
    };
    [x: string]: any;
};
import Node from "../node.js";
import Link from "../link.js";
declare const flagsSuspect: unique symbol;
//# sourceMappingURL=load-virtual.d.ts.map