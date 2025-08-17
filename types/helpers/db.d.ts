export function createOrLoad(dbName: any, dbPath: any, logging?: boolean): Promise<{
    sequelize: Sequelize;
    Namespaces: typeof Namespaces;
    Usages: typeof Usages;
    DataFlows: typeof DataFlows;
}>;
import { Sequelize } from "sequelize";
declare class Namespaces extends Model<any, any> {
    constructor(values?: import("sequelize").Optional<any, string>, options?: import("sequelize").BuildOptions);
}
declare class Usages extends Model<any, any> {
    constructor(values?: import("sequelize").Optional<any, string>, options?: import("sequelize").BuildOptions);
}
declare class DataFlows extends Model<any, any> {
    constructor(values?: import("sequelize").Optional<any, string>, options?: import("sequelize").BuildOptions);
}
import { Model } from "sequelize";
export {};
//# sourceMappingURL=db.d.ts.map