export default Tracker;
declare function Tracker(cls: any): {
    new (): {
        [x: string]: any;
        #progress: Map<any, any>;
        #createTracker(key: any, name: any): void;
        addTracker(section: any, subsection?: any, key?: any): void;
        finishTracker(section: any, subsection?: any, key?: any): void;
        #onError(msg: any): void;
    };
    [x: string]: any;
};
//# sourceMappingURL=tracker.d.ts.map