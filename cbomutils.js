import { readFileSync } from "node:fs";
import { convertOSQueryResults, dirNameStr } from "./utils.js";
import { executeOsQuery } from "./binary.js";
import { join } from "node:path";
const cbomosDbQueries = JSON.parse(
  readFileSync(join(dirNameStr, "data", "cbomosdb-queries.json"), "utf-8")
);

/**
 * Method to collect crypto and ssl libraries from the OS.
 *
 * @param {Object} options
 * @returns osPkgsList Array of OS crypto packages
 */
export const collectOSCryptoLibs = (options) => {
  let osPkgsList = [];
  for (const queryCategory of Object.keys(cbomosDbQueries)) {
    const queryObj = cbomosDbQueries[queryCategory];
    const results = executeOsQuery(queryObj.query);
    const dlist = convertOSQueryResults(
      queryCategory,
      queryObj,
      results,
      false
    );
    if (dlist && dlist.length) {
      osPkgsList = osPkgsList.concat(dlist);
      // Should we downgrade from cryptographic-asset to data for < 1.6 spec
      if (options && options.specVersion && options.specVersion < 1.6) {
        for (const apkg of osPkgsList) {
          if (apkg.type === "cryptographic-asset") {
            apkg.type = "data";
          }
        }
      }
    }
  }
  return osPkgsList;
};
