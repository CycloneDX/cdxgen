/**
 * Tests that a scan of a Maven project never starts the project's own build
 * tooling when dependency installation is disabled: `mvn` evaluates the
 * pom's build section and loads `.mvn/` configuration (jvm.config,
 * maven.config, extensions.xml), so it belongs to the same gated surface as
 * Gradle, sbt and Mill. The stand-in mvn records its invocation, mirroring
 * the marker-file reproducers of issue #4527, and the fixture plants the
 * `.mvn/jvm.config` a real attack would use.
 */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import process from "node:process";

import { assert, it } from "poku";

import { getLedgerEvents, resetLedgerEvents } from "../core/buildLedger.js";
import { resetRunState } from "../core/runState.js";

const ENV_NAMES = [
  "PATH",
  "HOME",
  "MVN_CMD",
  "MAVEN_CMD",
  "MVN_ARGS",
  "MAVEN_ARGS",
  "MAVEN_HOME",
  "M2_HOME",
  "CDXGEN_INTROSPECT",
  "CDXGEN_INTROSPECT_LEDGER",
];

const POM =
  "<project><modelVersion>4.0.0</modelVersion><groupId>org.example</groupId><artifactId>demo</artifactId><version>1.0.0</version><dependencies><dependency><groupId>com.example</groupId><artifactId>demo-lib</artifactId><version>1.0.0</version></dependency></dependencies></project>";

/**
 * Scan a Maven project that plants the `.mvn/jvm.config` javaagent payload of
 * issue #4527, with a stand-in mvn on PATH that records every invocation.
 *
 * @param {Object} [extraOptions] Options added to the scan's own.
 * @returns {Promise<{mvnRan: boolean, printed: string[], events: Object[], libs: string[]}>}
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
    const marker = join(root, "mvn-ran");
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
    const fakeMvn = join(binDir, "mvn");
    writeFileSync(
      fakeMvn,
      `#!/bin/sh\nprintf 'ran\\n' > ${JSON.stringify(marker)}\nexit 1\n`,
    );
    chmodSync(fakeMvn, 0o755);
    for (const name of ENV_NAMES) {
      delete process.env[name];
    }
    process.env.PATH = [binDir, saved.PATH].filter(Boolean).join(delimiter);
    process.env.HOME = emptyHome;
    process.env.CDXGEN_INTROSPECT_LEDGER = join(root, "ledger.jsonl");
    console.log = (...args) => printed.push(args.join(" "));

    resetRunState();
    resetLedgerEvents();
    const { createJavaBom } = await import("./jvmBom.js");
    const bomNSData = await createJavaBom(project, {
      projectType: ["java"],
      specVersion: 1.6,
      ...extraOptions,
    });
    let mvnRan = false;
    try {
      mvnRan = readFileSync(marker, "utf-8").includes("ran");
    } catch (_e) {
      mvnRan = false;
    }
    return {
      mvnRan,
      printed,
      events: getLedgerEvents(),
      libs: (bomNSData?.bomJson?.components || [])
        .filter((c) => c.group === "com.example")
        .map((c) => c.name)
        .sort(),
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
  if (process.platform === "win32") {
    // The stand-in is a POSIX shell script.
    return;
  }
  const { mvnRan, printed, events, libs } = await scanMavenProject({
    installDeps: false,
  });
  assert.strictEqual(
    mvnRan,
    false,
    "mvn started even though dependency installation is disabled",
  );
  assert.ok(
    printed.some((line) =>
      line.includes(
        "Skipping 'mvn dependency:tree' since dependency installation is disabled",
      ),
    ),
    `expected a skip message, printed: ${printed.join(" | ")}`,
  );
  assert.ok(
    events.some(
      (event) => event.remediationId === "jvm.maven.tooling-disabled",
    ),
    "expected a jvm.maven.tooling-disabled degradation event",
  );
  assert.deepStrictEqual(libs, ["demo-lib"]);
});

await it("still starts mvn when dependency installation is enabled (positive control)", async () => {
  if (process.platform === "win32") {
    return;
  }
  const { mvnRan } = await scanMavenProject({ installDeps: true });
  assert.strictEqual(mvnRan, true, "the stand-in mvn was never invoked");
});

await it("keeps mvn available to introspection mode when installs are disabled", async () => {
  if (process.platform === "win32") {
    return;
  }
  // Introspection exists to observe the project's own toolchain, so it keeps
  // the tooling on outside secure mode (see lib/ecosystems/gradleutils.js).
  const { mvnRan, printed } = await scanMavenProject({
    installDeps: false,
    introspect: true,
  });
  assert.strictEqual(mvnRan, true, "introspection should still run mvn");
  assert.ok(
    !printed.some((line) => line.includes("Skipping 'mvn dependency:tree'")),
    "no skip message is expected while introspection allows the tooling",
  );
});
