import { spawnSync } from "node:child_process";
import process from "node:process";

import { assert, it } from "poku";

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

it("git tests", () => {
  assert.ok(getBranch());
  assert.ok(getOriginUrl());
  const files = listFiles();
  assert.ok(files.length > 10);
});

it("tools tests", () => {
  assert.ok(collectJavaInfo());
  assert.ok(collectDotnetInfo());
  assert.ok(collectPythonInfo());
  assert.ok(collectNodeInfo());
  assert.ok(collectGccInfo());
  assert.ok(collectRustInfo());
  assert.ok(collectGoInfo());
  assert.ok(collectSwiftInfo());
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
      assert.deepStrictEqual(getNvmToolDirectory(22), true);
      assert.deepStrictEqual(getNvmToolDirectory(14)).toBeFalsy();

      // now we install nvm tool for a specific verison
      assert.deepStrictEqual(getOrInstallNvmTool(14), true);
      assert.deepStrictEqual(getNvmToolDirectory(14), true);
    } else {
      // if this test is failing it would be due to an error in isNvmAvailable()
      assert.deepStrictEqual(getNvmToolDirectory(22)).toBeFalsy();
      assert.deepStrictEqual(getOrInstallNvmTool(14)).toBeFalsy();
    }
  }
});
