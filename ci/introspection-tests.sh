#!/usr/bin/env bash
# Build-introspection vendored fixture matrix.
#
# Drives bin/cdxgen.js for every vendored fixture row of the fixture matrix
# (DELIVERABLE-10): Group B healthy rows must stay silent, Group C ceiling
# rows must score 100 with nothing to do, unsupported markers must surface as
# coverage gaps, and the two vendored transition rows must repair through the
# actions their own reports emitted. Run on every PR; the corpus-backed rows
# stay local.
#
# Usage: bash ci/introspection-tests.sh [--with-runtimes]
#   --with-runtimes  also run the intact rows under deno and bun (needs both)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAILURES=0

fail() {
  echo "FAIL: $*"
  FAILURES=$((FAILURES + 1))
}

pass() {
  echo "ok: $*"
}

# Scan one fixture with --introspect and exit non-zero when cdxgen fails.
scan() {
  local output="$1"
  local project="$2"
  shift 2
  node bin/cdxgen.js "$@" --no-install-deps --introspect \
    -o "$output" \
    --introspect-report "${output}.introspection.md" \
    --introspect-json "${output}.introspection.json" \
    "$project" >/dev/null 2>&1
}

# assert_silent <label> <report-json> <expected-tier>
# A healthy or at-ceiling row must rank exactly zero remediations.
assert_silent() {
  local label="$1" json="$2" tier="$3"
  if node -e '
    const fs = require("node:fs");
    const [, label, jsonPath, tier] = process.argv;
    const r = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    if (!Array.isArray(r.remediation) || r.remediation.length !== 0) {
      console.error(`${label}: expected zero remediations, got ${r.remediation?.length}`);
      process.exit(1);
    }
    if (r.overall.tier !== tier) {
      console.error(`${label}: expected tier ${tier}, got ${r.overall.tier}`);
      process.exit(1);
    }
  ' "$label" "$json" "$tier"; then
    pass "$label silent at $tier"
  else
    fail "$label silent at $tier"
  fi
}

echo "== Group B: healthy fixtures must stay silent"
# Rows are fixture:project-type:measured-tier. Colon-delimited rows rather
# than associative arrays: the macOS runner ships bash 3.2, which has none.
for row in \
  "go-smoke:go:resolved" \
  "cargo-smoke:rust:lockfile" \
  "poetry-smoke:python:lockfile" \
  "pnpm-smoke:js:lockfile" \
  "mix-smoke:elixir:resolved" \
  "composer-smoke:php:resolved" \
  "dotnet-eshop:csharp:resolved" \
  "npm-smoke:js:lockfile"; do
  fixture="${row%%:*}"
  rest="${row#*:}"
  type="${rest%%:*}"
  tier="${rest##*:}"
  output="$TMP/group-b-${fixture}.bom.json"
  # go-smoke ships no go.sum, so `resolved` is a claim about a machine that
  # has go. Without the toolchain the row measures the environment rather
  # than the feature, and the remediation it earns is the correct report.
  if [ "$fixture" = "go-smoke" ] && ! command -v go >/dev/null 2>&1; then
    echo "skip: group-b $fixture (go is not installed)"
    continue
  fi
  if scan "$output" "test/repotests/$fixture" -t "$type"; then
    assert_silent "group-b $fixture" "${output}.introspection.json" "$tier"
  else
    fail "group-b $fixture: cdxgen exited non-zero"
  fi
done

echo "== Group C1: at-ceiling rows score 100 with nothing to do"
for row in \
  "pubspec-smoke:dart:manifest" \
  "introspect-helm-ceiling:helm:manifest" \
  "introspect-clj-ceiling:clojure:manifest"; do
  fixture="${row%%:*}"
  rest="${row#*:}"
  type="${rest%%:*}"
  tier="${rest##*:}"
  output="$TMP/group-c1-${fixture}.bom.json"
  if scan "$output" "test/repotests/$fixture" -t "$type"; then
    assert_silent "group-c1 $fixture" "${output}.introspection.json" "$tier"
  else
    fail "group-c1 $fixture: cdxgen exited non-zero"
  fi
done

echo "== Group C2: unsupported markers are coverage gaps"
output="$TMP/group-c2.bom.json"
if scan "$output" "test/repotests/introspect-unsupported-markers"; then
  if node -e '
    const fs = require("node:fs");
    const r = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
    const gaps = (r.coverageGaps || []).map((g) => g.ecosystem).sort();
    const expected = ["dub"];
    if (JSON.stringify(gaps) !== JSON.stringify(expected)) {
      console.error(`coverage gaps ${gaps} != ${expected}`);
      process.exit(1);
    }
    if ((r.remediation || []).length !== 0) {
      console.error("unsupported rows ranked remediations");
      process.exit(1);
    }
  ' "${output}.introspection.json"; then
    pass "group-c2 gaps reported, no remediations"
  else
    fail "group-c2 gaps"
  fi
else
  fail "group-c2: cdxgen exited non-zero"
fi

echo "== Group A: the degraded maven row repairs through the report's own actions"
MVN_PROJECT="$TMP/maven-project"
cp -r test/repotests/maven-smoke "$MVN_PROJECT"
DEGRADED_MVN="$TMP/mvn-degraded.bom.json"
REPAIRED_MVN="$TMP/mvn-repaired.bom.json"
if (export MVN_CMD=/cdxgen-nonexistent/mvn; scan "$DEGRADED_MVN" "$MVN_PROJECT" -t java); then
  if node -e '
    const fs = require("node:fs");
    const r = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
    const top = (r.remediation || [])[0];
    if (r.overall.tier !== "manifest") {
      console.error(`expected degraded tier manifest, got ${r.overall.tier}`);
      process.exit(1);
    }
    if (!top || top.remediationId !== "jvm.maven.manifest-fallback" || top.blocked) {
      console.error(`expected jvm.maven.manifest-fallback unblocked first, got ${top && top.remediationId}`);
      process.exit(1);
    }
  ' "${DEGRADED_MVN}.introspection.json"; then
    pass "maven degraded shape"
  else
    fail "maven degraded shape"
  fi
else
  fail "maven degraded scan exited non-zero (is java installed?)"
fi
# The repair executes the report's own recipe: the tools the report asks to
# install are present on this machine, so the build action is what remains.
if command -v mvn >/dev/null 2>&1; then
  (cd "$MVN_PROJECT" && mvn -q package -DskipTests) >/dev/null 2>&1
  if scan "$REPAIRED_MVN" "$MVN_PROJECT" -t java; then
    if node -e '
      const fs = require("node:fs");
      const [degradedPath, repairedPath] = process.argv.slice(1);
      const degraded = JSON.parse(fs.readFileSync(degradedPath, "utf-8"));
      const repaired = JSON.parse(fs.readFileSync(repairedPath, "utf-8"));
      const degradedBom = JSON.parse(fs.readFileSync(degradedPath.replace(/\.introspection\.json$/, ""), "utf-8"));
      const repairedBom = JSON.parse(fs.readFileSync(repairedPath.replace(/\.introspection\.json$/, ""), "utf-8"));
      if (repaired.overall.tier !== "resolved" || repaired.overall.score <= degraded.overall.score) {
        console.error(`transition did not reach resolved: ${degraded.overall.score} -> ${repaired.overall.score}`);
        process.exit(1);
      }
      const edges = (bom) => (bom.dependencies || []).reduce((n, d) => n + (d.dependsOn || []).length, 0);
      if (repairedBom.components.length <= degradedBom.components.length || edges(repairedBom) <= edges(degradedBom)) {
        console.error("the SBOM did not grow across the transition");
        process.exit(1);
      }
    ' "${DEGRADED_MVN}.introspection.json" "${REPAIRED_MVN}.introspection.json"; then
      pass "maven transition raised the tier and grew the SBOM"
    else
      fail "maven transition assertions"
    fi
  else
    fail "maven repaired scan exited non-zero"
  fi
else
  fail "maven repaired scan skipped: mvn is not installed"
fi

echo "== Group A: the manifest-only js row repairs through the report's own actions"
JS_PROJECT="$TMP/js-project"
cp -r test/repotests/introspect-js-manifest "$JS_PROJECT"
DEGRADED_JS="$TMP/js-degraded.bom.json"
REPAIRED_JS="$TMP/js-repaired.bom.json"
if scan "$DEGRADED_JS" "$JS_PROJECT" -t js; then
  if command -v npm >/dev/null 2>&1; then
    # The emitted build action, verbatim: `npm install`.
    (cd "$JS_PROJECT" && npm install) >/dev/null 2>&1
    if scan "$REPAIRED_JS" "$JS_PROJECT" -t js; then
      if node -e '
        const fs = require("node:fs");
        const [degradedPath, repairedPath] = process.argv.slice(1);
        const degraded = JSON.parse(fs.readFileSync(degradedPath, "utf-8"));
        const repaired = JSON.parse(fs.readFileSync(repairedPath, "utf-8"));
        if (repaired.overall.score <= degraded.overall.score) {
          console.error(`js transition did not raise the score: ${degraded.overall.score} -> ${repaired.overall.score}`);
          process.exit(1);
        }
        if ((repaired.remediation || []).some((entry) => entry.remediationId === "js.no-node-modules")) {
          console.error("the key remediation survived the repair");
          process.exit(1);
        }
      ' "${DEGRADED_JS}.introspection.json" "${REPAIRED_JS}.introspection.json"; then
        pass "js transition raised the score"
      else
        fail "js transition assertions"
      fi
    else
      fail "js repaired scan exited non-zero"
    fi
  else
    fail "js repaired scan skipped: npm is not installed"
  fi
else
  fail "js degraded scan exited non-zero"
fi

if [ "${1:-}" = "--with-runtimes" ]; then
  echo "== cross-runtime gate: intact rows under deno and bun"
  for runtime in deno bun; do
    if ! command -v "$runtime" >/dev/null 2>&1; then
      fail "$runtime is not installed"
      continue
    fi
    for row in "go-smoke:go:resolved" "dotnet-eshop:csharp:resolved"; do
      fixture="${row%%:*}"
      rest="${row#*:}"
      type="${rest%%:*}"
      tier="${rest##*:}"
      if [ "$fixture" = "go-smoke" ] && ! command -v go >/dev/null 2>&1; then
        echo "skip: cross-runtime $runtime $fixture (go is not installed)"
        continue
      fi
      output="$TMP/${runtime}-${fixture}.bom.json"
      if [ "$runtime" = "deno" ]; then
        # Keep deno from materializing its own npm graph into
        # node_modules/.deno and rewiring the pnpm-managed links mid-job
        # (see the same flag in test/helpers/introspection-e2e.js).
        runtime_cmd=("$runtime" run -A --node-modules-dir=false)
      else
        runtime_cmd=("$runtime")
      fi
      if "${runtime_cmd[@]}" bin/cdxgen.js -t "$type" --no-install-deps --introspect \
        -o "$output" --introspect-json "${output}.introspection.json" \
        "test/repotests/$fixture" >/dev/null 2>&1; then
        assert_silent "cross-runtime $runtime $fixture" "${output}.introspection.json" "$tier"
      else
        fail "cross-runtime $runtime $fixture: cdxgen exited non-zero"
      fi
    done
  done
fi

echo "== introspection matrix: $FAILURES failure(s)"
if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi
