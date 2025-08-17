import { readFileSync } from "node:fs";

import { assert, it } from "poku";

import { filterBom } from "./postgen.js";

it("filter bom tests", () => {
  const bomJson = JSON.parse(
    readFileSync("./test/data/bom-postgen-test.json", "utf-8"),
  );
  let newBom = filterBom(bomJson, {});
  assert.deepStrictEqual(bomJson, newBom);
  assert.deepStrictEqual(newBom.components.length, 1060);
  newBom = filterBom(bomJson, { requiredOnly: true });
  for (const comp of newBom.components) {
    if (comp.scope && comp.scope !== "required") {
      throw new Error(`${comp.scope} is unexpected`);
    }
  }
  assert.deepStrictEqual(newBom.components.length, 345);
});

it("filter bom tests2", () => {
  const bomJson = JSON.parse(
    readFileSync("./test/data/bom-postgen-test2.json", "utf-8"),
  );
  let newBom = filterBom(bomJson, {});
  assert.deepStrictEqual(bomJson, newBom);
  assert.deepStrictEqual(newBom.components.length, 199);
  newBom = filterBom(bomJson, { requiredOnly: true });
  for (const comp of newBom.components) {
    if (comp.scope && comp.scope !== "required") {
      throw new Error(`${comp.scope} is unexpected`);
    }
  }
  assert.deepStrictEqual(newBom.components.length, 199);
  newBom = filterBom(bomJson, { filter: [""] });
  assert.deepStrictEqual(newBom.components.length, 199);
  newBom = filterBom(bomJson, { filter: ["apache"] });
  for (const comp of newBom.components) {
    if (comp.purl.includes("apache")) {
      throw new Error(`${comp.purl} is unexpected`);
    }
  }
  assert.deepStrictEqual(newBom.components.length, 158);
  newBom = filterBom(bomJson, { filter: ["apache", "json"] });
  for (const comp of newBom.components) {
    if (comp.purl.includes("apache") || comp.purl.includes("json")) {
      throw new Error(`${comp.purl} is unexpected`);
    }
  }
  assert.deepStrictEqual(newBom.components.length, 135);
  assert.deepStrictEqual(newBom.compositions, undefined);
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
  assert.deepStrictEqual(newBom.components.length, 29);
  assert.deepStrictEqual(newBom.compositions, [
    {
      aggregate: "incomplete_first_party_only",
      "bom-ref": "pkg:maven/sec/java-sec-code@1.0.0?type=jar",
    },
  ]);
});
