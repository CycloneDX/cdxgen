import { readFileSync } from "node:fs";
import { join } from "node:path";

import { assert, describe, it } from "poku";

import {
  androidNetworkSecurityConfigPins,
  CertificateCollector,
  certRecordFromDer,
  classifyCryptoFile,
  keyAlgorithmName,
  kubernetesTlsSecretRecords,
  linkFallbackIssuers,
  mergeDuplicateCryptoComponents,
  parseCertificateDer,
  pemCertificateDerBlocks,
  signatureAlgorithmName,
} from "./certificates.js";

const FIXTURES = join("test", "data", "cbom-certs");
const GENERATED = join(FIXTURES, "generated");

function readFixture(name) {
  return readFileSync(join(GENERATED, name));
}

function pemBlocks(name) {
  return pemCertificateDerBlocks(readFileSync(join(GENERATED, name), "utf-8"));
}

function prop(component, name) {
  return component.properties?.find((property) => property.name === name)
    ?.value;
}

describe("parseCertificateDer()", () => {
  it("walks a real certificate", () => {
    const der = pemBlocks("rootA.crt")[0];
    const parsed = parseCertificateDer(der);
    assert.ok(parsed);
    assert.strictEqual(parsed.version, 3);
    assert.strictEqual(parsed.keyAlgorithmOid, "1.2.840.113549.1.1.1");
    assert.strictEqual(parsed.signatureAlgorithmOid, "1.2.840.113549.1.1.11");
    assert.ok(parsed.rsaKeyBits >= 2047 && parsed.rsaKeyBits <= 2048);
    assert.ok(parsed.subjectKeyId);
    assert.ok(parsed.spkiDer.length > 200);
  });

  it("reads SKI and AKI from extensions", () => {
    const der = pemBlocks("intA.crt")[0];
    const parsed = parseCertificateDer(der);
    assert.ok(parsed.subjectKeyId);
    assert.strictEqual(
      parsed.authorityKeyId,
      parseCertificateDer(pemBlocks("rootA.crt")[0]).subjectKeyId,
    );
  });

  it("returns undefined for malformed input instead of throwing", () => {
    const der = pemBlocks("leaf.crt")[0];
    const truncated = der.subarray(0, Math.floor(der.length / 2));
    assert.strictEqual(parseCertificateDer(truncated), undefined);
    assert.strictEqual(
      parseCertificateDer(Buffer.from([0x30, 0x82, 0xff, 0xff, 0x00])),
      undefined,
    );
    assert.strictEqual(parseCertificateDer(Buffer.alloc(0)), undefined);
    assert.strictEqual(
      parseCertificateDer(Buffer.from("not der at all")),
      undefined,
    );
    // A huge declared length must not be followed.
    const bomb = Buffer.concat([
      Buffer.from([0x30, 0x84, 0x7f, 0xff, 0xff, 0xff]),
      Buffer.alloc(16),
    ]);
    assert.strictEqual(parseCertificateDer(bomb), undefined);
  });

  it("rejects input over the size cap", () => {
    assert.strictEqual(
      parseCertificateDer(Buffer.alloc(2 * 1024 * 1024, 0x30)),
      undefined,
    );
  });
});

describe("keyAlgorithmName() / signatureAlgorithmName()", () => {
  it("names post-quantum algorithms from the table", () => {
    assert.strictEqual(
      keyAlgorithmName({ oid: "2.16.840.1.101.3.4.3.18" }),
      "ML-DSA-65",
    );
    assert.strictEqual(
      keyAlgorithmName({ oid: "2.16.840.1.101.3.4.3.20" }),
      "SLH-DSA-SHA2-128s",
    );
    assert.strictEqual(
      keyAlgorithmName({ oid: "2.16.840.1.101.3.4.4.2" }),
      "ML-KEM-768",
    );
    assert.strictEqual(
      signatureAlgorithmName({ oid: "2.16.840.1.101.3.4.3.17" }),
      "ML-DSA-44",
    );
  });

  it("names classical algorithms with sizes", () => {
    assert.strictEqual(
      keyAlgorithmName({ oid: "1.2.840.113549.1.1.1", bits: 2048 }),
      "RSA-2048",
    );
    assert.strictEqual(
      keyAlgorithmName({
        oid: "1.2.840.10045.2.1",
        curveOid: "1.2.840.10045.3.1.7",
      }),
      "ECDSA-P256",
    );
    assert.strictEqual(keyAlgorithmName({ oid: "1.3.101.112" }), "Ed25519");
    assert.strictEqual(
      signatureAlgorithmName({ oid: "1.2.840.113549.1.1.11" }),
      "SHA256-RSA",
    );
  });

  it("names unknown algorithms by their dotted OID, never '0'", () => {
    assert.strictEqual(
      keyAlgorithmName({ oid: "2.16.840.1.114027.80.6.2" }),
      "2.16.840.1.114027.80.6.2",
    );
    assert.strictEqual(
      signatureAlgorithmName({ oid: "2.16.840.1.114027.80.6.2" }),
      "2.16.840.1.114027.80.6.2",
    );
  });
});

describe("certRecordFromDer() on generated fixtures", () => {
  it("builds records with roles, keys and subject names", () => {
    const records = [
      certRecordFromDer(pemBlocks("rootA.crt")[0], {
        location: "/rootA",
        sourceType: "ca-store",
      }),
      certRecordFromDer(pemBlocks("intA.crt")[0], {
        location: "/intA",
        sourceType: "ca-store",
      }),
      certRecordFromDer(pemBlocks("leaf.crt")[0], {
        location: "/leaf",
        sourceType: "server-config",
      }),
    ];
    assert.strictEqual(records[0].role, "root");
    assert.strictEqual(records[0].selfSigned, true);
    assert.strictEqual(records[1].role, "intermediate");
    assert.strictEqual(records[2].role, "leaf");
    assert.strictEqual(records[2].subject, "CN=api.example.test");
    assert.strictEqual(records[2].issuer, "CN=Shady Issuing CA 1,O=Shady CA");
    assert.strictEqual(records[2].keyName, "RSA-2048");
    assert.strictEqual(records[2].signatureAlgorithm, "SHA256-RSA");
    assert.ok(records[2].serialHex);
    assert.ok(!records[2].serialHex.includes(":"));
    linkFallbackIssuers(records);
    assert.deepStrictEqual(records[2].issuers, [records[1].certSha256]);
    assert.deepStrictEqual(records[1].issuers, [records[0].certSha256]);
  });

  it("gives cross-signed twins one SPKI", () => {
    const intA = certRecordFromDer(pemBlocks("intA.crt")[0], {
      location: "/a",
    });
    const intB = certRecordFromDer(pemBlocks("intB.crt")[0], {
      location: "/b",
    });
    assert.strictEqual(intA.spkiSha256, intB.spkiSha256);
    assert.notStrictEqual(intA.certSha256, intB.certSha256);
  });

  it("classifies the SHA-1 root as a root, not an intermediate", () => {
    const sha1Root = certRecordFromDer(pemBlocks("sha1-root.pem")[0], {
      location: "/sha1",
    });
    assert.strictEqual(sha1Root.role, "root");
    assert.strictEqual(sha1Root.signatureAlgorithm, "SHA1-RSA");
  });

  it("names post-quantum certificates from their OIDs", () => {
    const root = certRecordFromDer(pemBlocks("mldsa65-root.pem")[0], {
      location: "/pq",
    });
    const intermediate = certRecordFromDer(pemBlocks("mldsa44-int.pem")[0], {
      location: "/pq",
    });
    const ecdsaLeaf = certRecordFromDer(pemBlocks("ecdsa-leaf.pem")[0], {
      location: "/pq",
    });
    const kemLeaf = certRecordFromDer(pemBlocks("mlkem768-leaf.pem")[0], {
      location: "/pq",
    });
    const slhRoot = certRecordFromDer(pemBlocks("slhdsa-root.pem")[0], {
      location: "/pq",
    });
    assert.strictEqual(root.keyName, "ML-DSA-65");
    assert.strictEqual(root.signatureAlgorithm, "ML-DSA-65");
    assert.strictEqual(intermediate.keyName, "ML-DSA-44");
    assert.strictEqual(ecdsaLeaf.keyName, "ECDSA-P256");
    assert.strictEqual(kemLeaf.keyName, "ML-KEM-768");
    assert.strictEqual(kemLeaf.signatureAlgorithm, "ML-DSA-44");
    assert.strictEqual(slhRoot.keyName, "SLH-DSA-SHA2-128s");
    // SLH-DSA cannot be verified by every runtime; the self-issued fallback
    // still makes it a root.
    assert.strictEqual(slhRoot.role, "root");
    assert.strictEqual(slhRoot.selfSigned, true);
  });

  it("falls back to self-issued when verification throws", async () => {
    const { X509Certificate } = await import("node:crypto");
    const original = X509Certificate.prototype.verify;
    X509Certificate.prototype.verify = () => {
      throw new Error("unsupported algorithm");
    };
    try {
      const root = certRecordFromDer(pemBlocks("rootA.crt")[0], {
        location: "/r",
      });
      assert.strictEqual(root.selfSigned, true);
      assert.strictEqual(root.selfSignedUnverified, true);
      assert.strictEqual(root.role, "root");
    } finally {
      X509Certificate.prototype.verify = original;
    }
  });

  it("names a hand-mutated unknown OID by the OID itself", () => {
    // Not from a real issuer: the test flips the signature algorithm's last
    // OID arc (sha256WithRSA's .11) to an unassigned arc of the same encoded
    // length, so the DER stays well formed while the OID becomes unknown.
    const der = pemBlocks("leaf.crt")[0];
    const oidPattern = Buffer.from([
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b,
    ]);
    let last = -1;
    for (
      let at = der.indexOf(oidPattern);
      at !== -1;
      at = der.indexOf(oidPattern, at + 1)
    ) {
      last = at;
    }
    assert.ok(last > 0, "signature OID found in the certificate");
    const mutated = Buffer.from(der);
    mutated[last + oidPattern.length - 1] = 0x63;
    const record = certRecordFromDer(mutated, { location: "/mutated" });
    assert.strictEqual(record.signatureAlgorithmOid, "1.2.840.113549.1.1.99");
    assert.strictEqual(record.signatureAlgorithm, "1.2.840.113549.1.1.99");
  });
});

describe("CertificateCollector", () => {
  it("builds the contract model from report-2 materials", () => {
    const report = JSON.parse(
      readFileSync(join(FIXTURES, "report-2-rootfs.json"), "utf-8"),
    );
    assert.strictEqual(report.schema, "trustinspector/report-2");
    const collector = new CertificateCollector();
    collector.addTrustInspectorMaterials(report.materials);
    const { components, dependencies } = collector.build();
    const certificates = components.filter(
      (component) => component.cryptoProperties.assetType === "certificate",
    );
    assert.strictEqual(certificates.length, 5);
    const twins = certificates.filter(
      (component) => component.name === "Shady Issuing CA 1",
    );
    assert.strictEqual(twins.length, 2, "both twins survive (G2)");
    const keys = components.filter(
      (component) =>
        component.cryptoProperties.assetType === "related-crypto-material",
    );
    // Four distinct SPKIs: rootA, rootB, the shared intermediate key, leaf.
    assert.strictEqual(keys.length, 4);
    const sharedKey = keys.find(
      (component) =>
        component["bom-ref"].startsWith("crypto/public-key/") &&
        component.version ===
          twins[0].properties.find(
            (property) => property.name === "cdx:crypto:spkiSha256",
          ).value,
    );
    assert.ok(sharedKey, "twins share one public-key component");
    assert.ok(
      sharedKey.cryptoProperties.relatedCryptoMaterialProperties.fingerprint
        .content,
    );
    // Leaf depends on both twins; each twin depends on its own root.
    const leaf = certificates.find(
      (component) => component.name === "api.example.test",
    );
    const leafEdge = dependencies.find(
      (dependency) => dependency.ref === leaf["bom-ref"],
    );
    assert.strictEqual(leafEdge.dependsOn.length, 2);
    const issuerSpkis = leaf.properties.filter(
      (property) => property.name === "cdx:crypto:issuerSpkiSha256",
    );
    assert.strictEqual(issuerSpkis.length, 1, "one key, one property");
    const extensions =
      leaf.cryptoProperties.certificateProperties.certificateExtensions;
    assert.deepStrictEqual(
      extensions
        .map((extension) => extension.commonExtensionName)
        .filter(Boolean),
      [
        "basicConstraints",
        "keyUsage",
        "extendedKeyUsage",
        "subjectKeyIdentifier",
        "authorityKeyIdentifier",
        "subjectAlternativeName",
      ],
    );
    // Determinism: a second build is byte-identical.
    const again = new CertificateCollector();
    again.addTrustInspectorMaterials(report.materials);
    assert.deepStrictEqual(
      JSON.stringify(again.build()),
      JSON.stringify({ components, dependencies }),
    );
  });

  it("keeps report-1 input working with cert-hash bom-refs", () => {
    const report = JSON.parse(
      readFileSync(join(FIXTURES, "report-1-rootfs.json"), "utf-8"),
    );
    const collector = new CertificateCollector();
    collector.addTrustInspectorMaterials(report.materials);
    const { components } = collector.build();
    const certificates = components.filter(
      (component) => component.cryptoProperties.assetType === "certificate",
    );
    assert.ok(certificates.length >= 3);
    for (const certificate of certificates) {
      assert.match(
        certificate["bom-ref"],
        /^crypto\/certificate\/.+@sha256:[0-9a-f]{64}$/,
      );
      assert.ok(!certificate["bom-ref"].includes("undefined"));
    }
    assert.strictEqual(
      components.filter(
        (component) =>
          component.cryptoProperties.assetType === "related-crypto-material",
      ).length,
      0,
      "report-1 has no SPKI, so no public-key components",
    );
  });

  it("deduplicates certificates across producers with merged occurrences", () => {
    const report = JSON.parse(
      readFileSync(join(FIXTURES, "report-2-rootfs.json"), "utf-8"),
    );
    const collector = new CertificateCollector();
    const fallback = certRecordFromDer(pemBlocks("rootA.crt")[0], {
      location: "/extra/location.crt",
      sourceType: "generic",
    });
    collector.addRecords([fallback]);
    collector.addTrustInspectorMaterials(report.materials);
    const { components } = collector.build();
    const rootA = components.find(
      (component) => component.name === "Demo Root A",
    );
    const locations = rootA.evidence.occurrences.map((o) => o.location);
    assert.ok(locations.includes("/extra/location.crt"));
    assert.ok(locations.includes("/etc/ssl/certs/ca-certificates.crt"));
    assert.strictEqual(
      locations.length,
      new Set(locations).size,
      "occurrences are deduplicated and sorted",
    );
  });

  it("records Android pins as public-key components", () => {
    const pins = androidNetworkSecurityConfigPins(
      readFileSync(join(GENERATED, "network_security_config.xml"), "utf-8"),
      { file: "/res/xml/network_security_config.xml" },
    );
    assert.strictEqual(pins.length, 1);
    const collector = new CertificateCollector();
    collector.addPin(pins[0]);
    const { components } = collector.build();
    const pinKey = components.find(
      (component) =>
        component.cryptoProperties.assetType === "related-crypto-material",
    );
    assert.strictEqual(prop(pinKey, "cdx:crypto:sourceType"), "pin");
    assert.strictEqual(
      pinKey.cryptoProperties.relatedCryptoMaterialProperties.size,
      undefined,
    );
    assert.deepStrictEqual(pinKey.evidence.occurrences, [
      { location: "/res/xml/network_security_config.xml" },
    ]);
  });

  it("parses kubernetes TLS secrets without touching tls.key", () => {
    const records = kubernetesTlsSecretRecords(
      readFileSync(join(GENERATED, "tls-secret.yaml"), "utf-8"),
      { file: "/deploy/tls-secret.yaml" },
    );
    assert.strictEqual(records.length, 2);
    assert.ok(
      records.every(
        (record) =>
          record.occurrences[0].location === "/deploy/tls-secret.yaml#api-tls",
      ),
    );
    const yamlText = readFileSync(join(GENERATED, "tls-secret.yaml"), "utf-8");
    assert.ok(!yamlText.includes("tls.key"), "fixture never carries tls.key");
  });
});

describe("classifyCryptoFile()", () => {
  it("classifies bundles, keys, keystores and unknown content", () => {
    assert.strictEqual(
      classifyCryptoFile(readFixture("ca-certificates.crt")).kind,
      "certificates",
    );
    assert.strictEqual(
      classifyCryptoFile(readFixture("twins-bundle.crt")).ders.length,
      3,
    );
    assert.deepStrictEqual(
      classifyCryptoFile(readFixture("fullchain.pem")).ders.length,
      2,
    );
    const privkey = Buffer.concat([
      Buffer.from("-----BEGIN PRIVATE KEY-----\n"),
      Buffer.from("A".repeat(64), "utf-8"),
      Buffer.from("\n-----END PRIVATE KEY-----\n"),
    ]);
    assert.deepStrictEqual(classifyCryptoFile(privkey), {
      kind: "private-key",
      format: "PKCS8",
    });
    assert.strictEqual(
      classifyCryptoFile(readFixture("cacerts.p12")).kind,
      "keystore",
    );
    assert.strictEqual(
      classifyCryptoFile(readFixture("cacerts.p12")).format,
      "PKCS12",
    );
    assert.strictEqual(
      classifyCryptoFile(Buffer.from([0xfe, 0xed, 0xfe, 0xed, 0, 0, 0, 1]))
        .format,
      "JKS",
    );
    assert.strictEqual(
      classifyCryptoFile(Buffer.from([0xce, 0xce, 0xce, 0xce, 0, 0, 0, 1]))
        .format,
      "JCEKS",
    );
    assert.strictEqual(
      classifyCryptoFile(Buffer.from("plain text")).kind,
      "unknown",
    );
  });

  it("never throws on hostile input", () => {
    assert.doesNotThrow(() => classifyCryptoFile(Buffer.alloc(0)));
    assert.doesNotThrow(() =>
      classifyCryptoFile(Buffer.from([0x30, 0x82, 0xff, 0xff])),
    );
    assert.doesNotThrow(() =>
      classifyCryptoFile(
        Buffer.from(
          "-----BEGIN CERTIFICATE-----\nzzzz\n-----END CERTIFICATE-----\n",
        ),
      ),
    );
  });
});

describe("mergeDuplicateCryptoComponents()", () => {
  it("merges same-ref crypto components, unioning occurrences", () => {
    const left = {
      "bom-ref": "crypto/certificate/a@sha256:x",
      type: "cryptographic-asset",
      cryptoProperties: { assetType: "certificate" },
      evidence: { occurrences: [{ location: "/one" }] },
      properties: [{ name: "cdx:crypto:certRole", value: "root" }],
    };
    const right = {
      "bom-ref": "crypto/certificate/a@sha256:x",
      type: "cryptographic-asset",
      cryptoProperties: { assetType: "certificate" },
      evidence: { occurrences: [{ location: "/two" }, { location: "/one" }] },
      properties: [{ name: "cdx:crypto:isCA", value: "true" }],
    };
    const merged = mergeDuplicateCryptoComponents([left, right]);
    assert.strictEqual(merged.length, 1);
    assert.deepStrictEqual(
      merged[0].evidence.occurrences.map((o) => o.location),
      ["/one", "/two"],
    );
    assert.strictEqual(merged[0].properties.length, 2);
  });
});

describe("secrets never reach the output", () => {
  it("emits no private-key material from any producer", () => {
    const report = JSON.parse(
      readFileSync(join(FIXTURES, "report-2-rootfs.json"), "utf-8"),
    );
    const collector = new CertificateCollector();
    collector.addTrustInspectorMaterials(report.materials);
    const output = JSON.stringify(collector.build());
    assert.ok(!output.includes("PRIVATE KEY"));
    assert.ok(!output.includes("BEGIN RSA"));
    assert.ok(!output.includes("changeit"));
    // The private-key material contributes only its path and header format.
    const privateKey = report.materials.find((m) => m.kind === "private-key");
    assert.ok(privateKey);
    assert.ok(Object.keys(privateKey).includes("format"));
    assert.strictEqual(privateKey.path, "/etc/nginx/ssl/privkey.pem");
  });
});
