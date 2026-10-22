import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import process from "node:process";

import esmock from "esmock";
import { assert, it, skip } from "poku";

import { isWin } from "../managers/docker.js";
import {
  collectDotnetInfo,
  collectGccInfo,
  collectGoInfo,
  collectJavaInfo,
  collectNodeInfo,
  collectPythonInfo,
  collectRustInfo,
  collectSwiftInfo,
  getBranch,
  getNvmToolDirectory,
  getOrInstallNvmTool,
  getOriginUrl,
  isNvmAvailable,
  isSdkmanAvailable,
  isSdkmanToolAvailable,
  listFiles,
} from "./envcontext.js";

skip("Skipping envcontext tests due to old logic");

const isDarwin = process.platform === "darwin";

it("git tests", () => {
  assert.ok(getBranch());
  assert.ok(getOriginUrl());
  const files = listFiles();
  assert.ok(files.length > 10);
});

it("tools tests", () => {
  assert.ok(collectDotnetInfo());
  assert.ok(collectPythonInfo());
  assert.ok(collectNodeInfo());
  assert.ok(collectGccInfo());
  assert.ok(collectRustInfo());
  if (!isWin) {
    assert.ok(collectSwiftInfo());
    assert.ok(collectJavaInfo());
  }
  if (!isDarwin) {
    assert.ok(collectGoInfo());
  }
});

it("sdkman tests", () => {
  if (process.env?.SDKMAN_VERSION) {
    assert.deepStrictEqual(isSdkmanAvailable(), true);
    assert.deepStrictEqual(isSdkmanToolAvailable("java", "23.0.2-tem"), true);
  }
});

it("nvm tests", () => {
  if (process.env?.NVM_DIR) {
    if (isNvmAvailable()) {
      // try to remove nodejs 14 before testing below
      const _removeNode14 = spawnSync(
        process.env.SHELL || "bash",
        ["-i", "-c", `"nvm uninstall 14"`],
        {
          encoding: "utf-8",
          shell: process.env.SHELL || true,
        },
      );

      // expected to be run in CircleCi, where node version is 22.8.0
      // as defined in our Dockerfile
      assert.ok(typeof getNvmToolDirectory(22) === "string");
      assert.deepStrictEqual(getNvmToolDirectory(14), false);

      // now we install nvm tool for a specific verison
      assert.ok(getOrInstallNvmTool(14));
      assert.ok(typeof getNvmToolDirectory(14) === "string");
    } else {
      // if this test is failing it would be due to an error in isNvmAvailable()
      assert.deepStrictEqual(getNvmToolDirectory(22), undefined);
      assert.deepStrictEqual(getOrInstallNvmTool(14), false);
    }
  }
});

// The PHP and Composer probes with safeSpawnSync answering `output`, and the
// commands they ran.
async function loadPhpProbes(output) {
  const calls = [];
  const mod = await esmock("./envcontext.js", {
    "./utils.js": {
      safeSpawnSync: (command, args) => {
        calls.push([command, ...(args || [])]);
        return { status: 0, stdout: output, stderr: "" };
      },
    },
  });
  return { ...mod, calls };
}

it("collectPhpInfo records the version `php -n -v` prints, as a generic component with no bom-ref", async () => {
  const { collectPhpInfo, calls } = await loadPhpProbes(
    "PHP 8.5.11 (cli) (built: Sep 22 2026 13:32:06) (NTS)\nCopyright (c) The PHP Group\n",
  );
  // No bom-ref: formulation shares the document's refs with the inventory,
  // where an image scan can hold this same pkg:generic/php runtime.
  assert.deepStrictEqual(collectPhpInfo(tmpdir()), {
    type: "platform",
    name: "php",
    version: "8.5.11",
    cpe: "cpe:2.3:a:php:php:8.5.11:*:*:*:*:*:*:*",
    purl: "pkg:generic/php@8.5.11",
  });
  assert.deepStrictEqual(calls[0].slice(1), ["-n", "-v"]);
});

it("collectPhpInfo keeps the version a distro build reports, without a CPE", async () => {
  for (const [banner, version, purl] of [
    [
      "PHP 8.1.2-1ubuntu2.14 (cli) (built: Jan 1 2025 00:00:00) ( NTS )",
      "8.1.2-1ubuntu2.14",
      "pkg:generic/php@8.1.2-1ubuntu2.14",
    ],
    [
      "PHP 8.3.12-1+ubuntu22.04.1+deb.sury.org+1 (cli) (built: Sep 27 2024)",
      "8.3.12-1+ubuntu22.04.1+deb.sury.org+1",
      "pkg:generic/php@8.3.12-1%2Bubuntu22.04.1%2Bdeb.sury.org%2B1",
    ],
  ]) {
    const { collectPhpInfo } = await loadPhpProbes(`${banner}\n`);
    assert.deepStrictEqual(
      collectPhpInfo(tmpdir()),
      { type: "platform", name: "php", version, purl },
      banner,
    );
  }
});

it("collectPhpInfo records nothing for a banner it cannot read", async () => {
  for (const output of [
    "",
    "Segmentation fault",
    "PHP 8.5 (cli)",
    "php 8.5.11 (cli)",
    "PHP 8.5.11.1 (cli)",
    "PHP 8.4.27-",
    'Warning: Module "gd" is already loaded\nPHP 8.5.11 (cli)',
  ]) {
    const { collectPhpInfo } = await loadPhpProbes(output);
    assert.strictEqual(collectPhpInfo(tmpdir()), undefined, output);
  }
});

it("collectComposerInfo finds the banner below deprecation notices and never records the PHP path", async () => {
  const { collectComposerInfo, calls } = await loadPhpProbes(
    [
      "Deprecation Notice: Composer\\Util\\Platform::getEnv(): Implicitly marking parameter $name as nullable is deprecated in phar:///usr/local/bin/composer/src/Composer/Util/Platform.php:63",
      "Composer version 2.2.25 2024-12-11 11:57:47",
      "PHP version 8.5.11 (/opt/php/bin/php)",
    ].join("\n"),
  );
  const info = collectComposerInfo(tmpdir());
  assert.deepStrictEqual(info, {
    type: "platform",
    name: "composer",
    version: "2.2.25",
    cpe: "cpe:2.3:a:getcomposer:composer:2.2.25:*:*:*:*:*:*:*",
    purl: "pkg:generic/composer@2.2.25",
  });
  assert.ok(!JSON.stringify(info).includes("/opt/php"));
  assert.deepStrictEqual(calls[0].slice(1), [
    "--version",
    "--no-plugins",
    "--no-scripts",
    "--no-interaction",
  ]);
});

it("collectComposerInfo records nothing for a banner it cannot read", async () => {
  for (const output of [
    "",
    "Composer version",
    "Composer version @package_version@ @release_date@",
    "Composer version 2.9.0-RC1 2026-01-01 00:00:00",
    // An error block echoes composer.json indented; that is not the banner.
    'In JsonFile.php line 344:\n  Composer version 9.9.9 2026-01-01 00:00:00\n  "./composer.json" does not contain valid JSON',
  ]) {
    const { collectComposerInfo } = await loadPhpProbes(output);
    assert.strictEqual(collectComposerInfo(tmpdir()), undefined, output);
  }
});
