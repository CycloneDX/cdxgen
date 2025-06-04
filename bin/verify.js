#!/usr/bin/env node

import fs from "node:fs";
import { join } from "node:path";
import process from "node:process";
import jws from "jws";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { dirNameStr } from "../lib/helpers/utils.js";
import { getBomWithOras } from "../lib/managers/oci.js";

const dirName = dirNameStr;

const args = yargs(hideBin(process.argv))
  .option("input", {
    alias: "i",
    default: "bom.json",
    description: "Input json to validate. Default bom.json",
  })
  .option("platform", {
    description: "The platform to validate. No default",
  })
  .option("public-key", {
    default: "public.key",
    description: "Public key in PEM format. Default public.key",
  })
  .completion("completion", "Generate bash/zsh completion")
  .epilogue("for documentation, visit https://cyclonedx.github.io/cdxgen")
  .scriptName("cdx-verify")
  .version()
  .help("h")
  .alias("h", "help")
  .wrap(Math.min(120, yargs().terminalWidth())).argv;

if (args.version) {
  const packageJsonAsString = fs.readFileSync(
    join(dirName, "..", "package.json"),
    "utf-8",
  );
  const packageJson = JSON.parse(packageJsonAsString);

  console.log(packageJson.version);
  process.exit(0);
}

if (process.env?.CDXGEN_NODE_OPTIONS) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} ${process.env.CDXGEN_NODE_OPTIONS}`;
}

function getBom(args) {
  if (fs.existsSync(args.input)) {
    return JSON.parse(fs.readFileSync(args.input, "utf8"));
  }
  if (
    args.input.includes(":") ||
    args.input.includes("docker") ||
    args.input.includes("ghcr")
  ) {
    return getBomWithOras(args.input, args.platform);
  }
  return undefined;
}

const bomJson = getBom(args);
if (!bomJson) {
  console.log(`${args.input} is invalid!`);
  process.exit(1);
}
let hasInvalidComp = false;
// Validate any component signature
for (const comp of bomJson.components) {
  if (comp.signature) {
    const compSignature = comp.signature.value;
    const validationResult = jws.verify(
      compSignature,
      comp.signature.algorithm,
      fs.readFileSync(args.publicKey, "utf8"),
    );
    if (!validationResult) {
      console.log(`${comp["bom-ref"]} signature is invalid!`);
      hasInvalidComp = true;
    }
  }
}
if (hasInvalidComp) {
  process.exit(1);
}
const bomSignature = bomJson.signature?.value
  ? bomJson.signature.value
  : undefined;
if (!bomSignature) {
  console.log("No signature was found!");
} else {
  const validationResult = jws.verify(
    bomSignature,
    bomJson.signature.algorithm,
    fs.readFileSync(args.publicKey, "utf8"),
  );
  if (validationResult) {
    console.log("Signature is valid!");
  } else {
    console.log("BOM signature is invalid!");
    process.exit(1);
  }
}
