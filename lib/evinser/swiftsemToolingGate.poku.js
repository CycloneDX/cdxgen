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
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import process from "node:process";

import { assert, it } from "poku";

import { resetRunState } from "../core/runState.js";

const ENV_NAMES = [
  "PATH",
  "HOME",
  "SWIFT_CMD",
  "CDXGEN_INTROSPECT",
  "CDXGEN_SECURE_MODE",
];

// cdxgen spawns swift without a shell, so on Windows only a real executable
// could stand in for it.
const posixOnly = process.platform === "win32" ? it.skip : it;

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
 * @returns {Promise<{project: string, runs: {cwd: string, args: string}[]}>}
 *   every stand-in invocation with its working directory
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
    `#!/bin/sh\nprintf '%s\\t%s\\n' "$PWD" "$*" >> ${JSON.stringify(argsLog)}\nexit 1\n`,
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
    const runs = (
      existsSync(argsLog) ? readFileSync(argsLog, "utf-8").split("\n") : []
    )
      .filter(Boolean)
      .map((line) => {
        const [cwd, ...args] = line.split("\t");
        return { cwd, args: args.join("\t") };
      });
    return { project: realpathSync(project), runs };
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

await posixOnly(
  "skips dump-package and the build when dependency installation is disabled",
  async () => {
    const { project, runs } = await sliceWithStandInSwift({
      installDeps: false,
    });
    assert.deepStrictEqual(
      runs.filter(
        (run) =>
          run.args.includes("dump-package") || run.args.includes("build"),
      ),
      [],
      "swift evaluated the manifest or built the project even though dependency installation is disabled",
    );
    // swiftly picks a toolchain from the project's .swift-version, so even the
    // toolchain probe runs outside the project.
    assert.deepStrictEqual(
      runs.filter((run) => run.cwd === project),
      [],
      `swift ran inside the project: ${JSON.stringify(runs)}`,
    );
  },
);

await posixOnly(
  "still evaluates the manifest and builds when dependency installation is enabled",
  async () => {
    const { runs } = await sliceWithStandInSwift({ installDeps: true });
    assert.ok(
      runs.some((run) => run.args.includes("dump-package")),
      "the stand-in swift never evaluated the manifest",
    );
    assert.ok(
      runs.some((run) => run.args.includes("build")),
      "the stand-in swift never built the project",
    );
  },
);
