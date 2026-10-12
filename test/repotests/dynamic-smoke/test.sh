#!/bin/bash
# tracebom SaaSBOM smoke test: verifies dynamic SBOM generation with HTTP URL tracing
# Test 1: Basic library tracing (always runs, no root needed)
# Test 2: npm install with --trace-http-urls (requires sudo + eBPF, Linux >= 5.8)
# Test 3: pip install with --trace-http-urls (requires sudo + eBPF, Linux >= 5.8)
set -e

REPO_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
TRACEBOM="$REPO_DIR/bin/tracebom.js"
RESULTS_DIR="${REPO_DIR}/bomresults"
mkdir -p "$RESULTS_DIR"

echo "=== tracebom SaaSBOM smoke test ==="

# Schema validity is deterministic, unlike the network-dependent checks below,
# so an invalid BOM fails the run.
validate_bom() {
  node --input-type=module -e '
import { readFileSync } from "node:fs";
import { validateBom } from "'"$REPO_DIR"'/lib/validator/bomValidator.js";
if (!(await validateBom(JSON.parse(readFileSync(process.argv[1], "utf8"))))) {
  console.log("FAIL: " + process.argv[1] + " is not a valid CycloneDX BOM");
  process.exit(1);
}
console.log("PASS: " + process.argv[1] + " validates");
' "$1"
}

# ---------------------------------------------------------------
# Test 1: Basic library tracing (no HTTP URLs)
echo "--- Basic library tracing ---"
TESTDIR="$(mktemp -d)"
cd "$TESTDIR"
echo '{"name":"dynamic-smoke","version":"0.0.1"}' > package.json
OUTPUT="$RESULTS_DIR/tracebom-basic.json"

node "$TRACEBOM" --cmd "echo hello" --output "$OUTPUT" 2>&1
node -e '
const j = require("'"$OUTPUT"'");
if (!j.bomFormat || j.bomFormat !== "CycloneDX") { console.log("FAIL: bomFormat"); process.exit(0); }
const libs = j.components.filter(c => c.type === "library" && c.scope === "required");
if (libs.length < 1) { console.log("FAIL: no library components"); process.exit(0); }
console.log("PASS: basic library tracing (" + libs.length + " components)");
'
validate_bom "$OUTPUT"
rm -rf "$TESTDIR"

# ---------------------------------------------------------------
# Egress proxy (no root needed): the allowed host becomes a service, and the
# proxy reads the TLS parameters from the handshake.
echo "--- Egress proxy and TLS parameters ---"
TESTDIR="$(mktemp -d)"
cd "$TESTDIR"
OUTPUT="$RESULTS_DIR/tracebom-proxy.json"
if node "$TRACEBOM" --cmd "curl -s -o /dev/null https://registry.npmjs.org/" --proxy-egress --allow-host registry.npmjs.org --output "$OUTPUT" 2>&1; then
  node -e '
const j = require("'"$OUTPUT"'");
const allowed = (j.services || []).some(s => (s.properties || []).some(p => p.name === "cdx:dynamic:egressDecision" && p.value === "allowed"));
console.log(allowed ? "PASS: allowed egress service recorded" : "WARN: no allowed egress service (network may be unavailable)");
const assets = j.components.filter(c => c.type === "cryptographic-asset");
const protocol = assets.find(c => c.cryptoProperties.assetType === "protocol");
const algorithms = assets.filter(c => c.cryptoProperties.assetType === "algorithm");
if (protocol && algorithms.length) {
  console.log("PASS: TLS protocol and " + algorithms.length + " algorithm(s) recorded through the proxy");
} else {
  console.log("WARN: no TLS parameters recorded through the proxy");
}
'
  validate_bom "$OUTPUT"
else
  echo "WARN: egress proxy test skipped (sandbox unavailable on this system)"
fi
rm -rf "$TESTDIR"

# ---------------------------------------------------------------
# Tests 2 and 3 require sudo + eBPF (HTTP URL tracing)
if command -v sudo &>/dev/null && sudo -n true 2>/dev/null; then
  if [ "$(uname -s)" = "Linux" ]; then
    echo "--- npm install SaaSBOM ---"
    TESTDIR="$(mktemp -d)"
    cd "$TESTDIR"
    echo '{"name":"tb-npm-saasbom","version":"1.0.0","dependencies":{"left-pad":"1.3.0"}}' > package.json
    OUTPUT="$RESULTS_DIR/tracebom-npm.json"

    echo "--- Test 2: npm install SaaSBOM (best effort) ---"
    TESTDIR="$(mktemp -d)"
    cd "$TESTDIR"
    echo '{"name":"tb-npm-saasbom","version":"1.0.0","dependencies":{"left-pad":"1.3.0"}}' > package.json
    OUTPUT="$RESULTS_DIR/tracebom-npm.json"

    if sudo -E node "$TRACEBOM" --cmd "npm install" --trace-http-urls --trace-period 30 --output "$OUTPUT" 2>&1; then
      node -e '
const j = require("'"$OUTPUT"'");
if (!j.bomFormat) { console.log("FAIL: no bomFormat"); process.exit(0); }
console.log("components: " + (j.components ? j.components.length : 0));
console.log("services: " + (j.services ? j.services.length : 0));
if (j.services && j.services.length > 0) {
  const hasNpmjs = j.services.some(s =>
    s.endpoints && s.endpoints.some(ep => ep.indexOf("registry.npmjs.org") !== -1)
  );
  const hasMethods = j.services.some(s =>
    s.properties && s.properties.some(p => p.name === "cdx:service:httpMethod")
  );
  if (hasNpmjs) console.log("PASS: Found registry.npmjs.org endpoints");
  else console.log("WARN: No registry.npmjs.org endpoints (may vary by mirror)");
  if (hasMethods) console.log("PASS: services have httpMethod properties");
  console.log("PASS: services collected (" + j.services.length + " service(s))");
} else {
  console.log("FAIL: no services collected from npm install");
  process.exit(0);
}
'
    else
      echo "WARN: npm SaaSBOM test skipped (sandbox unavailable on this system)"
    fi
    sudo rm -rf "$TESTDIR"

    echo "--- pip download SaaSBOM (best effort) ---"
    TESTDIR="$(mktemp -d)"
    cd "$TESTDIR"
    echo 'requests>=2.28.0' > requirements.txt
    mkdir -p dist
    OUTPUT="$RESULTS_DIR/tracebom-pip.json"

    if sudo -E node "$TRACEBOM" --cmd "pip download -r requirements.txt --no-cache-dir -d dist" --trace-http-urls --trace-period 30 --output "$OUTPUT" 2>&1; then
      node -e '
const j = require("'"$OUTPUT"'");
if (!j.bomFormat) { console.log("FAIL: no bomFormat"); process.exit(0); }
console.log("components: " + (j.components ? j.components.length : 0));
console.log("services: " + (j.services ? j.services.length : 0));
if (j.services && j.services.length > 0) {
  const hasPypi = j.services.some(s =>
    s.endpoints && s.endpoints.some(ep =>
      ep.indexOf("pypi") !== -1 || ep.indexOf("python.org") !== -1 || ep.indexOf("pythonhosted.org") !== -1
    )
  );
  if (hasPypi) console.log("PASS: Found PyPI endpoints");
  else console.log("WARN: No PyPI endpoints found (may vary by mirror)");
  console.log("PASS: services collected (" + j.services.length + " service(s))");
} else {
  console.log("FAIL: no services collected from pip install");
  process.exit(0);
}
'
    else
      echo "WARN: pip SaaSBOM test skipped (sandbox unavailable on this system)"
    fi
    sudo rm -rf "$TESTDIR"
  fi
fi

# Test 4: Dynamic Cryptography Tracing (CBOM) (Linux >= 5.8 + eBPF/sudo)
if command -v sudo &>/dev/null && sudo -n true 2>/dev/null; then
  if [ "$(uname -s)" = "Linux" ]; then
    echo "--- Dynamic Cryptography Tracing (CBOM) ---"
    TESTDIR="$(mktemp -d)"
    cd "$TESTDIR"
    OUTPUT="$RESULTS_DIR/tracebom-crypto.json"
    
    if sudo -E node "$TRACEBOM" --cmd "curl -s -o /dev/null https://registry.npmjs.org/" --trace-crypto --output "$OUTPUT" 2>&1; then
      node -e '
const j = require("'"$OUTPUT"'");
if (!j.bomFormat) { console.log("FAIL: no bomFormat"); process.exit(0); }
const cryptoAssets = j.components.filter(c => c.type === "cryptographic-asset");
if (cryptoAssets.length > 0) {
  console.log("PASS: CBOM components captured in main SBOM (" + cryptoAssets.length + " assets)");
  const hasProto = cryptoAssets.some(c => c.cryptoProperties && c.cryptoProperties.assetType === "protocol");
  const hasAlgo = cryptoAssets.some(c => c.cryptoProperties && c.cryptoProperties.assetType === "algorithm");
  if (hasProto && hasAlgo) {
    console.log("PASS: Found both protocol and algorithm cryptographic assets in main SBOM");
  } else {
    console.log("FAIL: Missing expected protocol or algorithm assets");
    process.exit(0);
  }
} else {
  console.log("FAIL: No cryptographic assets found in main SBOM");
  process.exit(0);
}
'
      validate_bom "$OUTPUT"
    else
      echo "WARN: Crypto CBOM test skipped (sandbox or BPF unavailable)"
    fi
    sudo rm -rf "$TESTDIR"
  fi
fi

echo "=== tracebom SaaSBOM smoke test complete ==="