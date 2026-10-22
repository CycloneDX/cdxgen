import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { assert, describe, it } from "poku";

import { collectRootfsCertificates } from "./rootfsCerts.js";

const ROOTFS = join("test", "data", "cbom-certs", "rootfs");
const GENERATED = join("test", "data", "cbom-certs", "generated");

const certNames = (result) =>
  result.components
    .filter((c) => c.cryptoProperties?.assetType === "certificate")
    .map((c) => c.name)
    .sort();
const locations = (component) =>
  (component.evidence?.occurrences || []).map((o) => o.location);

const withTmp = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "cdxgen-rootfs-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("collectRootfsCertificates()", () => {
  it("finds the CA bundle, the k8s secret and the Android pin", () => {
    const result = collectRootfsCertificates(ROOTFS);
    assert.deepStrictEqual(certNames(result), [
      "Demo Root A",
      "Demo Root B",
      "Shady Issuing CA 1",
      "api.example.test",
    ]);
    const root = result.components.find((c) => c.name === "Demo Root A");
    assert.deepStrictEqual(locations(root), [
      "/etc/ssl/certs/ca-certificates.crt",
    ]);
    const leaf = result.components.find((c) => c.name === "api.example.test");
    assert.ok(
      locations(leaf)[0].startsWith("/var/run/secrets/tls/tls-secret.yaml#"),
    );
    const pinned = result.components.find((c) =>
      locations(c).includes("/app/res/xml/network_security_config.xml"),
    );
    assert.ok(pinned, "the pin lands on a public-key component");
    assert.strictEqual(
      pinned.cryptoProperties.assetType,
      "related-crypto-material",
    );
  });

  it("is deterministic", () => {
    const a = JSON.stringify(collectRootfsCertificates(ROOTFS));
    const b = JSON.stringify(collectRootfsCertificates(ROOTFS));
    assert.strictEqual(a, b);
  });

  it("matches the bom-refs of the on-disk source scan producer", async () => {
    const { createCryptoCertsBom } = await import("../cli/managedBom.js");
    const scan = await createCryptoCertsBom(ROOTFS, {
      multiProject: true,
      allLayersExplodedDir: ROOTFS,
    });
    const scanRefs = scan.bomJson.components
      .filter((c) => c.cryptoProperties?.assetType === "certificate")
      .map((c) => c["bom-ref"])
      .sort();
    const fallbackRefs = collectRootfsCertificates(ROOTFS)
      .components.filter((c) => c.cryptoProperties?.assetType === "certificate")
      .map((c) => c["bom-ref"])
      .sort();
    assert.deepStrictEqual(fallbackRefs, scanRefs);
  });

  it("returns nothing for a missing root", () => {
    assert.deepStrictEqual(
      collectRootfsCertificates("/no/such/root").components,
      [],
    );
  });

  it("does not follow a symlinked file or directory out of the root", () => {
    if (process.platform === "win32") {
      return;
    }
    withTmp((dir) => {
      const outside = join(dir, "outside");
      mkdirSync(outside);
      cpSync(join(GENERATED, "rootA.crt"), join(outside, "host.crt"));
      const root = join(dir, "root");
      mkdirSync(join(root, "etc", "ssl"), { recursive: true });
      symlinkSync(outside, join(root, "etc", "ssl", "certs"));
      mkdirSync(join(root, "usr", "local", "share", "ca-certificates"), {
        recursive: true,
      });
      symlinkSync(
        join(outside, "host.crt"),
        join(root, "usr", "local", "share", "ca-certificates", "link.crt"),
      );
      const result = collectRootfsCertificates(root);
      assert.deepStrictEqual(result.components, []);
    });
  });

  it("skips FIFOs without blocking", () => {
    if (process.platform === "win32") {
      return;
    }
    withTmp((dir) => {
      const certs = join(dir, "etc", "ssl", "certs");
      mkdirSync(certs, { recursive: true });
      const made = spawnSync("mkfifo", [join(certs, "pipe.crt")]);
      if (made.status !== 0) {
        return;
      }
      cpSync(join(GENERATED, "rootA.crt"), join(certs, "ok.crt"));
      const result = collectRootfsCertificates(dir);
      assert.deepStrictEqual(certNames(result), ["Demo Root A"]);
    });
  });

  it("skips oversized files and stops at the file and depth limits", () => {
    withTmp((dir) => {
      const certs = join(dir, "etc", "ssl", "certs");
      mkdirSync(certs, { recursive: true });
      cpSync(join(GENERATED, "rootA.crt"), join(certs, "a.crt"));
      cpSync(join(GENERATED, "rootB.crt"), join(certs, "b.crt"));
      const big = collectRootfsCertificates(dir, { maxFileBytes: 100 });
      assert.deepStrictEqual(certNames(big), []);
      assert.ok(big.warnings.some((w) => w.includes("skipped")));
      const limited = collectRootfsCertificates(dir, { maxFiles: 1 });
      assert.strictEqual(certNames(limited).length, 1);
      assert.ok(limited.warnings.some((w) => w.includes("file count limit")));
      const deep = join(certs, "d1", "d2", "d3");
      mkdirSync(deep, { recursive: true });
      cpSync(join(GENERATED, "intA.crt"), join(deep, "deep.crt"));
      const shallow = collectRootfsCertificates(dir, { maxDepth: 2 });
      assert.ok(!certNames(shallow).includes("Shady Issuing CA 1"));
      assert.ok(shallow.warnings.some((w) => w.includes("depth limit")));
      const entries = collectRootfsCertificates(dir, { maxEntries: 1 });
      assert.ok(entries.warnings.some((w) => w.includes("entry limit")));
    });
  });

  it("never reads the private-key directories", () => {
    withTmp((dir) => {
      const priv = join(dir, "etc", "ssl", "private");
      mkdirSync(priv, { recursive: true });
      writeFileSync(
        join(priv, "server.pem"),
        "-----BEGIN PRIVATE KEY-----\nQUJDRA==\n-----END PRIVATE KEY-----\n",
      );
      const result = collectRootfsCertificates(dir);
      assert.deepStrictEqual(result.components, []);
    });
  });

  it("classifies a private key without emitting its body", () => {
    withTmp((dir) => {
      const certs = join(dir, "etc", "nginx");
      mkdirSync(certs, { recursive: true });
      writeFileSync(
        join(certs, "site.key"),
        "-----BEGIN PRIVATE KEY-----\nU0VDUkVULUJPRFk=\n-----END PRIVATE KEY-----\n",
      );
      const result = collectRootfsCertificates(dir);
      const json = JSON.stringify(result);
      assert.ok(json.includes("crypto/related-crypto-material/private-key/"));
      assert.ok(!json.includes("U0VDUkVULUJPRFk"));
      assert.ok(!json.includes(dir));
    });
  });

  it("emits a keystore component for a PKCS#12 truststore", () => {
    withTmp((dir) => {
      const jvm = join(dir, "usr", "lib", "jvm", "java-21", "lib", "security");
      mkdirSync(jvm, { recursive: true });
      cpSync(join(GENERATED, "cacerts.p12"), join(jvm, "cacerts"));
      const result = collectRootfsCertificates(dir);
      const keystore = result.components.find((c) =>
        c["bom-ref"].startsWith("crypto/related-crypto-material/keystore/"),
      );
      assert.ok(keystore);
      assert.ok(existsSync(join(jvm, "cacerts")));
    });
  });
});
