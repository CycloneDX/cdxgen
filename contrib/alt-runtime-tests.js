#!/usr/bin/env node
/**
 * Run the unit test suite under Bun or Deno.
 *
 * Poku spawns each test file with the runtime named by `POKU_RUNTIME`, so the
 * suite can be pointed at another runtime without changing the tests. Two
 * groups are held back:
 *
 * - Files that mock modules with esmock. Esmock hooks Node's loader chain,
 *   which neither Bun nor Deno provides, so these fail on the mocking rather
 *   than on anything cdxgen does. The set is computed rather than listed, so a
 *   new esmock test is covered without touching this file.
 * - The per-runtime lists below, each of which is a genuine gap rather than a
 *   tool limitation. They are listed individually so that the cost of the gap
 *   stays visible and shrinks as the causes are fixed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";

/**
 * Tests held back per runtime, each with the reason it cannot run there yet.
 */
const KNOWN_GAPS = {
  bun: {
    "lib/cli/asar.poku.js": "asar extraction differs under bun",
    "lib/cli/degradation.poku.js": "spawns the node CLI directly",
    "lib/core/parallel.poku.js":
      "worker threads are disabled outside node, so the fan-out assertions cannot hold",
    "lib/ecosystems/parsers-misc.poku.js": "parser output differs under bun",
    "lib/inventory/analyzer.poku.js":
      "spawns a helper that assumes the node CLI",
    "lib/managers/dockerConnection.poku.js":
      "listening on a unix socket in the temp dir fails under bun",
    "lib/stages/postgen/introspection/reflect.poku.js": "spawns the node CLI directly",
    "lib/stages/postgen/introspection/loop.poku.js": "spawns the node, deno and bun CLIs directly",
    "lib/stages/postgen/introspection/skill.poku.js": "spawns the node CLI directly",
    "lib/core/deferredExit.poku.js": "spawns the node CLI directly",
    "lib/cli/toolingGateCli.poku.js":
      "spawns the node CLI directly, and bun resolves the cdxgen-secure symlink, so argv[1] no longer names the command",
  },
  deno: {
    "bin/cdxgenSecure.poku.js":
      "spawns process.execPath directly, which under deno needs a run subcommand and permission flags",
    "bin/commands.poku.js":
      "spawns process.argv0 directly, which under deno needs a run subcommand and permission flags",
    "bin/tracebom.poku.js":
      "spawns process.argv0 directly, which under deno needs a run subcommand and permission flags",
    "lib/cli/degradation.poku.js": "spawns the node CLI directly",
    "lib/core/parallel.poku.js":
      "worker threads are disabled outside node, so the fan-out assertions cannot hold",
    "lib/inventory/analyzer.poku.js":
      "spawns a helper that assumes the node CLI",
    "lib/managers/binaryRootfsCerts.poku.js":
      "spawns process.execPath directly, which under deno needs a run subcommand and permission flags",
    "lib/managers/dockerConnection.poku.js":
      "listening on a unix socket in the temp dir fails under deno",
    "lib/stages/postgen/introspection/reflect.poku.js": "spawns the node CLI directly",
    "lib/stages/postgen/introspection/loop.poku.js": "spawns the node, deno and bun CLIs directly",
    "lib/stages/postgen/introspection/skill.poku.js": "spawns the node CLI directly",
    "lib/core/deferredExit.poku.js": "spawns the node CLI directly",
    "lib/cli/toolingGateCli.poku.js": "spawns the node CLI directly",
    "lib/packaging.poku.js": "drives npm pack, which assumes the node CLI",
    "lib/stages/pregen/envAudit.poku.js":
      "assigns globalThis.Deno, which is read only under deno",
  },
};

/** Permissions the suite needs when Deno spawns each test file. */
const DENO_ALLOW = "read,run,env,net,write,sys";

/**
 * Locate Poku's CLI entry point.
 *
 * The entry is run directly rather than through npx, which on Windows is a
 * batch file and cannot be spawned without a shell. Poku does not export the
 * entry as a subpath, so its package root is found by walking up from the
 * module it does export.
 *
 * @returns {string} Absolute path to Poku's CLI entry point
 */
function resolvePokuBin() {
  let dir = dirname(createRequire(import.meta.url).resolve("poku"));
  while (dir !== dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, "utf-8"));
      if (pkg.name === "poku") {
        return join(dir, pkg.bin.poku);
      }
    }
    dir = dirname(dir);
  }
  throw new Error("Unable to locate the poku CLI entry point");
}

const runtime = process.argv[2];
if (!Object.hasOwn(KNOWN_GAPS, runtime)) {
  console.error(`Usage: node contrib/alt-runtime-tests.js <bun|deno>`);
  process.exit(2);
}

// Globs come back with the host separator, while the held-back lists below are
// written with forward slashes, so paths are normalised before either is used.
const files = [...globSync("lib/**/*.poku.js"), ...globSync("bin/**/*.poku.js")]
  .map((f) => f.replaceAll("\\", "/"))
  .sort();

const gaps = KNOWN_GAPS[runtime];
const mocked = files.filter((f) => /["']esmock["']/.test(readFileSync(f, "utf-8")));
const held = new Set([...mocked, ...Object.keys(gaps)]);
const running = files.filter((f) => !held.has(f));

console.log(`Running ${running.length} of ${files.length} test files under ${runtime}.`);
console.log(`  ${mocked.length} held back: esmock needs node's loader chain`);
for (const [file, why] of Object.entries(gaps)) {
  console.log(`  held back: ${file} — ${why}`);
}

const args = [resolvePokuBin(), ...running];
if (runtime === "deno") {
  args.push(`--denoAllow=${DENO_ALLOW}`);
}
const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, POKU_RUNTIME: runtime },
});
process.exit(result.status ?? 1);
