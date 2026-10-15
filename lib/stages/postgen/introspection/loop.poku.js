/**
 * End-to-end tests that need more than one runtime or more than one CLI run:
 * per-ecosystem isolation on a polyglot tree, cross-runtime equality of the
 * report's `overall` block, and the restricted-permission proof that a denied
 * probe degrades evidence instead of lying about a missing tool.
 *
 * This file spawns node, deno and bun CLIs directly, so it is held back from
 * the Bun and Deno suites (see contrib/alt-runtime-tests.js).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assert, describe, it, log } from "poku";

import {
  bomGraphFacts,
  queueStep,
  repoRoot,
  resolveRuntimeBinary,
  runIntrospectionScan,
  runtimeAvailable,
  toolAnswers,
} from "../../../../test/helpers/introspection-e2e.js";

const fixtures = join(repoRoot, "test", "repotests");
const DEAD_MVN = join("/", "cdxgen-nonexistent", "mvn");

describe("Group D — one polyglot repo, per-ecosystem verdicts", () => {
  const polyglot = join(repoRoot, "test", "data", "introspection-polyglot");
  if (!toolAnswers("mvn")) {
    log(
      "maven is not installed; the polyglot java row would be degraded in both runs",
    );
    return;
  }
  it("degrades only the maven toolchain and moves only the java tier", async () => {
    const healthyRun = await runIntrospectionScan({
      projectPath: polyglot,
      output: join(tmpdir(), "cdxgen-grpd-healthy.bom.json"),
    });
    assert.equal(healthyRun.status, 0, healthyRun.stderr.slice(-600));
    const degradedRun = await runIntrospectionScan({
      projectPath: polyglot,
      output: join(tmpdir(), "cdxgen-grpd-degraded.bom.json"),
      env: { MVN_CMD: DEAD_MVN },
    });
    assert.equal(degradedRun.status, 0, degradedRun.stderr.slice(-600));
    const healthy = Object.fromEntries(
      healthyRun.report.ecosystems.map((row) => [row.ecosystem, row]),
    );
    const degraded = Object.fromEntries(
      degradedRun.report.ecosystems.map((row) => [row.ecosystem, row]),
    );
    assert.ok(healthy.java, "no java row was graded");
    assert.ok(degraded.java, "no java row was graded");
    assert.ok(
      degraded.java.score < healthy.java.score,
      "the java tier did not move under a dead maven",
    );
    for (const [ecosystem, row] of Object.entries(degraded)) {
      if (ecosystem === "java") {
        continue;
      }
      const baseline = healthy[ecosystem];
      assert.ok(
        baseline,
        `the degraded run grew a row ${ecosystem} the healthy run lacked`,
      );
      assert.equal(
        row.tier,
        baseline.tier,
        `${ecosystem} moved under a maven-only degradation`,
      );
      assert.equal(row.score, baseline.score);
    }
  });
});

describe("cross-runtime equality of the report's overall block", () => {
  const rows = [
    ["go-smoke", "go"],
    ["poetry-smoke", "python"],
    ["dotnet-eshop", "csharp"],
  ];
  for (const runtime of ["deno", "bun"]) {
    if (!runtimeAvailable(runtime)) {
      log(`${runtime} is not installed; the equality matrix cannot run here`);
      continue;
    }
    for (const [fixture, projectType] of rows) {
      it(`${fixture} reports the same overall block under node and ${runtime}`, async () => {
        const nodeRun = await runIntrospectionScan({
          projectPath: join(fixtures, fixture),
          projectType,
          output: join(tmpdir(), `cdxgen-eq-node-${fixture}.bom.json`),
        });
        const altRun = await runIntrospectionScan({
          projectPath: join(fixtures, fixture),
          projectType,
          output: join(tmpdir(), `cdxgen-eq-${runtime}-${fixture}.bom.json`),
          runtime,
        });
        assert.equal(altRun.status, 0, altRun.stderr.slice(-600));
        // runId, generatedAt and the BOM serial identify the run; the
        // verdict must not depend on the runtime.
        assert.deepEqual(altRun.report.overall, nodeRun.report.overall);
        assert.deepEqual(altRun.report.remediation, nodeRun.report.remediation);
        assert.deepEqual(
          altRun.report.coverageGaps,
          nodeRun.report.coverageGaps,
        );
        assert.equal(
          altRun.report.ecosystems
            .map((row) => `${row.ecosystem}:${row.tier}:${row.score}`)
            .join(","),
          nodeRun.report.ecosystems
            .map((row) => `${row.ecosystem}:${row.tier}:${row.score}`)
            .join(","),
        );
      });
    }
  }
});

describe("restricted Deno permissions degrade evidence instead of lying", () => {
  if (!runtimeAvailable("deno")) {
    log(
      "deno is not installed; the restricted-permission proof cannot run here",
    );
    return;
  }
  it("a denied probe records evidence.degraded, never tool.missing", async () => {
    const output = join(tmpdir(), "cdxgen-denied-probe.bom.json");
    const projectPath = join(fixtures, "go-smoke");
    const args = [
      resolveRuntimeBinary("deno"),
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-net",
      "--allow-sys",
      // Running the repo's own entry under deno would otherwise adopt
      // deno.json's `nodeModulesDir: "auto"` and materialize deno's own
      // npm graph into node_modules/.deno — diverging from the pnpm-managed
      // install, since deno resolves versions itself (the repo sets
      // `"lock": false`) — and rewire the root node_modules links under the
      // running suite. Resolving from deno's own cache leaves the install
      // alone.
      "--node-modules-dir=false",
      join(repoRoot, "bin", "cdxgen.js"),
      "--profile",
      "introspect",
      "-t",
      "go",
      "--no-install-deps",
      "-o",
      output,
      projectPath,
    ];
    // The profile alone switches introspection on. Setting
    // CDXGEN_INTROSPECT=true here would start recording before the CLI
    // bridges in its automatic sidecar, and the earliest events would never
    // reach the report.
    const result = await queueStep(() =>
      spawnSync(args[0], args.slice(1), {
        encoding: "utf-8",
        timeout: 600000,
        // The introspection report can exceed spawnSync's 1 MiB default on
        // cache-rich machines, where long paths widen the table; the child
        // is then killed with ENOBUFS instead of exiting (see the same fix
        // in reflect.poku.js).
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env },
      }),
    );
    assert.equal(
      result.status,
      0,
      `the degraded scan itself must succeed: ${result.stderr.slice(-600)}`,
    );
    assert.ok(existsSync(output), "the BOM was not written");
    const report = JSON.parse(
      readFileSync(`${output}.introspection.json`, "utf-8"),
    );
    const serialized = JSON.stringify(report);
    assert.ok(
      !serialized.includes('"tool.missing"'),
      "the report claims a tool is missing under a permission denial",
    );
    const degradedProbe = (report.observations || []).find(
      (entry) => entry.kind === "evidence.degraded" && entry.tool === "go",
    );
    assert.ok(
      degradedProbe,
      "the denied go probe was not recorded as degraded evidence",
    );
    for (const row of report.ecosystems) {
      assert.deepEqual(row.tools.missing, []);
    }
    const facts = bomGraphFacts(JSON.parse(readFileSync(output, "utf-8")));
    assert.ok(facts.components > 0, "the scan produced no components");
  });
});
