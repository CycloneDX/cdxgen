#!/usr/bin/env node

import fs from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import jws from "jws";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { dirNameStr } from "../lib/helpers/utils.js";

let url = import.meta.url;
if (!url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
const dirName = dirNameStr;

const args = yargs(hideBin(process.argv))
  .option("input", {
    alias: "i",
    default: "bom.json",
    description: "Input json to validate. Default bom.json",
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

const bomJson = JSON.parse(fs.readFileSync(args.input, "utf8"));
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
    console.log("SBOM signature is invalid!");
    process.exit(1);
  }
}
