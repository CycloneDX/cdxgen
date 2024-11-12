import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirNameStr } from "../../helpers/utils.js";

const componentTags = JSON.parse(
  readFileSync(join(dirNameStr, "data", "component-tags.json"), "utf-8"),
);

function humanifyTimestamp(timestamp) {
  const dateObj = new Date(Date.parse(timestamp));
  return dateObj.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function toArticle(s) {
  return /^[aeiou]/i.test(s) ? "an" : "a";
}

function joinArray(arr) {
  if (!Array.isArray(arr)) {
    return arr;
  }
  if (arr.length <= 1) {
    return arr.join(", ");
  }
  const last = arr.pop();
  return `${arr.join(", ")}${arr.length > 1 ? "," : ""} and ${last}`;
}

function cleanNames(s) {
  return s.replace(/[+]/g, " ");
}

function cleanTypes(s) {
  return s.replace(/[+-_]/g, " ");
}

/**
 * Create the textual representation of the metadata section
 *
 * @param {Object} bomJson BOM JSON Object
 *
 * @returns {String | undefined} Textual representation of the metadata
 */
export function textualMetadata(bomJson) {
  if (!bomJson?.metadata) {
    return undefined;
  }
  let text = "";
  let cdxTypeDesc = "Software Bill-of-Materials (SBOM)";
  const metadata = bomJson.metadata;
  const lifecycles = metadata?.lifecycles || [];
  const cryptoAssetsCount = bomJson?.components.filter(
    (c) => c.type === "cryptographic-asset",
  ).length;
  // Is this an OBOM?
  if (lifecycles.filter((l) => l.phase === "operations").length > 0) {
    cdxTypeDesc = "Operations Bill-of-Materials (OBOM)";
  } else if (cryptoAssetsCount > 0) {
    cdxTypeDesc = "Cryptography Bill-of-Materials (CBOM)";
  }
  if (metadata?.timestamp) {
    text = `This ${cdxTypeDesc} document was created on ${humanifyTimestamp(metadata.timestamp)}`;
  }
  if (metadata?.tools) {
    const tools = metadata.tools.components;
    // Only components would be supported. If you need support for services, send a PR!
    if (tools && Array.isArray(tools)) {
      if (tools.length === 1) {
        text = `${text} with ${tools[0].name}.`;
      } else {
        text = `${text}. The xBOM tools used are: ${joinArray(tools.map((t) => t.name))}.`;
      }
    }
  }
  if (lifecycles && Array.isArray(lifecycles)) {
    if (lifecycles.length === 1) {
      const thePhase = lifecycles[0].phase;
      if (thePhase === "pre-build") {
        text = `${text} The data was captured during the ${thePhase} lifecycle phase without building the application.`;
      } else {
        text = `${text} The data was captured during the ${thePhase} lifecycle phase.`;
      }
    } else {
      text = `${text} The lifecycles phases represented are: ${joinArray(lifecycles.map((l) => l.phase))}.`;
    }
  }
  if (metadata?.component) {
    const parentVersion = metadata.component.version;
    const cleanTypeName = cleanTypes(metadata.component.type);
    if (
      parentVersion &&
      !["", "unspecified", "latest", "master", "main"].includes(parentVersion)
    ) {
      text = `${text} The document describes ${toArticle(metadata.component.type)} ${cleanTypeName} named '${cleanNames(metadata.component.name)}' with version '${parentVersion}'.`;
    } else {
      text = `${text} The document describes ${toArticle(metadata.component.type)} ${cleanTypeName} named '${cleanNames(metadata.component.name)}'.`;
    }
    if (cryptoAssetsCount) {
      text = `${text} There are ${cryptoAssetsCount} cryptographic assets listed under components in this CBOM.`;
    }
    if (
      metadata?.component.components &&
      Array.isArray(metadata.component?.components)
    ) {
      text = `${text} The ${cleanTypeName} also has ${metadata.component.components.length} child modules/components.`;
    }
  }
  let metadataProperties = metadata.properties || [];
  if (
    metadata?.component?.properties &&
    Array.isArray(metadata.component.properties)
  ) {
    metadataProperties = metadataProperties.concat(
      metadata.component.properties,
    );
  }
  let bomPkgTypes = [];
  let bomPkgNamespaces = [];
  let imageRepoTag;
  let imageArch;
  let imageOs;
  let imageComponentTypes;
  let osBuildVersion;
  for (const aprop of metadataProperties) {
    switch (aprop.name) {
      case "cdx:bom:componentTypes":
        bomPkgTypes = aprop?.value.split("\\n");
        break;
      case "cdx:bom:componentNamespaces":
        bomPkgNamespaces = aprop?.value.split("\\n");
        break;
      case "oci:image:RepoTag":
        imageRepoTag = aprop.value;
        break;
      case "arch":
      case "oci:image:Architecture":
        imageArch = aprop.value;
        break;
      case "oci:image:Os":
        imageOs = aprop.value;
        break;
      case "oci:image:componentTypes":
        imageComponentTypes = aprop.value.split("\\n");
        break;
      case "build_version":
        osBuildVersion = aprop.value;
        break;
      default:
        break;
    }
  }
  if (imageOs && imageArch && imageRepoTag) {
    text = `${text} The ${imageOs} image is ${imageArch} architecture with the registry tag ${imageRepoTag}.`;
  }
  if (imageArch && osBuildVersion) {
    text = `${text} The OS is ${imageArch} architecture with the build version '${osBuildVersion}'.`;
  }
  if (imageComponentTypes && imageComponentTypes.length > 0) {
    text = `${text} The OS components are of types ${joinArray(imageComponentTypes)}.`;
  }
  if (bomPkgTypes.length && bomPkgNamespaces.length) {
    if (bomPkgTypes.length === 1) {
      text = `${text} The package type in this xBOM is ${joinArray(bomPkgTypes)} with ${bomPkgNamespaces.length} namespaces described under components.`;
    } else {
      text = `${text} ${bomPkgTypes.length} package type(s) and ${bomPkgNamespaces.length} namespaces are described in the document under components.`;
    }
  }
  return text;
}

/**
 * Extract interesting tags from the component attribute
 *
 * @param {Object} component CycloneDX component
 * @returns {Array | undefined} Array of string tags
 */
export function extractTags(component) {
  if (!component || (!component.description && !component.properties)) {
    return undefined;
  }
  const tags = new Set();
  const desc = component?.description?.toLowerCase();
  const compProps = component.properties || [];
  // Identify tags from description
  if (desc) {
    for (const adescTag of componentTags.description) {
      if (desc.includes(` ${adescTag} `) || desc.includes(` ${adescTag}.`)) {
        tags.add(adescTag);
      }
      const stemmedTag = adescTag.replace(/(ion|ed|er|en|ing)$/, "");
      const stemmedDesc = adescTag.replace(/(ion|ed|er|en|ing) $/, " ");
      if (
        stemmedDesc.includes(` ${stemmedTag} `) ||
        stemmedDesc.includes(` ${stemmedTag}.`)
      ) {
        tags.add(adescTag);
      }
    }
  }
  // Identify tags from properties as a fallback
  if (!tags.size) {
    for (const adescTag of componentTags.properties) {
      for (const aprop of compProps) {
        if (
          aprop.name !== "SrcFile" &&
          aprop?.value?.toLowerCase().includes(adescTag)
        ) {
          tags.add(adescTag);
        }
      }
    }
  }
  return Array.from(tags).sort();
}
