import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cdx_15, cdx_16 } from "@appthreat/cdx-proto";

/**
 * Stringify the given bom json based on the type.
 *
 * @param {string | Object} bomJson string or object
 * @returns {string} BOM json string
 */
const stringifyIfNeeded = (bomJson) => {
  if (typeof bomJson === "string" || bomJson instanceof String) {
    return bomJson;
  }
  return JSON.stringify(bomJson);
};

/**
 * Method to convert the given bom json to proto binary
 *
 * @param {string | Object} bomJson BOM Json
 * @param {string} binFile Binary file name
 */
export const writeBinary = (bomJson, binFile) => {
  if (bomJson && binFile) {
    let bomObject = undefined;
    if (+bomJson.specVersion === 1.6) {
      bomObject = new cdx_16.Bom();
    } else {
      bomObject = new cdx_15.Bom();
    }
    writeFileSync(
      binFile,
      bomObject
        .fromJsonString(stringifyIfNeeded(bomJson), {
          ignoreUnknownFields: true,
        })
        .toBinary({ writeUnknownFields: true }),
    );
  }
};

/**
 * Method to read a serialized binary
 *
 * @param {string} binFile Binary file name
 * @param {boolean} asJson Convert to JSON
 * @param {number} specVersion Specification version. Defaults to 1.5
 */
export const readBinary = (binFile, asJson = true, specVersion = 1.5) => {
  if (!existsSync(binFile)) {
    return undefined;
  }
  let bomLib = undefined;
  if (specVersion === 1.6) {
    bomLib = new cdx_16.Bom();
  } else {
    bomLib = new cdx_15.Bom();
  }
  const bomObject = bomLib.fromBinary(readFileSync(binFile), {
    readUnknownFields: true,
  });
  if (asJson) {
    return bomObject.toJson({ emitDefaultValues: true });
  }
  return bomObject;
};
