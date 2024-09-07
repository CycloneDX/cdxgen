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
  getBranch,
  getOriginUrl,
  isNvmAvailable,
  isNvmToolAvailable,
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
});

test("sdkman tests", () => {
  if (process.env?.SDKMAN_VERSION) {
    expect(isSdkmanAvailable()).toBeTruthy();
    expect(isSdkmanToolAvailable("java", "22.0.1-tem")).toBeTruthy();
  }
});