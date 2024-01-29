import { expect, test } from "@jest/globals";

import {
  getBranch,
  getOriginUrl,
  listFiles,
  collectJavaInfo,
  collectDotnetInfo,
  collectPythonInfo,
  collectNodeInfo,
  collectGccInfo,
  collectRustInfo,
  collectGoInfo
} from "./envcontext.js";

test("git tests", () => {
  expect(getBranch()).toBeDefined();
  expect(getOriginUrl()).toBeDefined();
  const files = listFiles();
  expect(files.length).toBeGreaterThan(10);
});

/*
test("tools tests", () => {
  expect(collectJavaInfo()).toBeDefined();
  expect(collectDotnetInfo()).toBeDefined();
  expect(collectPythonInfo()).toBeDefined();
  expect(collectNodeInfo()).toBeDefined();
  expect(collectGccInfo()).toBeDefined();
  expect(collectRustInfo()).toBeDefined();
  expect(collectGoInfo()).toBeDefined();
});
*/
