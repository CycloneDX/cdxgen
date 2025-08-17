import { assert, it } from "poku";

import { collectOSCryptoLibs } from "./cbomutils.js";

it("cbom utils tests", () => {
  const cryptoLibs = collectOSCryptoLibs();
  assert.ok(cryptoLibs);
});
