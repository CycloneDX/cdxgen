import { filterBom } from "./postgen.js";

import { readFileSync } from "node:fs";
import { expect, test } from "@jest/globals";

test("filter bom tests", () => {
  const bomJson = JSON.parse(
    readFileSync("./test/data/bom-postgen-test.json", "utf-8"),
  );
  let newBom = filterBom(bomJson, {});
  expect(bomJson).toEqual(newBom);
  expect(newBom.components.length).toEqual(1060);
  newBom = filterBom(bomJson, { requiredOnly: true });
  for (const comp of newBom.components) {
    if (comp.scope && comp.scope !== "required") {
      throw new Error(`${comp.scope} is unexpected`);
    }
  }
  expect(newBom.components.length).toEqual(345);
});

test("filter bom tests2", () => {
  const bomJson = JSON.parse(
    readFileSync("./test/data/bom-postgen-test2.json", "utf-8"),
  );
  let newBom = filterBom(bomJson, {});
  expect(bomJson).toEqual(newBom);
  expect(newBom.components.length).toEqual(199);
  newBom = filterBom(bomJson, { requiredOnly: true });
  for (const comp of newBom.components) {
    if (comp.scope && comp.scope !== "required") {
      throw new Error(`${comp.scope} is unexpected`);
    }
  }
  expect(newBom.components.length).toEqual(199);
  newBom = filterBom(bomJson, { filter: [""] });
  expect(newBom.components.length).toEqual(199);
  newBom = filterBom(bomJson, { filter: ["apache"] });
  for (const comp of newBom.components) {
    if (comp.purl.includes("apache")) {
      throw new Error(`${comp.purl} is unexpected`);
    }
  }
  expect(newBom.components.length).toEqual(158);
  newBom = filterBom(bomJson, { filter: ["apache", "json"] });
  for (const comp of newBom.components) {
    if (comp.purl.includes("apache") || comp.purl.includes("json")) {
      throw new Error(`${comp.purl} is unexpected`);
    }
  }
  expect(newBom.components.length).toEqual(135);
  expect(newBom.compositions).toBeUndefined();
  newBom = filterBom(bomJson, {
    only: ["org.springframework"],
    specVersion: 1.5,
    autoCompositions: true,
  });
  for (const comp of newBom.components) {
    if (!comp.purl.includes("org.springframework")) {
      throw new Error(`${comp.purl} is unexpected`);
    }
  }
  expect(newBom.components.length).toEqual(29);
  expect(newBom.compositions).toEqual([
    {
      aggregate: "incomplete_first_party_only",
      "bom-ref": "pkg:maven/sec/java-sec-code@1.0.0?type=jar",
    },
  ]);
});
