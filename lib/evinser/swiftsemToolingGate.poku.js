/**
 * Tests that Swift evidence generation skips the SwiftPM manifest evaluation
 * (`swift package dump-package`) and the verbose build when dependency
 * installation is disabled: a SwiftPM manifest is a Swift program and the
 * build compiles the project, so both belong to the gated project-tooling
 * surface (issue #4527). A stand-in swift records every invocation.
 */
import {
  chmodSync,
  existsSync,
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

import { resetRunState } from "../core/runState.js";

const ENV_NAMES = ["PATH", "HOME", "SWIFT_CMD", "CDXGEN_INTROSPECT"];

const PACKAGE_SWIFT = `// swift-tools-version:5.9
import PackageDescription
import Foundation

FileHandle.standardError.write("SWIFT_MANIFEST_RAN\\n".data(using: .utf8)!)

let package = Package(name: "Demo", targets: [.executableTarget(name: "Demo")])
`;

/**
 * Run Swift semantics slicing over a fixture with a stand-in swift on PATH.
 *
 * @param {Object} options Options passed to createSemanticsSlices.
 * @returns {Promise<string[]>} the stand-in invocations that evaluate the
 *   manifest or build the project.
 */
async function sliceWithStandInSwift(options) {
  const saved = Object.fromEntries(ENV_NAMES.map((n) => [n, process.env[n]]));
  const root = mkdtempSync(join(tmpdir(), "cdxgen-swiftsem-gate-"));
  const project = join(root, "project");
  const binDir = join(root, "bin");
  mkdirSync(join(project, "Sources", "Demo"), { recursive: true });
  mkdirSync(binDir);
  writeFileSync(join(project, "Package.swift"), PACKAGE_SWIFT);
  writeFileSync(
    join(project, "Sources", "Demo", "main.swift"),
    'import Foundation\nprint("hello")\n',
  );
  const fakeSwift = join(binDir, "swift");
  const argsLog = join(root, "swift-args.log");
  writeFileSync(
    fakeSwift,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(argsLog)}\nexit 1\n`,
  );
  chmodSync(fakeSwift, 0o755);
  try {
    for (const name of ENV_NAMES) {
      delete process.env[name];
    }
    process.env.PATH = [binDir, saved.PATH].filter(Boolean).join(delimiter);
    process.env.HOME = join(root, "home");
    mkdirSync(process.env.HOME);
    resetRunState();
    const { createSemanticsSlices } = await import("./swiftsem.js");
    createSemanticsSlices(project, options);
    // Toolchain probes such as `swift --version` are fine; what the gate must
    // stop is the manifest evaluation (`swift package dump-package`) and the
    // project build (`swift build`).
    const invocations = existsSync(argsLog)
      ? readFileSync(argsLog, "utf-8").split("\n").filter(Boolean)
      : [];
    return invocations.filter(
      (line) => line.includes("dump-package") || line.includes("build"),
    );
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    resetRunState();
    rmSync(root, { force: true, recursive: true });
  }
}

await it("skips dump-package and the build when dependency installation is disabled", async () => {
  if (process.platform === "win32") {
    // The stand-in is a POSIX shell script.
    return;
  }
  const ran = await sliceWithStandInSwift({ installDeps: false });
  assert.deepStrictEqual(
    ran,
    [],
    "swift evaluated the manifest or built the project even though dependency installation is disabled",
  );
});

await it("still evaluates the manifest when dependency installation is enabled", async () => {
  if (process.platform === "win32") {
    return;
  }
  const ran = await sliceWithStandInSwift({ installDeps: true });
  assert.ok(
    ran.some((line) => line.includes("dump-package")),
    "the stand-in swift never evaluated the manifest",
  );
});
