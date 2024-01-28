import { expect, test } from "@jest/globals";

import { getBranch, getOriginUrl, listFiles } from "./gitcontext.js";

test("git tests", () => {
  expect(getBranch()).toBeDefined();
  expect(getOriginUrl()).toBeDefined();
  const files = listFiles();
  expect(files.length).toBeGreaterThan(10);
});
