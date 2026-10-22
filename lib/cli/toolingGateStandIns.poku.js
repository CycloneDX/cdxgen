/**
 * In-process checks of the sites that ran the scanned project's code, or a
 * binary the project chose, while installs were off (issue #4527): `cargo
 * check` and `cargo metadata`, `bundle exec`, `swift package resolve` in
 * pregen, `pod ipc spec` on a Ruby podspec, the evinse Maven catalog and the
 * formulation toolchain probes.
 *
 * Each site gets a stand-in tool first on PATH that records its working
 * directory and arguments, and a positive control in this file that differs
 * only in `installDeps`, so a negative test cannot pass just because the
 * stand-in was never reachable.
 *
 * cdxgen modules are imported inside the tests, after the *_CMD overrides are
 * removed: lib/core/env.js reads CARGO_CMD, SWIFT_CMD and DOTNET_CMD once,
 * when it loads. On Windows a stand-in is a .cmd script, which only stands in
 * for tools cdxgen spawns through cmd.exe (`shell: isWin`).
 */
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import process from "node:process";

import { assert, it } from "poku";

const isWin = process.platform === "win32";

// Removed for every test and restored afterwards: overrides that would pick
// a tool other than the stand-in, or change what the scans do.
const MANAGED_ENV = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "CDXGEN_TEMP_DIR",
  "CDXGEN_SECURE_MODE",
  "CDXGEN_INTROSPECT",
  "CDXGEN_INTROSPECT_LEDGER",
  "CDXGEN_ALLOWED_COMMANDS",
  "CDXGEN_DEBUG_MODE",
  "CDXGEN_JVM_TOOL_PINNED",
  "FETCH_LICENSE",
  "MAVEN_HOME",
  "M2_HOME",
  "MVN_CMD",
  "MAVEN_CMD",
  "MVN_ARGS",
  "MAVEN_ARGS",
  "MAVEN_CACHE_DIR",
  "CARGO_CMD",
  "CDXGEN_CARGO_TARGET",
  "CARGO_BUILD_TARGET",
  "SWIFT_CMD",
  "DOTNET_CMD",
  "POD_CMD",
  "BUNDLE_CMD",
  "CDXGEN_BUNDLE_CMD",
  "CDXGEN_RUBY_CMD",
  "RUBY_CMD",
  "CDXGEN_GEM_HOME",
  "GEM_HOME",
  "GEM_PATH",
  "BUNDLE_PATH",
  "BUNDLE_WITHOUT",
  "COCOA_FULL_SCAN",
  "COCOA_INCLUDED_TARGETS",
  "COCOA_EXCLUDED_TARGETS",
  "COCOA_RESOLVE_FROM_NODE",
  "COCOA_MERGE_SUBSPECS",
  "COCOA_PODSPEC_REPLACEMENTS",
  "COCOA_PODSPEC_JSON_REPLACEMENTS",
];

/**
 * Write a stand-in that appends `<cwd> @@ <args>` to `log` and exits 1.
 *
 * @param {string} binDir Directory placed first on PATH
 * @param {string} name Tool name without extension
 * @param {string} log File each run appends to
 * @returns {string} Path of the stand-in
 */
function writeStandIn(binDir, name, log) {
  if (isWin) {
    const tool = join(binDir, `${name}.cmd`);
    writeFileSync(
      tool,
      ["@echo off", `>>"${log}" echo %CD% @@ %*`, "exit /b 1", ""].join("\r\n"),
    );
    return tool;
  }
  const tool = join(binDir, name);
  writeFileSync(
    tool,
    `#!/bin/sh\nprintf '%s @@ %s\\n' "$(pwd -P)" "$*" >> ${JSON.stringify(log)}\nexit 1\n`,
  );
  chmodSync(tool, 0o755);
  return tool;
}

/**
 * The runs a stand-in recorded, or an empty list when it never ran.
 *
 * @param {string} log Stand-in log file
 * @returns {{cwd: string, args: string}[]}
 */
function standInRuns(log) {
  let text;
  try {
    text = readFileSync(log, "utf-8");
  } catch (_err) {
    return [];
  }
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const at = line.indexOf(" @@");
      return at === -1
        ? { cwd: "", args: line.trim() }
        : { cwd: line.slice(0, at).trim(), args: line.slice(at + 3).trim() };
    });
}

/**
 * Whether two paths name the same directory, after resolving symlinks
 * (/var on macOS) and Windows short names.
 *
 * @param {string} a Path
 * @param {string} b Path
 * @returns {boolean}
 */
function samePath(a, b) {
  const canonical = (p) => {
    let real;
    try {
      real = realpathSync.native(p);
    } catch (_err) {
      real = resolve(p);
    }
    return isWin ? real.toLowerCase() : real;
  };
  return Boolean(a) && Boolean(b) && canonical(a) === canonical(b);
}

/**
 * The runs a stand-in recorded, each labelled with where it started:
 * "project", "tmp" (cdxgen's temp directory) or "elsewhere". Called while
 * the scratch directory still exists, since resolving needs the paths.
 *
 * @param {string} log Stand-in log file
 * @param {Object} scratch Scratch directories of the test
 * @returns {{cwd: string, args: string, at: string}[]}
 */
function locatedRuns(log, scratch) {
  return standInRuns(log).map((run) => ({
    ...run,
    at: samePath(run.cwd, scratch.project)
      ? "project"
      : samePath(run.cwd, scratch.tmp)
        ? "tmp"
        : "elsewhere",
  }));
}

/**
 * Assert a condition. poku prints the message of passing assertions too, so
 * the detail is appended only when the assertion fails.
 *
 * @param {boolean} condition Expected to be true
 * @param {string} message What is expected
 * @param {*} detail Shown on failure
 */
function expectOk(condition, message, detail) {
  assert.ok(
    condition,
    condition
      ? message
      : `${message}\n${typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)}`,
  );
}

/**
 * Run `fn` with a scratch directory (project, bin, home and temp
 * directories), the stand-in directory first on PATH and the managed
 * variables removed. Everything is restored afterwards.
 *
 * @param {string} prefix Scratch directory prefix
 * @param {Object<string, string>|function(Object): Object<string, string>} env
 *   Extra variables for the test, or a function of the scratch returning them
 * @param {function(Object): Promise<void>} fn Test body
 */
async function withScratch(prefix, env, fn) {
  const saved = Object.fromEntries(
    MANAGED_ENV.map((name) => [name, process.env[name]]),
  );
  const root = mkdtempSync(join(tmpdir(), prefix));
  const scratch = {
    root,
    project: join(root, "project"),
    binDir: join(root, "bin"),
    home: join(root, "home"),
    tmp: join(root, "tmp"),
    printed: [],
    log(name) {
      return join(root, `${name}-runs.txt`);
    },
  };
  for (const dir of [scratch.project, scratch.binDir, scratch.home]) {
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(scratch.tmp);
  const originalLog = console.log;
  try {
    for (const name of MANAGED_ENV) {
      delete process.env[name];
    }
    process.env.PATH = [scratch.binDir, saved.PATH]
      .filter(Boolean)
      .join(delimiter);
    process.env.HOME = scratch.home;
    process.env.USERPROFILE = scratch.home;
    process.env.CDXGEN_TEMP_DIR = scratch.tmp;
    for (const [name, value] of Object.entries(
      typeof env === "function" ? env(scratch) : env,
    )) {
      process.env[name] = value;
    }
    console.log = (...args) => scratch.printed.push(args.join(" "));
    const { resetRunState } = await import("../core/runState.js");
    resetRunState();
    await fn(scratch);
  } finally {
    console.log = originalLog;
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    removeScratch(root);
  }
}

/**
 * Remove a scratch directory. On Windows a file a scan wrote can still be
 * open for a moment.
 *
 * @param {string} root Directory to remove
 */
function removeScratch(root) {
  try {
    rmSync(root, { force: true, recursive: true, maxRetries: 3 });
  } catch (err) {
    if (err?.code !== "EBUSY" && !(isWin && err?.code === "EPERM")) {
      throw err;
    }
  }
}

/**
 * `it`, or on Windows `it.skip` with the reason in the title.
 *
 * @param {string} reason Why the test cannot run on Windows
 * @returns {Function}
 */
function posixOnly(reason) {
  return isWin
    ? (title, cb) => it.skip(`${title} [skipped on Windows: ${reason}]`, cb)
    : it;
}

// f. cargo: --deep must not compile the project, and `cargo metadata` must
// start outside it, offline.

const CARGO_TOML = `[package]
name = "demo"
version = "0.1.0"
edition = "2021"

[dependencies]
itoa = "1.0.11"
`;

const CARGO_LOCK = `# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 3

[[package]]
name = "demo"
version = "0.1.0"
dependencies = [
 "itoa",
]

[[package]]
name = "itoa"
version = "1.0.11"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "49f1f14873335454500d59611f1cf4a4b0f786f9ac11f4312a78e4cf2566695b"
`;

async function scanRustProject(installDeps) {
  let result;
  await withScratch(`cdxgen-cargo-standin-${installDeps}-`, {}, async (s) => {
    writeFileSync(join(s.project, "Cargo.toml"), CARGO_TOML);
    writeFileSync(join(s.project, "Cargo.lock"), CARGO_LOCK);
    writeStandIn(s.binDir, "cargo", s.log("cargo"));
    const { createRustBom } = await import("./nativeBom.js");
    const bomNSData = await createRustBom(s.project, {
      deep: true,
      installDeps,
      projectType: ["rust"],
      specVersion: 1.6,
    });
    result = {
      runs: locatedRuns(s.log("cargo"), s),
      printed: s.printed,
      names: (bomNSData?.bomJson?.components || []).map((c) => c.name),
    };
  });
  return result;
}

await it("cargo: --deep with installs off runs no cargo check, and cargo metadata only offline outside the project", async () => {
  const { runs, printed, names } = await scanRustProject(false);
  expectOk(
    !runs.some((run) => run.args.startsWith("check")),
    "cargo check does not run",
    runs,
  );
  const metadataRuns = runs.filter((run) => run.args.startsWith("metadata"));
  expectOk(
    metadataRuns.length > 0,
    "cargo metadata is asked for the dependency kinds",
    runs,
  );
  expectOk(
    metadataRuns.every((run) => run.args.split(/\s+/).includes("--offline")),
    "every cargo metadata run is offline",
    metadataRuns,
  );
  expectOk(
    metadataRuns.every((run) => run.at === "tmp"),
    "cargo metadata starts in the temp directory, not the project",
    metadataRuns,
  );
  expectOk(
    printed.some((line) => line.includes("Skipping 'cargo check'")),
    "the skip is reported",
    printed,
  );
  expectOk(names.includes("itoa"), "Cargo.lock still yields itoa", names);
});

await it("cargo: --deep with installs on runs cargo check in the project (positive control)", async () => {
  const { runs } = await scanRustProject(true);
  expectOk(
    runs.some((run) => run.args.startsWith("check") && run.at === "project"),
    "the stand-in cargo runs check from the project",
    runs,
  );
});

// g. bundle: collecting gem module names runs `bundle exec ruby`, which
// evaluates the Gemfile. The module-name script is passed to bundle as an
// argument containing `|`, which safeSpawnSync refuses to hand to cmd.exe, so
// on Windows the stand-in can never run and the positive control cannot hold.

const GEMFILE = `source "https://rubygems.org"
gem "rake"
`;

const GEMFILE_LOCK = `GEM
  remote: https://rubygems.org/
  specs:
    rake (13.2.1)

PLATFORMS
  ruby

DEPENDENCIES
  rake

BUNDLED WITH
   2.5.10
`;

const RAKE_GEMSPEC = `# -*- encoding: utf-8 -*-
Gem::Specification.new do |s|
  s.name = "rake".freeze
  s.version = "13.2.1".freeze
  s.summary = "Rake is a Make-like program implemented in Ruby".freeze
  s.licenses = ["MIT".freeze]
end
`;

async function scanRubyProject(installDeps) {
  let result;
  await withScratch(
    `cdxgen-bundle-standin-${installDeps}-`,
    (s) => {
      const gemHome = join(s.root, "gemhome");
      mkdirSync(join(gemHome, "specifications"), { recursive: true });
      writeFileSync(
        join(gemHome, "specifications", "rake-13.2.1.gemspec"),
        RAKE_GEMSPEC,
      );
      return {
        CDXGEN_GEM_HOME: gemHome,
        CDXGEN_BUNDLE_CMD: writeStandIn(s.binDir, "bundle", s.log("bundle")),
      };
    },
    async (s) => {
      writeFileSync(join(s.project, "Gemfile"), GEMFILE);
      writeFileSync(join(s.project, "Gemfile.lock"), GEMFILE_LOCK);
      const { createRubyBom } = await import("./managedBom.js");
      await createRubyBom(s.project, {
        deep: true,
        installDeps,
        projectType: ["ruby"],
        specVersion: 1.6,
      });
      result = { runs: standInRuns(s.log("bundle")), printed: s.printed };
    },
  );
  return result;
}

const rubyIt = posixOnly(
  "bundle runs through cmd.exe with a module-name script containing '|', which safeSpawnSync blocks, so the stand-in is unreachable",
);

await rubyIt(
  "bundle: --deep with installs off does not run bundle exec despite a populated CDXGEN_GEM_HOME",
  async () => {
    const { runs, printed } = await scanRubyProject(false);
    expectOk(runs.length === 0, "bundle does not run", runs);
    expectOk(
      printed.some((line) =>
        line.includes("Skipping the module names of gems"),
      ),
      "the skip is reported",
      printed,
    );
  },
);

await rubyIt(
  "bundle: --deep with installs on runs bundle exec (positive control)",
  async () => {
    const { runs } = await scanRubyProject(true);
    expectOk(
      runs.some((run) => run.args.startsWith("exec ruby")),
      "the stand-in bundle runs exec ruby",
      runs,
    );
  },
);

// h. swift: pregen's `swift package resolve` runs Package.swift.

const PACKAGE_SWIFT = `// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "Demo",
  targets: [.executableTarget(name: "Demo")]
)
`;

async function prepareSwiftProject(installDeps) {
  let result;
  await withScratch(`cdxgen-swift-standin-${installDeps}-`, {}, async (s) => {
    writeFileSync(join(s.project, "Package.swift"), PACKAGE_SWIFT);
    writeStandIn(s.binDir, "swift", s.log("swift"));
    const { prepareSwiftEnv } = await import("../stages/pregen/pregen.js");
    prepareSwiftEnv(s.project, {
      deep: true,
      installDeps,
      projectType: ["swift"],
    });
    result = { runs: locatedRuns(s.log("swift"), s) };
  });
  return result;
}

await it("swift: pregen with installs off does not run swift package resolve", async () => {
  const { runs } = await prepareSwiftProject(false);
  expectOk(runs.length === 0, "swift does not run", runs);
});

await it("swift: pregen with installs on runs swift package resolve (positive control)", async () => {
  const { runs } = await prepareSwiftProject(true);
  expectOk(
    runs.some(
      (run) =>
        run.args.includes("package") &&
        run.args.includes("resolve") &&
        run.at === "project",
    ),
    "the stand-in swift resolves the package from the project",
    runs,
  );
});

// i. pod: a Ruby podspec of a local pod is a program; a JSON one is data.

const LOCAL_PODFILE = `platform :ios, '14.0'

target 'App' do
  pod 'LocalPod', :path => 'LocalPod'
end
`;

const LOCAL_PODFILE_LOCK = `PODS:
  - LocalPod (0.1.0)

DEPENDENCIES:
  - LocalPod (from \`LocalPod\`)

EXTERNAL SOURCES:
  LocalPod:
    :path: LocalPod

SPEC CHECKSUMS:
  LocalPod: 0e6e89a6fa191b17223c9ec6f5d0c0f0882c209c

PODFILE CHECKSUM: 4c8ad2b0e0a1f1e2f2e04a1d5b7c4d8a83b0b1f0

COCOAPODS: 1.15.2
`;

const LOCAL_PODSPEC = `Pod::Spec.new do |s|
  s.name = 'LocalPod'
  s.version = '0.1.0'
  s.license = { :type => 'MIT' }
  s.summary = 'A local pod'
  s.source = { :path => '.' }
end
`;

const LOCAL_PODSPEC_JSON = JSON.stringify({
  name: "LocalPod",
  version: "0.1.0",
  license: { type: "MIT" },
  summary: "A local pod",
  source: { path: "." },
});

/**
 * Scan a CocoaPods project whose only pod is a local one with the given
 * podspec, using the default COCOA_FULL_SCAN.
 *
 * @param {boolean} installDeps Scan option
 * @param {string} podspecName LocalPod.podspec or LocalPod.podspec.json
 * @param {string} podspec Podspec content
 */
async function scanLocalPod(installDeps, podspecName, podspec) {
  let result;
  await withScratch(
    `cdxgen-pod-standin-${installDeps}-`,
    // With replacements configured, a run with tooling allowed copies a Ruby
    // podspec to <uuid>.podspec beside the original before `pod ipc spec`.
    { COCOA_PODSPEC_REPLACEMENTS: "A local pod=A local pod" },
    async (s) => {
      mkdirSync(join(s.project, "LocalPod"));
      writeFileSync(join(s.project, "Podfile"), LOCAL_PODFILE);
      writeFileSync(join(s.project, "Podfile.lock"), LOCAL_PODFILE_LOCK);
      writeFileSync(join(s.project, "LocalPod", podspecName), podspec);
      writeStandIn(s.binDir, "pod", s.log("pod"));
      const { createCocoaBom } = await import("./nativeBom.js");
      const bomNSData = await createCocoaBom(s.project, {
        installDeps,
        projectType: ["cocoa"],
        specVersion: 1.6,
      });
      result = {
        runs: standInRuns(s.log("pod")),
        printed: s.printed,
        podDirFiles: readdirSync(join(s.project, "LocalPod")),
        localPod: (bomNSData?.bomJson?.components || []).find(
          (c) => c.name === "LocalPod",
        ),
      };
    },
  );
  return result;
}

await it("pod: installs off never runs pod ipc spec on a local Ruby podspec, nor copies it", async () => {
  const { runs, printed, podDirFiles, localPod } = await scanLocalPod(
    false,
    "LocalPod.podspec",
    LOCAL_PODSPEC,
  );
  expectOk(
    !runs.some((run) => run.args.startsWith("ipc spec")),
    "pod ipc spec does not run",
    runs,
  );
  expectOk(
    podDirFiles.length === 1 && podDirFiles[0] === "LocalPod.podspec",
    "no podspec copy appears beside the original",
    podDirFiles,
  );
  expectOk(
    printed.some((line) => line.includes("Skipping 'pod ipc spec'")),
    "the skip is reported",
    printed,
  );
  expectOk(Boolean(localPod), "the locked pod is kept", localPod);
});

await it("pod: installs off reads a local JSON podspec without pod", async () => {
  const { runs, localPod } = await scanLocalPod(
    false,
    "LocalPod.podspec.json",
    LOCAL_PODSPEC_JSON,
  );
  expectOk(runs.length === 0, "pod does not run", runs);
  expectOk(
    localPod?.licenses?.some(
      (l) => l.license?.id === "MIT" || l.license?.name === "MIT",
    ),
    "the license comes from the JSON podspec",
    localPod,
  );
});

await it("pod: installs on runs pod ipc spec on the Ruby podspec (positive control)", async () => {
  const { runs } = await scanLocalPod(true, "LocalPod.podspec", LOCAL_PODSPEC);
  // On the copy the replacements produced, which the negative test checks for
  expectOk(
    runs.some(
      (run) =>
        run.args.startsWith("ipc spec") &&
        /[0-9a-f-]{36}\.podspec"?$/.test(run.args),
    ),
    "the stand-in pod runs ipc spec on a <uuid>.podspec copy",
    runs,
  );
});

// j. evinse: cataloguing Maven jars runs `mvn dependency:copy-dependencies`.

const POM =
  "<project><modelVersion>4.0.0</modelVersion><groupId>org.example</groupId><artifactId>demo</artifactId><version>1.0.0</version><dependencies><dependency><groupId>com.example</groupId><artifactId>demo-lib</artifactId><version>1.0.0</version></dependency></dependencies></project>";

async function catalogMavenProject(installDeps) {
  let result;
  await withScratch(`cdxgen-evinse-mvn-${installDeps}-`, {}, async (s) => {
    mkdirSync(join(s.project, ".mvn"));
    writeFileSync(join(s.project, "pom.xml"), POM);
    writeFileSync(
      join(s.project, ".mvn", "jvm.config"),
      "-javaagent:.mvn/agent.jar\n",
    );
    writeStandIn(s.binDir, "mvn", s.log("mvn"));
    const stored = [];
    const Namespaces = {
      async findOrCreate(query) {
        stored.push(query);
        return [query, true];
      },
    };
    const { catalogMavenDeps } = await import("../evinser/evinser.js");
    await catalogMavenDeps(s.project, {}, Namespaces, { installDeps });
    result = { runs: locatedRuns(s.log("mvn"), s) };
  });
  return result;
}

await it("evinse: catalogMavenDeps with installs off does not run mvn", async () => {
  const { runs } = await catalogMavenProject(false);
  expectOk(runs.length === 0, "mvn does not run", runs);
});

await it("evinse: catalogMavenDeps with installs on runs mvn (positive control)", async () => {
  const { runs } = await catalogMavenProject(true);
  expectOk(
    runs.some(
      (run) =>
        run.args.includes("dependency:copy-dependencies") &&
        run.at === "project",
    ),
    "the stand-in mvn copies dependencies from the project",
    runs,
  );
});

// k. formulation probes: version managers pick the toolchain from files in
// the working directory, so with installs off the probes start elsewhere.
// The other probes (java, python, node, ...) run the host's real tools.

async function probeToolchains(installDeps) {
  let result;
  await withScratch(`cdxgen-envinfo-${installDeps}-`, {}, async (s) => {
    writeStandIn(s.binDir, "dotnet", s.log("dotnet"));
    const { collectEnvInfo } = await import("../inventory/envcontext.js");
    collectEnvInfo(s.project, { installDeps });
    result = { runs: locatedRuns(s.log("dotnet"), s) };
  });
  return result;
}

await it("formulation: collectEnvInfo with installs off probes dotnet outside the project", async () => {
  const { runs } = await probeToolchains(false);
  expectOk(runs.length > 0, "the stand-in dotnet is probed", runs);
  expectOk(
    runs.every((run) => run.at === "tmp"),
    "dotnet starts in the temp directory, not the project",
    runs,
  );
});

await it("formulation: collectEnvInfo with installs on probes dotnet in the project (positive control)", async () => {
  const { runs } = await probeToolchains(true);
  expectOk(
    runs.length > 0 && runs.every((run) => run.at === "project"),
    "dotnet starts in the project",
    runs,
  );
});
