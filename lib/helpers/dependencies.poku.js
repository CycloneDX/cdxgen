import { assert, it } from "poku";

import { checkDependencies } from "../../bin/dependencies.js";

it("checks dependency overrides in package.json vs installed in pnpm-lock.yaml", async () => {
  assert.equal(
    checkDependencies(),
    0,
    "There shouldn't have been dependency discrepancies",
  );
});
