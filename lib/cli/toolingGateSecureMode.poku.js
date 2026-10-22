/**
 * Secure-mode test for the project-tooling gate.
 *
 * Lives in its own file because `isSecureMode` is an import-time snapshot of
 * CDXGEN_SECURE_MODE, so the environment must be prepared before any cdxgen
 * module is first imported. No cdxgen module may be statically imported here.
 *
 * Introspection mode normally keeps the scanned project's build tooling
 * available, but secure mode wins: `isProjectToolingAllowed` must refuse to
 * run it even with introspect on (issue #4527). The positive control in the
 * same process proves the stand-in mvn is reachable, so the first test cannot
 * pass only because mvn was never found.
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

process.env.CDXGEN_SECURE_MODE = "true";

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
  "CDXGEN_ALLOWED_COMMANDS",
];

const POM =
  "<project><modelVersion>4.0.0</modelVersion><groupId>org.example</groupId><artifactId>demo</artifactId><version>1.0.0</version><dependencies><dependency><groupId>com.example</groupId><artifactId>demo-lib</artifactId><version>1.0.0</version></dependency></dependencies></project>";

/**
 * Scan a Maven project in secure mode with a stand-in mvn first on PATH.
 *
 * @param {Object} options Scan options
 * @returns {Promise<{mvnRuns: string[], printed: string[]}>}
 */
async function scanInSecureMode(options) {
  const saved = Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n]]));
  const root = mkdtempSync(join(tmpdir(), "cdxgen-tooling-secure-"));
  const printed = [];
  const originalLog = console.log;
  try {
    const binDir = join(root, "bin");
    const project = join(root, "project");
    const home = join(root, "home");
    const marker = join(root, "mvn-runs.txt");
    mkdirSync(binDir);
    mkdirSync(home);
    mkdirSync(join(project, ".mvn"), { recursive: true });
    writeFileSync(join(project, "pom.xml"), POM);
    writeFileSync(
      join(project, ".mvn", "jvm.config"),
      "-javaagent:.mvn/agent.jar\n",
    );
    writeStandInTool(binDir, "mvn", marker);
    const searchPath = saved.PATH ?? saved.Path;
    for (const name of ENV_NAMES) {
      delete process.env[name];
    }
    process.env.PATH = [binDir, searchPath].filter(Boolean).join(delimiter);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    console.log = (...args) => printed.push(args.join(" "));
    const { createJavaBom } = await import("./jvmBom.js");
    await createJavaBom(project, {
      projectType: ["java"],
      specVersion: 1.6,
      ...options,
    });
    return { mvnRuns: standInRuns(marker), printed };
  } finally {
    console.log = originalLog;
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    rmSync(root, { force: true, recursive: true });
  }
}

await it("secure mode wins over introspection: mvn does not start", async () => {
  const { mvnRuns, printed } = await scanInSecureMode({
    installDeps: false,
    introspect: true,
  });
  assert.deepStrictEqual(
    mvnRuns,
    [],
    "mvn started in secure mode even though dependency installation is disabled",
  );
  assert.ok(
    printed.some((line) => line.includes("Skipping Maven")),
    `expected the skip message, printed: ${printed.join(" | ")}`,
  );
});

await it("secure mode keeps installs off when the options leave them unset", async () => {
  // A library caller that never sets installDeps gets the secure-mode
  // default, which is off.
  const { mvnRuns } = await scanInSecureMode({});
  assert.deepStrictEqual(mvnRuns, []);
});

await it("secure mode still runs mvn when installs are explicitly enabled (positive control)", async () => {
  const { mvnRuns } = await scanInSecureMode({ installDeps: true });
  assert.ok(mvnRuns.length > 0, "the stand-in mvn was never invoked");
});
