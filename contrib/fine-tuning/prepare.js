import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { dirNameStr, getAllFiles } from "../../lib/helpers/utils.js";
const jsonlFiles = getAllFiles(dirNameStr, "**/*.jsonl", {
  exclude: ["**/{train, valid}.jsonl"],
});
let datasetDir = "dataset";
const argv = process.argv.slice(2);
if (argv.length > 1) {
  datasetDir = argv[1];
}

const TRAIN_FILE = join(datasetDir, "train.jsonl");
const VALID_FILE = join(datasetDir, "valid.jsonl");
const trainData = [];
const validData = [];

for (const jf of jsonlFiles) {
  const lines = readFileSync(jf, "utf-8");
  // Ignore empty lines
  if (!lines.trim().length) {
    continue;
  }
  trainData.push(lines);
  if (jf.includes("cdxgen-docs") || jf.includes("cli") || jf.includes("semantics")) {
    validData.push(lines);
  }
}

mkdirSync(datasetDir, { recursive: true });
if (trainData.length) {
  writeFileSync(TRAIN_FILE, trainData.join("\n"));
}
if (validData.length) {
  writeFileSync(VALID_FILE, validData.join("\n"));
}
