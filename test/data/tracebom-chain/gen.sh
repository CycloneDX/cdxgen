#!/bin/sh
# Regenerates the tracebom observed-chain fixtures:
#
#   crypto-result.json  the raw safer-exec CRYPTO result (report channel) of
#                       the workload below, captured with safer-exec >= 1.2.0
#   bom.json            the CBOM `bin/tracebom.js` produces from it (spec 1.7)
#   bom-1.6.json        the same run with --spec-version 1.6
#   c-*.pem, h-*.pem    the public certificates of the two chains, so tests
#                       can replay the on-disk producer against them
#
# Two TLS 1.2 servers present chains with CN=localhost leaves and
# subjectAltName DNS:localhost,IP:127.0.0.1:
#   - a 3-level classical PKI (RSA root -> RSA intermediate -> ECDSA P-256
#     leaf), and
#   - a hybrid PKI (ML-DSA-65 root -> ML-DSA-44 intermediate -> ECDSA P-256
#     leaf), which TLS 1.2 can carry because only the leaf signs the
#     handshake.
# A TLS 1.3 server with the classical leaf shows the limitation: its
# Certificate message is encrypted, so no chain is observed.
#
# Private keys are generated into a temp directory that is deleted on exit;
# only public material (certificates, JSON) is written here. Tool versions:
# README.md.
set -eu

out=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$out/../../.." && pwd)
OPENSSL=${OPENSSL:-/opt/homebrew/bin/openssl}
tmp=$(mktemp -d)
pids=""
cleanup() {
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

# One free port in the 9440-9459 range, starting at the preferred one.
free_port() {
  p=$1
  while [ "$p" -le 9459 ]; do
    if ! nc -z 127.0.0.1 "$p" 2>/dev/null; then
      echo "$p"
      return 0
    fi
    p=$((p + 1))
  done
  echo "no free port in 9440-9459" >&2
  exit 1
}

wait_port() {
  i=0
  while [ "$i" -lt 100 ]; do
    if nc -z 127.0.0.1 "$1" 2>/dev/null; then
      return 0
    fi
    i=$((i + 1))
    sleep 0.1
  done
  echo "server on port $1 never listened" >&2
  exit 1
}

port_classical=$(free_port 9440)
port_hybrid=$(free_port 9441)
port_tls13=$(free_port 9442)
echo "ports: classical=$port_classical hybrid=$port_hybrid tls13=$port_tls13"

cd "$tmp"
printf 'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' >ca.ext
printf 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n' >leaf.ext

root() { # key algorithm, subject, output, keygen option
  "$OPENSSL" genpkey -algorithm "$1" -out "$3.key" ${4:+-pkeyopt "$4"}
  "$OPENSSL" req -x509 -new -key "$3.key" -subj "/CN=$2" -days 3650 \
    -addext basicConstraints=critical,CA:TRUE \
    -addext keyUsage=critical,keyCertSign,cRLSign -out "$3.pem"
}
issue() { # key algorithm, subject, output, issuer, keygen option
  "$OPENSSL" genpkey -algorithm "$1" -out "$3.key" ${5:+-pkeyopt "$5"}
  "$OPENSSL" req -new -key "$3.key" -subj "/CN=$2" -out "$3.csr"
  "$OPENSSL" x509 -req -in "$3.csr" -CA "$4.pem" -CAkey "$4.key" \
    -set_serial "0x$("$OPENSSL" rand -hex 8)" -days 825 -extfile ca.ext -out "$3.pem"
}
leaf() { # key algorithm, subject, output, issuer, keygen option
  "$OPENSSL" genpkey -algorithm "$1" -out "$3.key" ${5:+-pkeyopt "$5"}
  "$OPENSSL" req -new -key "$3.key" -subj "/CN=$2" -out "$3.csr"
  "$OPENSSL" x509 -req -in "$3.csr" -CA "$4.pem" -CAkey "$4.key" \
    -set_serial "0x$("$OPENSSL" rand -hex 8)" -days 825 -extfile leaf.ext -out "$3.pem"
}

# Classical: RSA root -> RSA intermediate -> ECDSA P-256 leaf.
root RSA "Tracebom Test Root" c-root rsa_keygen_bits:2048
issue RSA "Tracebom Test Intermediate" c-int c-root rsa_keygen_bits:2048
leaf EC "localhost" c-leaf c-int ec_paramgen_curve:P-256
cat c-int.pem c-root.pem >c-chain.pem

# Hybrid: ML-DSA-65 root -> ML-DSA-44 intermediate -> ECDSA P-256 leaf.
root ML-DSA-65 "Tracebom PQ Root ML-DSA-65" h-root
issue ML-DSA-44 "Tracebom PQ Issuing ML-DSA-44" h-int h-root
leaf EC "localhost" h-leaf h-int ec_paramgen_curve:P-256
cat h-int.pem h-root.pem >h-chain.pem

start_server() { # port, key, cert, chain, min/max version flag
  "$OPENSSL" s_server -accept "$1" "$5" -www -key "$2" -cert "$3" \
    -cert_chain "$4" >/dev/null 2>&1 &
  pids="$pids $!"
}
start_server "$port_classical" c-leaf.key c-leaf.pem c-chain.pem -tls1_2
start_server "$port_hybrid" h-leaf.key h-leaf.pem h-chain.pem -tls1_2
start_server "$port_tls13" c-leaf.key c-leaf.pem c-chain.pem -tls1_3
wait_port "$port_classical"
wait_port "$port_hybrid"
wait_port "$port_tls13"

# The workload: one curl per server. Two load-bearing details:
#   - --noproxy "": safer-exec sets NO_PROXY to cover loopback, and without
#     it curl bypasses the egress tunnel, so the chain is never observed.
#   - the host name localhost, not the 127.0.0.1 literal: the proxy pins
#     hostnames, and cdxgen's --allow-host values are resolved with the DNS
#     resolver, which cannot resolve an IP literal, so an IP target is always
#     denied (proxy.go targetAllowed matches IP targets against AllowIPs
#     only).
workload=$(printf 'curl -sk --noproxy "" https://localhost:%s/ ; curl -sk --noproxy "" https://localhost:%s/ ; curl -sk --noproxy "" https://localhost:%s/' \
  "$port_classical" "$port_hybrid" "$port_tls13")

cd "$root"
node "$out/capture-crypto.mjs" "$port_classical" "$port_hybrid" "$port_tls13"
node bin/tracebom.js -d "$tmp" --cmd "sh -c '$workload'" \
  --proxy-egress --allow-host localhost \
  --allow-port "$port_classical,$port_hybrid,$port_tls13" \
  --trace-crypto -o "$out/bom.json"
node bin/tracebom.js -d "$tmp" --cmd "sh -c '$workload'" \
  --proxy-egress --allow-host localhost \
  --allow-port "$port_classical,$port_hybrid,$port_tls13" \
  --trace-crypto --spec-version 1.6 -o "$out/bom-1.6.json"
for cert in c-leaf c-int c-root h-leaf h-int h-root; do
  cp "$tmp/$cert.pem" "$out/$cert.pem"
done
echo "fixtures written to $out"
