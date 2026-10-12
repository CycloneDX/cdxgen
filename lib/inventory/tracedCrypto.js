import { readFileSync } from "node:fs";
import { join } from "node:path";

import { thoughtLog } from "../core/logger.js";
import { dirNameStr } from "../core/paths.js";
import { applyAlgorithmProperties } from "./cryptoAlgorithmFamily.js";

const cryptoOids = JSON.parse(
  readFileSync(join(dirNameStr, "data", "crypto-oid.json"), "utf-8"),
);

// TLS key-exchange groups by their IANA registry name. A hybrid group pairs a
// classical curve with ML-KEM: each half has an OID, the pair has none, so the
// group is recorded as both algorithms.
const GROUP_ALGORITHMS = {
  X25519MLKEM768: ["x25519", "ml-kem-768"],
  SecP256r1MLKEM768: ["secp256r1", "ml-kem-768"],
  SecP384r1MLKEM1024: ["secp384r1", "ml-kem-1024"],
  X25519Kyber768Draft00: ["x25519"],
  MLKEM512: ["ml-kem-512"],
  MLKEM768: ["ml-kem-768"],
  MLKEM1024: ["ml-kem-1024"],
  x448: ["curveX448"],
};

const MLKEM_SECURITY_LEVELS = {
  "ml-kem-512": 1,
  "ml-kem-768": 3,
  "ml-kem-1024": 5,
};

// The curve each classical key-exchange algorithm is defined over.
const KEY_AGREEMENT_CURVES = {
  x25519: "x25519",
  curveX448: "x448",
};

// Closed enums of cryptoProperties.algorithmProperties in bom-1.7.schema.json.
const MODES = new Set(["cbc", "ecb", "ccm", "gcm", "cfb", "ofb", "ctr"]);
const CRYPTO_FUNCTIONS = new Set([
  "generate",
  "keygen",
  "encrypt",
  "decrypt",
  "digest",
  "tag",
  "keyderive",
  "sign",
  "verify",
  "encapsulate",
  "decapsulate",
]);

/**
 * Names the bulk cipher of a TLS cipher suite as a crypto-oid.json key, from
 * either its IANA name (TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256) or its OpenSSL
 * name (ECDHE-RSA-AES128-GCM-SHA256).
 *
 * @param {string} suiteName Cipher suite name
 * @returns {{name: string, bits: number, mode: string|undefined}|undefined} The cipher, when it has an OID
 */
export function suiteCipher(suiteName) {
  const tokens = String(suiteName || "")
    .toUpperCase()
    .split(/[-_]/);
  let cipher;
  if (tokens.includes("CHACHA20")) {
    cipher = { name: "chaCha20Poly1305", bits: 256, mode: undefined };
  } else if (tokens.includes("3DES") || tokens.includes("CBC3")) {
    cipher = { name: "des-EDE3-CBC", bits: 112, mode: "cbc" };
  } else {
    const aesIdx = tokens.findIndex((t) => t.startsWith("AES"));
    if (aesIdx < 0) {
      return undefined;
    }
    const bits =
      Number.parseInt(tokens[aesIdx].substring(3), 10) ||
      Number.parseInt(tokens[aesIdx + 1], 10);
    const mode = ["GCM", "CCM"].find((m) => tokens.includes(m)) || "CBC";
    cipher = { name: `aes${bits}-${mode}`, bits, mode: mode.toLowerCase() };
  }
  return cryptoOids[cipher.name]?.oid ? cipher : undefined;
}

function oidKey(name) {
  if (!name) {
    return undefined;
  }
  if (cryptoOids[name]?.oid) {
    return name;
  }
  const lower = String(name).toLowerCase();
  return cryptoOids[lower]?.oid ? lower : undefined;
}

function cipherProperties(cipher) {
  const props = {
    primitive: cipher.mode === "cbc" ? "block-cipher" : "ae",
    parameterSetIdentifier: String(cipher.bits),
    cryptoFunctions: ["encrypt", "decrypt"],
    classicalSecurityLevel: cipher.bits,
  };
  if (cipher.mode) {
    props.mode = cipher.mode;
  }
  return props;
}

function keyExchangeProperties(name) {
  const level = MLKEM_SECURITY_LEVELS[name];
  if (level) {
    return {
      primitive: "kem",
      cryptoFunctions: ["keygen", "encapsulate", "decapsulate"],
      nistQuantumSecurityLevel: level,
    };
  }
  return { primitive: "key-agree", cryptoFunctions: ["keygen"] };
}

// Keeps the values of an algorithm the traced CBOM described that fit the
// schema; the primitive itself is checked by applyAlgorithmProperties.
function knownAlgorithmProperties(props) {
  const known = {};
  if (typeof props?.primitive === "string") {
    known.primitive = props.primitive === "aead" ? "ae" : props.primitive;
  }
  const mode = String(props?.mode || "").toLowerCase();
  if (MODES.has(mode)) {
    known.mode = mode;
  }
  const functions = (props?.cryptoFunctions || []).filter((f) =>
    CRYPTO_FUNCTIONS.has(f),
  );
  if (functions.length) {
    known.cryptoFunctions = functions;
  }
  for (const level of ["classicalSecurityLevel", "nistQuantumSecurityLevel"]) {
    if (Number.isInteger(props?.[level])) {
      known[level] = props[level];
    }
  }
  return known;
}

/**
 * Turns the CBOM safer-exec writes for a traced command into components that
 * cdxgen can merge and validate:
 *
 * - every asset gets a bom-ref, without which the assets merge into one
 * - algorithms carry their OID, and those without one are left out
 * - hybrid key-exchange groups become their classical and ML-KEM halves
 * - cipher suites become their bulk cipher, which the protocol's suites refer
 *   to by bom-ref
 * - algorithm properties keep only values the schema allows
 * - crypto libraries are left out: they are the traced library components,
 *   marked with cdx:dynamic:cryptoLibrary
 *
 * @param {Object[]} cbomComponents Components of the safer-exec CBOM
 * @returns {Object[]} Normalized cryptographic-asset components
 */
export function normalizeTracedCryptoComponents(cbomComponents) {
  const byRef = new Map();
  const addAlgorithm = (name, algorithmProperties, curve) => {
    const oid = cryptoOids[name].oid;
    const ref = `crypto/algorithm/${encodeURIComponent(name)}@${oid}`;
    if (!byRef.has(ref)) {
      const component = {
        type: "cryptographic-asset",
        name,
        "bom-ref": ref,
        description: cryptoOids[name].description,
        cryptoProperties: {
          assetType: "algorithm",
          algorithmProperties,
          oid,
        },
      };
      applyAlgorithmProperties(component, { name, curve });
      byRef.set(ref, component);
    }
    return ref;
  };
  const protocols = [];
  for (const comp of cbomComponents || []) {
    const props = comp?.cryptoProperties;
    if (comp?.type !== "cryptographic-asset" || !props) {
      continue;
    }
    if (props.assetType === "protocol") {
      protocols.push(comp);
      continue;
    }
    if (props.assetType !== "algorithm") {
      continue;
    }
    const groupHalves = GROUP_ALGORITHMS[comp.name];
    if (groupHalves) {
      for (const half of groupHalves) {
        addAlgorithm(
          half,
          keyExchangeProperties(half),
          KEY_AGREEMENT_CURVES[half] ||
            (MLKEM_SECURITY_LEVELS[half] ? "" : half),
        );
      }
      continue;
    }
    const name = oidKey(comp.name);
    if (name) {
      addAlgorithm(
        name,
        MLKEM_SECURITY_LEVELS[name] || KEY_AGREEMENT_CURVES[name]
          ? keyExchangeProperties(name)
          : knownAlgorithmProperties(props.algorithmProperties),
        KEY_AGREEMENT_CURVES[name] ||
          (/^(secp|brainpool)/.test(name) ? name : ""),
      );
      continue;
    }
    const cipher = suiteCipher(comp.name);
    if (cipher) {
      addAlgorithm(cipher.name, cipherProperties(cipher));
      continue;
    }
    thoughtLog(`Skipping traced algorithm '${comp.name}' without an OID.`);
  }
  for (const comp of protocols) {
    const ref = `crypto/protocol/${encodeURIComponent(comp.name)}@${encodeURIComponent(comp.version || "unknown")}`;
    const protocolProperties = {
      ...comp.cryptoProperties.protocolProperties,
    };
    // The traced suites list algorithm names; the schema wants bom-refs.
    const cipherSuites = (protocolProperties.cipherSuites || []).map(
      ({ algorithms: _names, ...suite }) => {
        const cipher = suiteCipher(suite.name);
        return cipher
          ? {
              ...suite,
              algorithms: [addAlgorithm(cipher.name, cipherProperties(cipher))],
            }
          : suite;
      },
    );
    const existing = byRef.get(ref);
    if (existing) {
      const suites = existing.cryptoProperties.protocolProperties.cipherSuites;
      for (const suite of cipherSuites) {
        if (!suites.some((s) => s.name === suite.name)) {
          suites.push(suite);
        }
      }
      continue;
    }
    protocolProperties.cipherSuites = cipherSuites;
    const component = {
      type: "cryptographic-asset",
      name: comp.name,
      "bom-ref": ref,
      cryptoProperties: {
        assetType: "protocol",
        protocolProperties,
      },
    };
    if (comp.version) {
      component.version = comp.version;
    }
    byRef.set(ref, component);
  }
  return Array.from(byRef.values());
}

/**
 * Maps the crypto libraries safer-exec reported to the paths they were loaded
 * from.
 *
 * @param {Object[]} cryptoEntries safer-exec crypto-library and crypto-cipher audit entries
 * @returns {Map<string, {name: string, version: string}>} Crypto libraries by path
 */
export function cryptoLibrariesByPath(cryptoEntries) {
  const libraries = new Map();
  for (const entry of cryptoEntries || []) {
    if (entry?.type !== "crypto-library" || !entry.path || !entry.name) {
      continue;
    }
    if (!libraries.has(entry.path)) {
      libraries.set(entry.path, {
        name: String(entry.name),
        version: entry.version ? String(entry.version) : "",
      });
    }
  }
  return libraries;
}
