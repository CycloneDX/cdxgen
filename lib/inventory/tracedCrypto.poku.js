import { assert, describe, it } from "poku";

import {
  cryptoLibrariesByPath,
  normalizeTracedCryptoComponents,
  suiteCipher,
} from "./tracedCrypto.js";

// The CBOM safer-exec 1.1.0 writes for `curl.exe https://example.com` through
// its egress proxy on Windows, trimmed to one library.
const windowsCbom = [
  {
    type: "cryptographic-asset",
    name: "Windows Schannel",
    version: "6.2.26100.9444",
    cryptoProperties: {
      assetType: "related-crypto-material",
      relatedCryptoMaterialProperties: { type: "library" },
    },
  },
  {
    type: "cryptographic-asset",
    name: "TLS_AES_256_GCM_SHA384",
    version: "TLSv1.3",
    cryptoProperties: {
      assetType: "algorithm",
      algorithmProperties: {
        primitive: "aead",
        parameterSetIdentifier: "SHA384",
        mode: "GCM",
        cryptoFunctions: ["encrypt", "decrypt"],
        classicalSecurityLevel: 256,
      },
    },
  },
  {
    type: "cryptographic-asset",
    name: "x25519",
    cryptoProperties: {
      assetType: "algorithm",
      algorithmProperties: {
        primitive: "key-agree",
        cryptoFunctions: ["keygen", "keyagree"],
      },
    },
  },
  {
    type: "cryptographic-asset",
    name: "TLSv1.3",
    version: "1.3",
    cryptoProperties: {
      assetType: "protocol",
      protocolProperties: {
        type: "tls",
        version: "1.3",
        cipherSuites: [
          {
            name: "TLS_AES_256_GCM_SHA384",
            algorithms: ["ECDHE", "AES", "SHA384"],
          },
        ],
      },
    },
  },
];

describe("normalizeTracedCryptoComponents()", () => {
  it("gives every asset a bom-ref and an OID, and drops library entries", () => {
    const comps = normalizeTracedCryptoComponents(windowsCbom);
    assert.deepEqual(
      comps.map((c) => c["bom-ref"]),
      [
        "crypto/algorithm/aes256-GCM@2.16.840.1.101.3.4.1.46",
        "crypto/algorithm/x25519@1.3.101.110",
        "crypto/protocol/TLSv1.3@1.3",
      ],
    );
    const aes = comps[0];
    assert.strictEqual(aes.cryptoProperties.oid, "2.16.840.1.101.3.4.1.46");
    assert.strictEqual(
      aes.cryptoProperties.algorithmProperties.primitive,
      "ae",
    );
    assert.strictEqual(aes.cryptoProperties.algorithmProperties.mode, "gcm");
    assert.strictEqual(
      aes.cryptoProperties.algorithmProperties.parameterSetIdentifier,
      "256",
    );
    assert.deepEqual(
      comps[1].cryptoProperties.algorithmProperties.cryptoFunctions,
      ["keygen"],
    );
  });

  it("refers to the suite's cipher by bom-ref from the protocol", () => {
    const protocol = normalizeTracedCryptoComponents(windowsCbom).at(-1);
    assert.deepEqual(
      protocol.cryptoProperties.protocolProperties.cipherSuites,
      [
        {
          name: "TLS_AES_256_GCM_SHA384",
          algorithms: ["crypto/algorithm/aes256-GCM@2.16.840.1.101.3.4.1.46"],
        },
      ],
    );
  });

  it("records a hybrid post-quantum group as its two algorithms", () => {
    const comps = normalizeTracedCryptoComponents([
      {
        type: "cryptographic-asset",
        name: "X25519MLKEM768",
        cryptoProperties: {
          assetType: "algorithm",
          algorithmProperties: {
            primitive: "kem",
            nistQuantumSecurityLevel: 3,
          },
        },
      },
    ]);
    assert.deepEqual(
      comps.map((c) => [
        c.name,
        c.cryptoProperties.algorithmProperties.primitive,
      ]),
      [
        ["x25519", "key-agree"],
        ["ml-kem-768", "kem"],
      ],
    );
    assert.strictEqual(
      comps[1].cryptoProperties.algorithmProperties.nistQuantumSecurityLevel,
      3,
    );
  });

  it("drops invalid enum values and algorithms without an OID", () => {
    const comps = normalizeTracedCryptoComponents([
      {
        type: "cryptographic-asset",
        name: "ffdhe2048",
        cryptoProperties: { assetType: "algorithm" },
      },
      {
        type: "cryptographic-asset",
        name: "ECDHE-RSA-AES128-GCM-SHA256",
        version: "TLSv1.2",
        cryptoProperties: {
          assetType: "algorithm",
          algorithmProperties: {
            primitive: "aead",
            mode: "GCM",
            executionEnvironment: "openssl",
            implementationPlatform: "openssl",
          },
        },
      },
    ]);
    assert.strictEqual(comps.length, 1);
    assert.strictEqual(comps[0].name, "aes128-GCM");
    const props = comps[0].cryptoProperties.algorithmProperties;
    assert.strictEqual(props.executionEnvironment, undefined);
    assert.strictEqual(props.implementationPlatform, undefined);
  });

  it("merges the suites of repeated protocol entries", () => {
    const tls12 = (suite) => ({
      type: "cryptographic-asset",
      name: "TLSv1.2",
      version: "1.2",
      cryptoProperties: {
        assetType: "protocol",
        protocolProperties: { type: "tls", cipherSuites: [{ name: suite }] },
      },
    });
    const comps = normalizeTracedCryptoComponents([
      tls12("ECDHE-RSA-AES256-GCM-SHA384"),
      tls12("ECDHE-RSA-CHACHA20-POLY1305"),
    ]);
    const protocol = comps.find((c) => c.name === "TLSv1.2");
    assert.deepEqual(
      protocol.cryptoProperties.protocolProperties.cipherSuites.map(
        (s) => s.algorithms[0],
      ),
      [
        "crypto/algorithm/aes256-GCM@2.16.840.1.101.3.4.1.46",
        `crypto/algorithm/chaCha20Poly1305@${comps.find((c) => c.name === "chaCha20Poly1305").cryptoProperties.oid}`,
      ],
    );
  });
});

describe("suiteCipher()", () => {
  it("reads IANA and OpenSSL suite names", () => {
    assert.strictEqual(
      suiteCipher("TLS_AES_128_GCM_SHA256").name,
      "aes128-GCM",
    );
    assert.strictEqual(
      suiteCipher("TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA").name,
      "aes256-CBC",
    );
    assert.strictEqual(suiteCipher("AES256-SHA").name, "aes256-CBC");
    assert.strictEqual(
      suiteCipher("TLS_CHACHA20_POLY1305_SHA256").name,
      "chaCha20Poly1305",
    );
    assert.strictEqual(
      suiteCipher("TLS_RSA_WITH_3DES_EDE_CBC_SHA").name,
      "des-EDE3-CBC",
    );
    assert.strictEqual(suiteCipher("TLS_NULL_WITH_NULL_NULL"), undefined);
  });
});

describe("cryptoLibrariesByPath()", () => {
  it("keys crypto-library audit entries by path", () => {
    const libs = cryptoLibrariesByPath([
      {
        type: "crypto-library",
        name: "Windows Schannel",
        version: "6.2.26100.9444",
        path: "C:\\Windows\\System32\\schannel.dll",
      },
      { type: "crypto-cipher", name: "TLS_AES_128_GCM_SHA256" },
      { type: "crypto-library", name: "OpenSSL" },
    ]);
    assert.deepEqual(Array.from(libs.entries()), [
      [
        "C:\\Windows\\System32\\schannel.dll",
        { name: "Windows Schannel", version: "6.2.26100.9444" },
      ],
    ]);
  });
});
