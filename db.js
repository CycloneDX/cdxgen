import path from "node:path";
import { DataTypes, Model, Sequelize } from "sequelize";
import SQLite from "sqlite3";

class Namespaces extends Model {}
class Usages extends Model {}
class DataFlows extends Model {}

export const createOrLoad = async (dbName, dbPath, logging = false) => {
  const sequelize = new Sequelize({
    define: {
      freezeTableName: true,
    },
    dialect: "sqlite",
    dialectOptions: {
      mode:
        SQLite.OPEN_READWRITE |
        SQLite.OPEN_CREATE |
        SQLite.OPEN_NOMUTEX |
        SQLite.OPEN_SHAREDCACHE,
    },
    storage: dbPath.includes("memory") ? dbPath : path.join(dbPath, dbName),
    logging,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
  Namespaces.init(
    {
      purl: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
      },
      data: {
        type: DataTypes.JSON,
        allowNull: false,
      },
    },
    { sequelize, modelName: "Namespaces" },
  );
  Usages.init(
    {
      purl: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
      },
      data: {
        type: DataTypes.JSON,
        allowNull: false,
      },
    },
    { sequelize, modelName: "Usages" },
  );
  DataFlows.init(
    {
      purl: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
      },
      data: {
        type: DataTypes.JSON,
        allowNull: false,
      },
    },
    { sequelize, modelName: "DataFlows" },
  );
  await sequelize.sync();
  return {
    sequelize,
    Namespaces,
    Usages,
    DataFlows,
  };
};
