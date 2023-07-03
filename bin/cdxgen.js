#!/usr/bin/env node

import { createBom, submitBom } from "../index.js";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import jws from "jws";
import crypto from "crypto";
import { start as _serverStart } from "../server.js";
import { fileURLToPath } from "node:url";
import globalAgent from "global-agent";
import { table } from "table";
import process from "node:process";

let url = import.meta.url;
if (!url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
const dirName = import.meta ? dirname(fileURLToPath(url)) : __dirname;

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const args = yargs(hideBin(process.argv))
  .option("output", {
    alias: "o",
    description: "Output file for bom.xml or bom.json. Default bom.json"
  })
  .option("type", {
    alias: "t",
    description: "Project type"
  })
  .option("recurse", {
    alias: "r",
    type: "boolean",
    description: "Recurse mode suitable for mono-repos"
  })
  .option("print", {
    alias: "p",
    type: "boolean",
    description:
      "Print the SBoM as a table. Defaults to true if output file is not specified with -o"
  })
  .option("resolve-class", {
    alias: "c",
    type: "boolean",
    description: "Resolve class names for packages. jars only for now."
  })
  .option("deep", {
    type: "boolean",
    description:
      "Perform deep searches for components. Useful while scanning live OS and oci images."
  })
  .option("server-url", {
    description: "Dependency track url. Eg: https://deptrack.cyclonedx.io"
  })
  .option("api-key", {
    description: "Dependency track api key"
  })
  .option("project-group", {
    description: "Dependency track project group"
  })
  .option("project-name", {
    description: "Dependency track project name. Default use the directory name"
  })
  .option("project-version", {
    description: "Dependency track project version",
    default: ""
  })
  .option("project-id", {
    description:
      "Dependency track project id. Either provide the id or the project name and version together"
  })
  .option("required-only", {
    type: "boolean",
    description: "Include only the packages with required scope on the SBoM."
  })
  .option("fail-on-error", {
    type: "boolean",
    description: "Fail if any dependency extractor fails."
  })
  .option("no-babel", {
    type: "boolean",
    description:
      "Do not use babel to perform usage analysis for JavaScript/TypeScript projects."
  })
  .option("generate-key-and-sign", {
    type: "boolean",
    description:
      "Generate an RSA public/private key pair and then sign the generated SBoM using JSON Web Signatures."
  })
  .option("server", {
    type: "boolean",
    description: "Run cdxgen as a server"
  })
  .option("server-host", {
    description: "Listen address",
    default: "127.0.0.1"
  })
  .option("server-port", {
    description: "Listen port",
    default: "9090"
  })
  .option("install-deps", {
    type: "boolean",
    default: true,
    description:
      "Install dependencies automatically for some projects. Defaults to true but disabled for containers and oci scans. Use --no-install-deps to disable this feature."
  })
  .scriptName("cdxgen")
  .version()
  .help("h").argv;

if (args.version) {
  const packageJsonAsString = fs.readFileSync(
    join(dirName, "..", "package.json"),
    "utf-8"
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

const filePath = args._[0] || ".";
if (!args.projectName) {
  if (filePath !== ".") {
    args.projectName = basename(filePath);
  } else {
    args.projectName = basename(resolve(filePath));
  }
}

/**
 * projectType: python, nodejs, java, golang
 * multiProject: Boolean to indicate monorepo or multi-module projects
 */
const options = {
  projectType: args.type,
  multiProject: args.recurse,
  output: args.output,
  resolveClass: args.resolveClass,
  installDeps: args.installDeps,
  requiredOnly: args.requiredOnly,
  failOnError: args.failOnError,
  noBabel: args.noBabel || args.babel === false,
  deep: args.deep,
  generateKeyAndSign: args.generateKeyAndSign,
  project: args.projectId,
  projectName: args.projectName,
  projectGroup: args.projectGroup,
  projectVersion: args.projectVersion,
  server: args.server,
  serverHost: args.serverHost,
  serverPort: args.serverPort
};

/**
 * Check for node >= 20 permissions
 *
 * @param {string} filePath File path
 * @returns
 */
const checkPermissions = (filePath) => {
  if (!process.permission) {
    return true;
  }
  if (!process.permission.has("fs.read", filePath)) {
    console.log(
      `FileSystemRead permission required. Please invoke with the argument --allow-fs-read="${resolve(
        filePath
      )}"`
    );
    return false;
  }
  if (!process.permission.has("fs.write", tmpdir())) {
    console.log(
      `FileSystemWrite permission required. Please invoke with the argument --allow-fs-write="${tmpdir()}"`
    );
    return false;
  }
  if (!process.permission.has("child")) {
    console.log(
      "ChildProcess permission is missing. This is required to spawn commands for some languages. Please invoke with the argument --allow-child-process"
    );
  }
  return true;
};

/**
 * Method to start the bom creation process
 */
(async () => {
  // Start SBoM server
  if (args.server) {
    return await _serverStart(options);
  }
  // Check if cdxgen has the required permissions
  if (!checkPermissions(filePath)) {
    return;
  }
  const bomNSData = (await createBom(filePath, options)) || {};
  if (!args.output) {
    args.output = "bom.json";
    args.print = true;
  }
  if (
    args.output &&
    (typeof args.output === "string" || args.output instanceof String)
  ) {
    if (bomNSData.bomXmlFiles) {
      console.log("BOM files produced:", bomNSData.bomXmlFiles);
    } else {
      const jsonFile = args.output.replace(".xml", ".json");
      // Create bom json file
      if (!args.output.endsWith(".xml") && bomNSData.bomJson) {
        let jsonPayload = undefined;
        if (
          typeof bomNSData.bomJson === "string" ||
          bomNSData.bomJson instanceof String
        ) {
          fs.writeFileSync(jsonFile, bomNSData.bomJson);
          jsonPayload = bomNSData.bomJson;
        } else {
          jsonPayload = JSON.stringify(bomNSData.bomJson, null, 2);
          fs.writeFileSync(jsonFile, jsonPayload);
        }
        if (
          jsonPayload &&
          (args.generateKeyAndSign ||
            (process.env.SBOM_SIGN_ALGORITHM &&
              process.env.SBOM_SIGN_ALGORITHM !== "none" &&
              process.env.SBOM_SIGN_PRIVATE_KEY &&
              fs.existsSync(process.env.SBOM_SIGN_PRIVATE_KEY)))
        ) {
          let alg = process.env.SBOM_SIGN_ALGORITHM || "RS512";
          if (alg.includes("none")) {
            alg = "RS512";
          }
          let privateKeyToUse = undefined;
          let jwkPublicKey = undefined;
          if (args.generateKeyAndSign) {
            const jdirName = dirname(jsonFile);
            const publicKeyFile = join(jdirName, "public.key");
            const privateKeyFile = join(jdirName, "private.key");
            const { privateKey, publicKey } = crypto.generateKeyPairSync(
              "rsa",
              {
                modulusLength: 4096,
                publicKeyEncoding: {
                  type: "spki",
                  format: "pem"
                },
                privateKeyEncoding: {
                  type: "pkcs8",
                  format: "pem"
                }
              }
            );
            fs.writeFileSync(publicKeyFile, publicKey);
            fs.writeFileSync(privateKeyFile, privateKey);
            console.log(
              "Created public/private key pairs for testing purposes",
              publicKeyFile,
              privateKeyFile
            );
            privateKeyToUse = privateKey;
            jwkPublicKey = crypto
              .createPublicKey(publicKey)
              .export({ format: "jwk" });
          } else {
            privateKeyToUse = fs.readFileSync(
              process.env.SBOM_SIGN_PRIVATE_KEY,
              "utf8"
            );
            if (
              process.env.SBOM_SIGN_PUBLIC_KEY &&
              fs.existsSync(process.env.SBOM_SIGN_PUBLIC_KEY)
            ) {
              jwkPublicKey = crypto
                .createPublicKey(
                  fs.readFileSync(process.env.SBOM_SIGN_PUBLIC_KEY, "utf8")
                )
                .export({ format: "jwk" });
            }
          }
          try {
            const signature = jws.sign({
              header: { alg },
              payload: jsonPayload,
              privateKey: privateKeyToUse
            });
            if (signature) {
              const bomJsonUnsignedObj = JSON.parse(jsonPayload);
              const signatureBlock = {
                algorithm: alg,
                value: signature
              };
              if (jwkPublicKey) {
                signatureBlock.publicKey = jwkPublicKey;
              }
              bomJsonUnsignedObj.signature = signatureBlock;
              fs.writeFileSync(
                jsonFile,
                JSON.stringify(bomJsonUnsignedObj, null, 2)
              );
            }
          } catch (ex) {
            console.log("SBoM signing was unsuccessful", ex);
            console.log("Check if the private key was exported in PEM format");
          }
        }
      }
      // Create bom xml file
      if (args.output.endsWith(".xml") && bomNSData.bomXml) {
        fs.writeFileSync(args.output, bomNSData.bomXml);
      }
      //
      if (bomNSData.nsMapping && Object.keys(bomNSData.nsMapping).length) {
        const nsFile = jsonFile + ".map";
        fs.writeFileSync(nsFile, JSON.stringify(bomNSData.nsMapping));
        console.log("Namespace mapping file written to", nsFile);
      }
    }
  } else if (!args.print) {
    if (bomNSData.bomJson) {
      console.log(JSON.stringify(bomNSData.bomJson, null, 2));
    } else if (bomNSData.bomXml) {
      console.log(Buffer.from(bomNSData.bomXml).toString());
    } else {
      console.log("Unable to produce BOM for", filePath);
      console.log("Try running the command with -t <type> or -r argument");
    }
  }

  // Automatically submit the bom data
  if (args.serverUrl && args.serverUrl != true && args.apiKey) {
    try {
      const dbody = await submitBom(args, bomNSData.bomJson);
      console.log("Response from server", dbody);
    } catch (err) {
      console.log(err);
    }
  }

  if (args.print && bomNSData.bomJson && bomNSData.bomJson.components) {
    const data = [["Group", "Name", "Version", "Scope"]];
    for (const comp of bomNSData.bomJson.components) {
      data.push([comp.group || "", comp.name, comp.version, comp.scope || ""]);
    }
    const config = {
      header: {
        alignment: "center",
        content: "Software Bill-of-Materials\nGenerated by @cyclonedx/cdxgen"
      }
    };
    console.log(table(data, config));
    console.log(
      "BOM includes",
      bomNSData.bomJson.components.length,
      "components and",
      bomNSData.bomJson.dependencies.length,
      "dependencies"
    );
  }
})();
