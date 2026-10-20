#!/usr/bin/env bash
# Regenerates the certificate fixtures for the CBOM certificate tests with
# real tools. Nothing here is hand-written or hand-edited.
#
#   test/data/cbom-certs/gen.sh
#
# Produces (committed):
#   generated/rootA.crt rootB.crt intA.crt intB.crt leaf.crt
#       two roots, one intermediate key certified twice (intA by rootA, intB
#       cross-signed by rootB: same SPKI, different fingerprints), and a leaf
#       issued by intA
#   generated/ca-certificates.crt    rootA + rootB + intA bundle
#   generated/twins-bundle.crt       rootA + intA + intB in ONE file
#   generated/fullchain.pem          leaf + intA
#   generated/cacerts.p12            JDK-style PKCS#12 truststore (keytool)
#   generated/mldsa65-root.pem mldsa44-int.pem ecdsa-leaf.pem
#   generated/mlkem768-leaf.pem slhdsa-root.pem sha1-root.pem
#       post-quantum set, mirroring safer-exec's testdata/pqc/gen.sh
#   generated/tls-secret.yaml        kubernetes.io/tls secret (base64 bundle)
#   generated/network_security_config.xml   Android SPKI pin of intA
#   report-2-rootfs.json report-2-certs.json   trustinspector report-2 fixtures
#   report-1-rootfs.json                        trustinspector report-1 fixture
#
# Private keys are generated in a temporary directory that is deleted on
# exit; nothing secret is ever written into the repository.
#
# Needs openssl >= 3.5 (ML-DSA/SLH-DSA/ML-KEM) and keytool. Set
# TRUSTINSPECTOR_R1 / TRUSTINSPECTOR_R2 to rebuilt trustinspector binaries to
# refresh the JSON fixtures; without them the certificate fixtures are still
# regenerated and the JSON capture step prints a notice.
set -euo pipefail
out=$(cd "$(dirname "$0")" && pwd)
gen="$out/generated"
mkdir -p "$gen"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"

openssl_bin=${OPENSSL_BIN:-openssl}

ca() { # ca <name> <subject>
  "$openssl_bin" req -x509 -newkey rsa:2048 -nodes -keyout "$tmp/$1.key" -out "$gen/$1.crt" -days 3650 \
    -subj "$2" -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
}
ca rootA "/O=Demo Trust/CN=Demo Root A"
ca rootB "/O=Other Trust/CN=Demo Root B"

"$openssl_bin" genrsa -out "$tmp/int.key" 2048 2>/dev/null
"$openssl_bin" req -new -key "$tmp/int.key" -subj "/O=Shady CA/CN=Shady Issuing CA 1" -out "$tmp/int.csr"
cat > "$tmp/int.ext" <<'EOF'
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid
authorityInfoAccess=caIssuers;URI:http://example.invalid/root.crt
crlDistributionPoints=URI:http://example.invalid/root.crl
EOF
"$openssl_bin" x509 -req -in "$tmp/int.csr" -CA "$gen/rootA.crt" -CAkey "$tmp/rootA.key" -CAserial "$tmp/rootA.srl" -CAcreateserial \
  -days 1825 -extfile "$tmp/int.ext" -out "$gen/intA.crt" 2>/dev/null
"$openssl_bin" x509 -req -in "$tmp/int.csr" -CA "$gen/rootB.crt" -CAkey "$tmp/rootB.key" -CAserial "$tmp/rootB.srl" -CAcreateserial \
  -days 1825 -extfile "$tmp/int.ext" -out "$gen/intB.crt" 2>/dev/null

"$openssl_bin" req -new -newkey rsa:2048 -nodes -keyout "$tmp/leaf.key" -subj "/CN=api.example.test" \
  -out "$tmp/leaf.csr" 2>/dev/null
cat > "$tmp/leaf.ext" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=DNS:api.example.test
authorityKeyIdentifier=keyid
EOF
"$openssl_bin" x509 -req -in "$tmp/leaf.csr" -CA "$gen/intA.crt" -CAkey "$tmp/int.key" -CAserial "$tmp/int.srl" -CAcreateserial \
  -days 90 -extfile "$tmp/leaf.ext" -out "$gen/leaf.crt" 2>/dev/null

cat "$gen/rootA.crt" "$gen/rootB.crt" "$gen/intA.crt" > "$gen/ca-certificates.crt"
cat "$gen/rootA.crt" "$gen/intA.crt" "$gen/intB.crt" > "$gen/twins-bundle.crt"
cat "$gen/leaf.crt" "$gen/intA.crt" > "$gen/fullchain.pem"

# keytool writes the JDK trusted-certificate attribute that real cacerts
# carry (and go-pkcs12's DecodeTrustStore requires); openssl -nokeys does not.
if command -v keytool >/dev/null 2>&1; then
  rm -f "$gen/cacerts.p12"
  keytool -importcert -noprompt -storetype PKCS12 -keystore "$gen/cacerts.p12" -storepass changeit \
    -alias shady-int -file "$gen/intB.crt" >/dev/null
else
  echo "keytool not found: skipping cacerts.p12 (tests that need it skip too)" >&2
fi

spki_b64() { "$openssl_bin" x509 -in "$1" -noout -pubkey | "$openssl_bin" pkey -pubin -outform DER | "$openssl_bin" dgst -sha256 -binary | base64; }
cat > "$gen/tls-secret.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: api-tls
type: kubernetes.io/tls
data:
  tls.crt: $(cat "$gen/leaf.crt" "$gen/intA.crt" | base64 | tr -d '\n')
EOF
cat > "$gen/network_security_config.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config>
    <domain includeSubdomains="true">api.example.test</domain>
    <pin-set>
      <pin digest="SHA-256">$(spki_b64 "$gen/intA.crt")</pin>
    </pin-set>
  </domain-config>
</network-security-config>
EOF

# Post-quantum set, mirroring safer-exec go/internal/tlsobserve/testdata/pqc/gen.sh.
printf 'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' > ca.ext
printf 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:pq.observe.test\nextendedKeyUsage=serverAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' > leaf.ext
pq_root() {
  "$openssl_bin" genpkey -algorithm "$1" -out "$tmp/$3.key" ${4:+-pkeyopt "$4"}
  "$openssl_bin" req -x509 -new -key "$tmp/$3.key" -subj "/CN=$2" -days 3650 ${5:-} \
    -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign -out "$gen/$3.pem"
}
pq_issue() {
  "$openssl_bin" genpkey -algorithm "$1" -out "$tmp/$3.key" ${6:+-pkeyopt "$6"}
  "$openssl_bin" req -new -key "$tmp/$3.key" -subj "/CN=$2" -out "$tmp/$3.csr"
  "$openssl_bin" x509 -req -in "$tmp/$3.csr" -CA "$gen/$4.pem" -CAkey "$tmp/$4.key" -set_serial "0x$("$openssl_bin" rand -hex 8)" \
    -days 825 -extfile "$5" -out "$gen/$3.pem"
}
pq_root ML-DSA-65 "PQ Test Root ML-DSA-65" mldsa65-root
pq_issue ML-DSA-44 "PQ Test Issuing ML-DSA-44" mldsa44-int mldsa65-root ca.ext
pq_issue EC "pq.observe.test" ecdsa-leaf mldsa44-int leaf.ext ec_paramgen_curve:P-256
"$openssl_bin" genpkey -algorithm ML-KEM-768 -out "$tmp/kem.key"
"$openssl_bin" pkey -in "$tmp/kem.key" -pubout -out "$tmp/kem.pub"
"$openssl_bin" x509 -new -force_pubkey "$tmp/kem.pub" -subj "/CN=kem.observe.test" -CA "$gen/mldsa44-int.pem" -CAkey "$tmp/mldsa44-int.key" \
  -set_serial "0x$("$openssl_bin" rand -hex 8)" -days 825 -extfile leaf.ext -out "$gen/mlkem768-leaf.pem"
pq_root SLH-DSA-SHA2-128s "PQ Test Root SLH-DSA-SHA2-128s" slhdsa-root
pq_root RSA "Legacy Test Root SHA-1" sha1-root rsa_keygen_bits:2048 -sha1

# trustinspector JSON fixtures: run the real tool over a scratch rootfs that
# holds the generated fixtures, so tests can exercise report-1 and report-2
# inputs without a binary.
scratch="$tmp/rootfs"
mkdir -p "$scratch/etc/ssl/certs" "$scratch/etc/nginx/ssl" "$scratch/usr/lib/jvm/java-21/lib/security"
cp "$gen/ca-certificates.crt" "$scratch/etc/ssl/certs/ca-certificates.crt"
cp "$gen/fullchain.pem" "$scratch/etc/nginx/ssl/fullchain.pem"
cp "$tmp/leaf.key" "$scratch/etc/nginx/ssl/privkey.pem"
[ -f "$gen/cacerts.p12" ] && cp "$gen/cacerts.p12" "$scratch/usr/lib/jvm/java-21/lib/security/cacerts"
if [ -n "${TRUSTINSPECTOR_R2:-}" ] && [ -x "$TRUSTINSPECTOR_R2" ]; then
  "$TRUSTINSPECTOR_R2" rootfs "$scratch" > "$out/report-2-rootfs.json"
  "$TRUSTINSPECTOR_R2" certs --root "$scratch" \
    "$scratch/etc/ssl/certs/ca-certificates.crt" "$scratch/etc/nginx/ssl/fullchain.pem" \
    > "$out/report-2-certs.json"
else
  echo "TRUSTINSPECTOR_R2 not set: keeping the committed report-2 fixtures" >&2
fi
if [ -n "${TRUSTINSPECTOR_R1:-}" ] && [ -x "$TRUSTINSPECTOR_R1" ]; then
  "$TRUSTINSPECTOR_R1" rootfs "$scratch" > "$out/report-1-rootfs.json"
else
  echo "TRUSTINSPECTOR_R1 not set: keeping the committed report-1 fixture" >&2
fi

echo "wrote $gen"
