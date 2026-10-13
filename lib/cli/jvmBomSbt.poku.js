import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import esmock from "esmock";
import { assert, it } from "poku";

// Runs createJavaBom over a two-module sbt build with a stand-in for sbt that
// answers the projects command and writes the dependency trees a real sbt
// would. COURSIER_CACHE is process-wide, so the cases run one after the other.

const PROJECTS_OUTPUT = `[info] welcome to sbt
[info] In file:/build/
[info] \t   cli
[info] \t   core
[info] \t * root
`;

// The cli tree ends with a second root, as sbt prints a project that cli
// depends on only in Test: it belongs to the cli tree, not to a project.
const TREES = {
  cli: [
    "com.example:cli_3:0.1.0",
    "  +-com.example:core_3:0.1.0",
    "  | +-com.lihaoyi:upickle_3:4.1.0",
    "  | ",
    "  +-org.slf4j:slf4j-api:2.0.16",
    "  ",
    "com.example:testkit_3:0.1.0",
    "",
  ].join("\n"),
  core: [
    "com.example:core_3:0.1.0",
    "  +-com.lihaoyi:upickle_3:4.1.0",
    "",
  ].join("\n"),
};

const PLUGINS_SBT = 'addSbtPlugin("com.eed3si9n" % "sbt-assembly" % "2.5.0")\n';

/**
 * Write a two-module sbt build.
 *
 * @param {string} root Directory to create the build in
 * @param {string} sbtVersion sbt.version of the build
 * @returns {string} The build directory
 */
function writeBuild(root, sbtVersion) {
  const project = join(root, "build");
  mkdirSync(join(project, "project"), { recursive: true });
  writeFileSync(
    join(project, "project", "build.properties"),
    `sbt.version=${sbtVersion}\n`,
  );
  writeFileSync(join(project, "project", "plugins.sbt"), PLUGINS_SBT);
  writeFileSync(
    join(project, "build.sbt"),
    [
      'name := "demo"',
      'ThisBuild / organization := "com.example"',
      'ThisBuild / version := "0.1.0"',
      "lazy val core = project",
      "lazy val cli = project.dependsOn(core)",
      'lazy val root = project.in(file(".")).aggregate(core, cli)',
      "",
    ].join("\n"),
  );
  return project;
}

/**
 * The tree files a command asks sbt to write: sbt 2 `--out "file"` with sbt
 * escapes, or sbt 1 `toFile file --force`.
 *
 * @param {string} command The sbt arguments joined with spaces
 * @returns {{project: string, file: string}[]}
 */
function requestedTrees(command) {
  const trees = [];
  for (const m of command.matchAll(
    /(\w+)\/dependencyTree --out "((?:[^"\\]|\\.)*)"/g,
  )) {
    trees.push({ project: m[1], file: m[2].replace(/\\(.)/g, "$1") });
  }
  for (const m of command.matchAll(
    /(\w+)\/dependencyTree \/ toFile (\S+) --force/g,
  )) {
    trees.push({ project: m[1], file: m[2] });
  }
  return trees;
}

/**
 * Scan an sbt build with a stand-in sbt.
 *
 * @param {string} sbtVersion sbt.version of the build
 * @param {(trees: {project: string, file: string}[], call: number) => number} writeTrees
 *   Writes the requested trees of one tree command and returns its exit code
 * @returns {Promise<{bomData: Object, treeCalls: string[][], pluginsDuringRun: string[], plugins: string, pluginsBackup: boolean}>}
 *   The scan result, the arguments of every tree command, the plugins.sbt
 *   each tree command saw, and the plugins.sbt left after the scan
 */
async function scanSbtBuild(sbtVersion, writeTrees) {
  const root = mkdtempSync(join(tmpdir(), "cdxgen-sbt-build-"));
  const savedCache = process.env.COURSIER_CACHE;
  process.env.COURSIER_CACHE = join(root, "coursier");
  try {
    const project = writeBuild(root, sbtVersion);
    const treeCalls = [];
    const pluginsDuringRun = [];
    const sbtutils = await import("../ecosystems/sbtutils.js");
    const { createJavaBom } = await esmock("./jvmBom.js", {
      "../ecosystems/sbtutils.js": {
        ...sbtutils,
        sbtSpawnSync: (_cmd, args) => {
          const command = args.join(" ");
          if (args.at(-1) === '"projects"') {
            return { status: 0, stdout: PROJECTS_OUTPUT, stderr: "" };
          }
          const trees = requestedTrees(command);
          if (!trees.length) {
            return { status: 0, stdout: "", stderr: "" };
          }
          treeCalls.push(args);
          pluginsDuringRun.push(
            readFileSync(join(project, "project", "plugins.sbt"), "utf-8"),
          );
          const status = writeTrees(trees, treeCalls.length - 1);
          return { status, stdout: "", stderr: "" };
        },
      },
    });
    const bomData = await createJavaBom(project, {
      projectType: ["sbt"],
      installDeps: true,
      multiProject: false,
      specVersion: 1.7,
    });
    return {
      bomData,
      treeCalls,
      pluginsDuringRun,
      plugins: readFileSync(join(project, "project", "plugins.sbt"), "utf-8"),
      pluginsBackup: existsSync(join(project, "project", "plugins.sbt.cdxgen")),
    };
  } finally {
    if (savedCache === undefined) {
      delete process.env.COURSIER_CACHE;
    } else {
      process.env.COURSIER_CACHE = savedCache;
    }
    rmSync(root, { force: true, recursive: true });
  }
}

/**
 * Write the requested trees, failing at the project named.
 *
 * @param {{project: string, file: string}[]} trees Requested trees
 * @param {string} [failAt] Project whose resolution fails and stops sbt
 * @returns {number} Exit code
 */
function writeTreesUntil(trees, failAt) {
  for (const { project, file } of trees) {
    if (project === failAt) {
      return 1;
    }
    writeFileSync(file, TREES[project]);
  }
  return 0;
}

/**
 * The dependsOn of a ref, asserting every dependency entry lists its
 * dependencies once.
 *
 * @param {Object[]} dependencies Dependency entries of the BOM
 * @param {string} ref Ref to look up
 * @returns {string[]}
 */
function dependsOnOf(dependencies, ref) {
  for (const dep of dependencies) {
    assert.strictEqual(
      new Set(dep.dependsOn).size,
      dep.dependsOn.length,
      `${dep.ref} lists each dependency once`,
    );
  }
  const entries = dependencies.filter((d) => d.ref === ref);
  assert.strictEqual(entries.length, 1, `${ref} has one dependency entry`);
  return entries[0].dependsOn;
}

const ROOT_REF = "pkg:maven/com.example/demo@0.1.0?type=jar";
const CLI_REF = "pkg:maven/com.example/cli@0.1.0?type=jar";
const CORE_REF = "pkg:maven/com.example/core@0.1.0?type=jar";

await it("sbt 2 writes every subproject tree to its own file and leaves plugins.sbt alone", async () => {
  const scan = await scanSbtBuild("2.0.10", (trees) => writeTreesUntil(trees));
  // One sbt 2 session: a single ;-joined argument with a file per subproject
  assert.strictEqual(scan.treeCalls.length, 1);
  const commandArg = scan.treeCalls[0].at(-1);
  assert.ok(
    commandArg.includes("set ThisBuild / dependencyTree / aggregate := false"),
  );
  assert.deepStrictEqual(
    requestedTrees(commandArg).map((t) => t.project),
    ["cli", "core"],
  );
  assert.ok(!scan.treeCalls[0].some((a) => a.startsWith("-addPluginSbtFile")));
  // sbt 2 ships the dependency tree, so the build definition is not amended
  assert.deepStrictEqual(scan.pluginsDuringRun, [PLUGINS_SBT]);
  assert.strictEqual(scan.plugins, PLUGINS_SBT);
  assert.ok(!scan.pluginsBackup);

  const { bomData } = scan;
  assert.strictEqual(bomData.parentComponent["bom-ref"], ROOT_REF);
  // The second root of the cli tree is a component, not another subproject
  assert.deepStrictEqual(dependsOnOf(bomData.dependencies, ROOT_REF), [
    CLI_REF,
    CORE_REF,
  ]);
  assert.ok(
    bomData.bomJson.components.some((c) => c.name === "testkit"),
    "the extra root of a tree is kept as a component",
  );
  const cliDeps = dependsOnOf(bomData.dependencies, CLI_REF);
  assert.ok(cliDeps.includes(CORE_REF));
  assert.ok(cliDeps.some((r) => r.includes("slf4j-api")));
  assert.ok(
    dependsOnOf(bomData.dependencies, CORE_REF).some((r) =>
      r.includes("upickle"),
    ),
  );
});

await it("sbt 2 retries the subprojects a failed session did not write", async () => {
  const scan = await scanSbtBuild("2.0.10", (trees, call) =>
    // The combined run stops at core; the retry of core succeeds
    writeTreesUntil(trees, call === 0 ? "core" : undefined),
  );
  assert.strictEqual(scan.treeCalls.length, 2);
  // Only the tree the failed session did not write is retried
  assert.deepStrictEqual(
    requestedTrees(scan.treeCalls[1].at(-1)).map((t) => t.project),
    ["core"],
  );
  const { bomData } = scan;
  assert.deepStrictEqual(dependsOnOf(bomData.dependencies, ROOT_REF), [
    CLI_REF,
    CORE_REF,
  ]);
  assert.ok(
    !bomData.parentComponent.properties?.some(
      (p) => p.name === "cdx:sbt:failedProjects",
    ),
  );
});

await it("sbt 2 records the subprojects whose retry fails as well", async () => {
  const scan = await scanSbtBuild("2.0.10", (trees) =>
    writeTreesUntil(trees, "core"),
  );
  const { bomData } = scan;
  assert.deepStrictEqual(dependsOnOf(bomData.dependencies, ROOT_REF), [
    CLI_REF,
  ]);
  assert.deepStrictEqual(
    bomData.parentComponent.properties.find(
      (p) => p.name === "cdx:sbt:failedProjects",
    )?.value,
    "core",
  );
});

await it("sbt 1 keeps toFile and the temporary plugin, and parses a retried tree once", async () => {
  const scan = await scanSbtBuild("1.10.11", (trees, call) =>
    writeTreesUntil(trees, call === 0 ? "core" : undefined),
  );
  assert.strictEqual(scan.treeCalls.length, 2);
  assert.ok(
    scan.treeCalls[0].join(" ").includes("cli/dependencyTree / toFile"),
  );
  // The dependency tree plugin is added for the run and removed afterwards
  assert.ok(scan.pluginsDuringRun[0].includes("addDependencyTreePlugin"));
  assert.strictEqual(scan.plugins, PLUGINS_SBT);
  assert.ok(!scan.pluginsBackup);
  assert.deepStrictEqual(dependsOnOf(scan.bomData.dependencies, ROOT_REF), [
    CLI_REF,
    CORE_REF,
  ]);
});
