import path from "node:path";
import { Sequelize, DataTypes, Model } from "sequelize";
import SQLite from "sqlite3";

class Namespaces extends Model {}
class Usages extends Model {}
class DataFlows extends Model {}

export const createOrLoad = async (dbName, dbPath, logging = false) => {
  const sequelize = new Sequelize({
    define: {
      freezeTableName: true
    },
    dialect: "sqlite",
    dialectOptions: {
      mode: SQLite.OPEN_READWRITE | SQLite.OPEN_CREATE | SQLite.OPEN_FULLMUTEX
    },
    storage: path.join(dbPath, dbName),
    logging
  });
  Namespaces.init(
    {
      purl: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
      },
      data: {
        type: DataTypes.JSON,
        allowNull: false
      }
    },
    { sequelize, modelName: "Namespaces" }
  );
  Usages.init(
    {
      purl: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
      },
      data: {
        type: DataTypes.JSON,
        allowNull: false
      }
    },
    { sequelize, modelName: "Usages" }
  );
  DataFlows.init(
    {
      purl: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
      },
      data: {
        type: DataTypes.JSON,
        allowNull: false
      }
    },
    { sequelize, modelName: "DataFlows" }
  );
  await sequelize.sync();
  return {
    sequelize,
    Namespaces,
    Usages,
    DataFlows
  };
};
