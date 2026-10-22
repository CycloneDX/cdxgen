import path from "node:path";

import {
  isReservedMetadataPropertyName,
  METADATA_PROPERTY_CONFIG_KEYS,
  parseMetadataProperties,
} from "./metadataProperties.js";
import { toCamel } from "./paths.js";

/**
 * Config file names cdxgen reads from the directory it is invoked in.
 */
export const PROJECT_CONFIG_FILENAMES = [
  ".cdxgenrc",
  ".cdxgen.json",
  ".cdxgen.yml",
  ".cdxgen.yaml",
];

/**
 * Options whose values name a file or directory cdxgen writes to or reads
 * from. A config file may set these, but only to a location inside its own
 * directory.
 */
const PATH_OPTIONS = new Set([
  "output",
  "evinse-output",
  "proto-bin-file",
  "deps-slices-file",
  "usages-slices-file",
  "data-flow-slices-file",
  "reachables-slices-file",
  "semantics-slices-file",
  "openapi-spec-file",
  "license-policy",
  "bom-audit-rules-dir",
]);

/**
 * Options that change where cdxgen sends data or how much of the host it
 * touches. These stay usable, but never silently.
 */
const ANNOUNCED_OPTIONS = new Set([
  "server-url",
  "api-key",
  "include-formulation",
  "install-deps",
  "introspect",
  "deep",
  "tea-publish",
  "tea-fetch",
  "tea-artifact-url",
  "tea-token",
]);

/**
 * Both spellings a config file may use for an option.
 *
 * @param {string} option kebab-case option name
 * @returns {string[]} kebab-case and camelCase spellings
 */
function optionSpellings(option) {
  const camel = toCamel(option);
  return camel === option ? [option] : [option, camel];
}

/**
 * Determine whether a config-supplied path stays inside the config's own
 * directory.
 *
 * @param {string} configDir directory the config file was read from
 * @param {unknown} value config-supplied path value
 * @returns {boolean} true when the path resolves inside configDir
 */
function isContainedPath(configDir, value) {
  if (typeof value !== "string" || !value.length) {
    return false;
  }
  const relativePath = path.relative(
    path.resolve(configDir),
    path.resolve(configDir, value),
  );
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

/**
 * Apply the trust boundary between cdxgen and the directory it is scanning.
 *
 * A config file lives in the tree under analysis, so it is attacker-controlled
 * whenever that tree is. Path options are therefore confined to the config's
 * own directory - a scanned project may choose where in itself the BOM lands,
 * but not write outside it - and options that redirect data off the host or
 * widen what cdxgen executes are announced on the console. A project may
 * describe itself with custom metadata properties, but not in the namespaces
 * cdxgen reserves for the facts it establishes, so a scanned tree cannot pass
 * its own claims off as cdxgen's.
 *
 * @param {Object} config parsed config file contents
 * @param {string} configDir directory the config file was read from
 * @returns {{config: Object, rejected: string[], announced: string[], reservedProperties: string[]}} sanitized config and what it did
 */
export function sanitizeProjectConfig(config, configDir) {
  if (!config || typeof config !== "object") {
    return { announced: [], config: {}, rejected: [], reservedProperties: [] };
  }
  const sanitized = { ...config };
  const rejected = [];
  const announced = [];
  const reservedProperties = [];
  for (const key of METADATA_PROPERTY_CONFIG_KEYS) {
    if (sanitized[key] === undefined) {
      continue;
    }
    const properties = [];
    for (const aprop of parseMetadataProperties(sanitized[key])) {
      if (isReservedMetadataPropertyName(aprop.name)) {
        reservedProperties.push(aprop.name);
      } else {
        properties.push(aprop);
      }
    }
    if (properties.length) {
      sanitized[key] = properties;
    } else {
      delete sanitized[key];
    }
  }
  for (const option of PATH_OPTIONS) {
    for (const key of optionSpellings(option)) {
      if (sanitized[key] === undefined) {
        continue;
      }
      if (!isContainedPath(configDir, sanitized[key])) {
        rejected.push(`${key}=${sanitized[key]}`);
        delete sanitized[key];
      }
    }
  }
  for (const option of ANNOUNCED_OPTIONS) {
    for (const key of optionSpellings(option)) {
      if (sanitized[key] !== undefined) {
        announced.push(key);
      }
    }
  }
  return { announced, config: sanitized, rejected, reservedProperties };
}
