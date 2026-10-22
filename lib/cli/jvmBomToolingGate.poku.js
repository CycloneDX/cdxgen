/**
 * Tests that a scan of a Maven project never starts the project's own build
 * tooling when dependency installation is disabled: `mvn` evaluates the
 * pom's build section and loads `.mvn/` configuration (jvm.config,
 * maven.config, extensions.xml), so it belongs to the same gated surface as
 * Gradle, sbt and Mill. The stand-in mvn records its invocation, mirroring
 * the marker-file reproducers of issue #4527, and the fixture plants the
 * `.mvn/jvm.config` a real attack would use.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import process from "node:process";

import { assert, it } from "poku";

import {
  standInRuns,
  writeStandInTool,
} from "../../test/helpers/standInTool.js";
import { getLedgerEvents, resetLedgerEvents } from "../core/buildLedger.js";
import { resetRunState } from "../core/runState.js";

const ENV_NAMES = [
  "PATH",
  "Path",
  "HOME",
  "USERPROFILE",
  "MVN_CMD",
  "MAVEN_CMD",
  "MVN_ARGS",
  "MAVEN_ARGS",
  "MAVEN_HOME",
  "M2_HOME",
  "CDXGEN_INTROSPECT",
  "CDXGEN_INTROSPECT_LEDGER",
  "CDXGEN_SECURE_MODE",
];

const POM =
  "<project><modelVersion>4.0.0</modelVersion><groupId>org.example</groupId><artifactId>demo</artifactId><version>1.0.0</version><dependencies><dependency><groupId>com.example</groupId><artifactId>demo-lib</artifactId><version>1.0.0</version></dependency></dependencies></project>";

/**
 * Scan a Maven project that plants the `.mvn/jvm.config` javaagent payload of
 * issue #4527, with a stand-in mvn on PATH that records every invocation.
 *
 * @param {Object} [extraOptions] Options added to the scan's own.
 * @returns {Promise<{mvnRuns: string[], printed: string[], events: Object[], libs: string[], parent: Object}>}
 */
async function scanMavenProject(extraOptions = {}) {
  const saved = Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n]]));
  const root = mkdtempSync(join(tmpdir(), "cdxgen-mvn-tooling-gate-"));
  const printed = [];
  const originalLog = console.log;
  try {
    const binDir = join(root, "bin");
    const project = join(root, "project");
    const emptyHome = join(root, "home");
    const marker = join(root, "mvn-runs.txt");
    mkdirSync(binDir);
    mkdirSync(emptyHome);
    mkdirSync(join(project, ".mvn"), { recursive: true });
    writeFileSync(join(project, "pom.xml"), POM);
    // The payload shape of issue #4527: the mvn launcher appends .mvn/jvm.config
    // to the JVM command line, so a -javaagent there runs before Maven starts.
    writeFileSync(
      join(project, ".mvn", "jvm.config"),
      "-javaagent:.mvn/agent.jar\n",
    );
    writeStandInTool(binDir, "mvn", marker);
    const searchPath = saved.PATH ?? saved.Path;
    for (const name of ENV_NAMES) {
      delete process.env[name];
    }
    // MAVEN_HOME and friends are gone, so getMavenCommand looks on PATH
    process.env.PATH = [binDir, searchPath].filter(Boolean).join(delimiter);
    process.env.HOME = emptyHome;
    process.env.USERPROFILE = emptyHome;
    // The in-memory ledger, without a sidecar file Windows would keep open
    process.env.CDXGEN_INTROSPECT = "true";
    console.log = (...args) => printed.push(args.join(" "));

    resetRunState();
    resetLedgerEvents();
    const { createJavaBom } = await import("./jvmBom.js");
    const bomNSData = await createJavaBom(project, {
      projectType: ["java"],
      specVersion: 1.6,
      ...extraOptions,
    });
    return {
      mvnRuns: standInRuns(marker),
      printed,
      events: getLedgerEvents(),
      libs: (bomNSData?.bomJson?.components || [])
        .filter((c) => c.group === "com.example")
        .map((c) => c.name)
        .sort(),
      parent: bomNSData?.parentComponent,
    };
  } finally {
    console.log = originalLog;
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    resetRunState();
    resetLedgerEvents();
    rmSync(root, { force: true, recursive: true });
  }
}

await it("does not start mvn for --no-install-deps and keeps the pom's direct dependencies", async () => {
  const { mvnRuns, printed, events, libs, parent } = await scanMavenProject({
    installDeps: false,
  });
  assert.deepStrictEqual(
    mvnRuns,
    [],
    "mvn started even though dependency installation is disabled",
  );
  assert.strictEqual(
    printed.filter((line) =>
      line.includes("Skipping Maven since dependency installation is disabled"),
    ).length,
    1,
    `expected one skip message, printed: ${printed.join(" | ")}`,
  );
  assert.ok(
    events.some(
      (event) => event.remediationId === "jvm.maven.tooling-disabled",
    ),
    "expected a jvm.maven.tooling-disabled degradation event",
  );
  assert.deepStrictEqual(libs, ["demo-lib"]);
  assert.strictEqual(parent?.name, "demo");
  assert.strictEqual(parent?.version, "1.0.0");
});

await it("still starts mvn when dependency installation is enabled (positive control)", async () => {
  const { mvnRuns } = await scanMavenProject({ installDeps: true });
  assert.ok(mvnRuns.length > 0, "the stand-in mvn was never invoked");
});

await it("keeps mvn available to introspection mode when installs are disabled", async () => {
  // Introspection exists to observe the project's own toolchain, so it keeps
  // the tooling on outside secure mode (see lib/core/projectTooling.js).
  const { mvnRuns, printed } = await scanMavenProject({
    installDeps: false,
    introspect: true,
  });
  assert.ok(mvnRuns.length > 0, "introspection should still run mvn");
  assert.ok(
    !printed.some((line) => line.includes("Skipping Maven")),
    "no skip message is expected while introspection allows the tooling",
  );
});

await it("does not let introspection from a config file start mvn", async () => {
  const { mvnRuns } = await scanMavenProject({
    installDeps: false,
    introspect: true,
    introspectFromConfigFile: true,
  });
  assert.deepStrictEqual(
    mvnRuns,
    [],
    "a config file's introspect setting started mvn with installs off",
  );
});
