import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assert, it } from "poku";

import { createNodejsBom } from "./jsBom.js";

// pnpm metadata enhancement records each dependency's install directory in
// internal:LocalNodeModulesPath. The property is collector-internal state — a
// pnpm path is absolute, so emitting it would leak the generating machine's
// filesystem into the SBOM (issue 4488) — and the evidence stage that used to
// be its only cleanup ran solely for projects whose source imports something.
// The fixture has an install tree but no JS or TS source: the exact shape that
// used to leak it.

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

await it("fills deep metadata from the pnpm install tree without imports", async () => {
  const { bomJson } = await scanFixture({ deep: true });
  const leftPad = bomJson.components.find((comp) => comp.name === "left-pad");
  assert.ok(leftPad, "expected the left-pad dependency");
  // The manifest under node_modules/.pnpm names the description; deep mode
  // reads it even though no source file imports the package.
  assert.strictEqual(leftPad.description, "String left pad");
  assert.deepStrictEqual(
    propertiesNamed(bomJson, "internal:LocalNodeModulesPath"),
    [],
    "the install directory must not reach the BOM",
  );
});
