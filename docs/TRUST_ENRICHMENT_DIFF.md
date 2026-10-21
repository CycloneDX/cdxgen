# Trust enrichment BOM diff examples

This page shows compact **before → after** excerpts for the new trust-oriented enrichments added by the `trivy-cdxgen-*` and `trustinspector-cdxgen-*` helpers.

Use it when you want a quick visual answer to: **what materially changes in the BOM once the new helpers are present?**

## 1) Container / rootfs example

### Before

A conventional rootfs SBOM already contains OS packages, but it typically does **not** expose package trust state, repository trust anchors, or helper provenance.

```json
{
  "metadata": {
    "tools": {
      "components": [
        {
          "name": "trivy",
          "version": "0.67.2"
        }
      ]
    }
  },
  "components": [
    {
      "type": "library",
      "name": "bash",
      "purl": "pkg:deb/debian/bash@5.2.15-2+b9?distro=debian-12"
    }
  ]
}
```

### After

```diff
@@ metadata.tools.components
   {
     "name": "trivy",
     "version": "0.67.2"
   },
+  {
+    "type": "application",
+    "name": "trustinspector",
+    "version": "2.1.0",
+    "purl": "pkg:generic/github.com/cdxgen/cdxgen-plugins-bin/trustinspector-cdxgen@2.1.0",
+    "hashes": [
+      {
+        "alg": "SHA-256",
+        "content": "<helper sha256>"
+      }
+    ]
+  }
@@ components[name=bash].properties
+  { "name": "PackageArchitecture", "value": "amd64" },
+  { "name": "PackageSource", "value": "bash-src" },
+  { "name": "PackageStatus", "value": "install ok installed" }
@@ components[name=bash]
+  "supplier": { "name": "Debian Bash Maintainers <bash@example.test>" },
+  "authors": [
+    { "name": "Debian Bash Maintainers", "email": "bash@example.test" }
+  ]
@@ components
+  {
+    "type": "data",
+    "name": "deb.debian.org/debian",
+    "purl": "pkg:generic/os-repository/deb.debian.org%2Fdebian@bookworm?...",
+    "properties": [
+      { "name": "internal:SrcFile", "value": "/etc/apt/sources.list.d/debian.sources" },
+      { "name": "cdx:os:repo:type", "value": "apt" },
+      { "name": "cdx:os:repo:url", "value": "https://deb.debian.org/debian" },
+      { "name": "cdx:os:repo:enabled", "value": "true" },
+      { "name": "cdx:os:repo:signedBy", "value": "/usr/share/keyrings/debian-archive-keyring.gpg" }
+    ]
+  },
+  {
+    "type": "cryptographic-asset",
+    "name": "debian-archive-keyring.gpg",
+    "cryptoProperties": {
+      "assetType": "related-crypto-material",
+      "relatedCryptoMaterialProperties": {
+        "type": "public-key",
+        "state": "active"
+      }
+    },
+    "properties": [
+      { "name": "internal:SrcFile", "value": "/usr/share/keyrings/debian-archive-keyring.gpg" },
+      { "name": "cdx:crypto:trustDomain", "value": "apt" },
+      { "name": "cdx:crypto:fingerprint", "value": "<fingerprint>" },
+      { "name": "cdx:crypto:algorithm", "value": "RSA" },
+      { "name": "cdx:crypto:keyStrength", "value": "4096" },
+      { "name": "cdx:crypto:keyId", "value": "<key id>" },
+      { "name": "cdx:crypto:userId", "value": "Debian Archive Automatic Signing Key <ftpmaster@debian.org>" }
+    ]
+  },
+  {
+    "type": "cryptographic-asset",
+    "name": "ca-certificates.crt",
+    "cryptoProperties": {
+      "assetType": "certificate"
+    },
+    "properties": [
+      { "name": "cdx:crypto:trustDomain", "value": "ca-store" },
+      { "name": "cdx:crypto:isCA", "value": "true" },
+      { "name": "cdx:crypto:expiresAt", "value": "2034-06-28T12:00:00Z" }
+    ]
+  }
```

### What changed?

- `metadata.tools` now records **which packaged helper binary** supplied trust metadata.
- OS package components gain package-manager trust context such as maintainer, source package, vendor, architecture, and status.
- Repo source components become explicit `type: data` entries.
- Keyrings and CA bundles become first-class `cryptographic-asset` components instead of remaining opaque files.

## 2) macOS OBOM example

```diff
@@ components[name=Calculator].properties
+{ "name": "cdx:darwin:codesign:identifier", "value": "com.apple.calculator" }
+{ "name": "cdx:darwin:codesign:teamIdentifier", "value": "Software Signing" }
+{ "name": "cdx:darwin:codesign:authority", "value": "Software Signing" }
+{ "name": "cdx:darwin:notarization:assessment", "value": "accepted" }
+{ "name": "cdx:darwin:notarization:source", "value": "Notarized Developer ID" }
@@ components
+{
+  "type": "data",
+  "name": "gatekeeper-system-policy",
+  "purl": "pkg:generic/host-trust/gatekeeper-system-policy@observed?kind=darwin-gatekeeper-status",
+  "properties": [
+    { "name": "cdx:darwin:gatekeeper:status", "value": "assessments enabled" }
+  ]
+}
```

## 3) Windows OBOM example

```diff
@@ components[name=powershell.exe].properties
+{ "name": "cdx:windows:authenticode:status", "value": "Valid" }
+{ "name": "cdx:windows:authenticode:isOSBinary", "value": "true" }
+{ "name": "cdx:windows:authenticode:signerSubject", "value": "CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US" }
+{ "name": "cdx:windows:authenticode:signerThumbprint", "value": "<thumbprint>" }
@@ components
+{
+  "type": "data",
+  "name": "wdac-active-policies",
+  "purl": "pkg:generic/host-trust/wdac-active-policies@0?kind=windows-wdac-status",
+  "properties": [
+    { "name": "cdx:windows:wdac:activePolicyCount", "value": "0" }
+  ]
+}
```

## 4) Quick review checklist

When diffing BOMs before/after the new enrichments, look for these high-signal additions:

- `metadata.tools.components[*].name == "trustinspector"`
- `PackageArchitecture`, `PackageSource`, `PackageStatus`
- native component origin fields such as `supplier`, `manufacturer`, and `authors`
- `cdx:os:repo:*` repository provenance keys
- `cdx:crypto:*` trust-anchor and certificate properties
- `cdx:darwin:codesign:*`, `cdx:darwin:notarization:*`, `cdx:darwin:gatekeeper:*`
- `cdx:windows:authenticode:*`, `cdx:windows:wdac:*`

## 5) Suggested local diff workflow

Generate a current BOM, then compare it against an older BOM or an earlier cdxgen release to isolate the new trust signals.

```bash
jq -S . old-bom.json > /tmp/old-bom.sorted.json
jq -S . new-bom.json > /tmp/new-bom.sorted.json
diff -u /tmp/old-bom.sorted.json /tmp/new-bom.sorted.json | less
```

For Windows PowerShell:

```powershell
Get-Content old-bom.json | ConvertFrom-Json | ConvertTo-Json -Depth 100 | Set-Content $env:TEMP\old-bom.sorted.json
Get-Content new-bom.json | ConvertFrom-Json | ConvertTo-Json -Depth 100 | Set-Content $env:TEMP\new-bom.sorted.json
Compare-Object (Get-Content $env:TEMP\old-bom.sorted.json) (Get-Content $env:TEMP\new-bom.sorted.json)
```

## 6) Certificate identity changes (2026-10)

The certificate model was rebuilt around the certificate's own identity
instead of the file it was found in. Three changes are visible in existing
BOMs:

**bom-refs are keyed by the certificate hash, not the file hash.** Two
different certificates in one bundle used to collide when they shared a CN
(all but one was silently dropped); now every certificate keeps its own
component wherever it appears.

```diff
-  "bom-ref": "crypto/certificate/Demo%20Root%20A@sha256:7d5015eaa04e55a6e35146dc395745053c2edbbe9cc8caf0e3e99d1696c056db"
+  "bom-ref": "crypto/certificate/Demo%20Root%20A@sha256:a8f6f5f67c8cfa4a8399b2eeba16246978c13ca3b23a0179b06afa7138af864e"
```

The old ref hashed the containing file (so `Demo Root A` and `Demo Root B`
from one bundle shared a ref); the new ref hashes the certificate's DER. The
`version` field and `cdx:crypto:fingerprint` follow the same value, and the
fingerprint property is now lowercase hex, matching every other digest in the
BOM (CycloneDX 1.7's `fingerprint` field remains the spec's uppercase-tolerant
form; producers and consumers match case-insensitively).

**Serial numbers are lowercase hex without padding.** trustinspector report-1
emitted the serial in decimal; the `certificateProperties.serialNumber` is now
`serialHex` (e.g. `6a8063a1…`), with no colons and no DER zero padding.

**Every certificate gains a public-key companion keyed by SPKI SHA-256**, so
cross-signed twins share one key component, plus algorithm components for the
key and signature algorithms:

```json
{
  "type": "cryptographic-asset",
  "bom-ref": "crypto/public-key/RSA-2048@spki-sha256:eb75b9659717d01b12340f8cd402384d80c5af97861b3f81d2924ccdfe5257a3",
  "name": "RSA-2048",
  "cryptoProperties": {
    "assetType": "related-crypto-material",
    "relatedCryptoMaterialProperties": {
      "type": "public-key",
      "size": 2048,
      "format": "SPKI",
      "fingerprint": { "alg": "SHA-256", "content": "eb75b965…" }
    }
  },
  "properties": [
    { "name": "cdx:crypto:spkiSha256", "value": "eb75b965…" },
    { "name": "cdx:crypto:spkiSha256Base64", "value": "63W5ZZ…" }
  ]
}
```

At spec version 1.6 the downgrade maps
`relatedCryptographicAssets` to the deprecated `subjectPublicKeyRef` and
`signatureAlgorithmRef`, drops `certificateExtensions` and the public-key
`fingerprint` object, and keeps every matching fact as a `cdx:crypto:`
property.

The source-directory scan (`--include-crypto` without a container) also
changed behaviour: private keys, GPG keys and unreadable keystores are no
longer labelled `assetType: certificate`. A PEM private key becomes
`related-crypto-material` with `type: private-key` and only its header format;
a GPG key becomes `related-crypto-material` with `type: public-key`; an
unreadable keystore carries `cdx:crypto:keystoreReadable=false`.
