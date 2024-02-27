import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PackageURL } from "packageurl-js";
import { DEBUG_MODE } from "./utils.js";

import { URL, fileURLToPath } from "node:url";
let url = import.meta.url;
if (!url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
const dirName = import.meta ? dirname(fileURLToPath(url)) : __dirname;

/**
 * Validate the generated bom using jsonschema
 *
 * @param {object} bomJson content
 */
export const validateBom = (bomJson) => {
  if (!bomJson) {
    return true;
  }
  const schema = JSON.parse(
    readFileSync(
      join(dirName, "data", `bom-${bomJson.specVersion}.schema.json`),
      "utf-8"
    )
  );
  const defsSchema = JSON.parse(
    readFileSync(join(dirName, "data", "jsf-0.82.schema.json"), "utf-8")
  );
  const spdxSchema = JSON.parse(
    readFileSync(join(dirName, "data", "spdx.schema.json"), "utf-8")
  );
  const ajv = new Ajv({
    schemas: [schema, defsSchema, spdxSchema],
    strict: false,
    logger: false
  });
  addFormats(ajv);
  const validate = ajv.getSchema(
    `http://cyclonedx.org/schema/bom-${bomJson.specVersion}.schema.json`
  );
  const isValid = validate(bomJson);
  if (!isValid) {
    console.log(validate.errors);
    return false;
  }
  // Deep validation tests
  return (
    validateMetadata(bomJson) && validatePurls(bomJson) && validateRefs(bomJson)
  );
};

/**
 * Validate the metadata object
 *
 * @param {object} bomJson Bom json object
 */
export const validateMetadata = (bomJson) => {
  const errorList = [];
  const warningsList = [];
  if (bomJson && bomJson.metadata) {
    if (
      !bomJson.metadata.component ||
      !Object.keys(bomJson.metadata.component).length
    ) {
      warningsList.push("metadata.component is missing.");
    }
    if (bomJson.metadata.component) {
      // Do we have a purl and bom-ref for metadata.component
      if (!bomJson.metadata.component.purl) {
        warningsList.push(`purl is missing for metadata.component`);
      }
      if (!bomJson.metadata.component["bom-ref"]) {
        warningsList.push(`bom-ref is missing for metadata.component`);
      }
      // Do we have a version for metadata.component
      if (!bomJson.metadata.component.version) {
        warningsList.push(`Version is missing for metadata.component`);
      }
      // Is the same component getting repeated inside the components block
      if (
        bomJson.metadata.component.components &&
        bomJson.metadata.component.components.length
      ) {
        for (const comp of bomJson.metadata.component.components) {
          if (comp["bom-ref"] === bomJson.metadata.component["bom-ref"]) {
            warningsList.push(
              `Found parent component with ref ${comp["bom-ref"]} in metadata.component.components`
            );
          } else if (comp["name"] === bomJson.metadata.component["name"]) {
            warningsList.push(
              `Found parent component with name ${comp["name"]} in metadata.component.components`
            );
          }
        }
      }
    }
  }
  if (DEBUG_MODE && warningsList.length !== 0) {
    console.log("===== WARNINGS =====");
    console.log(warningsList);
  }
  if (errorList.length != 0) {
    console.log(errorList);
    return false;
  }
  return true;
};

/**
 * Validate the format of all purls
 *
 * @param {object} bomJson Bom json object
 */
export const validatePurls = (bomJson) => {
  const errorList = [];
  const warningsList = [];
  if (bomJson && bomJson.components) {
    for (const comp of bomJson.components) {
      try {
        const purlObj = PackageURL.fromString(comp.purl);
        if (purlObj.type && purlObj.type !== purlObj.type.toLowerCase()) {
          warningsList.push(
            `purl type is not normalized to lower case ${comp.purl}`
          );
        }
      } catch (ex) {
        errorList.push(`Invalid purl ${comp.purl}`);
      }
    }
  }
  if (DEBUG_MODE && warningsList.length !== 0) {
    console.log("===== WARNINGS =====");
    console.log(warningsList);
  }
  if (errorList.length != 0) {
    console.log(errorList);
    return false;
  }
  return true;
};

const buildRefs = (bomJson) => {
  const refMap = {};
  if (bomJson) {
    if (bomJson.metadata) {
      if (bomJson.metadata.component) {
        refMap[bomJson.metadata.component["bom-ref"]] = true;
        if (bomJson.metadata.component.components) {
          for (const comp of bomJson.metadata.component.components) {
            refMap[comp["bom-ref"]] = true;
          }
        }
      }
    }
    if (bomJson.components) {
      for (const comp of bomJson.components) {
        refMap[comp["bom-ref"]] = true;
      }
    }
  }
  return refMap;
};

/**
 * Validate the refs in dependencies block
 *
 * @param {object} bomJson Bom json object
 */
export const validateRefs = (bomJson) => {
  const errorList = [];
  const warningsList = [];
  const refMap = buildRefs(bomJson);
  if (bomJson && bomJson.dependencies) {
    for (const dep of bomJson.dependencies) {
      if (
        dep.ref.includes("%40") ||
        dep.ref.includes("%3A") ||
        dep.ref.includes("%2F")
      ) {
        errorList.push(`Invalid encoded ref in dependencies ${dep.ref}`);
      }
      if (!refMap[dep.ref]) {
        warningsList.push(`Invalid ref in dependencies ${dep.ref}`);
      }
      for (const don of dep.dependsOn) {
        if (!refMap[don]) {
          warningsList.push(`Invalid ref in dependencies.dependsOn ${don}`);
        }
      }
    }
  }
  if (DEBUG_MODE && warningsList.length !== 0) {
    console.log("===== WARNINGS =====");
    console.log(warningsList);
  }
  if (errorList.length != 0) {
    console.log(errorList);
    return false;
  }
  return true;
};
