#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "node:fs";
import jws from "jws";
import process from "node:process";

const args = yargs(hideBin(process.argv))
  .option("input", {
    alias: "i",
    default: "bom.json",
    description: "Input json to validate. Default bom.json"
  })
  .option("public-key", {
    default: "public.key",
    description: "Public key in PEM format. Default public.key"
  })
  .scriptName("cdx-verify")
  .version()
  .help("h").argv;

const bomJson = JSON.parse(fs.readFileSync(args.input, "utf8"));
const bomSignature = bomJson?.signature?.value;
if (!bomSignature) {
  console.log("No signature was found!");
} else {
  const validationResult = jws.verify(
    bomSignature,
    bomJson.signature.algorithm,
    fs.readFileSync(args.publicKey, "utf8")
  );
  if (validationResult) {
    console.log("Signature is valid!");
  } else {
    console.log("SBoM signature is invalid!");
    process.exit(1);
  }
}
