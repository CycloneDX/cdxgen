import { readFileSync } from "node:fs";
import { join } from "node:path";
import { executeOsQuery } from "../managers/binary.js";
import { convertOSQueryResults, dirNameStr } from "./utils.js";
const cbomosDbQueries = JSON.parse(
  readFileSync(join(dirNameStr, "data", "cbomosdb-queries.json"), "utf-8"),
);
const cbomCryptoOids = JSON.parse(
  readFileSync(join(dirNameStr, "data", "crypto-oid.json"), "utf-8"),
);

/**
 * Method to collect crypto and ssl libraries from the OS.
 *
 * @param {Object} options
 * @returns osPkgsList Array of OS crypto packages
 */
export function collectOSCryptoLibs(options) {
  let osPkgsList = [];
  for (const queryCategory of Object.keys(cbomosDbQueries)) {
    const queryObj = cbomosDbQueries[queryCategory];
    const results = executeOsQuery(queryObj.query);
    const dlist = convertOSQueryResults(
      queryCategory,
      queryObj,
      results,
      false,
    );
    if (dlist?.length) {
      osPkgsList = osPkgsList.concat(dlist);
      // Should we downgrade from cryptographic-asset to data for < 1.6 spec
      if (options?.specVersion && options.specVersion < 1.6) {
        for (const apkg of osPkgsList) {
          if (apkg.type === "cryptographic-asset") {
            apkg.type = "data";
          }
        }
      }
    }
  }
  return osPkgsList;
}

function cleanStr(str) {
  return str.toLowerCase().replace(/[^0-9a-z ]/gi, "");
}

/**
 * Find crypto algorithm in the given code snippet
 *
 * @param {String} Code snippet
 * @returns {Array} Arary of crypto algorithm objects with oid and description
 */
export function findCryptoAlgos(code) {
  const cleanCode = cleanStr(code);
  const cryptoAlgos = [];
  for (const algoName of Object.keys(cbomCryptoOids)) {
    if (cleanCode.includes(cleanStr(algoName))) {
      cryptoAlgos.push({
        ...cbomCryptoOids[algoName],
        name: algoName,
        ref: `crypto/algorithm/${algoName}@${cbomCryptoOids[algoName].oid}`,
      });
    }
  }
  return cryptoAlgos;
}
