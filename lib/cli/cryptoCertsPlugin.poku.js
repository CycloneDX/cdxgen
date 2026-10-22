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
import { join } from "node:path";
import process from "node:process";

import esmock from "esmock";
import { assert, describe, it } from "poku";

const FIXTURES = join("test", "data", "cbom-certs");
const KEYSTORE_LOCATION = "/usr/lib/jvm/java-21/lib/security/cacerts";

const prop = (component, name) =>
  component.properties?.find((p) => p.name === name)?.value;

// Builds a rootfs holding the committed PKCS#12 truststore at the path the
// committed plugin reports use, and a stand-in plugin binary that prints the
// given report. The stand-in is a shell script, so these tests do not run on
// Windows.
function setup(report) {
  const dir = mkdtempSync(join(tmpdir(), "cdxgen-cryptocerts-"));
  const root = join(dir, "root");
  const keystoreDir = join(root, "usr/lib/jvm/java-21/lib/security");
  mkdirSync(keystoreDir, { recursive: true });
  cpSync(
    join(FIXTURES, "generated", "cacerts.p12"),
    join(keystoreDir, "cacerts"),
  );
  const reportFile = join(dir, "report.json");
  writeFileSync(reportFile, JSON.stringify(report));
  const plugin = join(dir, "trustinspector");
  writeFileSync(plugin, `#!/bin/sh\ncat "${reportFile}"\n`);
  chmodSync(plugin, 0o755);
  return { dir, root, plugin };
}

async function run({ root, plugin }) {
  const { createCryptoCertsBom } = await esmock("./managedBom.js", {
    "../inventory/plugins.js": {
      resolvePluginBinary: (name) =>
        name === "trustinspector" ? plugin : undefined,
      getPluginToolComponents: () => [],
    },
  });
  return createCryptoCertsBom(root, {
    multiProject: true,
    allLayersExplodedDir: root,
  });
}

const report2 = () =>
  JSON.parse(readFileSync(join(FIXTURES, "report-2-rootfs.json"), "utf-8"));

describe("createCryptoCertsBom with the plugin: keystores", () => {
  it("emits a keystore component linked to the certificates it holds", async () => {
    if (process.platform === "win32") {
      return;
    }
    const env = setup(report2());
    try {
      const bom = await run(env);
      const keystore = bom.bomJson.components.find(
        (c) =>
          c["bom-ref"] ===
          `crypto/related-crypto-material/keystore/${encodeURIComponent(KEYSTORE_LOCATION)}`,
      );
      assert.ok(keystore, "keystore component present");
      assert.strictEqual(
        prop(keystore, "cdx:crypto:sourceType"),
        "java-truststore",
      );
      assert.strictEqual(
        prop(keystore, "cdx:crypto:keystoreReadable"),
        undefined,
      );
      assert.deepStrictEqual(keystore.evidence.occurrences, [
        { location: KEYSTORE_LOCATION },
      ]);
      const held = bom.bomJson.components.filter(
        (c) =>
          c.cryptoProperties?.assetType === "certificate" &&
          c.evidence.occurrences.some((o) => o.location === KEYSTORE_LOCATION),
      );
      assert.ok(held.length > 0);
      const edge = bom.dependencies.find((d) => d.ref === keystore["bom-ref"]);
      assert.deepStrictEqual(
        edge.dependsOn,
        held.map((c) => c["bom-ref"]).sort(),
      );
    } finally {
      rmSync(env.dir, { recursive: true, force: true });
    }
  });

  it("still gives an unreadable keystore a component, without certificates or secrets", async () => {
    if (process.platform === "win32") {
      return;
    }
    // Synthesized from the committed report: the certificate materials of the
    // truststore are replaced by the keystore material the plugin emits for
    // a keystore it cannot open. This input is not plugin output.
    const report = report2();
    report.materials = report.materials
      .filter((m) => m.path !== KEYSTORE_LOCATION)
      .concat({
        kind: "keystore",
        path: KEYSTORE_LOCATION,
        sourceType: "java-truststore",
        format: "PKCS12",
        properties: [{ name: "cdx:crypto:keystoreReadable", value: "false" }],
      });
    const env = setup(report);
    try {
      const bom = await run(env);
      const keystore = bom.bomJson.components.find((c) =>
        c["bom-ref"].startsWith("crypto/related-crypto-material/keystore/"),
      );
      assert.strictEqual(
        prop(keystore, "cdx:crypto:keystoreReadable"),
        "false",
      );
      assert.ok(
        !bom.dependencies.some((d) => d.ref === keystore["bom-ref"]),
        "no certificate edges",
      );
      const json = JSON.stringify(bom);
      assert.ok(!json.includes("changeit"));
      assert.ok(!json.includes(env.dir), "no host paths");
    } finally {
      rmSync(env.dir, { recursive: true, force: true });
    }
  });

  it("without a plugin the keystore component carries keystoreReadable=false", async () => {
    const env = setup(report2());
    try {
      const { createCryptoCertsBom } = await esmock("./managedBom.js", {
        "../inventory/plugins.js": {
          resolvePluginBinary: () => undefined,
          getPluginToolComponents: () => [],
        },
      });
      const bom = await createCryptoCertsBom(env.root, {
        multiProject: true,
        allLayersExplodedDir: env.root,
      });
      const keystore = bom.bomJson.components.find((c) =>
        c["bom-ref"].startsWith("crypto/related-crypto-material/keystore/"),
      );
      assert.strictEqual(
        prop(keystore, "cdx:crypto:keystoreReadable"),
        "false",
      );
    } finally {
      rmSync(env.dir, { recursive: true, force: true });
    }
  });

  it("a report-1 plugin falls back to the same producer as no plugin", async () => {
    if (process.platform === "win32") {
      return;
    }
    const report1 = JSON.parse(
      readFileSync(join(FIXTURES, "report-1-rootfs.json"), "utf-8"),
    );
    const env = setup(report1);
    try {
      const bom = await run(env);
      const keystore = bom.bomJson.components.find((c) =>
        c["bom-ref"].startsWith("crypto/related-crypto-material/keystore/"),
      );
      assert.strictEqual(
        prop(keystore, "cdx:crypto:keystoreReadable"),
        "false",
      );
    } finally {
      rmSync(env.dir, { recursive: true, force: true });
    }
  });
});
