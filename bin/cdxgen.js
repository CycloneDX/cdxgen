#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { findUpSync } from "find-up";
import globalAgent from "global-agent";
import { load as _load } from "js-yaml";
import jws from "jws";
import { createBom, submitBom } from "../lib/cli/index.js";
import {
  printCallStack,
  printDependencyTree,
  printFormulation,
  printOccurrences,
  printReachables,
  printServices,
  printSponsorBanner,
  printSummary,
  printTable,
} from "../lib/helpers/display.js";
import { thoughtEnd, thoughtLog } from "../lib/helpers/logger.js";
import {
  ATOM_DB,
  dirNameStr,
  getTmpDir,
  isMac,
  isSecureMode,
  isWin,
  safeExistsSync,
} from "../lib/helpers/utils.js";
import { validateBom } from "../lib/helpers/validator.js";
import { postProcess } from "../lib/stages/postgen/postgen.js";
import { prepareEnv } from "../lib/stages/pregen/pregen.js";

// Support for config files
const configPath = findUpSync([
  ".cdxgenrc",
  ".cdxgen.json",
  ".cdxgen.yml",
  ".cdxgen.yaml",
]);
let config = {};
if (configPath) {
  try {
    if (configPath.endsWith(".yml") || configPath.endsWith(".yaml")) {
      config = _load(fs.readFileSync(configPath, "utf-8"));
    } else {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (e) {
    console.log("Invalid config file", configPath);
  }
}

let url = import.meta.url;
if (!url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
const dirName = dirNameStr;

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const args = yargs(hideBin(process.argv))
  .env("CDXGEN")
  .parserConfiguration({
    "greedy-arrays": false,
    "short-option-groups": false,
  })
  .option("output", {
    alias: "o",
    description: "Output file. Default bom.json",
    default: "bom.json",
  })
  .option("evinse-output", {
    description:
      "Create bom with evidence as a separate file. Default bom.json",
    hidden: true,
  })
  .option("type", {
    alias: "t",
    description:
      "Project type. Please refer to https://cyclonedx.github.io/cdxgen/#/PROJECT_TYPES for supported languages/platforms.",
  })
  .option("exclude-type", {
    description:
      "Project types to exclude. Please refer to https://cyclonedx.github.io/cdxgen/#/PROJECT_TYPES for supported languages/platforms.",
  })
  .option("recurse", {
    alias: "r",
    type: "boolean",
    default: true,
    description:
      "Recurse mode suitable for mono-repos. Defaults to true. Pass --no-recurse to disable.",
  })
  .option("print", {
    alias: "p",
    type: "boolean",
    description: "Print the SBOM as a table with tree.",
  })
  .option("resolve-class", {
    alias: "c",
    type: "boolean",
    description: "Resolve class names for packages. jars only for now.",
  })
  .option("deep", {
    type: "boolean",
    description:
      "Perform deep searches for components. Useful while scanning C/C++ apps, live OS and oci images.",
  })
  .option("server-url", {
    description: "Dependency track url. Eg: https://deptrack.cyclonedx.io",
  })
  .option("skip-dt-tls-check", {
    type: "boolean",
    default: false,
    description: "Skip TLS certificate check when calling Dependency-Track. ",
  })
  .option("api-key", {
    description: "Dependency track api key",
  })
  .option("project-group", {
    description: "Dependency track project group",
  })
  .option("project-name", {
    description:
      "Dependency track project name. Default use the directory name",
  })
  .option("project-version", {
    description: "Dependency track project version",
    default: "",
    type: "string",
  })
  .option("project-id", {
    description:
      "Dependency track project id. Either provide the id or the project name and version together",
    type: "string",
  })
  .option("parent-project-id", {
    description: "Dependency track parent project id",
    type: "string",
  })
  .option("required-only", {
    type: "boolean",
    description:
      "Include only the packages with required scope on the SBOM. Would set compositions.aggregate to incomplete unless --no-auto-compositions is passed.",
  })
  .option("fail-on-error", {
    type: "boolean",
    default: isSecureMode,
    description: "Fail if any dependency extractor fails.",
  })
  .option("no-babel", {
    type: "boolean",
    description:
      "Do not use babel to perform usage analysis for JavaScript/TypeScript projects.",
  })
  .option("generate-key-and-sign", {
    type: "boolean",
    description:
      "Generate an RSA public/private key pair and then sign the generated SBOM using JSON Web Signatures.",
  })
  .option("server", {
    type: "boolean",
    description: "Run cdxgen as a server",
  })
  .option("server-host", {
    description: "Listen address",
    default: "127.0.0.1",
  })
  .option("server-port", {
    description: "Listen port",
    default: "9090",
  })
  .option("install-deps", {
    type: "boolean",
    default: !isSecureMode,
    description:
      "Install dependencies automatically for some projects. Defaults to true but disabled for containers and oci scans. Use --no-install-deps to disable this feature.",
  })
  .option("validate", {
    type: "boolean",
    default: true,
    description:
      "Validate the generated SBOM using json schema. Defaults to true. Pass --no-validate to disable.",
  })
  .option("evidence", {
    type: "boolean",
    default: false,
    description: "Generate SBOM with evidence for supported languages.",
  })
  .option("deps-slices-file", {
    description: "Path for the parsedeps slice file created by atom.",
    default: "deps.slices.json",
    hidden: true,
  })
  .option("usages-slices-file", {
    description: "Path for the usages slices file created by atom.",
    default: "usages.slices.json",
    hidden: true,
  })
  .option("data-flow-slices-file", {
    description: "Path for the data-flow slices file created by atom.",
    default: "data-flow.slices.json",
    hidden: true,
  })
  .option("reachables-slices-file", {
    description: "Path for the reachables slices file created by atom.",
    default: "reachables.slices.json",
    hidden: true,
  })
  .option("semantics-slices-file", {
    description: "Path for the semantics slices file.",
    default: "semantics.slices.json",
    hidden: true,
  })
  .option("spec-version", {
    description: "CycloneDX Specification version to use. Defaults to 1.6",
    default: 1.6,
    type: "number",
  })
  .option("filter", {
    description:
      "Filter components containing this word in purl or component.properties.value. Multiple values allowed.",
  })
  .option("only", {
    description:
      "Include components only containing this word in purl. Useful to generate BOM with first party components alone. Multiple values allowed.",
  })
  .option("author", {
    description:
      "The person(s) who created the BOM. Set this value if you're intending the modify the BOM and claim authorship.",
    default: "OWASP Foundation",
  })
  .option("profile", {
    description: "BOM profile to use for generation. Default generic.",
    default: "generic",
    choices: [
      "appsec",
      "research",
      "operational",
      "threat-modeling",
      "license-compliance",
      "generic",
      "machine-learning",
      "ml",
      "deep-learning",
      "ml-deep",
      "ml-tiny",
    ],
  })
  .option("lifecycle", {
    description: "Product lifecycle for the generated BOM.",
    hidden: true,
    choices: ["pre-build", "build", "post-build"],
  })
  .option("exclude", {
    description: "Additional glob pattern(s) to ignore",
  })
  .option("export-proto", {
    type: "boolean",
    default: false,
    description: "Serialize and export BOM as protobuf binary.",
    hidden: true,
  })
  .option("proto-bin-file", {
    description: "Path for the serialized protobuf binary.",
    default: "bom.cdx",
    hidden: true,
  })
  .option("include-formulation", {
    type: "boolean",
    default: false,
    description:
      "Generate formulation section with git metadata and build tools. Defaults to false.",
  })
  .option("include-crypto", {
    type: "boolean",
    default: false,
    description: "Include crypto libraries as components.",
  })
  .option("standard", {
    description:
      "The list of standards which may consist of regulations, industry or organizational-specific standards, maturity models, best practices, or any other requirements which can be evaluated against or attested to.",
    choices: [
      "asvs-5.0",
      "asvs-4.0.3",
      "bsimm-v13",
      "masvs-2.0.0",
      "nist_ssdf-1.1",
      "pcissc-secure-slc-1.1",
      "scvs-1.0.0",
      "ssaf-DRAFT-2023-11",
    ],
  })
  .option("no-banner", {
    type: "boolean",
    default: false,
    hidden: true,
    description:
      "Do not show the donation banner. Set this attribute if you are an active sponsor for OWASP CycloneDX.",
  })
  .option("feature-flags", {
    description: "Experimental feature flags to enable. Advanced users only.",
    hidden: true,
    choices: ["safe-pip-install", "suggest-build-tools", "ruby-docker-install"],
  })
  .option("min-confidence", {
    description:
      "Minimum confidence needed for the identity of a component from 0 - 1, where 1 is 100% confidence.",
    default: 0,
    type: "number",
  })
  .option("technique", {
    description: "Analysis technique to use",
    choices: [
      "auto",
      "source-code-analysis",
      "binary-analysis",
      "manifest-analysis",
      "hash-comparison",
      "instrumentation",
      "filename",
    ],
  })
  .completion("completion", "Generate bash/zsh completion")
  .array("type")
  .array("excludeType")
  .array("filter")
  .array("only")
  .array("author")
  .array("exclude")
  .array("standard")
  .array("feature-flags")
  .array("technique")
  .option("auto-compositions", {
    type: "boolean",
    default: true,
    description:
      "Automatically set compositions when the BOM was filtered. Defaults to true",
  })
  .example([
    ["$0 -t java .", "Generate a Java SBOM for the current directory"],
    [
      "$0 -t java -t js .",
      "Generate a SBOM for Java and JavaScript in the current directory",
    ],
    [
      "$0 -t java --profile ml .",
      "Generate a Java SBOM for machine learning purposes.",
    ],
    [
      "$0 -t python --profile research .",
      "Generate a Python SBOM for appsec research.",
    ],
    ["$0 --server", "Run cdxgen as a server"],
  ])
  .epilogue("for documentation, visit https://cyclonedx.github.io/cdxgen")
  .config(config)
  .scriptName("cdxgen")
  .version()
  .alias("v", "version")
  .help("h")
  .alias("h", "help")
  .wrap(Math.min(120, yargs().terminalWidth())).argv;

if (process.env?.CDXGEN_NODE_OPTIONS) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} ${process.env.CDXGEN_NODE_OPTIONS}`;
}

if (args.version) {
  const packageJsonAsString = fs.readFileSync(
    join(dirName, "..", "package.json"),
    "utf-8",
  );
  const packageJson = JSON.parse(packageJsonAsString);

  console.log(packageJson.version);
  process.exit(0);
}

if (process.env.GLOBAL_AGENT_HTTP_PROXY || process.env.HTTP_PROXY) {
  // Support standard HTTP_PROXY variable if the user doesn't override the namespace
  if (!process.env.GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE) {
    process.env.GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE = "";
  }
  globalAgent.bootstrap();
}

const filePath = args._[0] || process.cwd();
if (!args.projectName) {
  if (filePath !== ".") {
    args.projectName = basename(filePath);
  } else {
    args.projectName = basename(resolve(filePath));
  }
}
thoughtLog(`Let's try to generate a CycloneDX BOM for the path '${filePath}'`);
if (
  filePath.includes(" ") ||
  filePath.includes("\r") ||
  filePath.includes("\n")
) {
  console.log(
    `'${filePath}' contains spaces. This could lead to bugs when invoking external build tools.`,
  );
  if (isSecureMode) {
    process.exit(1);
  }
}
// Support for obom/cbom aliases
if (process.argv[1].includes("obom") && !args.type) {
  args.type = "os";
  thoughtLog(
    "Ok, the user wants to generate an Operations Bill-of-Materials (OBOM).",
  );
}

/**
 * Command line options
 */
const options = Object.assign({}, args, {
  projectType: args.type,
  multiProject: args.recurse,
  noBabel: args.noBabel || args.babel === false,
  project: args.projectId,
  deep: args.deep || args.evidence,
  output:
    isSecureMode && args.output === "bom.json"
      ? resolve(join(filePath, args.output))
      : args.output,
});
// Filter duplicate types. Eg: -t gradle -t gradle
if (options.projectType && Array.isArray(options.projectType)) {
  options.projectType = Array.from(new Set(options.projectType));
}
if (!options.projectType) {
  thoughtLog(
    "Ok, the user wants me to identify all the project types and generate a consolidated BOM document.",
  );
}
if (process.argv[1].includes("cbom")) {
  thoughtLog(
    "Ok, the user wants to generate Cryptographic Bill-of-Materials (CBOM).",
  );
  options.includeCrypto = true;
  options.evidence = true;
  options.specVersion = 1.6;
  options.deep = true;
}
if (process.argv[1].includes("cdxgen-secure")) {
  thoughtLog(
    "Ok, the user wants cdxgen to run in secure mode by default. Let's try and use the permissions api.",
  );
  console.log(
    "NOTE: Secure mode only restricts cdxgen from performing certain activities such as package installation. It does not provide security guarantees in the presence of malicious code.",
  );
  options.installDeps = false;
  process.env.CDXGEN_SECURE_MODE = true;
}
if (options.standard) {
  options.specVersion = 1.6;
}
if (options.includeFormulation) {
  thoughtLog(
    "Wait, the user wants to include formulation information. Let's warn about accidentally disclosing sensitive data via the BOM files.",
  );
  console.log(
    "NOTE: Formulation section could include sensitive data such as emails and secrets.\nPlease review the generated SBOM before distribution.\n",
  );
}
/**
 * Method to apply advanced options such as profile and lifecycles
 *
 * @param {object} options CLI options
 */
const applyAdvancedOptions = (options) => {
  if (options?.profile !== "generic") {
    thoughtLog(`BOM profile to use is '${options.profile}'.`);
  } else {
    thoughtLog(
      "The user hasn't specified a profile. Should I suggest one to optimize the BOM for a specific use case or persona 🤔?",
    );
  }
  switch (options.profile) {
    case "appsec":
      options.deep = true;
      break;
    case "research":
      options.deep = true;
      options.evidence = true;
      options.includeCrypto = true;
      process.env.CDX_MAVEN_INCLUDE_TEST_SCOPE = "true";
      process.env.ASTGEN_IGNORE_DIRS = "";
      process.env.ASTGEN_IGNORE_FILE_PATTERN = "";
      break;
    case "operational":
      if (options?.projectType) {
        options.projectType.push("os");
      } else {
        options.projectType = ["os"];
      }
      break;
    case "threat-modeling":
      options.deep = true;
      options.evidence = true;
      break;
    case "license-compliance":
      process.env.FETCH_LICENSE = "true";
      break;
    case "ml-tiny":
      process.env.FETCH_LICENSE = "true";
      options.deep = false;
      options.evidence = false;
      options.includeCrypto = false;
      options.installDeps = false;
      break;
    case "machine-learning":
    case "ml":
      process.env.FETCH_LICENSE = "true";
      options.deep = true;
      options.evidence = false;
      options.includeCrypto = false;
      options.installDeps = !isSecureMode;
      break;
    case "deep-learning":
    case "ml-deep":
      process.env.FETCH_LICENSE = "true";
      options.deep = true;
      options.evidence = true;
      options.includeCrypto = true;
      options.installDeps = !isSecureMode;
      break;
    default:
      break;
  }
  if (options.lifecycle) {
    thoughtLog(
      `BOM must be generated for the lifecycle '${options.lifecycle}'.`,
    );
  }
  switch (options.lifecycle) {
    case "pre-build":
      options.installDeps = false;
      break;
    case "post-build":
      if (
        !options.projectType ||
        (Array.isArray(options.projectType) &&
          options.projectType.length > 1) ||
        ![
          "csharp",
          "dotnet",
          "container",
          "docker",
          "podman",
          "oci",
          "android",
          "apk",
          "aab",
          "go",
          "golang",
          "rust",
          "rust-lang",
          "cargo",
        ].includes(options.projectType[0])
      ) {
        console.log(
          "PREVIEW: post-build lifecycle SBOM generation is supported only for android, dotnet, go, and Rust projects. Please specify the type using the -t argument.",
        );
        process.exit(1);
      }
      options.installDeps = true;
      break;
    default:
      break;
  }
  // When the user specifies source-code-analysis as a technique, then enable deep and evidence mode.
  if (options?.technique && Array.isArray(options.technique)) {
    if (options?.technique?.includes("source-code-analysis")) {
      options.deep = true;
      options.evidence = true;
    }
    if (options.technique.length === 1) {
      thoughtLog(
        `Wait, the user wants me to use only the following technique: '${options.technique.join(", ")}'.`,
      );
    } else {
      thoughtLog(
        `Alright, I will use only the following techniques: '${options.technique.join(", ")}' for the final BOM.`,
      );
    }
  }
  if (!options.installDeps) {
    thoughtLog(
      "I must avoid any package installations and focus solely on the available artefacts, such as lock files.",
    );
  }
  return options;
};
applyAdvancedOptions(options);

/**
 * Check for node >= 20 permissions
 *
 * @param {string} filePath File path
 * @param {Object} options CLI Options
 * @returns
 */
const checkPermissions = (filePath, options) => {
  const fullFilePath = resolve(filePath);
  if (
    process.getuid &&
    process.getuid() === 0 &&
    process.env?.CDXGEN_IN_CONTAINER !== "true"
  ) {
    console.log(
      "\x1b[1;35mSECURE MODE: DO NOT run cdxgen with root privileges.\x1b[0m",
    );
  }
  if (!process.permission) {
    if (isSecureMode) {
      console.log(
        "\x1b[1;35mSecure mode requires permission-related arguments. These can be passed as CLI arguments directly to the node runtime or set the NODE_OPTIONS environment variable as shown below.\x1b[0m",
      );
      const childProcessArgs =
        options?.lifecycle !== "pre-build" ? " --allow-child-process" : "";
      const nodeOptionsVal = `--permission --allow-fs-read="${getTmpDir()}/*" --allow-fs-write="${getTmpDir()}/*" --allow-fs-read="${fullFilePath}/*" --allow-fs-write="${options.output}"${childProcessArgs}`;
      console.log(
        `${isWin ? "$env:" : "export "}NODE_OPTIONS='${nodeOptionsVal}'`,
      );
      if (process.env?.CDXGEN_IN_CONTAINER !== "true") {
        console.log(
          "TIP: Run cdxgen using the secure container image 'ghcr.io/cyclonedx/cdxgen-secure' for best experience.",
        );
      }
    }
    return true;
  }
  // Secure mode checks
  if (isSecureMode) {
    if (process.permission.has("fs.read", "*")) {
      console.log(
        "\x1b[1;35mSECURE MODE: DO NOT run cdxgen with FileSystemRead permission set to wildcard.\x1b[0m",
      );
    }
    if (process.permission.has("fs.write", "*")) {
      console.log(
        "\x1b[1;35mSECURE MODE: DO NOT run cdxgen with FileSystemWrite permission set to wildcard.\x1b[0m",
      );
    }
    if (process.permission.has("worker")) {
      console.log(
        "SECURE MODE: DO NOT run cdxgen with worker thread permission! Remove `--allow-worker` argument.",
      );
    }
    if (filePath !== fullFilePath) {
      console.log(
        `\x1b[1;35mSECURE MODE: Invoke cdxgen with an absolute path to improve security. Use '${fullFilePath}' instead of '${filePath}'\x1b[0m`,
      );
      if (fullFilePath.includes(" ")) {
        console.log(
          "\x1b[1;35mSECURE MODE: Directory names containing spaces are known to cause issues. Rename the directories by replacing spaces with hyphens or underscores.\x1b[0m",
        );
      } else if (fullFilePath.length > 255 && isWin) {
        console.log(
          "Ensure 'Enable Win32 Long paths' is set to 'Enabled' by using Group Policy Editor.",
        );
      }
      return false;
    }
  }

  if (!process.permission.has("fs.read", filePath)) {
    console.log(
      `\x1b[1;35mSECURE MODE: FileSystemRead permission required. Please invoke cdxgen with the argument --allow-fs-read="${resolve(
        filePath,
      )}"\x1b[0m`,
    );
    return false;
  }
  if (!process.permission.has("fs.write", options.output)) {
    console.log(
      `\x1b[1;35mSECURE MODE: FileSystemWrite permission is required to create the output BOM file. Please invoke cdxgen with the argument --allow-fs-write="${options.output}"\x1b[0m`,
    );
  }
  if (options.evidence) {
    const slicesFilesKeys = [
      "deps-slices-file",
      "usages-slices-file",
      "reachables-slices-file",
    ];
    if (options?.type?.includes("swift")) {
      slicesFilesKeys.push("semantics-slices-file");
    }
    for (const sf of slicesFilesKeys) {
      let issueFound = false;
      if (!process.permission.has("fs.write", options[sf])) {
        console.log(
          `SECURE MODE: FileSystemWrite permission is required to create the output slices file. Please invoke cdxgen with the argument --allow-fs-write="${options[sf]}"`,
        );
        if (!issueFound) {
          issueFound = true;
        }
      }
      if (issueFound) {
        return false;
      }
    }
    if (!process.permission.has("fs.write", process.env.ATOM_DB || ATOM_DB)) {
      console.log(
        `SECURE MODE: FileSystemWrite permission is required to create the output slices file. Please invoke cdxgen with the argument --allow-fs-write="${process.env.ATOM_DB || ATOM_DB}"`,
      );
      return false;
    }
    console.log(
      "TIP: Invoke cdxgen with `--allow-addons` to allow the use of sqlite3 native addon. This addon is required for evidence mode.",
    );
  } else {
    if (process.permission.has("fs.write", process.env.ATOM_DB || ATOM_DB)) {
      console.log(
        `SECURE MODE: FileSystemWrite permission is not required for the directory "${process.env.ATOM_DB || ATOM_DB}" in non-evidence mode. Consider removing the argument --allow-fs-write="${process.env.ATOM_DB || ATOM_DB}".`,
      );
      return false;
    }
  }
  if (!process.permission.has("fs.write", getTmpDir())) {
    console.log(
      `FileSystemWrite permission may be required for the TEMP directory. Please invoke cdxgen with the argument --allow-fs-write="${join(getTmpDir(), "*")}" in case of any crashes.`,
    );
    if (isMac) {
      console.log(
        "TIP: macOS doesn't use the `/tmp` prefix for TEMP directories. Use the argument shown above.",
      );
    }
  }
  if (!process.permission.has("child") && !isSecureMode) {
    console.log(
      "ChildProcess permission is missing. This is required to spawn commands for some languages. Please invoke cdxgen with the argument --allow-child-process in case of issues.",
    );
  }
  if (process.permission.has("child") && options?.lifecycle === "pre-build") {
    console.log(
      "SECURE MODE: ChildProcess permission is not required for pre-build SBOM generation. Please invoke cdxgen without the argument --allow-child-process.",
    );
    return false;
  }
  return true;
};

/**
 * Method to start the bom creation process
 */
(async () => {
  // Display the sponsor banner
  printSponsorBanner(options);
  // Start SBOM server
  if (options.server) {
    const serverModule = await import("../lib/server/server.js");
    return serverModule.start(options);
  }
  // Check if cdxgen has the required permissions
  if (!checkPermissions(filePath, options)) {
    if (isSecureMode) {
      process.exit(1);
    }
    return;
  }
  // This will prevent people from accidentally using the usages slices belonging to a different project
  if (!options.usagesSlicesFile) {
    options.usagesSlicesFile = `${options.projectName}-usages.json`;
  }
  prepareEnv(filePath, options);
  thoughtLog("Getting ready to generate the BOM ⚡️.");
  let bomNSData = (await createBom(filePath, options)) || {};
  if (bomNSData?.bomJson) {
    thoughtLog(
      "Tweaking the generated BOM data with useful annotations and properties.",
    );
  }
  // Add extra metadata and annotations with post processing
  bomNSData = postProcess(bomNSData, options);
  if (
    options.output &&
    (typeof options.output === "string" || options.output instanceof String)
  ) {
    const jsonFile = options.output;
    // Create bom json file
    if (bomNSData.bomJson) {
      let jsonPayload = undefined;
      if (
        typeof bomNSData.bomJson === "string" ||
        bomNSData.bomJson instanceof String
      ) {
        fs.writeFileSync(jsonFile, bomNSData.bomJson);
        jsonPayload = bomNSData.bomJson;
      } else {
        jsonPayload = JSON.stringify(bomNSData.bomJson, null, null);
        fs.writeFileSync(jsonFile, jsonPayload);
        if (jsonFile.endsWith("bom.json")) {
          thoughtLog(
            `Let's save the file to "${jsonFile}". Should I suggest the '.cdx.json' file extension for better semantics?`,
          );
        } else {
          thoughtLog(`Let's save the file to "${jsonFile}".`);
        }
      }
      if (
        jsonPayload &&
        (options.generateKeyAndSign ||
          (process.env.SBOM_SIGN_ALGORITHM &&
            process.env.SBOM_SIGN_ALGORITHM !== "none" &&
            process.env.SBOM_SIGN_PRIVATE_KEY &&
            safeExistsSync(process.env.SBOM_SIGN_PRIVATE_KEY)))
      ) {
        let alg = process.env.SBOM_SIGN_ALGORITHM || "RS512";
        if (alg.includes("none")) {
          alg = "RS512";
        }
        let privateKeyToUse = undefined;
        let jwkPublicKey = undefined;
        let publicKeyFile = undefined;
        if (options.generateKeyAndSign) {
          const jdirName = dirname(jsonFile);
          publicKeyFile = join(jdirName, "public.key");
          const privateKeyFile = join(jdirName, "private.key");
          const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
            modulusLength: 4096,
            publicKeyEncoding: {
              type: "spki",
              format: "pem",
            },
            privateKeyEncoding: {
              type: "pkcs8",
              format: "pem",
            },
          });
          fs.writeFileSync(publicKeyFile, publicKey);
          fs.writeFileSync(privateKeyFile, privateKey);
          console.log(
            "Created public/private key pairs for testing purposes",
            publicKeyFile,
            privateKeyFile,
          );
          privateKeyToUse = privateKey;
          jwkPublicKey = crypto
            .createPublicKey(publicKey)
            .export({ format: "jwk" });
        } else {
          privateKeyToUse = fs.readFileSync(
            process.env.SBOM_SIGN_PRIVATE_KEY,
            "utf8",
          );
          if (
            process.env.SBOM_SIGN_PUBLIC_KEY &&
            safeExistsSync(process.env.SBOM_SIGN_PUBLIC_KEY)
          ) {
            jwkPublicKey = crypto
              .createPublicKey(
                fs.readFileSync(process.env.SBOM_SIGN_PUBLIC_KEY, "utf8"),
              )
              .export({ format: "jwk" });
          }
        }
        try {
          // Sign the individual components
          // Let's leave the services unsigned for now since it might require additional cleansing
          const bomJsonUnsignedObj = JSON.parse(jsonPayload);
          for (const comp of bomJsonUnsignedObj.components) {
            const compSignature = jws.sign({
              header: { alg },
              payload: comp,
              privateKey: privateKeyToUse,
            });
            const compSignatureBlock = {
              algorithm: alg,
              value: compSignature,
            };
            if (jwkPublicKey) {
              compSignatureBlock.publicKey = jwkPublicKey;
            }
            comp.signature = compSignatureBlock;
          }
          const signature = jws.sign({
            header: { alg },
            payload: JSON.stringify(bomJsonUnsignedObj, null, 2),
            privateKey: privateKeyToUse,
          });
          if (signature) {
            const signatureBlock = {
              algorithm: alg,
              value: signature,
            };
            if (jwkPublicKey) {
              signatureBlock.publicKey = jwkPublicKey;
            }
            bomJsonUnsignedObj.signature = signatureBlock;
            fs.writeFileSync(
              jsonFile,
              JSON.stringify(bomJsonUnsignedObj, null, null),
            );
            thoughtLog(`Signing the BOM file "${jsonFile}".`);
            if (publicKeyFile) {
              // Verifying this signature
              const signatureVerification = jws.verify(
                signature,
                alg,
                fs.readFileSync(publicKeyFile, "utf8"),
              );
              if (signatureVerification) {
                console.log(
                  "SBOM signature is verifiable with the public key and the algorithm",
                  publicKeyFile,
                  alg,
                );
              } else {
                console.log("SBOM signature verification was unsuccessful");
                console.log(
                  "Check if the public key was exported in PEM format",
                );
              }
            }
          }
        } catch (ex) {
          console.log("SBOM signing was unsuccessful", ex);
          console.log("Check if the private key was exported in PEM format");
        }
      }
    }
    // bom ns mapping
    if (bomNSData.nsMapping && Object.keys(bomNSData.nsMapping).length) {
      const nsFile = `${jsonFile}.map`;
      fs.writeFileSync(nsFile, JSON.stringify(bomNSData.nsMapping));
    }
  } else if (!options.print) {
    if (bomNSData.bomJson) {
      console.log(JSON.stringify(bomNSData.bomJson, null, 2));
    } else {
      console.log("Unable to produce BOM for", filePath);
      console.log("Try running the command with -t <type> or -r argument");
    }
  }
  // Evidence generation
  if (options.evidence || options.includeCrypto) {
    // Set the evinse output file to be the same as output file
    if (!options.evinseOutput) {
      options.evinseOutput = options.output;
    }
    const evinserModule = await import("../lib/evinser/evinser.js");
    options.projectType = options.projectType || ["java"];
    const evinseOptions = {
      _: args._,
      input: options.output,
      output: options.evinseOutput,
      language: options.projectType,
      dbPath: process.env.ATOM_DB || ATOM_DB,
      skipMavenCollector: false,
      force: false,
      withReachables: options.deep,
      usagesSlicesFile: options.usagesSlicesFile,
      dataFlowSlicesFile: options.dataFlowSlicesFile,
      reachablesSlicesFile: options.reachablesSlicesFile,
      semanticsSlicesFile: options.semanticsSlicesFile,
      includeCrypto: options.includeCrypto,
      specVersion: options.specVersion,
      profile: options.profile,
    };
    const dbObjMap = await evinserModule.prepareDB(evinseOptions);
    if (dbObjMap) {
      const sliceArtefacts = await evinserModule.analyzeProject(
        dbObjMap,
        evinseOptions,
      );
      const evinseJson = evinserModule.createEvinseFile(
        sliceArtefacts,
        evinseOptions,
      );
      bomNSData.bomJson = evinseJson;
      if (options.print && evinseJson) {
        printOccurrences(evinseJson);
        printCallStack(evinseJson);
        printReachables(sliceArtefacts);
        printServices(evinseJson);
      }
    }
  }
  // Perform automatic validation
  if (options.validate && bomNSData?.bomJson) {
    thoughtLog("Wait, let's check the generated BOM file for any issues.");
    if (!validateBom(bomNSData.bomJson)) {
      process.exit(1);
    }
    thoughtLog("BOM file looks valid. Thank you for using cdxgen!");
  }
  thoughtEnd();
  // Automatically submit the bom data
  // biome-ignore lint/suspicious/noDoubleEquals: yargs passes true for empty values
  if (options.serverUrl && options.serverUrl != true && options.apiKey) {
    try {
      await submitBom(options, bomNSData.bomJson);
    } catch (err) {
      console.log(err);
    }
  }
  // Protobuf serialization
  if (options.exportProto) {
    const protobomModule = await import("../lib/helpers/protobom.js");
    protobomModule.writeBinary(bomNSData.bomJson, options.protoBinFile);
  }
  if (options.print && bomNSData.bomJson && bomNSData.bomJson.components) {
    printSummary(bomNSData.bomJson);
    if (options.includeFormulation) {
      printFormulation(bomNSData.bomJson);
    }
    printDependencyTree(bomNSData.bomJson);
    printTable(bomNSData.bomJson);
    // CBOM related print
    if (options.includeCrypto) {
      printTable(bomNSData.bomJson, ["cryptographic-asset"]);
      printDependencyTree(bomNSData.bomJson, "provides");
    }
  }
})();
