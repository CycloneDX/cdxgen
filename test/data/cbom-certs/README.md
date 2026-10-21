# CBOM certificate test fixtures

Everything under `generated/` plus the three `report-*.json` files is
produced by `gen.sh` — do not edit by hand. Regenerate with:

```bash
TRUSTINSPECTOR_R1=<path to a report-1 trustinspector build> \
TRUSTINSPECTOR_R2=<path to a report-2 trustinspector build> \
OPENSSL_BIN=/opt/homebrew/bin/openssl \
  test/data/cbom-certs/gen.sh
```

`gen.sh` needs OpenSSL >= 3.5 (ML-DSA, SLH-DSA and ML-KEM support),
`keytool` (a JDK-style PKCS#12 truststore), and — only for the JSON capture —
rebuilt trustinspector binaries. Private keys are generated in a temporary
directory that the script deletes; the repository holds public certificates
only.

Provenance of the committed JSON:

- `report-2-rootfs.json`, `report-2-certs.json`: trustinspector `rootfs` and
  `certs` modes, built from cdxgen/cdxgen-plugins-bin `main` @ `96dbca37`
  (PR #132, schema `trustinspector/report-2`), run over a scratch rootfs the
  script assembles from the generated certificates.
- `report-1-rootfs.json`: the pre-change trustinspector (schema
  `trustinspector/report-1`), built from commit `bc4d5b27`, over the same
  rootfs.

The generated certificates are re-created with fresh keys and serials on
every run, so tests must compute the expected hashes from the committed
certificates at test time rather than hard-coding them; the JSON fixtures are
only valid for the certificates committed beside them.

`generated/mutated-oid-leaf.pem` (when present) is derived at test time by
flipping OIDs in a committed certificate; see the tests. It is not from a
real issuer.
