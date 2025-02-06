import { readFileSync } from "node:fs";
import { dirNameStr, getAllFiles } from "../../lib/helpers/utils.js";
const jsonlFiles = getAllFiles(dirNameStr, "**/*.jsonl");
const failures = {};
for (const jf of jsonlFiles) {
  const failedLines = [];
  const lines = readFileSync(jf, "utf-8");
  for (const ajson of lines.split("\n")) {
    try {
      JSON.parse(ajson);
    } catch (e) {
      failedLines.push(ajson);
    }
  }
  if (failedLines.length) {
    failures[jf] = failedLines;
  }
}

if (Object.keys(failures).length) {
  console.log("=== VALIDATION FAILED ===");
  console.log(failures);
}
