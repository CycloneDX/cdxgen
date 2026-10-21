# Certificates in the CBOM

A CBOM can answer three questions about the certificate estate that no SBOM
could:

- **Q1 — Go exposure:** which Go binaries still trust the intermediates Go
  1.27.3/1.26.10 distrust (CVE-2026-111943)?
- **Q2 — presence:** where do those keys, or certificates issued under them,
  exist?
- **Q3 — impact:** which servers present chains through them?

Generate the BOM with:

```bash
cdxgen -t docker <image> --include-crypto --bom-audit --bom-audit-categories cbom -o bom.json
cdxi bom.json   # then: .certs   .certchain <spki-prefix>
```

## The model

- One **certificate** is one component, wherever it appears: the bom-ref is
  `crypto/certificate/<name>@sha256:<whole-DER SHA-256>` and every location
  (CA bundle, server chain file, Java truststore, Kubernetes secret) is an
  `evidence.occurrences` entry.
- One **public key** is one component keyed by the SHA-256 of the DER
  `SubjectPublicKeyInfo` (`crypto/public-key/<alg-bits>@spki-sha256:<hash>`).
  Cross-signed and re-issued copies of one key share it — and Go's distrust
  list matches on exactly this hash.
- **Issuer edges** are `dependsOn` entries, and only exist where the
  signature actually verifies. A leaf issued under a cross-signed key depends
  on both twins.
- **Algorithm components** carry the OID, primitive, parameter set and
  `nistQuantumSecurityLevel` (0 for classical algorithms, which is a fact,
  not a policy).

Roles (`cdx:crypto:certRole`) are `root`, `intermediate` and `leaf`.
Self-signed means the signature was verified; when the runtime cannot check
the algorithm, a self-issued certificate still counts and carries
`cdx:crypto:selfSignedUnverified`.

Private keys are classified from their PEM header only and never decoded.
Keystore passwords are never tried beyond the JDK defaults, and unreadable
keystores appear as `cdx:crypto:keystoreReadable=false`/`partial`.

## Q2: where is a key?

```bash
# every certificate and pin carrying a distrusted SPKI
jq -r '.components[]
  | select((.properties // [])[] | select(.name=="cdx:crypto:spkiSha256" and .value=="<spki-hex>"))
  | ."bom-ref"' bom.json

# cross-signed twins: certificates sharing one SPKI
jq -r '[.components[] | select(.cryptoProperties.assetType=="certificate")
  | {spki: ([.properties[] | select(.name=="cdx:crypto:spkiSha256")][0].value // ""), ref: ."bom-ref"}]
  | group_by(.spki) | .[] | select(length > 1)' bom.json

# certificates issued under a given SPKI (one hop over the verified edges;
# .certchain <spki-prefix> walks the whole chain interactively)
jq -r --arg spki "<spki-hex>" '.components[]
  | select((.properties // [])[] | select(.name=="cdx:crypto:issuerSpkiSha256" and .value==$spki))
  | ."bom-ref"' bom.json
```

Simpler with cdxi: `.certs` lists every certificate with its role, issuer,
expiry and SPKI prefix; `.certchain <spki-prefix>` walks the chain above a
certificate and lists the certificates issued under it.

## Q1: which Go binaries are exposed?

Each executable `file` component carries `cdx:go:buildVersion` read from the
binary's buildinfo header, and depends on its
`pkg:golang/stdlib@v<toolchain>` component.

```bash
jq -r '.components[] | select((.properties // [])[] | select(.name=="cdx:go:buildVersion"))
  | [.name, ([.properties[] | select(.name=="cdx:go:buildVersion")][0].value)] | @tsv' bom.json
```

Flag anything below `go1.26.10`, any `go1.27.0`–`go1.27.2`, and every older
line (`go1.25.x` and earlier never receive the fix). The `GO-TLS-001` audit
rule does this comparison for you (see `docs/BOM_AUDIT.md`).

## Q3: observed chains

`tracebom` records the certificate chain each server presents (TLS ≤ 1.2);
those certificates enter the same model with
`cdx:crypto:sourceType=observed-tls` and an occurrence of
`tls://<host>:<port>`. TLS 1.3 encrypts its Certificate message, so those
connections record no chain — see the limitations below.

```bash
node bin/tracebom.js --cmd 'curl -sk https://api.example.test/' \
  --proxy-egress --allow-host api.example.test --trace-crypto -o cbom.json
```

What the run records, and what it deliberately does not:

- **TLS ≤ 1.2 only.** The observer reads the cleartext handshake; a TLS 1.3
  Certificate message is encrypted and yields nothing.
- **A presented chain is untrusted server input.** The certificates and their
  order are the server's own claim. cdxgen records each certificate's
  identity (hashes, subject, validity, key) and where it was presented, but
  never turns the order into issuer edges: no `dependsOn` and no
  `issuerSpkiSha256` come from an observed chain alone. `CBC-004` therefore
  needs the same certificate found on disk (whose issuer signature a producer
  could verify) merged with the observation — then the flagged leaf carries
  both the file path and the `tls://` server.
- **The proxy must see the connection.** The egress proxy sets `NO_PROXY` to
  cover loopback, so a loopback fixture server must be reached with
  `curl --noproxy ""` (or an equivalent override), and by a host name listed
  in `--allow-host`, not an IP literal — the proxy pins hostnames.

Each TLS protocol component `provides` the certificates and keys presented
under it, so the graph leads from `crypto/protocol/tls@<version>` to the
chain a server used.

Which servers presented a denylisted SPKI:

```bash
jq -r --arg spki "<spki-hex>" '.components[]
  | select((.properties // [])[] | select(.name=="cdx:crypto:spkiSha256" and .value==$spki))
  | ."bom-ref", (.evidence.occurrences // [] | map(.location) | .[])' bom.json
```

or with cdxi: `.certs` lists every certificate with its occurrence count;
`.certchain <spki-prefix>` walks the verified chain above a certificate.

## Audit rules

`--bom-audit --bom-audit-categories cbom` runs:

| Rule | Fires when |
|---|---|
| `CBC-001`/`CBC-002` | a certificate expired, or expires within 30 days |
| `CBC-003` | a certificate or key's SPKI SHA-256 is one of the eight Go-distrusted hashes |
| `CBC-004` | a certificate was issued under a Go-distrusted key (`issuerSpkiSha256` or `authorityKeyId` match) |
| `CBC-005` | a CA certificate whose key and signature are both classical stays valid past 2035-01-01 (NIST IR 8547, initial public draft) |
| `CBC-006` | a post-quantum key certified with a classical signature |
| `CBC-007` | an algorithm named only by its dotted OID (composite or pre-standard) |

`GO-TLS-001` (category `go-security`) flags Go binaries built with unpatched
toolchains. Bring your own deny list with
`--bom-audit-rules-dir <dir>`: copy `data/rules/cbom-security.yaml`, append
your SPKI hashes to the `$deny` arrays, and see
`docs/cbom-custom-spki-denylist.yaml` for a documented example.

## Post-quantum certificates

ML-DSA (RFC 9881), SLH-DSA (RFC 9909) and ML-KEM (RFC 9935) keys and
signatures are named from their OIDs — `ML-DSA-65`, `SLH-DSA-SHA2-128s`,
`ML-KEM-768` — never from what the local toolchain happens to print for an
algorithm it may not know. Unknown algorithms (composite ML-DSA,
pre-standard OQS OIDs) keep their dotted OID as the name, and CBC-007 reports
them.

## Limitations

- **TLS 1.3 chains cannot be observed passively.** The Certificate message is
  encrypted. Observed chains come from TLS ≤ 1.2 connections only.
- **DER-embedded certificates are out of scope.** PEM blocks embedded in
  binaries are found by trustinspector's opt-in `--embedded` scan; raw DER
  blobs are not.
- **The Node fallback parser** (used when the trustinspector plugin is absent
  or predates report-2) derives subject, issuer, validity, serial, SPKI hash,
  signature/key OIDs and SKI/AKI from a bounded DER walk, but does not emit
  key-usage bits, path length or EKU names, and cannot read PKCS#7, JKS or
  PKCS#12 containers (they appear as `keystoreReadable=false`).
- **JKS integrity is not verified.** trustinspector reads trusted-certificate
  entries without checking the store digest; the docs of the helper say so.
