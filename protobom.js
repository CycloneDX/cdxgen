import { Bom } from "@appthreat/cdx-proto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const stringifyIfNeeded = (bomJson) => {
  if (typeof bomJson === "string" || bomJson instanceof String) {
    return bomJson;
  }
  return JSON.stringify(bomJson);
};

export const writeBinary = (bomJson, binFile) => {
  if (bomJson && binFile) {
    const bomObject = new Bom();
    writeFileSync(
      binFile,
      bomObject
        .fromJsonString(stringifyIfNeeded(bomJson), {
          ignoreUnknownFields: true
        })
        .toBinary({ writeUnknownFields: true })
    );
  }
};

export const readBinary = (binFile, asJson = true) => {
  if (!existsSync(binFile)) {
    return undefined;
  }
  const bomObject = new Bom().fromBinary(readFileSync(binFile), {
    readUnknownFields: true
  });
  if (asJson) {
    return bomObject.toJson({ emitDefaultValues: true });
  }
  return bomObject;
};
