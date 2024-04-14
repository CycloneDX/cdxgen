export function createOrLoad(
  dbName: any,
  dbPath: any,
  logging?: boolean,
): Promise<{
  sequelize: Sequelize;
  Namespaces: typeof Namespaces;
  Usages: typeof Usages;
  DataFlows: typeof DataFlows;
}>;
import type { Sequelize } from "sequelize";
declare class Namespaces extends Model<any, any> {
  constructor(
    values?: import("sequelize").Optional<any, string>,
    options?: import("sequelize").BuildOptions,
  );
}
declare class Usages extends Model<any, any> {
  constructor(
    values?: import("sequelize").Optional<any, string>,
    options?: import("sequelize").BuildOptions,
  );
}
declare class DataFlows extends Model<any, any> {
  constructor(
    values?: import("sequelize").Optional<any, string>,
    options?: import("sequelize").BuildOptions,
  );
}
import { Model } from "sequelize";
//# sourceMappingURL=db.d.ts.map
