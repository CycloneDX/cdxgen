import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import esmock from "esmock";
import { assert, describe, it } from "poku";
import sinon from "sinon";

import {
  APK_INSTALLED_DB_PATHS,
  MAX_APK_DATABASE_BYTES,
  MAX_APK_PACKAGES,
  readApkInstalledDb,
} from "./apkInstalledDb.js";

const testData = (name) =>
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "test",
    "data",
    name,
  );

// Built for these tests, in the shape apk writes: a record is a run of
// `<letter>:<value>` lines ended by a blank line, and a record may start with C:
// (Alpine) or P: (Wolfi).
const TWO_PACKAGES = [
  "C:Q1deadbeef0000000000000000000=",
  "P:php84",
  "V:8.4.27-r0",
  "A:x86_64",
  "S:2029382",
  "I:8394808",
  "T:The PHP84 language runtime engine",
  "U:https://www.php.net/",
  "L:PHP-3.01 BSD-3-Clause",
  "o:php84",
  "m:A Maintainer <maintainer@example.org>",
  "t:1792600700",
  "D:php84-common so:libc.musl-x86_64.so.1",
  "p:php-cli cmd:php84=8.4.27-r0",
  "F:usr",
  "F:usr/local",
  "F:usr/local/bin",
  "R:php-cgi",
  "a:0:0:755",
  "Z:Q14ZNFgWLCOkI6ZbvXXxA5F931hPg=",
  "R:php",
  "Z:Q1111111111111111111111111111=",
  "",
  "P:musl",
  "V:1.2.6-r3",
  "A:x86_64",
  "T:the musl c library (libc) implementation",
  "U:https://musl.libc.org/",
  "L:MIT",
  "o:musl",
  "m:Another Maintainer <another@example.org>",
  "F:lib",
  "R:ld-musl-x86_64.so.1",
  "Z:Q1222222222222222222222222222=",
  "",
].join("\n");

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "cdxgen-apk-db-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function put(root, file, content) {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

const read = (root, extra = {}) =>
  readApkInstalledDb({ rootPath: root, platform: "linux", ...extra });

describe("readApkInstalledDb()", () => {
  it("reads the packages of an installed database", () =>
    withRoot((root) => {
      put(root, "lib/apk/db/installed", TWO_PACKAGES);
      const result = read(root);
      assert.strictEqual(result.state, "ok");
      assert.strictEqual(result.path, join(root, "lib/apk/db/installed"));
      assert.strictEqual(result.malformed, 0);
      assert.deepStrictEqual(result.packages, [
        {
          name: "php84",
          version: "8.4.27-r0",
          arch: "x86_64",
          origin: "php84",
          maintainer: "A Maintainer <maintainer@example.org>",
          license: "PHP-3.01 BSD-3-Clause",
          url: "https://www.php.net/",
          description: "The PHP84 language runtime engine",
          fileCount: 2,
          files: [],
        },
        {
          name: "musl",
          version: "1.2.6-r3",
          arch: "x86_64",
          origin: "musl",
          maintainer: "Another Maintainer <another@example.org>",
          license: "MIT",
          url: "https://musl.libc.org/",
          description: "the musl c library (libc) implementation",
          fileCount: 1,
          files: [],
        },
      ]);
    }));

  it("skips a record without a version and says how many it left out", () =>
    withRoot((root) => {
      const broken = [
        "C:Q1abc=",
        "P:no-version",
        "A:x86_64",
        "T:This record has no V: line",
        "",
        "C:Q1def=",
        "V:1.0-r0",
        "A:x86_64",
        "T:This record has no P: line",
        "",
      ].join("\n");
      put(root, "lib/apk/db/installed", `${TWO_PACKAGES}\n${broken}`);
      const result = read(root);
      assert.strictEqual(result.state, "ok");
      assert.deepStrictEqual(
        result.packages.map((pkg) => pkg.name),
        ["php84", "musl"],
      );
      assert.strictEqual(result.malformed, 2);
    }));

  it("treats a database over the size cap as unreadable, never as read in part", () =>
    withRoot((root) => {
      put(root, "lib/apk/db/installed", TWO_PACKAGES);
      const result = read(root, { maxBytes: TWO_PACKAGES.length - 1 });
      assert.strictEqual(result.state, "unreadable");
      assert.deepStrictEqual(result.packages, []);
      assert.strictEqual(result.path, join(root, "lib/apk/db/installed"));
      // A database of exactly the cap is within it.
      assert.strictEqual(
        read(root, { maxBytes: TWO_PACKAGES.length }).state,
        "ok",
      );
    }));

  it("caps the database at 64 MiB and the packages at 100000", () => {
    assert.strictEqual(MAX_APK_DATABASE_BYTES, 64 * 1024 * 1024);
    assert.strictEqual(MAX_APK_PACKAGES, 100000);
  });

  it("treats a database with more packages than the cap as unreadable", () =>
    withRoot((root) => {
      const records = [];
      for (let i = 0; i < 5; i++) {
        records.push(`P:p${i}\nV:1\nA:x86_64\n`);
      }
      put(root, "lib/apk/db/installed", records.join("\n"));
      const result = read(root, { maxPackages: 4 });
      assert.strictEqual(result.state, "unreadable");
      assert.deepStrictEqual(result.packages, []);
      assert.strictEqual(read(root, { maxPackages: 5 }).packages.length, 5);
    }));

  it("reports no database where there is none", () =>
    withRoot((root) => {
      assert.deepStrictEqual(read(root), {
        state: "absent",
        packages: [],
        malformed: 0,
      });
    }));

  it("reports an unreadable database where a directory stands in its place", () =>
    withRoot((root) => {
      mkdirSync(join(root, "lib/apk/db/installed"), { recursive: true });
      const result = read(root);
      assert.strictEqual(result.state, "unreadable");
      assert.strictEqual(result.path, join(root, "lib/apk/db/installed"));
      assert.deepStrictEqual(result.packages, []);
    }));

  it("looks for the database in the places apk puts it, in this order", () => {
    assert.deepStrictEqual(APK_INSTALLED_DB_PATHS, [
      "lib/apk/db/installed",
      "usr/lib/apk/db/installed",
      "var/lib/apk/db/installed",
    ]);
  });

  for (const location of APK_INSTALLED_DB_PATHS) {
    it(`finds the database at /${location}`, () =>
      withRoot((root) => {
        put(root, location, TWO_PACKAGES);
        const result = read(root);
        assert.strictEqual(result.state, "ok");
        assert.strictEqual(result.path, join(root, location));
        assert.strictEqual(result.packages.length, 2);
      }));
  }

  it("reads one database once when /lib and /usr/lib name the same file", () =>
    withRoot((root) => {
      // On a usr-merged system /lib is a link to /usr/lib; two plain copies
      // stand in for the two names of one file.
      put(root, "lib/apk/db/installed", TWO_PACKAGES);
      put(root, "usr/lib/apk/db/installed", TWO_PACKAGES);
      const result = read(root);
      assert.strictEqual(result.state, "ok");
      assert.strictEqual(result.packages.length, 2);
      assert.strictEqual(result.path, join(root, "lib/apk/db/installed"));
    }));

  it("does not look past a database it found but could not read", () =>
    withRoot((root) => {
      mkdirSync(join(root, "lib/apk/db/installed"), { recursive: true });
      put(root, "usr/lib/apk/db/installed", TWO_PACKAGES);
      const result = read(root);
      assert.strictEqual(result.state, "unreadable");
      assert.deepStrictEqual(result.packages, []);
    }));

  it("reads the file it is told to instead of looking under the root", () =>
    withRoot((root) => {
      const file = put(root, "elsewhere/installed", TWO_PACKAGES);
      const result = readApkInstalledDb({
        databaseFile: file,
        rootPath: join(root, "nothing-here"),
        platform: "linux",
      });
      assert.strictEqual(result.state, "ok");
      assert.strictEqual(result.path, file);
      assert.strictEqual(result.packages.length, 2);
    }));

  it("hands back the files it was asked about, and counts all of them", () =>
    withRoot((root) => {
      put(root, "lib/apk/db/installed", TWO_PACKAGES);
      const result = read(root, {
        wantedFiles: new Set(["/usr/local/bin/php-cgi", "/nowhere/else"]),
      });
      assert.deepStrictEqual(result.packages[0].files, [
        "/usr/local/bin/php-cgi",
      ]);
      assert.strictEqual(result.packages[0].fileCount, 2);
      assert.deepStrictEqual(result.packages[1].files, []);
    }));

  it("names a file of the root directory with a bare slash", () =>
    withRoot((root) => {
      // `F:` with no name is the root directory, as in Wolfi's baselayout.
      put(
        root,
        "lib/apk/db/installed",
        "P:base\nV:1\nA:x86_64\nF:\nR:bin\nF:etc\nR:hosts\n",
      );
      const result = read(root, {
        wantedFiles: new Set(["/bin", "/etc/hosts"]),
      });
      assert.deepStrictEqual(result.packages[0].files, ["/bin", "/etc/hosts"]);
    }));

  it("reads a record whose last line has no blank line after it", () =>
    withRoot((root) => {
      put(root, "lib/apk/db/installed", "P:musl\nV:1.2.6-r3\nA:x86_64");
      assert.deepStrictEqual(
        read(root).packages.map((pkg) => [pkg.name, pkg.version]),
        [["musl", "1.2.6-r3"]],
      );
    }));

  it("leaves out the fields a record does not have and keeps an empty U: out", () =>
    withRoot((root) => {
      put(
        root,
        "lib/apk/db/installed",
        "P:wolfi-baselayout\nV:20230201-r30\nA:x86_64\nL:MIT\nm:wolfi\nU:\n",
      );
      assert.deepStrictEqual(read(root).packages, [
        {
          name: "wolfi-baselayout",
          version: "20230201-r30",
          arch: "x86_64",
          maintainer: "wolfi",
          license: "MIT",
          fileCount: 0,
          files: [],
        },
      ]);
    }));

  it("cuts a field that is longer than a field can be", () =>
    withRoot((root) => {
      put(
        root,
        "lib/apk/db/installed",
        `P:big\nV:1\nA:x86_64\nT:${"x".repeat(100000)}\n`,
      );
      const [pkg] = read(root).packages;
      assert.strictEqual(pkg.description.length, 4096);
    }));

  it("only reads on Linux, where an apk database can exist", () =>
    withRoot((root) => {
      put(root, "lib/apk/db/installed", TWO_PACKAGES);
      for (const platform of ["darwin", "win32"]) {
        assert.deepStrictEqual(read(root, { platform }), {
          state: "absent",
          packages: [],
          malformed: 0,
        });
      }
    }));

  it("parses the database of Alpine 3.24 (apk-tools 3.0.8) as it ships", () => {
    const result = readApkInstalledDb({
      databaseFile: testData("apk-installed-alpine"),
      platform: "linux",
    });
    assert.strictEqual(result.state, "ok");
    assert.strictEqual(result.packages.length, 28);
    assert.strictEqual(result.malformed, 0);
    const php = result.packages.find((pkg) => pkg.name === "php84");
    assert.strictEqual(php.version, "8.4.27-r0");
    assert.strictEqual(php.arch, "x86_64");
    assert.strictEqual(php.origin, "php84");
    assert.strictEqual(
      php.license,
      "PHP-3.01 BSD-3-Clause LGPL-2.0-or-later MIT Zend-2.0",
    );
    assert.strictEqual(php.url, "https://www.php.net/");
    assert.strictEqual(php.description, "The PHP84 language runtime engine");
    assert.ok(php.maintainer.startsWith("Andy Postnikov <"), php.maintainer);
    assert.strictEqual(php.fileCount, 1);
    // Every record has what a purl needs.
    for (const pkg of result.packages) {
      assert.ok(pkg.name && pkg.version && pkg.arch, JSON.stringify(pkg));
    }
  });

  it("parses the database of Wolfi (apk-tools 2.14), whose records start with P:", () => {
    const result = readApkInstalledDb({
      databaseFile: testData("apk-installed-wolfi"),
      platform: "linux",
    });
    assert.strictEqual(result.state, "ok");
    assert.strictEqual(result.packages.length, 19);
    const [first] = result.packages;
    assert.strictEqual(first.name, "wolfi-baselayout");
    assert.strictEqual(first.version, "20230201-r30");
    assert.strictEqual(first.maintainer, "wolfi");
    assert.strictEqual(first.url, undefined);
  });

  it("parses the apk-tools 3 database of Alpaquita, whose files sit under /var/lib/apk", () => {
    const result = readApkInstalledDb({
      databaseFile: testData("alpaquita-installed"),
      platform: "linux",
    });
    assert.strictEqual(result.state, "ok");
    assert.deepStrictEqual(
      result.packages.map((pkg) => `${pkg.name}@${pkg.version}`),
      [
        "apk-tools@3.0.7-r1",
        "busybox@1.38.0-r2",
        "libapk@3.0.7-r1",
        "musl-perf@1.2.6-r2",
        "ssl_client@1.38.0-r2",
      ],
    );
    assert.strictEqual(
      result.packages[0].maintainer,
      "BellSoft <info@bell-sw.com>",
    );
  });

  it("leaves the whole database in the file as it found it", () => {
    const before = readFileSync(testData("apk-installed-alpine"), "utf-8");
    readApkInstalledDb({
      databaseFile: testData("apk-installed-alpine"),
      platform: "linux",
    });
    assert.strictEqual(
      readFileSync(testData("apk-installed-alpine"), "utf-8"),
      before,
    );
  });
});

describe("readApkInstalledDb() activity", () => {
  it("blocks itself in dry-run mode, says so, and reads nothing", async () => {
    const recordActivity = sinon.stub();
    const { readApkInstalledDb: mocked } = await esmock("./apkInstalledDb.js", {
      "../core/activity.js": { isDryRun: true, recordActivity },
    });
    withRoot((root) => {
      put(root, "lib/apk/db/installed", TWO_PACKAGES);
      assert.deepStrictEqual(mocked({ rootPath: root, platform: "linux" }), {
        state: "skipped",
        packages: [],
        malformed: 0,
      });
    });
    sinon.assert.calledWithMatch(recordActivity, {
      capability: "apk-installed-db",
      kind: "read",
      status: "blocked",
    });
  });

  it("records what it read in the activity ledger", async () => {
    const recordActivity = sinon.stub();
    const { readApkInstalledDb: mocked } = await esmock("./apkInstalledDb.js", {
      "../core/activity.js": { isDryRun: false, recordActivity },
    });
    withRoot((root) => {
      put(root, "lib/apk/db/installed", TWO_PACKAGES);
      mocked({ rootPath: root, platform: "linux" });
    });
    sinon.assert.calledWithMatch(recordActivity, {
      capability: "apk-installed-db",
      kind: "read",
      status: "completed",
    });
  });

  it("records a database it could not read as failed", async () => {
    const recordActivity = sinon.stub();
    const { readApkInstalledDb: mocked } = await esmock("./apkInstalledDb.js", {
      "../core/activity.js": { isDryRun: false, recordActivity },
    });
    withRoot((root) => {
      mkdirSync(join(root, "lib/apk/db/installed"), { recursive: true });
      mocked({ rootPath: root, platform: "linux" });
    });
    sinon.assert.calledWithMatch(recordActivity, {
      capability: "apk-installed-db",
      kind: "read",
      status: "failed",
    });
  });

  it("records nothing when there is no database to read", async () => {
    const recordActivity = sinon.stub();
    const { readApkInstalledDb: mocked } = await esmock("./apkInstalledDb.js", {
      "../core/activity.js": { isDryRun: false, recordActivity },
    });
    withRoot((root) => {
      mocked({ rootPath: root, platform: "linux" });
    });
    sinon.assert.notCalled(recordActivity);
  });
});
