import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { assert, it } from "poku";

import { isMac, isWin } from "../core/paths.js";
import {
  fetchCacheDir,
  resolveCacheDir,
  resolveCacheDirFor,
} from "./cacheDir.js";

function withEnv(env, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

it("CDXGEN_CACHE_DIR overrides every platform convention", () => {
  const dir = withEnv(
    {
      CDXGEN_CACHE_DIR: "/tmp/custom-cache",
      XDG_CACHE_HOME: "/xdg/home",
      HOME: "/home/user",
      LOCALAPPDATA: "/local",
      USERPROFILE: "/profile",
    },
    () => resolveCacheDir(),
  );
  assert.strictEqual(dir, path.resolve("/tmp/custom-cache"));
});

it("empty CDXGEN_CACHE_DIR falls through to platform convention", () => {
  const dir = withEnv(
    {
      CDXGEN_CACHE_DIR: "  ",
      XDG_CACHE_HOME: undefined,
      HOME: "/home/user",
      LOCALAPPDATA: undefined,
      USERPROFILE: undefined,
    },
    () => resolveCacheDir(),
  );
  assert.ok(dir !== null);
  assert.ok(dir.includes("cdxgen"), `unexpected dir: ${dir}`);
});

// Every platform branch is driven through resolveCacheDirFor, whose inputs are
// parameters. Reading process.platform instead would leave two of the three
// branches unexercised on any given host.
it("Linux prefers an absolute XDG_CACHE_HOME over HOME", () => {
  assert.strictEqual(
    resolveCacheDirFor({
      platform: "linux",
      xdgCacheHome: "/var/cache",
      home: "/home/user",
    }),
    path.join("/var/cache", "cdxgen"),
  );
});

it("Linux ignores a relative XDG_CACHE_HOME", () => {
  assert.strictEqual(
    resolveCacheDirFor({
      platform: "linux",
      xdgCacheHome: "relative/path",
      home: "/home/user",
    }),
    path.join("/home/user", ".cache", "cdxgen"),
  );
});

it("macOS uses Library/Caches and ignores XDG_CACHE_HOME", () => {
  assert.strictEqual(
    resolveCacheDirFor({
      platform: "macos",
      xdgCacheHome: "/var/cache",
      home: "/Users/user",
    }),
    path.join("/Users/user", "Library", "Caches", "cdxgen"),
  );
});

it("Windows prefers LOCALAPPDATA and falls back to the home profile", () => {
  const localAppData = "C:\\Users\\u\\AppData\\Local";
  assert.strictEqual(
    resolveCacheDirFor({
      platform: "windows",
      localAppData,
      home: "C:\\Users\\u",
    }),
    path.join(localAppData, "cdxgen", "cache"),
  );
  assert.strictEqual(
    resolveCacheDirFor({ platform: "windows", home: "C:\\Users\\u" }),
    path.join("C:\\Users\\u", "AppData", "Local", "cdxgen", "cache"),
  );
});

it("returns null on every platform when nothing resolves", () => {
  for (const platform of ["linux", "macos", "windows"]) {
    assert.strictEqual(
      resolveCacheDirFor({ platform }),
      null,
      `${platform} should disable the cache rather than pick a fallback`,
    );
  }
});

it("Linux and macOS ignore a relative home, by POSIX rules on every host", () => {
  // A relative root would resolve against the working directory, which is
  // what the XDG rule exists to prevent; cdxrs ignores these too.
  assert.strictEqual(
    resolveCacheDirFor({ platform: "linux", home: "home/user" }),
    null,
  );
  assert.strictEqual(
    resolveCacheDirFor({
      platform: "linux",
      xdgCacheHome: "cache",
      home: "home/user",
    }),
    null,
  );
  assert.strictEqual(
    resolveCacheDirFor({ platform: "macos", home: "." }),
    null,
  );
  // Judged by the target's rules, not the host's: on a Windows host
  // `path.isAbsolute` accepts `\cache`, and on any host `C:/cache` is not a
  // Linux path.
  for (const xdgCacheHome of ["C:/cache", "\\cache"]) {
    assert.strictEqual(
      resolveCacheDirFor({ platform: "linux", xdgCacheHome, home: "/home/u" }),
      path.join("/home/u", ".cache", "cdxgen"),
      xdgCacheHome,
    );
  }
});

it("Windows ignores a relative LOCALAPPDATA or home profile", () => {
  for (const localAppData of [
    "AppData\\Local",
    "C:AppData",
    "\\AppData",
    "/AppData",
  ]) {
    assert.strictEqual(
      resolveCacheDirFor({
        platform: "windows",
        localAppData,
        home: "C:\\Users\\u",
      }),
      path.join("C:\\Users\\u", "AppData", "Local", "cdxgen", "cache"),
      localAppData,
    );
  }
  assert.strictEqual(
    resolveCacheDirFor({ platform: "windows", home: "Users\\u" }),
    null,
  );
  // Forward slashes and UNC roots are absolute.
  for (const localAppData of ["d:/local", "\\\\server\\share"]) {
    assert.strictEqual(
      resolveCacheDirFor({ platform: "windows", localAppData }),
      path.join(localAppData, "cdxgen", "cache"),
      localAppData,
    );
  }
});

it("fetchCacheDir appends the cdxrs-fetch component", () => {
  const dir = fetchCacheDir("/tmp/cache-root");
  assert.strictEqual(dir, path.join("/tmp/cache-root", "cdxrs-fetch"));
});

it("resolveCacheDir and Rust agree on the directory when CDXGEN_CACHE_DIR is set", async () => {
  // This test verifies the single-source-of-truth invariant: both JS and Rust
  // resolve the same path when CDXGEN_CACHE_DIR is set. When cdxrs is not
  // available, the test is a no-op because there is nothing to compare with.
  let cdxrsAvailable;
  try {
    const mod = await import("./cdxrs.js");
    cdxrsAvailable = mod.cdxrsAvailable("fetch").available;
  } catch {
    cdxrsAvailable = false;
  }
  if (!cdxrsAvailable) {
    return;
  }

  const { createServer } = await import("node:http");
  const { existsSync, readdirSync } = await import("node:fs");

  const tmp = mkdtempSync(path.join(tmpdir(), "cdxgen-cache-parity-"));
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ name: "parity-test" }));
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/parity-test`;

    const jsDir = withEnv({ CDXGEN_CACHE_DIR: tmp }, () => resolveCacheDir());
    assert.strictEqual(jsDir, tmp, "JS should resolve CDXGEN_CACHE_DIR as-is");

    const { runCdxrs } = await import("./cdxrs.js");
    const payload = JSON.stringify({
      requests: [{ id: "x", url }],
    });
    // First run: populates the cache. CDXGEN_CACHE_LOOPBACK is needed because
    // the mock server is on 127.0.0.1 and loopback is excluded by default.
    const first = await withEnv(
      { CDXGEN_CACHE_DIR: tmp, CDXGEN_CACHE_LOOPBACK: "1" },
      async () =>
        await runCdxrs("fetch", {
          content: payload,
          args: ["--cache-ttl", "0"],
          timeoutMs: 10_000,
        }),
    );
    assert.ok(first.ok, `first fetch failed: ${first.reason}`);
    // Second run: should serve from cache (fromCache=true).
    const second = await withEnv(
      { CDXGEN_CACHE_DIR: tmp, CDXGEN_CACHE_LOOPBACK: "1" },
      async () =>
        await runCdxrs("fetch", {
          content: payload,
          args: ["--cache-ttl", "0"],
          timeoutMs: 10_000,
        }),
    );
    assert.ok(second.ok, `second fetch failed: ${second.reason}`);
    const envelope = JSON.parse(second.stdout);
    assert.ok(envelope.results.length > 0);
    assert.strictEqual(
      envelope.results[0].fromCache,
      true,
      "second run did not hit the cache — Rust and JS disagree on the directory",
    );
    // Verify cache files are in the JS-resolved directory.
    const fetchSubdir = path.join(tmp, "cdxrs-fetch");
    assert.ok(
      existsSync(fetchSubdir),
      `Rust did not write to the JS-resolved directory: ${fetchSubdir}`,
    );
    const hostDirs = readdirSync(fetchSubdir);
    assert.ok(hostDirs.includes("127.0.0.1"), `unexpected hosts: ${hostDirs}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(tmp, { recursive: true, force: true });
  }
});

it("resolveCacheDir and Rust agree on the platform-derived directory", async () => {
  // The CDXGEN_CACHE_DIR case above is the branch where agreement is trivial.
  // This one drives the platform convention on both sides — the branch that can
  // actually drift — by pointing the home-directory inputs at a scratch tree
  // and asserting Rust writes where JS says it will.
  const { cdxrsAvailable, runCdxrs } = await import("./cdxrs.js");
  if (!cdxrsAvailable("fetch").available) {
    return;
  }
  const { createServer } = await import("node:http");
  const { existsSync } = await import("node:fs");

  const scratchHome = mkdtempSync(path.join(tmpdir(), "cdxgen-cache-home-"));
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ name: "platform-parity" }));
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const env = {
      CDXGEN_CACHE_DIR: undefined,
      CDXGEN_CACHE_LOOPBACK: "1",
      HOME: scratchHome,
      USERPROFILE: scratchHome,
      XDG_CACHE_HOME: undefined,
      LOCALAPPDATA: undefined,
    };
    // The home directory is supplied to the pure resolver rather than by
    // mutating HOME around `resolveCacheDir()`: `os.homedir()` re-reads HOME on
    // node but not on bun, so the mutation form asserts a runtime detail rather
    // than the agreement this test is about. Rust still resolves independently,
    // from the child environment below.
    const jsDir = resolveCacheDirFor({
      platform: isWin ? "windows" : isMac ? "macos" : "linux",
      cdxgenCacheDir: undefined,
      xdgCacheHome: undefined,
      home: scratchHome,
      localAppData: undefined,
    });
    assert.ok(jsDir?.startsWith(scratchHome), `JS resolved outside: ${jsDir}`);

    const result = await withEnv(env, async () =>
      // No --cache-dir: Rust must resolve the same path independently.
      runCdxrs("fetch", {
        content: JSON.stringify({
          requests: [{ id: "x", url: `http://127.0.0.1:${port}/pp` }],
        }),
        timeoutMs: 10_000,
      }),
    );
    assert.ok(result.ok, `fetch failed: ${result.reason}`);
    assert.ok(
      existsSync(fetchCacheDir(jsDir)),
      `Rust resolved a different directory; JS expected ${fetchCacheDir(jsDir)}`,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(scratchHome, { recursive: true, force: true });
  }
});
