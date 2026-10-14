# JSF compatibility fixtures

BOMs signed by the cdxgen 13.3.0 signer (`lib/helpers/bomSigner.js` at
`f063a9d99`, identical to the 12.8.5 signer), together with the public keys
that verify them. They pin the
signature format: every file here must keep verifying with the current
`cdx-verify` and `verifyBom()`.

- `replace-<alg>.json` — single root signature over the BOM, with nested
  component, service, and annotation signatures made by the same key.
- `replace-RS512-publickey.json` — the root and nested signatures embed the
  signer's public key.
- `replace-ES256-spec17.json`, `replace-Ed25519-spec20.json` — CycloneDX 1.7
  and 2.0 documents.
- `signers-RS512-ES256.json` — two `signers` entries (`builder` RSA, `auditor`
  P-256); nested signatures belong to `builder`.
- `replace-then-signers.json` — a single RSA signature later moved into a
  `signers` list by an Ed25519 co-signer.
- `chain-Ed25519-PS512.json` — a two-entry `chain` (`builder` Ed25519,
  `release` RSA with PS512); nested signatures belong to `builder`.

The key files are named after the key, not the algorithm: `rsa` signs `RS*`
and `PS256`/`PS512`, `rsapss` signs `PS384`, `p256`/`p384`/`p521` sign
`ES256`/`ES384`/`ES512`. `hmac.secret` is a test-only shared secret for
`replace-HS256.json`. No private keys are kept.
