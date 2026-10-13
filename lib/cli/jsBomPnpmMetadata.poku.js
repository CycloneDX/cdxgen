import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assert, it } from "poku";

import { createNodejsBom } from "./jsBom.js";

// pnpm metadata enhancement records each dependency's absolute install
// directory in internal:LocalNodeModulesPath. The fixture has an install tree
// but no JS or TS source, so the scan sees no imports.

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "test",
  "data",
  "js-pnpm-metadata-repotest",
);

const scanFixture = (options) =>
  createNodejsBom(fixtureDir, {
    installDeps: false,
    multiProject: false,
    specVersion: 1.7,
    ...options,
  });

const propertiesNamed = (bomJson, propertyName) =>
  (bomJson?.components || []).flatMap((comp) =>
    (comp.properties || []).filter((prop) => prop.name === propertyName),
  );

await it("omits internal:LocalNodeModulesPath from a pnpm project without imports", async () => {
  const { bomJson } = await scanFixture();
  const leftPad = bomJson.components.find((comp) => comp.name === "left-pad");
  assert.ok(leftPad, "expected the left-pad dependency");
  assert.strictEqual(leftPad.version, "1.3.0");
  assert.deepStrictEqual(
    propertiesNamed(bomJson, "internal:LocalNodeModulesPath"),
    [],
    "the install directory must not reach the BOM",
  );
});

await it("omits internal:LocalNodeModulesPath in deep mode", async () => {
  const { bomJson } = await scanFixture({ deep: true });
  const leftPad = bomJson.components.find((comp) => comp.name === "left-pad");
  assert.ok(leftPad, "expected the left-pad dependency");
  assert.deepStrictEqual(
    propertiesNamed(bomJson, "internal:LocalNodeModulesPath"),
    [],
    "the install directory must not reach the BOM",
  );
});
