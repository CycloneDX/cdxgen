import { readFileSync } from "node:fs";
import { convertOSQueryResults, dirNameStr, executeOsQuery } from "./utils.js";
import { join } from "node:path";
const cbomosDbQueries = JSON.parse(
  readFileSync(join(dirNameStr, "data", "cbomosdb-queries.json"), "utf-8")
);

/**
 * Method to collect crypto and ssl libraries from the OS.
 *
 * @returns osPkgsList Array of OS crypto packages
 */
export const collectOSCryptoLibs = () => {
  let osPkgsList = [];
  for (const queryCategory of Object.keys(cbomosDbQueries)) {
    const queryObj = cbomosDbQueries[queryCategory];
    const results = executeOsQuery(queryObj.query);
    const dlist = convertOSQueryResults(queryCategory, queryObj, results, true);
    if (dlist && dlist.length) {
      osPkgsList = osPkgsList.concat(dlist);
    }
  }
  return osPkgsList;
};
