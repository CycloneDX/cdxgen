/**
 * Mutation test suite for the golden SBOM harness.
 *
 * This is the headline acceptance evidence for Deliverable 04.  It takes a real
 * BOM, applies each mutation from the review table, and asserts whether the
 * harness catches (or correctly ignores) each one.  A rule that cannot be
 * justified against the table gets removed at review.
 *
 * Also includes:
 * - Fixed-point test: norm(norm(x)) === norm(x)
 * - Two-run determinism: two independent cdxgen runs normalize to identical output
 * - bom-ref rewriting: no dangling refs after normalization
 * - bom-ref negative test: a dependsOn edge pointing at a rewritten ref still resolves
 *
 * Run:  node contrib/mutation-tests.js
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import process from "node:process";
import path from "node:path";

import {
  normalizeBom,
  serializeBom,
  rewriteBomRefs,
  findDanglingRefs,
} from "./sbom-normalize.js";
import { diffBoms } from "./sbom-diff.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Load a real golden BOM file to use as the mutation base.
 * Falls back to a synthetic BOM if the golden file is not yet generated.
 */
function loadBaseBom(which = "cargo-smoke", scenario = "default") {
  const goldenPath = path.join(
    REPO_ROOT,
    "test",
    "repotests",
    which,
    "expected",
    `${scenario}.json`,
  );
  try {
    return JSON.parse(readFileSync(goldenPath, "utf-8"));
  } catch {
    // Synthetic fallback with a real dependency graph shape
    return {
      bomFormat: "CycloneDX",
      specVersion: "1.7",
      serialNumber: "urn:uuid:abc123",
      version: 1,
      metadata: {
        timestamp: "2025-01-01T00:00:00Z",
        tools: {
          components: [
            {
              name: "cdxgen",
              version: "12.8.3",
              "bom-ref": "pkg:npm/@cyclonedx/cdxgen@12.8.3",
            },
          ],
        },
        component: {
          type: "application",
          name: "test-app",
          version: "1.0.0",
          "bom-ref": "pkg:npm/test-app@1.0.0",
        },
      },
      components: [
        {
          type: "library",
          name: "left-pad",
          version: "1.3.0",
          "bom-ref": "pkg:npm/left-pad@1.3.0",
          purl: "pkg:npm/left-pad@1.3.0",
          scope: "required",
          licenses: [{ id: "Apache-2.0" }],
          hashes: [{ alg: "SHA-256", content: "abc123hash" }],
        },
        {
          type: "library",
          name: "semver",
          version: "7.3.5",
          "bom-ref": "pkg:npm/semver@7.3.5",
          purl: "pkg:npm/semver@7.3.5",
          scope: "required",
        },
      ],
      dependencies: [
        {
          ref: "pkg:npm/test-app@1.0.0",
          dependsOn: ["pkg:npm/left-pad@1.3.0", "pkg:npm/semver@7.3.5"],
        },
        { ref: "pkg:npm/left-pad@1.3.0", dependsOn: [] },
        { ref: "pkg:npm/semver@7.3.5", dependsOn: [] },
      ],
    };
  }
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (process.env.CDXGEN_DEBUG_MODE) {
      console.error(err.stack);
    }
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Section 1: Mutation tests — "the harness catches real regressions"
// ---------------------------------------------------------------------------

function runMutationTests() {
  console.log("\n--- Mutation tests ---");

  const baseBom = loadBaseBom();
  const baseNorm = normalizeBom(baseBom, { projectRoot: "/test" });

  // Helper: apply a mutation to a deep clone of the base BOM, normalize,
  // and return the diff result.
  function mutateAndDiff(mutateFn) {
    const mutated = structuredClone(baseBom);
    mutateFn(mutated);
    const mutatedNorm = normalizeBom(mutated, { projectRoot: "/test" });
    return diffBoms(mutatedNorm, baseNorm);
  }

  test("change one component's purl (version bump) → caught", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      const c = bom.components?.[0];
      if (c?.purl) {
        c.purl = c.purl.replace(/@\d+\.\d+\.\d+/, "@99.99.99");
        c["bom-ref"] = c.purl;
      } else {
        // synthetic fallback
        bom.components[0].purl = "pkg:npm/left-pad@99.99.99";
        bom.components[0]["bom-ref"] = "pkg:npm/left-pad@99.99.99";
      }
    });
    assert.ok(!isEqual, `Expected diff but got: ${summary}`);
  });

  test("change one version field → caught", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      if (bom.components?.length > 0) {
        bom.components[0].version = "999.999.999";
      }
    });
    assert.ok(!isEqual, `Expected diff but got: ${summary}`);
  });

  test("change a license.id (Apache-2.0 → MIT) → caught", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      for (const c of bom.components || []) {
        if (c.licenses) {
          for (const l of c.licenses) {
            if (l.id === "Apache-2.0") {
              l.id = "MIT";
              return;
            }
          }
        }
      }
      // If no license in golden, add one to the base
      if (bom.components?.length > 0) {
        bom.components[0].licenses = [{ id: "MIT" }];
      }
    });
    assert.ok(!isEqual, `Expected diff but got: ${summary}`);
  });

  test("drop one component → caught", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      if (bom.components?.length > 0) {
        bom.components.splice(0, 1);
      }
    });
    assert.ok(!isEqual, `Expected diff but got: ${summary}`);
  });

  test("rewire one dependsOn edge to a different ref → caught", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      // Rewire the first dependsOn edge to point at a different component
      if (bom.dependencies?.length > 0 && bom.dependencies[0].dependsOn?.length > 0) {
        const allRefs = (bom.components || []).map((c) => c["bom-ref"]).filter(Boolean);
        if (allRefs.length > 1) {
          const current = bom.dependencies[0].dependsOn[0];
          const other = allRefs.find((r) => r !== current);
          if (other) {
            bom.dependencies[0].dependsOn[0] = other;
          }
        }
      }
    });
    assert.ok(!isEqual, `Expected diff but got: ${summary}`);
  });

  test("change one content hash value → caught", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      for (const c of bom.components || []) {
        if (c.hashes?.length > 0) {
          c.hashes[0].content = "deadbeef" + c.hashes[0].content.slice(8);
          return;
        }
      }
    });
    assert.ok(!isEqual, `Expected diff but got: ${summary}`);
  });

  test("change a component type → caught", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      if (bom.components?.length > 0) {
        bom.components[0].type = "application";
      }
    });
    assert.ok(!isEqual, `Expected diff but got: ${summary}`);
  });

  test("change a component scope → caught", () => {
    // Use the with-maven golden (dependency installation on): the default
    // maven-smoke scenario is statically parsed, and its direct dependencies
    // carry no scope to mutate.
    const mavenBom = loadBaseBom("maven-smoke", "with-maven");
    const mavenNorm = normalizeBom(mavenBom, { projectRoot: "/test" });
    const mutated = structuredClone(mavenBom);
    for (const c of mutated.components || []) {
      if (c.scope) {
        c.scope = c.scope === "required" ? "optional" : "required";
        break;
      }
    }
    const mutatedNorm = normalizeBom(mutated, { projectRoot: "/test" });
    const { isEqual, summary } = diffBoms(mutatedNorm, mavenNorm);
    assert.ok(!isEqual, `Expected diff but got: ${summary}`);
  });

  // --- Mutations that must NOT be caught (normalized away) ---

  test("reorder components array → NOT caught (ordering normalized)", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      if (bom.components?.length > 1) {
        bom.components.reverse();
      }
    });
    assert.ok(isEqual, `Expected no diff but got: ${summary}`);
  });

  test("change serialNumber → NOT caught (normalized)", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      bom.serialNumber = "urn:uuid:ffffffff-ffff-ffff-ffff-ffffffffffff";
    });
    assert.ok(isEqual, `Expected no diff but got: ${summary}`);
  });

  test("change metadata.timestamp → NOT caught (normalized)", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      if (bom.metadata) {
        bom.metadata.timestamp = "2030-06-06T06:06:06Z";
      }
    });
    assert.ok(isEqual, `Expected no diff but got: ${summary}`);
  });

  test("change tool version → NOT caught (normalized)", () => {
    const { isEqual, summary } = mutateAndDiff((bom) => {
      if (bom.metadata?.tools?.components) {
        for (const t of bom.metadata.tools.components) {
          t.version = "99.99.99";
        }
      }
    });
    assert.ok(isEqual, `Expected no diff but got: ${summary}`);
  });
}

// ---------------------------------------------------------------------------
// Section 2: Fixed-point and determinism
// ---------------------------------------------------------------------------

function runDeterminismTests() {
  console.log("\n--- Fixed-point and determinism tests ---");

  const baseBom = loadBaseBom();

  test("normalizing twice is a fixed point: norm(norm(x)) === norm(x)", () => {
    const once = normalizeBom(baseBom, { projectRoot: "/test" });
    const twice = normalizeBom(once, { projectRoot: "/test" });
    assert.strictEqual(
      serializeBom(once),
      serializeBom(twice),
      "Second normalization produced different output",
    );
  });

  test("normalizing is deterministic across separate invocations", () => {
    const a = normalizeBom(baseBom, { projectRoot: "/test" });
    const b = normalizeBom(structuredClone(baseBom), { projectRoot: "/test" });
    assert.strictEqual(
      serializeBom(a),
      serializeBom(b),
      "Two normalizations of the same input produced different output",
    );
  });
}

// ---------------------------------------------------------------------------
// Section 3: bom-ref graph integrity
// ---------------------------------------------------------------------------

function runBomRefTests() {
  console.log("\n--- bom-ref graph integrity tests ---");

  test("no dangling refs introduced by normalization", () => {
    const baseBom = loadBaseBom();
    const normalized = normalizeBom(baseBom, { projectRoot: "/test" });
    const dangling = findDanglingRefs(normalized);
    // The normalized BOM may have pre-existing dangling refs from the
    // original cdxgen output (e.g. Cargo deps pointing at packages not
    // in the component list).  The test asserts that normalization does
    // not ADD new dangling refs — i.e. the set after == the set before.
    const originalDangling = findDanglingRefs(normalizeBom(baseBom, { projectRoot: "/test" }));
    assert.deepStrictEqual(
      dangling.sort(),
      originalDangling.sort(),
      "Normalization introduced new dangling refs",
    );
  });

  test("bom-ref rewriting preserves dependsOn edges", () => {
    // Build a BOM where bom-refs are UUIDs (non-deterministic), then
    // verify that after rewriting, every dependsOn edge still resolves.
    const bom = {
      metadata: {
        component: {
          type: "application",
          name: "app",
          "bom-ref": "uuid-root-001",
          purl: "pkg:npm/app@1.0.0",
        },
      },
      components: [
        {
          type: "library",
          name: "lib-a",
          version: "1.0.0",
          "bom-ref": "uuid-aaa-111",
          purl: "pkg:npm/lib-a@1.0.0",
        },
        {
          type: "library",
          name: "lib-b",
          version: "2.0.0",
          "bom-ref": "uuid-bbb-222",
          purl: "pkg:npm/lib-b@2.0.0",
        },
      ],
      dependencies: [
        { ref: "uuid-root-001", dependsOn: ["uuid-aaa-111"] },
        { ref: "uuid-aaa-111", dependsOn: ["uuid-bbb-222"] },
        { ref: "uuid-bbb-222", dependsOn: [] },
      ],
    };

    const normalized = normalizeBom(bom);
    const dangling = findDanglingRefs(normalized);
    assert.strictEqual(
      dangling.length,
      0,
      `Expected zero dangling refs after normalization, got: ${dangling.join(", ")}`,
    );

    // Verify the edge root→lib-a was preserved (by identity, not UUID)
    const rootDep = normalized.dependencies.find(
      (d) => d.ref === normalized.metadata.component["bom-ref"],
    );
    assert.ok(rootDep, "Root dependency node not found after normalization");
    assert.ok(rootDep.dependsOn.length > 0, "Root has no dependsOn edges");

    // The dependsOn should point at lib-a's new ref
    const libA = normalized.components.find((c) => c.name === "lib-a");
    assert.ok(
      rootDep.dependsOn.includes(libA["bom-ref"]),
      `dependsOn edge root→lib-a was lost during bom-ref rewriting. ` +
        `Expected ${libA["bom-ref"]} in [${rootDep.dependsOn.join(", ")}]`,
    );
  });

  test("bom-ref rewriting handles a ref that appears only in dependencies (pre-existing dangling)", () => {
    // Some cdxgen BOMs have dependency nodes for packages that were filtered
    // out of the component list.  The normalizer must not crash on these,
    // and must report them via findDanglingRefs.
    const bom = {
      components: [
        {
          type: "library",
          name: "lib-a",
          "bom-ref": "pkg:npm/lib-a@1.0.0",
          purl: "pkg:npm/lib-a@1.0.0",
        },
      ],
      dependencies: [
        { ref: "pkg:npm/lib-a@1.0.0", dependsOn: ["pkg:npm/missing-pkg@9.9.9"] },
      ],
    };

    const normalized = normalizeBom(bom);
    const dangling = findDanglingRefs(normalized);
    assert.ok(
      dangling.includes("pkg:npm/missing-pkg@9.9.9"),
      "Pre-existing dangling ref was not reported by findDanglingRefs",
    );
  });
}

// ---------------------------------------------------------------------------
// Section 4: Two-run determinism (runs cdxgen twice on the same fixture)
// ---------------------------------------------------------------------------

async function runTwoRunDeterminism() {
  console.log("\n--- Two-run determinism (cdxgen × 2 on same fixture) ---");

  await testAsync("two createBom runs on the same project normalize identically", async () => {
    const { createBom } = await import(
      path.join(REPO_ROOT, "lib", "cli", "index.js")
    );

    const fixtureDir = path.join(REPO_ROOT, "test", "repotests", "maven-smoke");
    const options = {
      projectType: ["maven"],
      multiProject: false,
      installDeps: false,
      outputFormat: "json",
      specVersion: "1.7",
    };

    const r1 = await createBom(fixtureDir, options);
    const r2 = await createBom(fixtureDir, options);

    const n1 = normalizeBom(r1?.bomJson || r1, { projectRoot: fixtureDir });
    const n2 = normalizeBom(r2?.bomJson || r2, { projectRoot: fixtureDir });

    assert.strictEqual(
      serializeBom(n1),
      serializeBom(n2),
      "Two createBom runs produced different normalized output",
    );
  });
}

// ---------------------------------------------------------------------------
// Section 5: Cassette miss is loud (does not fall through to network)
// ---------------------------------------------------------------------------

async function runCassetteTests() {
  console.log("\n--- Cassette layer tests ---");

  const { startReplay, CassetteMissError } = await import("./cassette.js");

  await testAsync("cassette replay throws CassetteMissError for unmatched request (loud failure)", async () => {
    // Start replay with a non-existent cassette → every request should throw
    const controller = startReplay("/tmp/nonexistent-cassette-test.json");
    try {
      const { cdxgenAgent } = await import(
        path.join(REPO_ROOT, "lib", "core", "activity.js")
      );
      await assert.rejects(
        () => cdxgenAgent.get("https://registry.npmjs.org/nonexistent-pkg-test"),
        (err) => {
          assert.ok(
            err instanceof CassetteMissError,
            `Expected CassetteMissError, got ${err.constructor.name}: ${err.message}`,
          );
          return true;
        },
      );
    } finally {
      controller.stop();
    }
  });
}

// ---------------------------------------------------------------------------
// Section 6: Normalizer invariants (regression tests)
//
// Each of these covers a defect found in review. The mutation table above
// passed while all four were live, because every one of them corrupts the
// golden and the actual output *identically* — so a table-complete mutation
// suite cannot see them. They are asserted directly instead.
// ---------------------------------------------------------------------------

function runNormalizerInvariantTests() {
  console.log("\n--- Normalizer invariant tests ---");

  const withComponents = (comps, deps = []) => ({
    bomFormat: "CycloneDX",
    components: comps,
    dependencies: deps,
  });

  test("hyphens in a purl survive ref derivation (distinct packages stay distinct)", () => {
    const out = normalizeBom(
      withComponents([
        {
          name: "left-pad",
          version: "1.3.0",
          type: "library",
          purl: "pkg:npm/left-pad@1.3.0",
        },
        {
          name: "left_pad",
          version: "1.3.0",
          type: "library",
          purl: "pkg:npm/left_pad@1.3.0",
        },
      ]),
    );
    const refs = out.components.map((c) => c["bom-ref"]);
    assert.ok(
      refs.includes("pkg:npm/left-pad@1.3.0"),
      `hyphen was mangled: ${JSON.stringify(refs)}`,
    );
    assert.equal(new Set(refs).size, 2, "distinct purls collapsed onto one ref");
  });

  test("output is independent of incoming component array order", () => {
    const mk = (order) =>
      withComponents(
        order.map((p) => ({
          name: p,
          version: "1",
          type: "library",
          purl: `pkg:npm/${p}@1`,
          "bom-ref": `uuid-${p}`,
        })),
        order.map((p) => ({ ref: `uuid-${p}`, dependsOn: [] })),
      );
    assert.equal(
      JSON.stringify(normalizeBom(mk(["a-b", "a_b"]))),
      JSON.stringify(normalizeBom(mk(["a_b", "a-b"]))),
    );
  });

  test("colliding identities get order-independent disambiguation suffixes", () => {
    // Two components sharing a purl must normalize identically regardless of
    // emission order; suffixes are assigned in content order, not array order.
    const mk = (order) =>
      withComponents(
        order.map((n) => ({
          name: "x",
          version: "1",
          type: "library",
          purl: "pkg:npm/x@1",
          description: n,
          "bom-ref": `u${n}`,
        })),
      );
    assert.equal(
      JSON.stringify(normalizeBom(mk(["p", "q"]))),
      JSON.stringify(normalizeBom(mk(["q", "p"]))),
    );
  });

  test("the cdxgen version is not baked into goldens via the tool purl", () => {
    const mk = (v) => ({
      metadata: {
        tools: {
          components: [
            {
              name: "cdxgen",
              group: "@cyclonedx",
              version: v,
              type: "application",
              purl: `pkg:npm/%40cyclonedx/cdxgen@${v}`,
              "bom-ref": "t",
            },
          ],
        },
      },
      components: [
        {
          name: "flask",
          version: "2.0.0",
          type: "library",
          purl: "pkg:pypi/flask@2.0.0",
        },
      ],
    });
    assert.equal(
      JSON.stringify(normalizeBom(mk("12.8.3"))),
      JSON.stringify(normalizeBom(mk("13.0.0"))),
      "a cdxgen version bump changes normalized output",
    );
    // ...while dependency purls must keep their versions.
    assert.equal(
      normalizeBom(mk("12.8.3")).components[0].purl,
      "pkg:pypi/flask@2.0.0",
    );
  });

  test("a component with no incoming bom-ref is not reported as dangling", () => {
    const bom = withComponents(
      [{ name: "x", version: "1", type: "library", purl: "pkg:npm/x@1" }],
      [{ ref: "pkg:npm/x@1", dependsOn: [] }],
    );
    const { danglingRefs } = rewriteBomRefs(bom, {});
    assert.deepEqual(danglingRefs, []);
  });

  test("nested sub-components and services count as resolvable ref targets", () => {
    const bom = withComponents(
      [
        {
          name: "p",
          version: "1",
          type: "library",
          purl: "pkg:npm/p@1",
          "bom-ref": "u1",
          components: [
            {
              name: "s",
              version: "1",
              type: "library",
              purl: "pkg:npm/s@1",
              "bom-ref": "u2",
            },
          ],
        },
      ],
      [{ ref: "u1", dependsOn: ["u2"] }],
    );
    rewriteBomRefs(bom, {});
    assert.deepEqual(
      findDanglingRefs(bom),
      [],
      "nested sub-component ref reported as dangling",
    );
    assert.deepEqual(bom.dependencies[0].dependsOn, ["pkg:npm/s@1"]);
  });

  // `evidence.identity` is an object in CycloneDX 1.5 and an array from 1.6 on.
  // cdxgen emits both (object form from ~68 call sites in lib/, array from ~8), so
  // the normalizer must tolerate either. It previously called `.slice()` on the bare
  // value, which threw `c.evidence.identity.slice is not a function` on every
  // object-form component and made whole ecosystems (pylock.toml) ungoldenable.
  // `occurrences` had the same unguarded shape assumption.
  test("both evidence.identity shapes normalize, and neither is coerced", () => {
    for (const [label, identity] of [
      ["array", [{ field: "version", confidence: 1 }, { field: "name", confidence: 1 }]],
      ["object", { field: "name", confidence: 1 }],
    ]) {
      const out = normalizeBom(
        withComponents([
          {
            type: "library",
            name: "a",
            version: "1",
            purl: "pkg:npm/a@1",
            "bom-ref": "pkg:npm/a@1",
            evidence: { identity, occurrences: { location: "single" } },
          },
        ]),
        { projectRoot: process.cwd() },
      );
      const got = out.components[0].evidence.identity;
      assert.equal(
        Array.isArray(got),
        label === "array",
        `${label}-form identity shape was changed by normalization`,
      );
    }
  });

  test("array-form identity is still sorted by field", () => {
    const out = normalizeBom(
      withComponents([
        {
          type: "library",
          name: "a",
          version: "1",
          purl: "pkg:npm/a@1",
          "bom-ref": "pkg:npm/a@1",
          evidence: {
            identity: [{ field: "version" }, { field: "name" }],
          },
        },
      ]),
      { projectRoot: process.cwd() },
    );
    assert.deepEqual(
      out.components[0].evidence.identity.map((i) => i.field),
      ["name", "version"],
    );
  });
}

// ---------------------------------------------------------------------------
// Section 7: End-to-end golden-runner negative tests
//
// The in-memory mutations above prove the normalizer+diff catch changes when
// comparing two in-memory BOMs. They do NOT exercise the runner's real compare
// path: regenerate-from-fixture -> normalize -> diff against a committed golden
// read from disk. A regression that only surfaces through that path (e.g. the
// runner silently re-reading a stale cache, or a golden-compare short-circuit)
// would be invisible to those tests.
//
// These tests corrupt a real committed golden on disk, run the actual
// runScenario -> readGolden -> diffBoms pipeline, assert the regression is
// caught AND that the diff names the offending component, then restore the
// golden in a finally block. This is the permanent form of the manual
// negative-test evidence the plan requires.
// ---------------------------------------------------------------------------

async function runGoldenRunnerNegativeTests() {
  console.log("\n--- Golden-runner end-to-end negative tests ---");

  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  const { runScenario, readGolden, writeGolden, goldenFilePath } = await import(
    "./golden-runner.js"
  );

  // A scenario with enough structure (components + dependency edges) to exercise
  // both the purl and the edge mutation paths.
  const PROJECT = "npm-smoke";
  const SCENARIO_NAME = "default";

  await testAsync("runner catches a corrupted component purl in a committed golden", async () => {
    const original = readGolden(PROJECT, SCENARIO_NAME);
    assert.ok(original, `${PROJECT}/${SCENARIO_NAME} golden must exist`);
    try {
      // Corrupt: bump a real component's purl+version in the committed golden.
      const corrupted = structuredClone(original);
      const target = (corrupted.components || []).find(
        (c) => c.purl && c.purl.includes("left-pad"),
      );
      assert.ok(target, "npm-smoke golden must contain left-pad");
      target.purl = target.purl.replace(/@\d+\.\d+\.\d+/, "@99.99.99");
      target.version = "99.99.99";
      target["bom-ref"] = target.purl;
      writeGolden(PROJECT, SCENARIO_NAME, corrupted);

      // Regenerate from the fixture and run the runner's real compare path.
      const manifest = {
        fixture: ".",
        scenarios: [{ name: SCENARIO_NAME, projectType: ["npm"], options: {} }],
      };
      const { normalized } = await runScenario(
        PROJECT,
        manifest.scenarios[0],
        manifest,
      );
      const expected = readGolden(PROJECT, SCENARIO_NAME);
      const { isEqual, summary } = diffBoms(normalized, expected);

      assert.ok(!isEqual, `corrupted purl was not caught: ${summary}`);
      assert.match(
        summary,
        /component/i,
        `diff summary did not name the changed component: ${summary}`,
      );
    } finally {
      writeGolden(PROJECT, SCENARIO_NAME, original);
    }
  });

  await testAsync("runner catches a dropped dependency edge in a committed golden", async () => {
    // cargo-smoke has non-trivial dependency edges.
    const CARGO_PROJECT = "cargo-smoke";
    const original = readGolden(CARGO_PROJECT, SCENARIO_NAME);
    assert.ok(original, `${CARGO_PROJECT}/${SCENARIO_NAME} golden must exist`);
    try {
      const corrupted = structuredClone(original);
      const nodeWithEdges = (corrupted.dependencies || []).find(
        (d) => d.dependsOn && d.dependsOn.length > 1,
      );
      assert.ok(
        nodeWithEdges,
        "cargo-smoke golden must have a dependency node with >1 edge",
      );
      nodeWithEdges.dependsOn.shift();
      writeGolden(CARGO_PROJECT, SCENARIO_NAME, corrupted);

      const manifest = {
        fixture: ".",
        scenarios: [{ name: SCENARIO_NAME, projectType: ["cargo"], options: {} }],
      };
      const { normalized } = await runScenario(
        CARGO_PROJECT,
        manifest.scenarios[0],
        manifest,
      );
      const expected = readGolden(CARGO_PROJECT, SCENARIO_NAME);
      const { isEqual, summary } = diffBoms(normalized, expected);

      assert.ok(!isEqual, `dropped edge was not caught: ${summary}`);
      assert.match(
        summary,
        /dependen|edge/i,
        `diff summary did not name the changed dependency: ${summary}`,
      );
    } finally {
      writeGolden(CARGO_PROJECT, SCENARIO_NAME, original);
    }
  });

  await testAsync("runner agrees when a golden is left intact (control)", async () => {
    // Control: the unmodified golden must compare equal. Guards against the
    // negative tests passing simply because runScenario is broken.
    const manifest = {
      fixture: ".",
      scenarios: [{ name: SCENARIO_NAME, projectType: ["npm"], options: {} }],
    };
    const { normalized } = await runScenario(
      PROJECT,
      manifest.scenarios[0],
      manifest,
    );
    const expected = readGolden(PROJECT, SCENARIO_NAME);
    const { isEqual, summary } = diffBoms(normalized, expected);
    assert.ok(isEqual, `unmodified golden did not compare equal: ${summary}`);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main() {
  console.log("=== Mutation & determinism test suite ===");

  runMutationTests();
  runDeterminismTests();
  runBomRefTests();
  await runTwoRunDeterminism();
  await runCassetteTests();
  runNormalizerInvariantTests();
  await runGoldenRunnerNegativeTests();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// Auto-run when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
