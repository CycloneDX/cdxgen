import { readFileSync } from "node:fs";

import { it } from "poku";

import { printDependencyTree } from "./display.js";

it("print tree test", () => {
  const bomJson = JSON.parse(
    readFileSync("./test/data/vuln-spring-1.5.bom.json", { encoding: "utf-8" }),
  );
  printDependencyTree(bomJson);
});
