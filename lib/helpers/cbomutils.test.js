import { expect, test } from "@jest/globals";

import { collectOSCryptoLibs } from "./cbomutils.js";

test("cbom utils tests", () => {
  const cryptoLibs = collectOSCryptoLibs();
  expect(cryptoLibs).toBeDefined();
});
