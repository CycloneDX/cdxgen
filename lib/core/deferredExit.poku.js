/**
 * Tests for the deferred `fail-on-error` exit: an introspected run whose
 * extractor fails must still write the BOM and both reports and only then
 * exit with the dedicated failure status, while a run without introspection
 * keeps the historical contract of exiting 1 before any output exists.
 *
 * Every assertion drives `bin/cdxgen.js`, because the deferred exit is
 * decided after `postProcess` — a test on `createBom` would never reach the
 * code under test. The file therefore spawns the node CLI directly.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname as pathDirname } from "node:path";
import { fileURLToPath } from "node:url";

import { assert, describe, it, log } from "poku";

const repoRoot = join(pathDirname(fileURLToPath(import.meta.url)), "..", "..");

const tmpRoot = mkdtempSync(join(tmpdir(), "cdxgen-deferred-"));
const degradedFixture = join(tmpRoot, "degraded-fixture");
mkdirSync(degradedFixture, { recursive: true });
copyFileSync(
  join(repoRoot, "test", "repotests", "maven-smoke", "pom.xml"),
  join(degradedFixture, "pom.xml"),
);
const DEAD_MVN = join("/", "cdxgen-nonexistent", "mvn");

/**
 * Whether maven answers on this machine, so the healthy-exit case can be
 * guarded the way the e2e matrix guards its toolchain rows.
 *
 * @returns {boolean} True when a working mvn exists.
 */
function mavenAnswers() {
  const probe = spawnSync("mvn", ["--version"], {
    encoding: "utf-8",
    timeout: 60000,
    shell: process.platform === "win32",
  });
  return probe.status === 0;
}

/**
 * Run the CLI against the degraded fixture.
 *
 * @param {string[]} extraArgs Additional CLI arguments.
 * @param {string} output BOM output path.
 * @param {Object} [envOverrides] Extra environment for the child.
 * @returns {Object} The spawn result.
 */
function runScan(extraArgs, output, envOverrides = {}, opts = {}) {
  return spawnSync(
    process.execPath,
    [
      join(repoRoot, "bin", "cdxgen.js"),
      "-t",
      "java",
      // The introspected cases keep the historical --no-install-deps:
      // introspection leaves the project tooling on, so mvn still runs and
      // still fails. The non-introspected historical-exit case opts out,
      // because --no-install-deps now skips mvn entirely and nothing fails.
      ...(opts.installDeps ? ["--install-deps"] : ["--no-install-deps"]),
      ...extraArgs,
      "-o",
      output,
      degradedFixture,
    ],
    {
      encoding: "utf-8",
      timeout: 240000,
      env: {
        ...process.env,
        CDXGEN_INTROSPECT: "",
        MVN_CMD: DEAD_MVN,
        ...envOverrides,
      },
    },
  );
}

describe("deferred fail-on-error exits", () => {
  it("writes the BOM and both reports, then exits 5 on an introspected run", () => {
    const output = join(tmpRoot, "deferred", "bom.json");
    const result = runScan(["--introspect", "--fail-on-error"], output);
    assert.equal(
      result.status,
      5,
      `expected the deferred-failure exit code, got ${result.status}: ${result.stderr.slice(-1500)}`,
    );
    assert.ok(existsSync(output), "the deferred run still wrote the BOM");
    assert.ok(existsSync(`${output}.introspection.md`));
    assert.ok(existsSync(`${output}.introspection.json`));
    assert.ok(
      `${result.stdout}${result.stderr}`.includes("fail-on-error"),
      "the operator is told which extractor failed",
    );
    const report = JSON.parse(
      readFileSync(`${output}.introspection.json`, "utf-8"),
    );
    assert.equal(report.ledger.complete, true);
    const deferral = (report.observations || []).find(
      (observation) =>
        observation.kind === "command.failed" && observation.tool === "maven",
    );
    assert.ok(deferral, "the deferral is reported as a run-scoped observation");
    assert.equal(deferral.ecosystem, "java");
    // A verdict that names no repair is the failure this deliverable exists
    // to prevent: the extractor records what degraded before it stops, so
    // the report still ranks the fix an agent has to apply.
    assert.ok(
      report.remediation.some(
        (entry) => entry.remediationId === "jvm.maven.manifest-fallback",
      ),
      `the deferred run ranked no repair: ${JSON.stringify(report.remediation)}`,
    );
  });

  it("the deferred failure outranks a failed gate but the gate stays in the report", () => {
    const output = join(tmpRoot, "deferred-gate", "bom.json");
    const result = runScan(
      ["--introspect", "--fail-on-error", "--introspect-fail-below", "100"],
      output,
    );
    assert.equal(result.status, 5);
    assert.ok(existsSync(`${output}.introspection.json`));
    const report = JSON.parse(
      readFileSync(`${output}.introspection.json`, "utf-8"),
    );
    assert.equal(
      report.gate.passed,
      false,
      "the gate decision is still recorded",
    );
  });

  it("exits 1 and writes no BOM without introspection, as the flag always did", () => {
    const output = join(tmpRoot, "undeferred", "bom.json");
    const result = runScan(
      ["--fail-on-error"],
      output,
      {},
      {
        installDeps: true,
      },
    );
    assert.equal(
      result.status,
      1,
      `expected the historical fail-on-error exit, got ${result.status}`,
    );
    assert.ok(!existsSync(output), "no BOM is written on the historical path");
    assert.ok(!existsSync(`${output}.introspection.json`));
  });

  it("keeps exit 1 when the failure left no BOM to report on", () => {
    // Exit 5 is a promise that the outputs exist. A container archive that
    // cannot be exported produces no BOM at all, so the run has no verdict to
    // offer and keeps the historical meaning of exit 1.
    const archive = join(tmpRoot, "empty-image.tar");
    mkdirSync(tmpRoot, { recursive: true });
    writeFileSync(archive, "");
    const output = join(tmpRoot, "container", "bom.json");
    const result = spawnSync(
      process.execPath,
      [
        join(repoRoot, "bin", "cdxgen.js"),
        "-t",
        "oci",
        "--introspect",
        "--fail-on-error",
        "-o",
        output,
        archive,
      ],
      { encoding: "utf-8", timeout: 240000, env: { ...process.env } },
    );
    assert.equal(result.status, 1, result.stderr.slice(-600));
    assert.ok(
      `${result.stderr}`.includes("no BOM was produced"),
      "the operator is told why the exit is 1 and not 5",
    );
    assert.ok(!existsSync(output));
  });

  it("exits 0 when no extractor fails, even with the flag and introspection", () => {
    if (!mavenAnswers()) {
      log("maven is not installed; the healthy-exit case cannot run here");
      return;
    }
    const output = join(tmpRoot, "healthy", "bom.json");
    const result = runScan(["--introspect", "--fail-on-error"], output, {
      MVN_CMD: "",
    });
    assert.equal(
      result.status,
      0,
      `a healthy extractor must not defer: ${result.stderr.slice(-800)}`,
    );
    assert.ok(existsSync(`${output}.introspection.json`));
  });
});

if (process.env.CDXGEN_TEST_KEEP_TMP === undefined) {
  rmSync(tmpRoot, { recursive: true, force: true });
}
