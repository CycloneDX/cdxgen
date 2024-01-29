import { expect, test } from "@jest/globals";

import {
  getBranch,
  getOriginUrl,
  listFiles,
  collectJavaInfo
} from "./envcontext.js";

test("git tests", () => {
  expect(getBranch()).toBeDefined();
  expect(getOriginUrl()).toBeDefined();
  const files = listFiles();
  expect(files.length).toBeGreaterThan(10);
});

test("tools tests", () => {
  expect(collectJavaInfo()).toBeDefined();
});
