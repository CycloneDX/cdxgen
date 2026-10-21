/**
 * Tests that scans with dependency installation disabled never start the
 * project's own build tooling for Swift (a SwiftPM manifest is a Swift
 * program, and show-dependencies also fetches missing packages), Clojure
 * (`lein deps :tree-data` evaluates project.clj) and CocoaPods (`pod ipc
 * podfile-json` evaluates the Podfile). The fixtures mirror the marker-file
 * reproducers of issue #4527; stand-ins on PATH record every invocation.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
  "SWIFT_CMD",
  "LEIN_CMD",
  "COCOA_INCLUDED_TARGETS",
  "COCOA_EXCLUDED_TARGETS",
  "COCOA_FULL_SCAN",
  "COCOA_RESOLVE_FROM_NODE",
  "COCOA_MERGE_SUBSPECS",
  "CDXGEN_INTROSPECT",
  "CDXGEN_INTROSPECT_LEDGER",
  "FETCH_LICENSE",
];

const PACKAGE_SWIFT = `// swift-tools-version:5.9
import PackageDescription
import Foundation

FileHandle.standardError.write("SWIFT_MANIFEST_RAN\\n".data(using: .utf8)!)

let package = Package(
  name: "Demo",
  dependencies: [
    .package(url: "https://github.com/apple/swift-argument-parser", from: "1.3.0")
  ],
  targets: [.executableTarget(name: "Demo")]
)
`;

const PACKAGE_RESOLVED = `{
  "pins": [
    {
      "identity": "swift-argument-parser",
      "kind": "remoteSourceControl",
      "location": "https://github.com/apple/swift-argument-parser",
      "state": {
        "revision": "c8ed701b513cf5177118a175d85fbbbcd707ab41",
        "version": "1.3.0"
      }
    }
  ],
  "version": 2
}
`;

const PROJECT_CLJ = `(defproject demo "1.0.0"
  :description "Demo project"
  :dependencies [[org.clojure/clojure "1.11.1"]
                 [ring/ring-core "1.10.0"]])
`;

const PODFILE = `platform :ios, '14.0'

target 'App' do
  pod 'Alamofire', '~> 5.6'
end
`;

const PODFILE_LOCK = `PODS:
  - Alamofire (5.6.4)

DEPENDENCIES:
  - Alamofire (~> 5.6)

SPEC REPOS:
  trunk:
    - Alamofire

SPEC CHECKSUMS:
  Alamofire: 0e6e89a6fa191b17223c9ec6f5d0c0f0882c209c

PODFILE CHECKSUM: 4c8ad2b0e0a1f1e2f2e04a1d5b7c4d8a83b0b1f0

COCOAPODS: 1.15.2
`;

/**
 * Write a stand-in executable that records its invocation into a marker file.
 *
 * @param {string} binDir Directory to place the tool in.
 * @param {string} name Tool file name.
 * @param {string} marker Marker file the tool writes on invocation.
 * @param {string} [extraSh] Extra shell run after the marker write (e.g. to
 *   answer a command with recorded output).
 */
function writeFakeTool(binDir, name, marker, extraSh = "") {
  const tool = join(binDir, name);
  writeFileSync(
    tool,
    `#!/bin/sh\nprintf 'ran\\n' > ${JSON.stringify(marker)}\n${extraSh}`,
  );
  chmodSync(tool, 0o755);
}

/**
 * Create the scratch root with a bin directory and a saved environment.
 *
 * @param {string} stem Temp directory stem.
 * @returns {{root: string, binDir: string, saved: Object, printed: string[], hookConsole: Function, restoreConsole: Function, applyEnv: Function, restoreEnv: Function, marker: Function}}
 */
function setupScratch(stem) {
  const root = mkdtempSync(join(tmpdir(), stem));
  const binDir = join(root, "bin");
  const emptyHome = join(root, "home");
  mkdirSync(binDir);
  mkdirSync(emptyHome);
  const saved = Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n]]));
  const printed = [];
  const originalLog = console.log;
  return {
    root,
    binDir,
    saved,
    printed,
    hookConsole() {
      console.log = (...args) => printed.push(args.join(" "));
    },
    restoreConsole() {
      console.log = originalLog;
    },
    applyEnv() {
      for (const name of ENV_NAMES) {
        delete process.env[name];
      }
      process.env.PATH = [binDir, saved.PATH].filter(Boolean).join(delimiter);
      process.env.HOME = emptyHome;
      // Keep the CocoaPods metadata flow off the network and off pod itself.
      process.env.COCOA_FULL_SCAN = "false";
      process.env.CDXGEN_INTROSPECT_LEDGER = join(root, "ledger.jsonl");
    },
    restoreEnv() {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    },
    marker(name) {
      return join(root, name);
    },
  };
}

await it("does not evaluate the SwiftPM manifest with --no-install-deps and keeps Package.resolved packages", async () => {
  if (process.platform === "win32") {
    // The stand-ins are POSIX shell scripts.
    return;
  }
  const scratch = setupScratch("cdxgen-swift-gate-");
  const project = join(scratch.root, "project");
  mkdirSync(join(project, "Sources", "Demo"), { recursive: true });
  writeFileSync(join(project, "Package.swift"), PACKAGE_SWIFT);
  writeFileSync(join(project, "Package.resolved"), PACKAGE_RESOLVED);
  writeFileSync(
    join(project, "Sources", "Demo", "main.swift"),
    'print("hello")\n',
  );
  writeFakeTool(scratch.binDir, "swift", scratch.marker("swift-ran"));
  try {
    scratch.applyEnv();
    scratch.hookConsole();
    resetRunState();
    resetLedgerEvents();
    const { createSwiftBom } = await import("./nativeBom.js");
    const bomNSData = await createSwiftBom(project, {
      installDeps: false,
      projectType: ["swift"],
      specVersion: 1.6,
    });
    assert.strictEqual(
      existsSync(scratch.marker("swift-ran")),
      false,
      "swift started even though dependency installation is disabled",
    );
    assert.ok(
      scratch.printed.some((line) =>
        line.includes(
          "Skipping 'swift package show-dependencies' since dependency installation is disabled",
        ),
      ),
      `expected a skip message, printed: ${scratch.printed.join(" | ")}`,
    );
    assert.ok(
      getLedgerEvents().some(
        (event) => event.remediationId === "swift.tooling-disabled",
      ),
      "expected a swift.tooling-disabled degradation event",
    );
    const pins = (bomNSData?.bomJson?.components || []).map((c) => c.name);
    assert.ok(
      pins.includes("swift-argument-parser"),
      `the Package.resolved pin is missing from ${pins}`,
    );
  } finally {
    scratch.restoreConsole();
    scratch.restoreEnv();
    resetRunState();
    resetLedgerEvents();
    rmSync(scratch.root, { force: true, recursive: true });
  }
});

await it("still evaluates the SwiftPM manifest when dependency installation is enabled", async () => {
  if (process.platform === "win32") {
    return;
  }
  const scratch = setupScratch("cdxgen-swift-control-");
  const project = join(scratch.root, "project");
  mkdirSync(join(project, "Sources", "Demo"), { recursive: true });
  writeFileSync(join(project, "Package.swift"), PACKAGE_SWIFT);
  writeFileSync(
    join(project, "Sources", "Demo", "main.swift"),
    'print("hello")\n',
  );
  writeFakeTool(scratch.binDir, "swift", scratch.marker("swift-ran"));
  try {
    scratch.applyEnv();
    resetRunState();
    const { createSwiftBom } = await import("./nativeBom.js");
    await createSwiftBom(project, {
      installDeps: true,
      projectType: ["swift"],
      specVersion: 1.6,
    });
    assert.strictEqual(
      existsSync(scratch.marker("swift-ran")),
      true,
      "the stand-in swift was never invoked",
    );
  } finally {
    scratch.restoreEnv();
    resetRunState();
    rmSync(scratch.root, { force: true, recursive: true });
  }
});

await it("does not evaluate project.clj with --no-install-deps and keeps its declared dependencies", async () => {
  if (process.platform === "win32") {
    return;
  }
  const scratch = setupScratch("cdxgen-lein-gate-");
  const project = join(scratch.root, "project");
  mkdirSync(project);
  writeFileSync(join(project, "project.clj"), PROJECT_CLJ);
  writeFakeTool(scratch.binDir, "lein", scratch.marker("lein-ran"));
  try {
    scratch.applyEnv();
    scratch.hookConsole();
    resetRunState();
    resetLedgerEvents();
    const { createClojureBom } = await import("./nativeBom.js");
    const bomNSData = await createClojureBom(project, {
      installDeps: false,
      projectType: ["clojure"],
      specVersion: 1.6,
    });
    assert.strictEqual(
      existsSync(scratch.marker("lein-ran")),
      false,
      "lein started even though dependency installation is disabled",
    );
    assert.ok(
      scratch.printed.some((line) =>
        line.includes(
          "Skipping 'lein deps :tree-data' since dependency installation is disabled",
        ),
      ),
      `expected a skip message, printed: ${scratch.printed.join(" | ")}`,
    );
    assert.ok(
      getLedgerEvents().some(
        (event) => event.remediationId === "clojure.lein.tooling-disabled",
      ),
      "expected a clojure.lein.tooling-disabled degradation event",
    );
    const clojure = (bomNSData?.bomJson?.components || []).find(
      (c) => c.name === "clojure",
    );
    assert.ok(clojure, "the declared clojure dependency is missing");
    assert.strictEqual(clojure.version, "1.11.1");
    const ring = (bomNSData?.bomJson?.components || []).find(
      (c) => c.name === "ring-core",
    );
    assert.ok(ring, "the declared ring-core dependency is missing");
  } finally {
    scratch.restoreConsole();
    scratch.restoreEnv();
    resetRunState();
    resetLedgerEvents();
    rmSync(scratch.root, { force: true, recursive: true });
  }
});

await it("does not evaluate the Podfile for target filtering with --no-install-deps and keeps every locked pod", async () => {
  if (process.platform === "win32") {
    return;
  }
  const scratch = setupScratch("cdxgen-cocoa-gate-");
  const project = join(scratch.root, "project");
  mkdirSync(project);
  writeFileSync(join(project, "Podfile"), PODFILE);
  writeFileSync(join(project, "Podfile.lock"), PODFILE_LOCK);
  writeFakeTool(scratch.binDir, "pod", scratch.marker("pod-ran"));
  try {
    scratch.applyEnv();
    // Target configuration is what reaches `pod ipc podfile-json`.
    process.env.COCOA_INCLUDED_TARGETS = "App";
    scratch.hookConsole();
    resetRunState();
    resetLedgerEvents();
    const { createCocoaBom } = await import("./nativeBom.js");
    const bomNSData = await createCocoaBom(project, {
      deep: false,
      failOnError: false,
      installDeps: false,
      multiProject: false,
      projectType: ["cocoa"],
      specVersion: 1.6,
    });
    assert.strictEqual(
      existsSync(scratch.marker("pod-ran")),
      false,
      "pod started even though dependency installation is disabled",
    );
    assert.ok(
      scratch.printed.some((line) =>
        line.includes(
          "Skipping 'pod ipc podfile-json' since dependency installation is disabled",
        ),
      ),
      `expected a skip message, printed: ${scratch.printed.join(" | ")}`,
    );
    assert.ok(
      getLedgerEvents().some(
        (event) =>
          event.remediationId === "cocoa.podfile-json.tooling-disabled",
      ),
      "expected a cocoa.podfile-json.tooling-disabled degradation event",
    );
    const names = (bomNSData?.bomJson?.components || []).map((c) => c.name);
    assert.ok(
      names.includes("Alamofire"),
      `the locked Alamofire pod is missing from ${names}`,
    );
  } finally {
    scratch.restoreConsole();
    scratch.restoreEnv();
    resetRunState();
    resetLedgerEvents();
    rmSync(scratch.root, { force: true, recursive: true });
  }
});

await it("still evaluates the Podfile for target filtering when dependency installation is enabled", async () => {
  if (process.platform === "win32") {
    return;
  }
  const scratch = setupScratch("cdxgen-cocoa-control-");
  const project = join(scratch.root, "project");
  mkdirSync(project);
  writeFileSync(join(project, "Podfile"), PODFILE);
  writeFileSync(join(project, "Podfile.lock"), PODFILE_LOCK);
  writeFakeTool(
    scratch.binDir,
    "pod",
    scratch.marker("pod-ran"),
    `case "$*" in
      *ipc\\ podfile-json*) echo '{"target_definitions":[{"name":"Pods","children":[{"name":"App","dependencies":["Alamofire"]}]}]}';;
      *) echo "";;
    esac
    exit 0
    `,
  );
  try {
    scratch.applyEnv();
    process.env.COCOA_INCLUDED_TARGETS = "App";
    resetRunState();
    const { createCocoaBom } = await import("./nativeBom.js");
    const bomNSData = await createCocoaBom(project, {
      deep: false,
      failOnError: false,
      installDeps: true,
      multiProject: false,
      projectType: ["cocoa"],
      specVersion: 1.6,
    });
    assert.strictEqual(
      existsSync(scratch.marker("pod-ran")),
      true,
      "the stand-in pod was never invoked",
    );
    const names = (bomNSData?.bomJson?.components || []).map((c) => c.name);
    assert.ok(
      names.includes("Alamofire"),
      `Alamofire missing from the filtered targets: ${names}`,
    );
  } finally {
    scratch.restoreEnv();
    resetRunState();
    rmSync(scratch.root, { force: true, recursive: true });
  }
});

await it("honours COCOA_EXCLUDED_TARGETS alone (no included list) with installs enabled", async () => {
  if (process.platform === "win32") {
    return;
  }
  // Only the exclusion list is configured here. The include list is unset, so
  // target selection comes from the targets the Podfile resolved.
  const scratch = setupScratch("cdxgen-cocoa-excluded-");
  const project = join(scratch.root, "project");
  mkdirSync(project);
  writeFileSync(join(project, "Podfile"), PODFILE);
  writeFileSync(join(project, "Podfile.lock"), PODFILE_LOCK);
  writeFakeTool(
    scratch.binDir,
    "pod",
    scratch.marker("pod-ran"),
    `case "$*" in
      *ipc\\ podfile-json*) echo '{"target_definitions":[{"name":"Pods","children":[{"name":"App","dependencies":["Alamofire"]},{"name":"AppTests","dependencies":[]}]}]}';;
      *) echo "";;
    esac
    exit 0
    `,
  );
  try {
    scratch.applyEnv();
    process.env.COCOA_EXCLUDED_TARGETS = "AppTests";
    resetRunState();
    const { createCocoaBom } = await import("./nativeBom.js");
    const bomNSData = await createCocoaBom(project, {
      deep: false,
      failOnError: false,
      installDeps: true,
      multiProject: false,
      projectType: ["cocoa"],
      specVersion: 1.6,
    });
    assert.strictEqual(existsSync(scratch.marker("pod-ran")), true);
    const names = (bomNSData?.bomJson?.components || []).map((c) => c.name);
    assert.ok(
      names.includes("Alamofire"),
      `the kept target's pod is missing: ${names}`,
    );
  } finally {
    scratch.restoreEnv();
    resetRunState();
    rmSync(scratch.root, { force: true, recursive: true });
  }
});

await it("keeps every locked pod when pod ipc prints nothing usable", async () => {
  if (process.platform === "win32") {
    return;
  }
  // CocoaPods refuses to run as root and prints nothing on stdout; the scan
  // used to die on JSON.parse of the empty string.
  const scratch = setupScratch("cdxgen-cocoa-unparseable-");
  const project = join(scratch.root, "project");
  mkdirSync(project);
  writeFileSync(join(project, "Podfile"), PODFILE);
  writeFileSync(join(project, "Podfile.lock"), PODFILE_LOCK);
  writeFakeTool(scratch.binDir, "pod", scratch.marker("pod-ran"));
  try {
    scratch.applyEnv();
    process.env.COCOA_INCLUDED_TARGETS = "App";
    resetRunState();
    const { createCocoaBom } = await import("./nativeBom.js");
    const bomNSData = await createCocoaBom(project, {
      deep: false,
      failOnError: false,
      installDeps: true,
      multiProject: false,
      projectType: ["cocoa"],
      specVersion: 1.6,
    });
    const names = (bomNSData?.bomJson?.components || []).map((c) => c.name);
    assert.ok(
      names.includes("Alamofire"),
      `the locked pod was lost to the unparseable Podfile output: ${names}`,
    );
  } finally {
    scratch.restoreEnv();
    resetRunState();
    rmSync(scratch.root, { force: true, recursive: true });
  }
});
