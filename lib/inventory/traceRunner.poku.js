import { assert, describe, it } from "poku";

import {
  engineMessages,
  executeAndTrace,
  isSaferExecAvailable,
  parseCommand,
  resolveSaferExecBinary,
} from "./traceRunner.js";

// A SaferExec stand-in whose fluent methods all chain, and whose run()
// resolves to the given result.
function fakeSaferExec(result) {
  const chain = new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === "run" ? async () => result : () => chain,
    },
  );
  // `new SaferExec()` yields the object a constructor function returns.
  return function SaferExec() {
    return chain;
  };
}

describe("traceRunner", () => {
  it("parses simple command string", () => {
    const parsed = parseCommand("node app.js");
    assert.strictEqual(parsed.cmd, "node");
    assert.deepEqual(parsed.args, ["app.js"]);
  });

  it("parses command string with double quotes", () => {
    const parsed = parseCommand('node "my app.js" --arg1');
    assert.strictEqual(parsed.cmd, "node");
    assert.deepEqual(parsed.args, ["my app.js", "--arg1"]);
  });

  it("parses command string with single quotes", () => {
    const parsed = parseCommand("node 'my app.js' --arg1");
    assert.strictEqual(parsed.cmd, "node");
    assert.deepEqual(parsed.args, ["my app.js", "--arg1"]);
  });

  it("returns undefined cmd for empty string", () => {
    const parsed = parseCommand("");
    assert.strictEqual(parsed.cmd, undefined);
    assert.deepEqual(parsed.args, []);
  });

  it("handles multiple spaces between tokens", () => {
    const parsed = parseCommand("node    app.js   --verbose");
    assert.strictEqual(parsed.cmd, "node");
    assert.deepEqual(parsed.args, ["app.js", "--verbose"]);
  });

  it("handles argument with = sign", () => {
    const parsed = parseCommand("node --flag=value app.js");
    assert.strictEqual(parsed.cmd, "node");
    assert.deepEqual(parsed.args, ["--flag=value", "app.js"]);
  });
});

describe("safer-exec availability", () => {
  it("reports the tracing runtime as available in a healthy install", () => {
    assert.strictEqual(typeof isSaferExecAvailable(), "boolean");
    // @cdxgen/safer-exec is an optional dependency; the test environments
    // install it, so the runtime must load.
    assert.strictEqual(isSaferExecAvailable(), true);
  });

  it("resolves the platform payload binary on supported platforms", () => {
    const binPath = resolveSaferExecBinary();
    assert.ok(binPath, "expected the safer-exec payload to resolve");
    const expected =
      process.platform === "win32" ? "safer-exec-rt.exe" : "safer-exec-rt";
    assert.ok(
      binPath.endsWith(expected),
      `unexpected payload path: ${binPath}`,
    );
  });

  it("resolves the Windows payload next to its MXC executor", async () => {
    const esmock = (await import("esmock")).default;
    const { join } = await import("node:path");
    const seen = [];
    const { resolveSaferExecBinary: resolveOnWindows } = await esmock(
      "./traceRunner.js",
      {
        "node:os": { platform: () => "win32", arch: () => "arm64" },
        "node:fs": {
          existsSync: (p) => {
            seen.push(p);
            return p.endsWith(
              join("safer-exec-windows-arm64", "bin", "safer-exec-rt.exe"),
            );
          },
          realpathSync: (p) => p,
          chmodSync: () => {
            throw new Error("chmod must not run on Windows");
          },
        },
      },
    );
    const binPath = resolveOnWindows();
    assert.ok(binPath, `nothing resolved; probed ${seen.join(", ")}`);
    assert.ok(
      binPath.endsWith(
        join("safer-exec-windows-arm64", "bin", "safer-exec-rt.exe"),
      ),
    );
  });

  it("rejects executeAndTrace instead of returning an empty result when the runtime is missing", async () => {
    const esmock = (await import("esmock")).default;
    const { executeAndTrace: executeAndTraceWithoutRuntime } = await esmock(
      "./traceRunner.js",
      {
        "@cdxgen/safer-exec": { SaferExec: undefined },
      },
    );
    await assert.rejects(
      () => executeAndTraceWithoutRuntime("echo hello"),
      /@cdxgen\/safer-exec/,
    );
  });

  it("returns an empty result without throwing for an empty command", async () => {
    assert.deepEqual(await executeAndTrace(""), {
      libPaths: [],
      httpAccessEntries: [],
    });
  });
});

describe("engine messages", () => {
  it("separates engine warnings from the error that stopped the run", () => {
    const { warnings, error } = engineMessages(
      [
        "npm warn deprecated left-pad",
        "safer-exec: warning: not enforced on Windows: privateTmp for C:\\T",
        "safer-exec: egress proxy listening on 127.0.0.1:1234",
        "safer-exec: warning: not enforced on Windows: privateTmp for C:\\T",
        "safer-exec: strict mode: not enforceable on Windows: blockJIT",
        "",
      ].join("\r\n"),
    );
    assert.deepEqual(warnings, [
      "safer-exec: warning: not enforced on Windows: privateTmp for C:\\T",
    ]);
    assert.strictEqual(
      error,
      "safer-exec: strict mode: not enforceable on Windows: blockJIT",
    );
    assert.deepEqual(engineMessages(undefined), {
      warnings: [],
      error: undefined,
    });
  });

  it("fails a --strict trace the sandbox refused instead of returning an empty result", async () => {
    const esmock = (await import("esmock")).default;
    const refusal = {
      exitCode: 1,
      stderr:
        "safer-exec: strict mode: not enforceable on Windows: privateTmp for C:\\T\n",
      auditLog: [],
    };
    const { executeAndTrace: trace } = await esmock("./traceRunner.js", {
      "@cdxgen/safer-exec": { SaferExec: fakeSaferExec(refusal) },
    });
    await assert.rejects(
      () => trace("cmd /c ver", undefined, { strict: true }),
      /Tracing refused under --strict: safer-exec: strict mode/,
    );
    // Without --strict the same failure is reported and the trace goes on.
    const result = await trace("cmd /c ver", undefined, {});
    assert.deepEqual(result.libPaths, []);
  });
});
