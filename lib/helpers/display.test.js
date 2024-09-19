import { readFileSync } from "node:fs";
import { test } from "@jest/globals";
import { printDependencyTree } from "./display.js";

test("print tree test", () => {
  const bomJson = JSON.parse(
    readFileSync("./test/data/vuln-spring-1.5.bom.json", { encoding: "utf-8" }),
  );
  printDependencyTree(bomJson);
});
