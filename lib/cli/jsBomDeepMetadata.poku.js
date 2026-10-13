import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { assert, it } from "poku";

import { addEvidenceForImports } from "../ecosystems/jsEvidence.js";
import { createNodejsBom } from "./jsBom.js";

// Deep-mode npm metadata comes from the scanned project's install tree and
// never from the node_modules of the directory cdxgen runs in. Each case scans
// from a decoy working directory that holds a same-named package. The working
// directory is process-wide, so the cases run one after the other.

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "test",
  "data",
  "js-deep-metadata-repotest",
);

const makeDecoyDir = (packageName, manifest) => {
  const decoyDir = mkdtempSync(join(tmpdir(), "cdxgen-decoy-"));
  const packageDir = join(decoyDir, "node_modules", ...packageName.split("/"));
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, "package.json"), JSON.stringify(manifest));
  return decoyDir;
};

const inDirectory = async (dir, fn) => {
  const originalCwd = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
};

await it("scans a lockfile-only project from a directory with a same-named package", async () => {
  // The fixture has no node_modules. The decoy matches the dependency's name
  // and version, and declares no license.
  const decoyDir = makeDecoyDir("@scope/demo", {
    name: "@scope/demo",
    version: "2.0.0",
    description: "not the scanned project",
  });
  try {
    const result = await inDirectory(decoyDir, () =>
      createNodejsBom(fixtureDir, {
        installDeps: false,
        multiProject: false,
        specVersion: 1.7,
        deep: true,
      }),
    );
    const comps = result.bomJson?.components || [];
    const find = (group, name) =>
      comps.find((c) => c.group === group && c.name === name);

    const scoped = find("@scope", "demo");
    assert.ok(scoped, "expected the @scope/demo dependency");
    assert.strictEqual(scoped.description, undefined);
    assert.ok(
      scoped.licenses?.some(
        (l) => l.license?.id === "MIT" || l.license?.name === "MIT",
      ),
      "expected the license from the lockfile",
    );
    const unscoped = find("", "demo-lib");
    assert.ok(unscoped, "expected the demo-lib dependency");
    assert.strictEqual(unscoped.description, undefined);
    assert.strictEqual(unscoped.scope, "required");
  } finally {
    rmSync(decoyDir, { recursive: true, force: true });
  }
});

await it("does not resolve a location without a SrcFile against the working directory", async () => {
  const decoyDir = makeDecoyDir("demo-lib", {
    name: "demo-lib",
    version: "1.1.0",
    description: "not the scanned project",
  });
  try {
    const pkg = {
      group: "",
      name: "demo-lib",
      version: "1.1.0",
      properties: [
        {
          name: "internal:LocalNodeModulesPath",
          value: "node_modules/demo-lib",
        },
      ],
    };
    await inDirectory(decoyDir, () =>
      addEvidenceForImports([pkg], {}, {}, true),
    );

    assert.strictEqual(pkg.description, undefined);
  } finally {
    rmSync(decoyDir, { recursive: true, force: true });
  }
});
