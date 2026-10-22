import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import esmock from "esmock";
import { assert, describe, it } from "poku";
import sinon from "sinon";

import { createPhpRuntimeComponent, MAX_PHP_PROBES } from "./phpBuildInfo.js";
import { probeHostPhp } from "./phpHostProbe.js";

// Every file below is built by these tests: the markers stand in for the
// X-Powered-By string a compiled PHP carries.
const marker = (version) => Buffer.from(`X-Powered-By: PHP/${version}\0`);

async function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "cdxgen-php-host-"));
  try {
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function put(root, file, content = "", mode = undefined) {
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  if (mode) {
    chmodSync(target, mode);
  }
  return target;
}

// dpkg keeps one <package>.list per package, naming each path as it is on the
// system.
function dpkgOwns(root, packageName, paths) {
  put(
    root,
    `var/lib/dpkg/info/${packageName}.list`,
    `${["/.", ...paths].join("\n")}\n`,
  );
}

// apk keeps one record per package: F: names a directory, R: a file in it.
function apkOwns(root, packageName, version, filesByDir) {
  const lines = [`P:${packageName}`, `V:${version}`, "A:x86_64"];
  for (const [dir, names] of Object.entries(filesByDir)) {
    lines.push(`F:${dir}`);
    for (const name of names) {
      lines.push(`R:${name}`, "Z:Q1deadbeef");
    }
  }
  put(root, "lib/apk/db/installed", `${lines.join("\n")}\n\n`);
}

const probe = (root, extra = {}) =>
  probeHostPhp({ rootPath: root, platform: "linux", ...extra });
const sources = (components) =>
  components
    .filter((component) => component.type === "file")
    .map(
      (component) =>
        component.properties.find((prop) => prop.name === "internal:SrcFile")
          .value,
    )
    .sort();
const phpProps = (component) =>
  Object.fromEntries(
    (component.properties || [])
      .filter((prop) => prop.name.startsWith("cdx:php:"))
      .map((prop) => [prop.name, prop.value]),
  );

describe("probeHostPhp()", () => {
  it("reports an unpackaged PHP as a file component linked to one runtime", () =>
    withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      const { components, dependencies } = probe(root);
      const runtime = createPhpRuntimeComponent("8.4.27");
      assert.deepStrictEqual(components, [
        {
          name: "php",
          type: "file",
          purl: "pkg:generic/php#usr/local/bin/php",
          "bom-ref": "pkg:generic/php#usr/local/bin/php",
          properties: [
            { name: "internal:SrcFile", value: "/usr/local/bin/php" },
            { name: "cdx:php:buildVersion", value: "8.4.27" },
            { name: "cdx:php:buildVersionSource", value: "binary" },
            { name: "cdx:php:sapi", value: "cli" },
          ],
          evidence: {
            identity: [
              {
                field: "purl",
                confidence: 0,
                methods: [
                  {
                    technique: "filename",
                    confidence: 0,
                    value: "/usr/local/bin/php",
                  },
                ],
                concludedValue: "/usr/local/bin/php",
              },
            ],
          },
        },
        runtime,
      ]);
      assert.deepStrictEqual(dependencies, [
        { ref: runtime["bom-ref"], dependsOn: [] },
        {
          ref: "pkg:generic/php#usr/local/bin/php",
          dependsOn: [runtime["bom-ref"]],
        },
      ]);
      assert.strictEqual(runtime.cpe, "cpe:2.3:a:php:php:8.4.27:*:*:*:*:*:*:*");
    }));

  it("finds the SAPIs of a source build in the fixed directories only", () =>
    withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      put(root, "usr/local/bin/php-cgi", marker("8.4.27"));
      put(root, "usr/local/bin/phpdbg", marker("8.4.27"));
      put(root, "usr/local/sbin/php-fpm", marker("8.4.27"));
      put(root, "usr/local/lib/libphp.so", marker("8.4.27"));
      put(root, "usr/lib/apache2/modules/libphp8.4.so", marker("8.4.27"));
      put(root, "usr/lib/httpd/modules/libphp.so", marker("8.4.27"));
      put(root, "usr/lib64/httpd/modules/libphp.so", marker("8.4.27"));
      put(root, "opt/php-8.4/bin/php8.4", marker("8.4.27"));
      put(root, "opt/php-8.4/sbin/php-fpm8.4", marker("8.4.27"));
      put(root, "usr/local/bin/frankenphp", marker("8.5.12"));
      // Not SAPIs php-src installs.
      put(root, "usr/local/bin/phpize", marker("8.4.27"));
      put(root, "usr/local/bin/php-config", marker("8.4.27"));
      // Not in a fixed directory, or too deep for one.
      put(root, "usr/bin/php", marker("8.4.27"));
      put(root, "usr/local/bin/sub/php", marker("8.4.27"));
      put(root, "opt/remi/php83/root/usr/bin/php", marker("8.3.30"));
      put(root, "opt/bin/php", marker("8.4.27"));
      put(root, "home/user/bin/php", marker("8.4.27"));
      const { components } = probe(root);
      assert.deepStrictEqual(sources(components), [
        "/opt/php-8.4/bin/php8.4",
        "/opt/php-8.4/sbin/php-fpm8.4",
        "/usr/lib/apache2/modules/libphp8.4.so",
        "/usr/lib/httpd/modules/libphp.so",
        "/usr/lib64/httpd/modules/libphp.so",
        "/usr/local/bin/frankenphp",
        "/usr/local/bin/php",
        "/usr/local/bin/php-cgi",
        "/usr/local/bin/phpdbg",
        "/usr/local/lib/libphp.so",
        "/usr/local/sbin/php-fpm",
      ]);
      const bySapi = Object.fromEntries(
        components
          .filter((component) => component.type === "file")
          .map((component) => [
            component.properties.find(
              (prop) => prop.name === "internal:SrcFile",
            ).value,
            phpProps(component)["cdx:php:sapi"],
          ]),
      );
      assert.strictEqual(bySapi["/usr/local/bin/frankenphp"], "frankenphp");
      assert.strictEqual(bySapi["/usr/local/lib/libphp.so"], "libphp");
      assert.strictEqual(bySapi["/opt/php-8.4/sbin/php-fpm8.4"], "fpm");
      // One runtime per version.
      assert.deepStrictEqual(
        components
          .filter((component) => component.type === "platform")
          .map((component) => component.purl),
        ["pkg:generic/php@8.4.27", "pkg:generic/php@8.5.12"],
      );
    }));

  it("emits nothing for PHP that dpkg or apk owns, and keeps the unpackaged one", () =>
    withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      put(root, "usr/local/sbin/php-fpm", marker("8.2.29"));
      put(root, "usr/local/bin/php-cgi", marker("8.3.30"));
      dpkgOwns(root, "php8.2-fpm", [
        "/usr/local/sbin/php-fpm",
        "/usr/share/doc/php8.2-fpm",
      ]);
      dpkgOwns(root, "libc6:amd64", ["/lib/x86_64-linux-gnu/libc.so.6"]);
      apkOwns(root, "php83-cgi", "8.3.30-r0", {
        "usr/local/bin": ["php-cgi"],
      });
      const { components, dependencies } = probe(root);
      assert.deepStrictEqual(sources(components), ["/usr/local/bin/php"]);
      assert.deepStrictEqual(
        components
          .filter((component) => component.type === "platform")
          .map((component) => component.version),
        ["8.4.27"],
      );
      // The owned files get no property, and no edge reaches a runtime.
      assert.ok(
        components.every(
          (component) =>
            component.type !== "file" ||
            phpProps(component)["cdx:php:buildVersion"] === "8.4.27",
        ),
      );
      assert.strictEqual(dependencies.length, 2);
    }));

  it("counts a Homebrew symlink into the Cellar as owned, whatever revision the formula has", () =>
    withRoot((root) => {
      put(root, "opt/homebrew/Cellar/php/8.5.11_1/bin/php", marker("8.5.11"));
      put(
        root,
        "opt/homebrew/Cellar/php/8.5.11_1/sbin/php-fpm",
        marker("8.5.11"),
      );
      mkdirSync(join(root, "opt/homebrew/bin"), { recursive: true });
      mkdirSync(join(root, "opt/homebrew/sbin"), { recursive: true });
      symlinkSync(
        "../Cellar/php/8.5.11_1/bin/php",
        join(root, "opt/homebrew/bin/php"),
      );
      symlinkSync(
        "../Cellar/php/8.5.11_1/sbin/php-fpm",
        join(root, "opt/homebrew/sbin/php-fpm"),
      );
      // A real binary beside the symlinks is nobody's package.
      put(root, "usr/local/bin/php", marker("8.4.27"));
      const { components } = probe(root, { platform: "darwin" });
      assert.deepStrictEqual(sources(components), ["/usr/local/bin/php"]);
      assert.deepStrictEqual(
        components
          .filter((component) => component.type === "platform")
          .map((component) => component.version),
        ["8.4.27"],
      );
    }));

  it("reads a symlink to an unpackaged PHP through to the file it names", () =>
    withRoot((root) => {
      put(root, "opt/php-8.4/bin/php", marker("8.4.27"));
      mkdirSync(join(root, "usr/local/bin"), { recursive: true });
      symlinkSync(
        "../../../opt/php-8.4/bin/php",
        join(root, "usr/local/bin/php"),
      );
      const { components } = probe(root);
      // One file component for the one file, named where its bytes are.
      assert.deepStrictEqual(sources(components), ["/opt/php-8.4/bin/php"]);
    }));

  it("does not read through a symlink to a file that is not a PHP, or that leaves the root", () =>
    withRoot((root) => {
      const outside = mkdtempSync(join(tmpdir(), "cdxgen-php-host-out-"));
      try {
        put(outside, "php", marker("8.4.27"));
        put(root, "usr/share/other", marker("8.4.27"));
        mkdirSync(join(root, "usr/local/bin"), { recursive: true });
        symlinkSync("../../share/other", join(root, "usr/local/bin/php"));
        symlinkSync(join(outside, "php"), join(root, "usr/local/bin/php-cgi"));
        symlinkSync("php-missing", join(root, "usr/local/bin/php-fpm"));
        // None is a candidate, so nothing is asked of any package database.
        mkdirSync(join(root, "var/lib/rpm"), { recursive: true });
        const executeOsQuery = sinon.stub().returns([]);
        assert.deepStrictEqual(probe(root, { executeOsQuery }).components, []);
        sinon.assert.notCalled(executeOsQuery);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    }));

  it("asks osquery's rpm_package_files who owns a candidate, and trusts its answer", () =>
    withRoot((root) => {
      mkdirSync(join(root, "var/lib/rpm"), { recursive: true });
      put(root, "opt/remi/bin/php", marker("8.3.30"));
      put(root, "usr/local/bin/php", marker("8.4.27"));
      const executeOsQuery = sinon
        .stub()
        .returns([{ package: "php83-php-cli", path: "/opt/remi/bin/php" }]);
      const { components } = probe(root, { executeOsQuery });
      assert.deepStrictEqual(sources(components), ["/usr/local/bin/php"]);
      sinon.assert.calledOnce(executeOsQuery);
      const query = executeOsQuery.firstCall.args[0];
      assert.match(
        query,
        /^SELECT package, path FROM rpm_package_files WHERE path IN \(/,
      );
      assert.ok(query.includes("'/opt/remi/bin/php'"));
      assert.ok(query.includes("'/usr/local/bin/php'"));
    }));

  it("quotes a path in the osquery query", () =>
    withRoot((root) => {
      mkdirSync(join(root, "usr/lib/sysimage/rpm"), { recursive: true });
      put(root, "opt/o'brien/bin/php", marker("8.4.27"));
      const executeOsQuery = sinon.stub().returns([]);
      const { components } = probe(root, { executeOsQuery });
      assert.deepStrictEqual(sources(components), ["/opt/o'brien/bin/php"]);
      assert.ok(
        executeOsQuery.firstCall.args[0].includes("'/opt/o''brien/bin/php'"),
      );
    }));

  it("never calls osquery when there is no rpm database or no candidate", () =>
    withRoot((root) => {
      const executeOsQuery = sinon.stub().returns([]);
      put(root, "usr/local/bin/php", marker("8.4.27"));
      probe(root, { executeOsQuery });
      sinon.assert.notCalled(executeOsQuery);
      mkdirSync(join(root, "var/lib/rpm"), { recursive: true });
      rmSync(join(root, "usr"), { recursive: true });
      probe(root, { executeOsQuery });
      sinon.assert.notCalled(executeOsQuery);
    }));

  it("emits no generic PHP while a package database it must ask cannot be read", async () => {
    const degradations = [];
    const { probeHostPhp: mocked } = await esmock("./phpHostProbe.js", {
      "../core/buildLedger.js": {
        recordDegradation: (id, fields) => degradations.push({ id, ...fields }),
      },
    });
    await withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      // osquery cannot be run, or answered nothing parseable.
      mkdirSync(join(root, "var/lib/rpm"), { recursive: true });
      const { components, dependencies } = mocked({
        rootPath: root,
        platform: "linux",
        executeOsQuery: () => undefined,
      });
      assert.deepStrictEqual(components, []);
      assert.deepStrictEqual(dependencies, []);
    });
    assert.deepStrictEqual(
      degradations.map((entry) => [entry.id, entry.ecosystem, entry.impact]),
      [["php.host-probe.package-db-unreadable", "php", "components"]],
    );
  });

  it("emits no generic PHP while a dpkg list or the apk database cannot be read", async () => {
    const degradations = [];
    const { probeHostPhp: mocked } = await esmock("./phpHostProbe.js", {
      "../core/buildLedger.js": {
        recordDegradation: (id, fields) => degradations.push({ id, ...fields }),
      },
    });
    await withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      // A directory where a list should be: reading it fails.
      mkdirSync(join(root, "var/lib/dpkg/info/broken.list"), {
        recursive: true,
      });
      dpkgOwns(root, "fine", ["/usr/bin/other"]);
      assert.deepStrictEqual(
        mocked({ rootPath: root, platform: "linux" }).components,
        [],
      );
    });
    await withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      // A directory where the database should be.
      mkdirSync(join(root, "lib/apk/db/installed"), { recursive: true });
      assert.deepStrictEqual(
        mocked({ rootPath: root, platform: "linux" }).components,
        [],
      );
    });
    assert.deepStrictEqual(
      degradations.map((entry) => entry.id),
      [
        "php.host-probe.package-db-unreadable",
        "php.host-probe.package-db-unreadable",
      ],
    );
  });

  it("still sees a candidate that a readable database lists, when another cannot be read", () =>
    withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      mkdirSync(join(root, "lib/apk/db/installed"), { recursive: true });
      dpkgOwns(root, "php8.4-cli", ["/usr/local/bin/php"]);
      assert.deepStrictEqual(probe(root).components, []);
    }));

  it("treats a file as unpackaged when there is no package database at all", () =>
    withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      assert.deepStrictEqual(sources(probe(root).components), [
        "/usr/local/bin/php",
      ]);
    }));

  it("falls back to php_version.h when the binary carries no marker", () =>
    withRoot((root) => {
      put(root, "usr/local/bin/php", Buffer.alloc(2048, 0));
      put(
        root,
        "usr/local/include/php/main/php_version.h",
        '#define PHP_VERSION "8.4.27"\n',
      );
      const { components } = probe(root);
      assert.deepStrictEqual(
        phpProps(components.find((component) => component.type === "file")),
        {
          "cdx:php:buildVersion": "8.4.27",
          "cdx:php:buildVersionSource": "php_version.h",
          "cdx:php:sapi": "cli",
        },
      );
    }));

  it("opens at most MAX_PHP_PROBES candidates", () =>
    withRoot((root) => {
      for (let i = 0; i < MAX_PHP_PROBES + 20; i++) {
        put(root, `usr/local/bin/php${i}`, marker("8.4.27"));
      }
      const { components } = probe(root);
      assert.strictEqual(
        components.filter((component) => component.type === "file").length,
        MAX_PHP_PROBES,
      );
    }));

  it("only reads a file, and never runs it", () =>
    withRoot((root) => {
      const sentinel = join(root, "ran");
      put(
        root,
        "usr/local/bin/php",
        Buffer.concat([
          Buffer.from(`#!/bin/sh\ntouch '${sentinel}'\n`),
          marker("8.4.27"),
        ]),
        0o755,
      );
      const { components } = probe(root);
      assert.strictEqual(sources(components).length, 1);
      assert.strictEqual(existsSync(sentinel), false);
    }));

  it("reports nothing for a root with no PHP, and skips directories it cannot read", () =>
    withRoot((root) => {
      assert.deepStrictEqual(probe(root), { components: [], dependencies: [] });
      mkdirSync(join(root, "usr/local/bin"), { recursive: true });
      put(root, "usr/local/bin/php", Buffer.alloc(16, 1));
      assert.deepStrictEqual(probe(root), { components: [], dependencies: [] });
      assert.deepStrictEqual(
        probeHostPhp({ rootPath: join(root, "missing"), platform: "linux" }),
        { components: [], dependencies: [] },
      );
    }));

  it("blocks itself in dry-run mode and says so", async () => {
    const recordActivity = sinon.stub();
    const { probeHostPhp: mocked } = await esmock("./phpHostProbe.js", {
      "../core/activity.js": { isDryRun: true, recordActivity },
    });
    await withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      assert.deepStrictEqual(mocked({ rootPath: root, platform: "linux" }), {
        components: [],
        dependencies: [],
      });
    });
    sinon.assert.calledWithMatch(recordActivity, {
      capability: "php-host-probe",
      status: "blocked",
    });
  });

  it("records what it read in the activity ledger", async () => {
    const recordActivity = sinon.stub();
    const { probeHostPhp: mocked } = await esmock("./phpHostProbe.js", {
      "../core/activity.js": { isDryRun: false, recordActivity },
    });
    await withRoot((root) => {
      put(root, "usr/local/bin/php", marker("8.4.27"));
      mocked({ rootPath: root, platform: "linux" });
    });
    sinon.assert.calledWithMatch(recordActivity, {
      capability: "php-host-probe",
      kind: "read",
      status: "completed",
    });
  });
});

describe("probeHostPhp() on Windows", () => {
  const winProbe = (root, extra = {}) =>
    probeHostPhp({
      rootPath: root,
      platform: "win32",
      env: {},
      ...extra,
    });
  const chocolatey = (names) =>
    names.map((name) => ({
      name,
      type: "application",
      purl: `pkg:chocolatey/${name}@8.4.27`,
    }));

  it("looks in the common roots and takes the version of a CGI build from the core DLL", () =>
    withRoot((root) => {
      put(root, "php/php.exe", marker("8.4.27"));
      put(root, "php/php-cgi.exe", Buffer.alloc(256, 7));
      put(root, "php/php8.dll", marker("8.4.27"));
      put(root, "tools/php-8.3/php-cgi.exe", Buffer.alloc(256, 7));
      put(root, "tools/php-8.3/php8ts.dll", marker("8.3.30"));
      put(root, "Program Files/PHP/php.exe", marker("8.2.29"));
      put(root, "Program Files/PHP/phpdbg.exe", marker("8.2.29"));
      // Not common roots, and not PHP programs.
      put(root, "xampp/php/php.exe", marker("8.4.27"));
      put(root, "php/phpize.bat", marker("8.4.27"));
      const { components } = winProbe(root);
      const files = components.filter((component) => component.type === "file");
      assert.deepStrictEqual(
        files
          .map((component) => [
            component.name,
            phpProps(component)["cdx:php:sapi"],
            phpProps(component)["cdx:php:buildVersion"],
          ])
          .sort((a, b) => `${a}`.localeCompare(`${b}`)),
        [
          ["php-cgi.exe", "cgi", "8.3.30"],
          ["php-cgi.exe", "cgi", "8.4.27"],
          ["php.exe", "cli", "8.2.29"],
          ["php.exe", "cli", "8.4.27"],
          ["phpdbg.exe", "phpdbg", "8.2.29"],
        ],
      );
      assert.deepStrictEqual(
        components
          .filter((component) => component.type === "platform")
          .map((component) => component.version)
          .sort(),
        ["8.2.29", "8.3.30", "8.4.27"],
      );
    }));

  it("counts PHP under the tools directory as Chocolatey's when its php package is installed", () =>
    withRoot((root) => {
      put(root, "tools/php84/php.exe", marker("8.4.27"));
      put(root, "php/php.exe", marker("8.3.30"));
      mkdirSync(join(root, "ProgramData/chocolatey"), { recursive: true });
      const { components } = winProbe(root, {
        packageComponents: chocolatey(["chocolatey", "php"]),
        env: { ChocolateyInstall: join(root, "ProgramData/chocolatey") },
      });
      assert.deepStrictEqual(
        components
          .filter((component) => component.type === "file")
          .map((component) => phpProps(component)["cdx:php:buildVersion"]),
        ["8.3.30"],
      );
    }));

  it("identifies PHP under the tools directory when Chocolatey has no php package", () =>
    withRoot((root) => {
      put(root, "tools/php84/php.exe", marker("8.4.27"));
      mkdirSync(join(root, "ProgramData/chocolatey"), { recursive: true });
      const { components } = winProbe(root, {
        packageComponents: chocolatey(["chocolatey", "git"]),
        env: { ChocolateyInstall: join(root, "ProgramData/chocolatey") },
      });
      assert.strictEqual(
        components.filter((component) => component.type === "file").length,
        1,
      );
    }));

  it("emits no generic PHP while Chocolatey is installed but its packages were not listed", async () => {
    const degradations = [];
    const { probeHostPhp: mocked } = await esmock("./phpHostProbe.js", {
      "../core/buildLedger.js": {
        recordDegradation: (id, fields) => degradations.push({ id, ...fields }),
      },
    });
    await withRoot((root) => {
      put(root, "tools/php84/php.exe", marker("8.4.27"));
      mkdirSync(join(root, "ProgramData/chocolatey"), { recursive: true });
      assert.deepStrictEqual(
        mocked({
          rootPath: root,
          platform: "win32",
          packageComponents: [],
          env: { ChocolateyInstall: join(root, "ProgramData/chocolatey") },
        }).components,
        [],
      );
    });
    assert.strictEqual(degradations.length, 1);
  });
});
