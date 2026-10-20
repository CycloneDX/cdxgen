import { tmpdir } from "node:os";
import process from "node:process";

import esmock from "esmock";
import { assert, it } from "poku";
import sinon from "sinon";

it("doNpmInstall() does not run npm when dependency installation is disabled", async () => {
  // npm install runs the project's preinstall script even with
  // --package-lock-only, so --no-install-deps must skip it.
  const utils = await import("../../helpers/utils.js");
  const safeSpawnSync = sinon.stub().returns({ status: 0, stdout: "" });
  const { doNpmInstall } = await esmock("./pregen.js", {
    "../../helpers/utils.js": { ...utils, safeSpawnSync },
  });
  doNpmInstall(tmpdir(), "/opt/node/bin", { installDeps: false });
  assert.strictEqual(safeSpawnSync.callCount, 0);
  const originalInstallArgs = process.env.NODE_INSTALL_ARGS;
  delete process.env.NODE_INSTALL_ARGS;
  try {
    doNpmInstall(tmpdir(), "/opt/node/bin", {});
    assert.strictEqual(safeSpawnSync.callCount, 1);
  } finally {
    if (originalInstallArgs !== undefined) {
      process.env.NODE_INSTALL_ARGS = originalInstallArgs;
    }
  }
});
