#!/usr/bin/env bash
# Assembles the small committed rootfs fixture used by the rootfs fallback
# tests from the certificates gen.sh produced. No new certificates are made.
#
#   test/data/cbom-certs/mk-rootfs.sh
#
#   rootfs/etc/ssl/certs/ca-certificates.crt          one CA bundle
#   rootfs/var/run/secrets/tls/tls-secret.yaml        one kubernetes.io/tls secret
#   rootfs/app/res/xml/network_security_config.xml    one Android SPKI pin
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
gen="$here/generated"
out="$here/rootfs"
rm -rf "$out"
mkdir -p "$out/etc/ssl/certs" "$out/var/run/secrets/tls" "$out/app/res/xml"
cp "$gen/ca-certificates.crt" "$out/etc/ssl/certs/ca-certificates.crt"
cp "$gen/tls-secret.yaml" "$out/var/run/secrets/tls/tls-secret.yaml"
cp "$gen/network_security_config.xml" "$out/app/res/xml/network_security_config.xml"
