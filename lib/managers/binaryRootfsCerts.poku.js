import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { assert, describe, it } from "poku";

const FIXTURES = resolve("test", "data", "cbom-certs");
const KEYSTORE_LOCATION = "/usr/lib/jvm/java-21/lib/security/cacerts";

// Runs getOSPackages over a rootfs in a child process, so the plugin binary
// is resolved from the environment the way a real run resolves it. The
// stand-in plugin is a shell script that prints the committed report.
function scan({ reportName, withPlugin }) {
  const dir = mkdtempSync(join(tmpdir(), "cdxgen-binrootfs-"));
  try {
    const root = join(dir, "root");
    const keystoreDir = join(root, "usr/lib/jvm/java-21/lib/security");
    mkdirSync(keystoreDir, { recursive: true });
    cpSync(
      join(FIXTURES, "generated", "cacerts.p12"),
      join(keystoreDir, "cacerts"),
    );
    cpSync(join(FIXTURES, "rootfs"), root, { recursive: true });
    const env = { ...process.env, CDXGEN_PLUGINS_DIR: join(dir, "no-plugins") };
    delete env.TRUSTINSPECTOR_CMD;
    if (withPlugin) {
      const plugin = join(dir, "trustinspector");
      writeFileSync(plugin, `#!/bin/sh\ncat "${join(FIXTURES, reportName)}"\n`);
      chmodSync(plugin, 0o755);
      env.TRUSTINSPECTOR_CMD = plugin;
    }
    const code = `
      import { getOSPackages } from ${JSON.stringify(pathToFileURL(resolve("lib/managers/binary.js")).href)};
      const r = await getOSPackages(${JSON.stringify(root)}, { Env: [] }, {});
      console.log("@@" + JSON.stringify({ components: r.osPackages.filter(c => c.type === "cryptographic-asset"), dependencies: r.dependenciesList }));
    `;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      { encoding: "utf-8", env, maxBuffer: 64 * 1024 * 1024 },
    );
    const line = result.stdout.split("\n").find((l) => l.startsWith("@@"));
    assert.ok(line, result.stderr || result.stdout);
    return JSON.parse(line.slice(2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const names = (data, assetType) =>
  data.components
    .filter((c) => c.cryptoProperties?.assetType === assetType)
    .map((c) => c.name)
    .sort();

describe("getOSPackages() certificate inventory of a rootfs", () => {
  it("without the plugin walks the rootfs in JavaScript", () => {
    if (process.platform === "win32") {
      return;
    }
    const data = scan({ withPlugin: false });
    assert.ok(names(data, "certificate").includes("Demo Root A"));
    assert.ok(names(data, "certificate").includes("api.example.test"));
    assert.ok(
      data.components.some((c) =>
        c["bom-ref"].startsWith("crypto/related-crypto-material/keystore/"),
      ),
    );
  });

  it("with a report-2 plugin the plugin report is the only certificate producer", () => {
    if (process.platform === "win32") {
      return;
    }
    const data = scan({ withPlugin: true, reportName: "report-2-rootfs.json" });
    const refs = data.components.map((c) => c["bom-ref"]);
    assert.strictEqual(new Set(refs).size, refs.length, "no duplicate refs");
    // Only what the committed report lists: the rootfs holds a k8s secret the
    // plugin does not parse, and the fallback must not run beside the plugin.
    assert.ok(!JSON.stringify(data).includes("tls-secret.yaml"));
    const keystore = data.components.find(
      (c) =>
        c["bom-ref"] ===
        `crypto/related-crypto-material/keystore/${encodeURIComponent(KEYSTORE_LOCATION)}`,
    );
    assert.ok(keystore, "readable keystore gets a component");
    const edge = data.dependencies.find((d) => d.ref === keystore["bom-ref"]);
    assert.ok(edge?.dependsOn.length > 0);
  });

  it("with a report-1 plugin certificates still come from the report", () => {
    if (process.platform === "win32") {
      return;
    }
    const data = scan({ withPlugin: true, reportName: "report-1-rootfs.json" });
    assert.ok(names(data, "certificate").length > 0);
    assert.ok(!JSON.stringify(data).includes("tls-secret.yaml"));
    const refs = data.components.map((c) => c["bom-ref"]);
    assert.strictEqual(new Set(refs).size, refs.length);
  });
});
