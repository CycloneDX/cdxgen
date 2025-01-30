import { spawnSync } from "node:child_process";
import process from "node:process";
import { expect, test } from "@jest/globals";
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

test("git tests", () => {
  expect(getBranch()).toBeDefined();
  expect(getOriginUrl()).toBeDefined();
  const files = listFiles();
  expect(files.length).toBeGreaterThan(10);
});

test("tools tests", () => {
  expect(collectJavaInfo()).toBeDefined();
  expect(collectDotnetInfo()).toBeDefined();
  expect(collectPythonInfo()).toBeDefined();
  expect(collectNodeInfo()).toBeDefined();
  expect(collectGccInfo()).toBeDefined();
  expect(collectRustInfo()).toBeDefined();
  expect(collectGoInfo()).toBeDefined();
  expect(collectSwiftInfo()).toBeDefined();
});

test("sdkman tests", () => {
  if (process.env?.SDKMAN_VERSION) {
    expect(isSdkmanAvailable()).toBeTruthy();
    expect(isSdkmanToolAvailable("java", "23.0.2-tem")).toBeTruthy();
  }
});

test("nvm tests", () => {
  if (process.env?.NVM_DIR) {
    if (isNvmAvailable()) {
      // try to remove nodejs 14 before testing below
      const removeNode14 = spawnSync(
        process.env.SHELL || "bash",
        ["-i", "-c", `"nvm uninstall 14"`],
        {
          encoding: "utf-8",
          shell: process.env.SHELL || true,
        },
      );

      // expected to be run in CircleCi, where node version is 22.8.0
      // as defined in our Dockerfile
      expect(getNvmToolDirectory(22)).toBeTruthy();
      expect(getNvmToolDirectory(14)).toBeFalsy();

      // now we install nvm tool for a specific verison
      expect(getOrInstallNvmTool(14)).toBeTruthy();
      expect(getNvmToolDirectory(14)).toBeTruthy();
    } else {
      // if this test is failing it would be due to an error in isNvmAvailable()
      expect(getNvmToolDirectory(22)).toBeFalsy();
      expect(getOrInstallNvmTool(14)).toBeFalsy();
    }
  }
});
