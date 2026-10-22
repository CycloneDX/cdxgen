#!/usr/bin/env bash
# Builds a tiny two-layer OCI image archive (plain tar and jq, no docker) for
# the layer-whiteout tests.
#
#   test/data/oci-whiteout/build.sh
#
# Layer 1 adds three CA certificates: etc/ssl/certs/removed.crt,
# etc/ssl/certs/kept.crt and opt/certs/old.crt. Layer 2 whites out
# removed.crt (.wh.removed.crt) and makes opt/certs opaque (.wh..wh..opq)
# while adding opt/certs/new.crt. The merged image holds kept.crt and
# new.crt only.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
gen="$here/../cbom-certs/generated"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }

mkdir -p "$work/l1/etc/ssl/certs" "$work/l1/opt/certs" "$work/l2/etc/ssl/certs" "$work/l2/opt/certs"
cp "$gen/rootA.crt" "$work/l1/etc/ssl/certs/removed.crt"
cp "$gen/rootB.crt" "$work/l1/etc/ssl/certs/kept.crt"
cp "$gen/intA.crt" "$work/l1/opt/certs/old.crt"
: > "$work/l2/etc/ssl/certs/.wh.removed.crt"
: > "$work/l2/opt/certs/.wh..wh..opq"
cp "$gen/leaf.crt" "$work/l2/opt/certs/new.crt"

img="$work/img"
mkdir -p "$img/blobs/sha256"
layer_digests=()
for n in 1 2; do
  (cd "$work/l$n" && COPYFILE_DISABLE=1 tar --format=ustar -cf "$work/layer$n.tar" .)
  d=$(sha "$work/layer$n.tar")
  cp "$work/layer$n.tar" "$img/blobs/sha256/$d"
  layer_digests+=("$d")
done

jq -n --arg a "${layer_digests[0]}" --arg b "${layer_digests[1]}" \
  '{architecture:"amd64",os:"linux",config:{},rootfs:{type:"layers",diff_ids:["sha256:\($a)","sha256:\($b)"]}}' \
  > "$work/config.json"
cfg=$(sha "$work/config.json")
cp "$work/config.json" "$img/blobs/sha256/$cfg"

jq -n --arg cfg "$cfg" --argjson cs "$(wc -c < "$work/config.json")" \
  --arg a "${layer_digests[0]}" --argjson as "$(wc -c < "$work/layer1.tar")" \
  --arg b "${layer_digests[1]}" --argjson bs "$(wc -c < "$work/layer2.tar")" \
  '{schemaVersion:2,mediaType:"application/vnd.oci.image.manifest.v1+json",
    config:{mediaType:"application/vnd.oci.image.config.v1+json",digest:"sha256:\($cfg)",size:$cs},
    layers:[{mediaType:"application/vnd.oci.image.layer.v1.tar",digest:"sha256:\($a)",size:$as},
            {mediaType:"application/vnd.oci.image.layer.v1.tar",digest:"sha256:\($b)",size:$bs}]}' \
  > "$work/manifest.json"
m=$(sha "$work/manifest.json")
cp "$work/manifest.json" "$img/blobs/sha256/$m"

printf '{"imageLayoutVersion":"1.0.0"}' > "$img/oci-layout"
jq -n --arg m "$m" --argjson ms "$(wc -c < "$work/manifest.json")" \
  '{schemaVersion:2,manifests:[{mediaType:"application/vnd.oci.image.manifest.v1+json",digest:"sha256:\($m)",size:$ms}]}' \
  > "$img/index.json"
(cd "$img" && COPYFILE_DISABLE=1 tar --format=ustar -cf "$here/whiteout-image.tar" oci-layout index.json blobs)
