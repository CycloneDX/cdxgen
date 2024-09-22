import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { PackageURL } from "packageurl-js";
import { DEBUG_MODE, dirNameStr, isPartialTree } from "./utils.js";

import { URL, fileURLToPath } from "node:url";
let url = import.meta.url;
if (!url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
const dirName = dirNameStr;

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
      "utf-8",
    ),
  );
  const defsSchema = JSON.parse(
    readFileSync(join(dirName, "data", "jsf-0.82.schema.json"), "utf-8"),
  );
  const spdxSchema = JSON.parse(
    readFileSync(join(dirName, "data", "spdx.schema.json"), "utf-8"),
  );
  const ajv = new Ajv({
    schemas: [schema, defsSchema, spdxSchema],
    strict: false,
    logger: false,
    verbose: true,
    code: {
      source: true,
      lines: true,
      optimize: true,
    },
  });
  addFormats(ajv);
  const validate = ajv.getSchema(
    `http://cyclonedx.org/schema/bom-${bomJson.specVersion}.schema.json`,
  );
  const isValid = validate(bomJson);
  if (!isValid) {
    console.log(
      `Schema validation failed for ${bomJson.metadata.component.name}`,
    );
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
  if (bomJson?.metadata) {
    if (
      !bomJson.metadata.component ||
      !Object.keys(bomJson.metadata.component).length
    ) {
      warningsList.push(
        "metadata.component is missing. Run cdxgen with both --project-name and --project-version argument.",
      );
    }
    if (bomJson.metadata.component) {
      // Do we have a purl and bom-ref for metadata.component
      if (!bomJson.metadata.component.purl) {
        warningsList.push("purl is missing for metadata.component");
      }
      if (!bomJson.metadata.component["bom-ref"]) {
        warningsList.push("bom-ref is missing for metadata.component");
      }
      // Do we have a version for metadata.component
      if (!bomJson.metadata.component.version) {
        warningsList.push(
          "Version is missing for metadata.component. Pass the version using --project-version argument.",
        );
      }
      // Is the same component getting repeated inside the components block
      if (bomJson.metadata.component.components?.length) {
        for (const comp of bomJson.metadata.component.components) {
          if (comp["bom-ref"] === bomJson.metadata.component["bom-ref"]) {
            warningsList.push(
              `Found parent component with ref ${comp["bom-ref"]} in metadata.component.components`,
            );
          } else if (comp["name"] === bomJson.metadata.component["name"]) {
            warningsList.push(
              `Found parent component with name ${comp["name"]} in metadata.component.components`,
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
  if (errorList.length !== 0) {
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
  if (bomJson?.components) {
    for (const comp of bomJson.components) {
      if (comp.type === "cryptographic-asset") {
        if (comp.purl?.length) {
          errorList.push(
            `purl should not be defined for cryptographic-asset ${comp.purl}`,
          );
        }
        if (!comp.cryptoProperties) {
          errorList.push(
            `cryptoProperties is missing for cryptographic-asset ${comp.purl}`,
          );
        } else if (
          comp.cryptoProperties.assetType === "algorithm" &&
          !comp.cryptoProperties.oid
        ) {
          errorList.push(
            `cryptoProperties.oid is missing for cryptographic-asset of type algorithm ${comp.purl}`,
          );
        } else if (
          comp.cryptoProperties.assetType === "certificate" &&
          !comp.cryptoProperties.algorithmProperties
        ) {
          errorList.push(
            `cryptoProperties.algorithmProperties is missing for cryptographic-asset of type certificate ${comp.purl}`,
          );
        }
      } else {
        try {
          const purlObj = PackageURL.fromString(comp.purl);
          if (purlObj.type && purlObj.type !== purlObj.type.toLowerCase()) {
            warningsList.push(
              `purl type is not normalized to lower case ${comp.purl}`,
            );
          }
          if (
            ["npm", "golang"].includes(purlObj.type) &&
            purlObj.name.includes("%2F") &&
            !purlObj.namespace
          ) {
            errorList.push(
              `purl does not include namespace but includes encoded slash in name for npm type. ${comp.purl}`,
            );
          }
        } catch (ex) {
          errorList.push(`Invalid purl ${comp.purl}`);
        }
      }
    }
  }
  if (DEBUG_MODE && warningsList.length !== 0) {
    console.log("===== WARNINGS =====");
    console.log(warningsList);
  }
  if (errorList.length !== 0) {
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
  if (bomJson?.dependencies) {
    if (isPartialTree(bomJson.dependencies, bomJson?.components?.length)) {
      warningsList.push(
        "Dependency tree is partial with multiple empty dependsOn attributes.",
      );
    }
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
      if (dep.dependsOn) {
        for (const don of dep.dependsOn) {
          if (!refMap[don]) {
            warningsList.push(`Invalid ref in dependencies.dependsOn ${don}`);
          }
        }
      }
      if (dep.provides) {
        for (const don of dep.provides) {
          if (!refMap[don]) {
            warningsList.push(`Invalid ref in dependencies.provides ${don}`);
          }
        }
      }
    }
  }
  if (DEBUG_MODE && warningsList.length !== 0) {
    console.log("===== WARNINGS =====");
    console.log(warningsList);
  }
  if (errorList.length !== 0) {
    console.log(errorList);
    return false;
  }
  return true;
};
