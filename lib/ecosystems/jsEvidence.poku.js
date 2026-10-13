import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { assert, describe, it } from "poku";

import { addEvidenceForImports } from "./jsEvidence.js";

const importOf = (importedAs, fileName, extra = {}) =>
  new Set([
    {
      fileName,
      lineNumber: 1,
      importedAs,
      importedModules: [importedAs],
      ...extra,
    },
  ]);

const propValue = (pkg, name) =>
  (pkg?.properties || []).find((property) => property.name === name)?.value;

const writePackageJson = (dir, manifest) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
};

// The properties an npm lockfile component carries: the lock file it was
// parsed from (an arborist tree root) and the arborist location relative to
// that root.
const npmLockProps = (projectDir, location) => [
  { name: "internal:SrcFile", value: join(projectDir, "package-lock.json") },
  { name: "internal:LocalNodeModulesPath", value: location },
];

describe("addEvidenceForImports()", () => {
  // #4336: a missing import is not evidence that a package is optional.
  it("promotes imported packages and leaves the rest at their manifest scope", async () => {
    const pkgList = [
      { group: "", name: "debug", properties: [] },
      { group: "", name: "left-pad", properties: [] },
      {
        group: "@scope",
        name: "runtime-plugin",
        properties: [],
      },
      {
        group: "",
        name: "peer-only",
        properties: [{ name: "cdx:npm:package:peer", value: "true" }],
      },
      {
        group: "",
        name: "is-number",
        scope: "optional",
        properties: [{ name: "cdx:npm:package:development", value: "true" }],
      },
      {
        group: "",
        name: "picocolors",
        scope: "optional",
        properties: [{ name: "cdx:npm:package:development", value: "true" }],
      },
    ];
    await addEvidenceForImports(
      pkgList,
      {
        debug: importOf("debug", "index.js"),
        "is-number": importOf("is-number", "index.js"),
      },
      {},
      false,
    );
    const scopeOf = Object.fromEntries(
      pkgList.map((pkg) => [pkg.name, pkg.scope]),
    );

    assert.strictEqual(scopeOf.debug, "required");
    assert.strictEqual(scopeOf["is-number"], "required");
    assert.strictEqual(scopeOf["left-pad"], undefined);
    assert.strictEqual(scopeOf["runtime-plugin"], undefined);
    assert.strictEqual(scopeOf["peer-only"], undefined);
    assert.strictEqual(scopeOf.picocolors, "optional");
    assert.strictEqual(
      pkgList.find((pkg) => pkg.name === "is-number").evidence.occurrences[0]
        .location,
      "index.js",
    );
  });

  it("scopes a package imported only for its types as excluded", async () => {
    const pkgList = [
      { group: "", name: "is-odd", properties: [] },
      { group: "", name: "is-even", properties: [] },
    ];
    await addEvidenceForImports(
      pkgList,
      {
        "is-odd": importOf("is-odd", "src/index.ts", { isTypeOnly: true }),
        "is-even": importOf("is-even", "src/index.ts"),
      },
      {},
      false,
    );
    const [isOdd, isEven] = pkgList;

    assert.strictEqual(isOdd.scope, "excluded");
    assert.strictEqual(propValue(isOdd, "cdx:npm:package:type-only"), "true");
    assert.strictEqual(isOdd.evidence.occurrences[0].location, "src/index.ts");
    assert.strictEqual(isEven.scope, "required");
    assert.strictEqual(
      propValue(isEven, "cdx:npm:package:type-only"),
      undefined,
    );
  });

  it("keeps a type-only import required when its bin command is used", async () => {
    const pkgList = [
      {
        group: "",
        name: "license-report",
        scope: "optional",
        properties: [{ name: "cdx:npm:bin", value: "license-report" }],
      },
    ];
    await addEvidenceForImports(
      pkgList,
      {
        "license-report": importOf("license-report", "src/report.ts", {
          isTypeOnly: true,
        }),
        "cdx:npm:bin/license-report": importOf(
          "cdx:npm:bin/license-report",
          "package.json",
        ),
      },
      {},
      false,
    );

    assert.strictEqual(pkgList[0].scope, "required");
    assert.strictEqual(
      propValue(pkgList[0], "cdx:npm:package:type-only"),
      undefined,
    );
  });
});

describe("addEvidenceForImports() deep node_modules metadata", () => {
  it("takes metadata from the scanned project, not the working directory (#4443)", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "cdxgen-js-evidence-"));
    const projectDir = join(tmpRoot, "proj");
    const otherDir = join(tmpRoot, "other");
    try {
      writePackageJson(join(projectDir, "node_modules", "@scope", "demo"), {
        name: "@scope/demo",
        version: "2.0.0",
        description: "metadata from the scanned project",
        license: "MIT",
        author: "Fixture Author",
        homepage: "https://example.com/@scope/demo",
        repository: { url: "git+https://example.com/@scope/demo.git" },
      });
      // A same-named package, at the very version of the component, installed
      // under the directory cdxgen runs from.
      writePackageJson(join(otherDir, "node_modules", "@scope", "demo"), {
        name: "@scope/demo",
        version: "2.0.0",
        description: "not the scanned project",
      });
      const pkg = {
        group: "@scope",
        name: "demo",
        version: "2.0.0",
        properties: npmLockProps(projectDir, "node_modules/@scope/demo"),
      };
      const originalCwd = process.cwd();
      process.chdir(otherDir);
      try {
        await addEvidenceForImports([pkg], {}, {}, true);
      } finally {
        process.chdir(originalCwd);
      }

      assert.strictEqual(pkg.description, "metadata from the scanned project");
      assert.strictEqual(pkg.license, "MIT");
      assert.strictEqual(pkg.author, "Fixture Author");
      assert.deepStrictEqual(pkg.homepage, {
        url: "https://example.com/@scope/demo",
      });
      // The transient lookup property must not leak into the BOM.
      assert.strictEqual(
        pkg.properties.some((p) => p.name === "internal:LocalNodeModulesPath"),
        false,
      );
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("skips a local package.json describing a different version", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "cdxgen-js-evidence-"));
    try {
      writePackageJson(join(projectDir, "node_modules", "@scope", "demo"), {
        name: "@scope/demo",
        version: "1.0.0",
        description: "stale local copy",
        license: "MIT",
      });
      const pkg = {
        group: "@scope",
        name: "demo",
        version: "2.0.0",
        license: "MIT",
        properties: npmLockProps(projectDir, "node_modules/@scope/demo"),
      };
      await addEvidenceForImports([pkg], {}, {}, true);

      assert.strictEqual(pkg.description, undefined);
      assert.strictEqual(pkg.license, "MIT");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("keeps fields the local package.json does not provide", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "cdxgen-js-evidence-"));
    try {
      // No license, author, homepage or repository in the local copy.
      writePackageJson(join(projectDir, "node_modules", "demo-lib"), {
        name: "demo-lib",
        version: "1.1.0",
        description: "unscoped demo lib",
      });
      const pkg = {
        group: "",
        name: "demo-lib",
        version: "1.1.0",
        license: "Apache-2.0",
        author: "Original Author",
        homepage: { url: "https://example.com/original" },
        repository: { url: "git+https://example.com/original.git" },
        properties: npmLockProps(projectDir, "node_modules/demo-lib"),
      };
      await addEvidenceForImports([pkg], {}, {}, true);

      assert.strictEqual(pkg.description, "unscoped demo lib");
      assert.strictEqual(pkg.license, "Apache-2.0");
      assert.strictEqual(pkg.author, "Original Author");
      assert.deepStrictEqual(pkg.homepage, {
        url: "https://example.com/original",
      });
      assert.deepStrictEqual(pkg.repository, {
        url: "git+https://example.com/original.git",
      });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("uses an absolute LocalNodeModulesPath without a SrcFile anchor", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "cdxgen-js-evidence-"));
    try {
      // pnpm metadata records an absolute path from the lock file's
      // directory, so no anchor property is needed.
      const absoluteDir = join(tmpRoot, "node_modules", ".pnpm", "demo@1.1.0");
      writePackageJson(absoluteDir, {
        name: "demo-lib",
        version: "1.1.0",
        description: "pnpm virtual store copy",
        license: "BSD-2-Clause",
      });
      const pkg = {
        group: "",
        name: "demo-lib",
        version: "1.1.0",
        properties: [
          { name: "internal:LocalNodeModulesPath", value: absoluteDir },
        ],
      };
      await addEvidenceForImports([pkg], {}, {}, true);

      assert.strictEqual(pkg.description, "pnpm virtual store copy");
      assert.strictEqual(pkg.license, "BSD-2-Clause");
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("does not resolve a relative path against the working directory", async () => {
    const otherDir = mkdtempSync(join(tmpdir(), "cdxgen-js-evidence-"));
    try {
      // The working directory holds a same-named package, but without the
      // lock file anchor a relative location has no trustworthy base, so the
      // lookup must be skipped rather than fall back to it.
      writePackageJson(join(otherDir, "node_modules", "demo-lib"), {
        name: "demo-lib",
        version: "1.1.0",
        description: "not the scanned project",
      });
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
      const originalCwd = process.cwd();
      process.chdir(otherDir);
      try {
        await addEvidenceForImports([pkg], {}, {}, true);
      } finally {
        process.chdir(originalCwd);
      }

      assert.strictEqual(pkg.description, undefined);
      assert.strictEqual(pkg.license, undefined);
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("enriches an unscoped package that the source imports", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "cdxgen-js-evidence-"));
    try {
      writePackageJson(join(projectDir, "node_modules", "demo-lib"), {
        name: "demo-lib",
        version: "1.1.0",
        description: "unscoped demo lib",
      });
      const pkg = {
        group: "",
        name: "demo-lib",
        version: "1.1.0",
        properties: npmLockProps(projectDir, "node_modules/demo-lib"),
      };
      // The alias matching the import ends the alias loop with a break;
      // metadata enrichment must not depend on that.
      await addEvidenceForImports(
        [pkg],
        { "demo-lib": importOf("demo-lib", "src/index.js") },
        {},
        true,
      );

      assert.strictEqual(pkg.scope, "required");
      assert.strictEqual(pkg.description, "unscoped demo lib");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("leaves metadata alone outside deep mode", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "cdxgen-js-evidence-"));
    try {
      writePackageJson(join(projectDir, "node_modules", "demo-lib"), {
        name: "demo-lib",
        version: "1.1.0",
        description: "unscoped demo lib",
      });
      const pkg = {
        group: "",
        name: "demo-lib",
        version: "1.1.0",
        properties: npmLockProps(projectDir, "node_modules/demo-lib"),
      };
      await addEvidenceForImports([pkg], {}, {}, false);

      assert.strictEqual(pkg.description, undefined);
      assert.strictEqual(pkg.license, undefined);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
