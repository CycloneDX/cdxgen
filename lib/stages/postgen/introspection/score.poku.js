/**
 * Tests for the scoring step: the three scoring properties (monotonic,
 * bounded, stable) asserted as properties over generated reflections, the
 * remediation catalog contract (producers ↔ catalog, both directions, plus
 * the D06 entry extension), ranking stability, blocked detection, and
 * deduplication.
 *
 * Everything here is runtime-neutral: scoring is pure arithmetic over the
 * reflection document and no test spawns a process. The end-to-end CLI
 * assertion for the score line lives in reflect.poku.js, which already owns
 * the node-CLI-bound tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assert, describe, it } from "poku";

import { LEDGER_EVENT_IMPACTS } from "../../../core/buildLedger.js";
import { ECOSYSTEM_CEILINGS } from "./reflect.js";
import {
  confidenceFor,
  REMEDIATION_ACTION_KINDS,
  rankRemediations,
  scoreEcosystemRow,
  scoreReflection,
  TIER_BASE_SCORES,
  TIER_LADDER,
} from "./score.js";
import { SHAPE_VARIABLES } from "./shapeCommand.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const catalog = JSON.parse(
  readFileSync(join(repoRoot, "data", "remediations.json"), "utf-8"),
);

/**
 * Deterministic PRNG (mulberry32) so the generated reflections are identical
 * on every run and every platform.
 *
 * @param {number} seed Seed value.
 * @returns {() => number} Generator producing floats in [0, 1).
 */
function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick a random element.
 *
 * @param {() => number} random Generator.
 * @param {Array} values Candidates.
 * @returns {*} Chosen element.
 */
function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

const ECOSYSTEM_NAMES = ["dart", "go", "java", "npm", "python", "ruby"];
const DEGRADATION_IDS = Object.keys(catalog).filter(
  (id) => catalog[id].ecosystem !== "generic",
);
const RULE_IDS = ["BF-GEN-001", "BF-JVM-001", "BF-JS-001", "BF-PY-001"];

/**
 * Build a reflection row with randomized but valid facts.
 *
 * @param {() => number} random Generator.
 * @param {string} ecosystem Ecosystem name.
 * @returns {Object} Row in the reflection document shape.
 */
function generateRow(random, ecosystem) {
  const tier = pick(random, TIER_LADDER);
  const ceiling = pick(random, [
    "resolved",
    "resolved",
    "lockfile",
    "manifest",
  ]);
  let state;
  if (random() < 0.15) {
    state = "absent";
  } else if (tier === ceiling) {
    state = "at-ceiling";
  } else {
    state = "graded";
  }
  const row = {
    ecosystem,
    state,
    tier: state === "absent" ? "absent" : tier,
    ceilingTier: ceiling,
    tierReasons: [
      { source: "rule", id: pick(random, RULE_IDS), determining: true },
    ],
    componentCount: Math.floor(random() * 500),
    dependencyEdgeCount: Math.floor(random() * 500),
    markersOnDisk: [],
    toolsExpected: [],
    toolsResolved: [],
    toolsMissing: [],
    toolsMismatched: [],
    degradations: [],
    findings: [],
  };
  const missingCount = Math.floor(random() * 3);
  for (let index = 0; index < missingCount; index += 1) {
    row.toolsMissing.push({ tool: "maven", wanted: "3.9.9", source: "PATH" });
  }
  const mismatchCount = Math.floor(random() * 3);
  for (let index = 0; index < mismatchCount; index += 1) {
    row.toolsMismatched.push({
      tool: "java",
      wanted: "21",
      found: "17",
    });
  }
  const degradationCount = Math.floor(random() * 4);
  for (let index = 0; index < degradationCount; index += 1) {
    row.degradations.push({
      remediationId: pick(random, DEGRADATION_IDS),
      impact: pick(random, Object.values(LEDGER_EVENT_IMPACTS)),
      detail: "generated degradation",
    });
  }
  if (random() < 0.4) {
    row.findings.push({
      ruleId: "BF-GEN-001",
      message: "generated finding",
      mitigation: "generated mitigation",
      severity: "high",
      tierSignal: "manifest",
    });
  }
  return row;
}

/**
 * Generate a full reflection document with randomized rows.
 *
 * @param {number} seed Seed value.
 * @returns {Object} Reflection document.
 */
function generateReflection(seed) {
  const random = prng(seed);
  const rowCount = Math.floor(random() * 5);
  const ecosystems = [];
  for (let index = 0; index < rowCount; index += 1) {
    const ecosystem = ECOSYSTEM_NAMES[index % ECOSYSTEM_NAMES.length];
    if (ecosystems.some((row) => row.ecosystem === ecosystem)) {
      continue;
    }
    if (random() < 0.1) {
      ecosystems.push({
        ecosystem,
        state: "unsupported",
        tier: null,
        ceilingTier: null,
        tierReasons: [
          { source: "disk", id: "unsupported-ecosystem", determining: true },
        ],
        componentCount: 0,
        dependencyEdgeCount: 0,
        markersOnDisk: ["elm.json"],
        toolsExpected: [],
        toolsResolved: [],
        toolsMissing: [],
        toolsMismatched: [],
        degradations: [],
        findings: [],
      });
      continue;
    }
    ecosystems.push(generateRow(random, ecosystem));
  }
  return {
    ledgerSource: pick(random, ["sidecar", "memory", "none"]),
    ledgerComplete: random() > 0.2,
    ecosystems,
    observations: [],
  };
}

/**
 * Shuffle a copy of an array.
 *
 * @param {Array} values Array to shuffle.
 * @param {() => number} random Generator.
 * @returns {Array} Shuffled copy.
 */
function shuffled(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/**
 * A basic graded manifest row with no deductions.
 *
 * @param {string} ecosystem Ecosystem name.
 * @param {number} componentCount Component count.
 * @returns {Object} Row.
 */
function gradedRow(ecosystem, componentCount) {
  return {
    ecosystem,
    state: "graded",
    tier: "manifest",
    ceilingTier: "resolved",
    tierReasons: [{ source: "rule", id: "BF-GEN-001", determining: true }],
    componentCount,
    dependencyEdgeCount: 0,
    markersOnDisk: [],
    toolsExpected: [],
    toolsResolved: [],
    toolsMissing: [],
    toolsMismatched: [],
    degradations: [],
    findings: [],
  };
}

describe("remediation catalog", () => {
  const firstArgument =
    /record(?:Degradation|PolicyDegradationOnce)\(\s*["']([a-z0-9.-]+)["']/g;
  const quotedLiteral = /["']([a-z0-9.-]+)["']/g;
  // reportProjectToolingSkipped takes the id as its second argument, which the
  // formatter usually puts on a line of its own.
  const toolingSkip =
    /reportProjectToolingSkipped\(\s*[A-Za-z_.]+\s*,\s*["']([a-z0-9.-]+)["']/g;

  /**
   * Collect the remediation ids referenced by the producers, using the same
   * assignment-shaped source scan as the degradation contract test.
   *
   * @returns {Set<string>} Referenced remediation ids.
   */
  function referencedRemediationIds() {
    const referenced = new Set();
    const collect = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const entryPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          collect(entryPath);
        } else if (
          entry.name.endsWith(".js") &&
          !entry.name.endsWith(".poku.js")
        ) {
          const content = readFileSync(entryPath, "utf-8");
          for (const match of content.matchAll(toolingSkip)) {
            referenced.add(match[1]);
          }
          for (const line of content.split("\n")) {
            for (const match of line.matchAll(firstArgument)) {
              referenced.add(match[1]);
            }
            if (/remediationId\s*[:=]/.test(line)) {
              for (const match of line.matchAll(quotedLiteral)) {
                referenced.add(match[1]);
              }
            }
          }
        }
      }
    };
    collect(join(repoRoot, "lib"));
    return referenced;
  }

  it("matches the producer-referenced ids in both directions", () => {
    const referenced = referencedRemediationIds();
    const catalogIds = new Set(Object.keys(catalog));
    for (const id of referenced) {
      assert.ok(
        catalogIds.has(id),
        `producer references ${id}, which is missing from the catalog`,
      );
    }
    for (const id of catalogIds) {
      assert.ok(
        referenced.has(id),
        `catalog entry ${id} is referenced by no producer`,
      );
    }
  });

  it("extends every entry with a target tier, actions, verify and docs", () => {
    for (const [id, entry] of Object.entries(catalog)) {
      assert.ok(
        entry.targetTier === null || TIER_LADDER.includes(entry.targetTier),
        `${id} declares targetTier ${entry.targetTier}, which is outside the ladder`,
      );
      assert.ok(Array.isArray(entry.actions), `${id} must declare actions`);
      assert.ok(entry.verify, `${id} must declare a verify clause`);
      const verify = entry.verify;
      const hasCheck =
        (Array.isArray(verify.rules) && verify.rules.length > 0) ||
        typeof verify.expectTier === "string" ||
        (Array.isArray(verify.eventsCleared) &&
          verify.eventsCleared.length > 0);
      assert.ok(hasCheck, `${id} has no way to verify itself`);
      assert.ok(
        typeof entry.docs === "string" && entry.docs.startsWith("https://"),
        `${id} must link its docs`,
      );
    }
  });

  it("targets a tier at or better than the ecosystem's ceiling", () => {
    const tierRank = new Map(TIER_LADDER.map((tier, index) => [tier, index]));
    for (const [id, entry] of Object.entries(catalog)) {
      if (entry.targetTier === null) {
        continue;
      }
      const ceilingTier = ECOSYSTEM_CEILINGS[entry.ecosystem] || "resolved";
      assert.ok(
        tierRank.get(entry.targetTier) >= tierRank.get(ceilingTier),
        `${id} targets ${entry.targetTier}, which is better than the ${entry.ecosystem} ceiling of ${ceilingTier}; the loop would chase a tier this ecosystem can never reach`,
      );
    }
  });

  it("authors commands only from variables the resolver knows", () => {
    const knownVariables = new Set([...SHAPE_VARIABLES, "version", "major"]);
    const placeholder = /\{\{([a-zA-Z]+)\}\}/g;
    for (const [id, entry] of Object.entries(catalog)) {
      for (const action of entry.actions) {
        for (const variant of [
          `${action.command || ""}`,
          `${action.windows || ""}`,
        ]) {
          for (const match of variant.matchAll(placeholder)) {
            assert.ok(
              knownVariables.has(match[1]),
              `${id} uses {{${match[1]}}}, which the command resolver does not substitute`,
            );
          }
        }
      }
    }
  });

  it("keeps actions within the closed kind set and never skips work", () => {
    for (const [id, entry] of Object.entries(catalog)) {
      for (const action of entry.actions) {
        assert.ok(
          REMEDIATION_ACTION_KINDS.includes(action.kind),
          `${id} declares action kind ${action.kind}, which is outside the closed set`,
        );
        const command = `${action.command || ""}`;
        assert.doesNotMatch(
          command,
          /--skip/,
          `${id} proposes skipping work: ${command}`,
        );
        assert.doesNotMatch(
          command,
          /\b\d+\.\d+\b/,
          `${id} hardcodes a version in a command: ${command}`,
        );
        for (const variant of [command, `${action.windows || ""}`]) {
          if (
            variant.includes("{{version}}") ||
            variant.includes("{{major}}")
          ) {
            assert.ok(
              action.versionFrom === "expected" ||
                action.versionFrom === "latest",
              `${id} uses a version placeholder without versionFrom: ${command}`,
            );
          }
          for (const match of variant.matchAll(/\{\{([a-z]+)\}\}/g)) {
            assert.ok(
              match[1] === "version" ||
                match[1] === "major" ||
                SHAPE_VARIABLES.includes(match[1]),
              `${id} uses the template variable {{${match[1]}}}, which the resolver does not know: ${command}`,
            );
          }
        }
      }
    }
  });

  it("gives every install action a Windows story", () => {
    for (const [id, entry] of Object.entries(catalog)) {
      for (const action of entry.actions) {
        if (action.kind !== "install") {
          continue;
        }
        if (typeof action.windows === "string") {
          assert.ok(
            action.windows.length > 0,
            `${id} has an empty windows variant`,
          );
        } else {
          assert.equal(
            action.windows,
            null,
            `${id} install action must carry a windows variant or explicit null`,
          );
          assert.ok(
            typeof action.windowsReason === "string" &&
              action.windowsReason.length > 0,
            `${id} null windows variant needs a reason`,
          );
        }
      }
    }
  });

  it("answers the toolchain-impractical ecosystems with a container action", () => {
    const containerIds = [
      "dotnet.sdk.missing",
      "cocoa.pods.missing",
      "swift.toolchain.missing",
      "ruby.build-deps.missing",
      "ruby.version.unsupported-host",
    ];
    for (const id of containerIds) {
      assert.ok(
        catalog[id].actions.some((action) => action.kind === "container"),
        `${id} must propose the official container image`,
      );
    }
  });

  it("targets the ceiling ecosystems at their ceiling tier", () => {
    assert.equal(catalog["clojure.lein.missing"].targetTier, "manifest");
    assert.equal(catalog["clojure.cli.missing"].targetTier, "manifest");
    assert.equal(catalog["swift.toolchain.missing"].targetTier, "lockfile");
    assert.equal(catalog["swift.package-command"].targetTier, "lockfile");
    for (const remediationId of [
      "js.no-lockfile",
      "js.git-dependency",
      "js.no-node-modules",
      "js.lockfile-version",
      "js.pnpm-lock-unparseable",
      "python.lockfile-unparseable.uv",
      "python.lockfile-unparseable.poetry",
      "python.lockfile-unparseable.pdm",
      "python.lockfile-unparseable.pipenv",
    ]) {
      assert.equal(catalog[remediationId].targetTier, "lockfile");
      assert.equal(catalog[remediationId].verify.expectTier, "lockfile");
    }
  });
});

describe("scoring semantics", () => {
  it("offers a tier-neutral remediation for every deduction it charges", () => {
    // A policy restriction is recorded against the tool's own ecosystem, so it
    // reaches a row and costs points; its catalog entry names no target tier
    // because the fix restores evidence without moving the row up the ladder.
    for (const remediationId of [
      "policy.secure-mode",
      "policy.host-blocked",
      "policy.offline",
    ]) {
      const entry = catalog[remediationId];
      const row = {
        ...gradedRow("java", 40),
        degradations: [{ remediationId, impact: entry.impact, detail: "x" }],
      };
      const scoring = scoreReflection(
        { ledgerSource: "memory", ledgerComplete: true, ecosystems: [row] },
        catalog,
        {},
      );
      const [remediation] = scoring.remediations;
      assert.equal(
        remediation?.remediationId,
        remediationId,
        `${remediationId} charges a deduction with nothing to act on`,
      );
      assert.equal(remediation.targetTier, row.tier);
      assert.equal(
        remediation.projectedScore - remediation.currentScore,
        scoring.ecosystems[0].deduction,
      );
    }
  });

  it("folds a rule entry into the ledger fix that clears it", () => {
    const scoring = scoreReflection(
      {
        ledgerSource: "memory",
        ledgerComplete: true,
        ecosystems: [
          {
            ...gradedRow("java", 3),
            degradations: [
              {
                remediationId: "jvm.maven.manifest-fallback",
                impact: "transitive-deps",
                detail: "x",
              },
            ],
            findings: [
              { ruleId: "BF-JVM-001", message: "m", tierSignal: "manifest" },
              { ruleId: "BF-GEN-001", message: "g", tierSignal: "manifest" },
            ],
          },
        ],
      },
      catalog,
      {},
    );
    const ids = scoring.remediations.map((entry) => entry.remediationId);
    assert.deepEqual(ids, ["jvm.maven.manifest-fallback", "BF-GEN-001"]);
    // The catalog entry's verify clause names BF-JVM-001, so a separate entry
    // for it would ask the loop to fix the same thing twice.
    assert.deepEqual(scoring.remediations[0].subsumes, ["BF-JVM-001"]);
    assert.equal(scoring.remediations[1].subsumes, undefined);
  });

  it("attaches the failure facts to the ledger entry as evidence", () => {
    const scoring = scoreReflection(
      {
        ledgerSource: "memory",
        ledgerComplete: true,
        ecosystems: [
          {
            ...gradedRow("java", 3),
            degradations: [
              {
                remediationId: "jvm.maven.manifest-fallback",
                impact: "transitive-deps",
                detail: "The maven dependency tree did not succeed.",
                command: "mvn -B dependency:tree",
                exitCode: 1,
                causeDetail: "the resolver could not reach the repository",
                outputExcerpt: "[ERROR] Could not resolve dependencies",
              },
            ],
            findings: [],
          },
        ],
      },
      catalog,
      {},
    );
    assert.deepEqual(scoring.remediations[0].evidence, {
      failedCommand: "mvn -B dependency:tree",
      exitCode: 1,
      cause: "the resolver could not reach the repository",
      outputExcerpt: "[ERROR] Could not resolve dependencies",
    });
  });

  it("falls the evidence cause back to the recorded detail when no cause was diagnosed", () => {
    const scoring = scoreReflection(
      {
        ledgerSource: "memory",
        ledgerComplete: true,
        ecosystems: [
          {
            ...gradedRow("java", 3),
            degradations: [
              {
                remediationId: "jvm.maven.manifest-fallback",
                impact: "transitive-deps",
                detail: "The maven dependency tree did not succeed.",
                exitCode: 1,
              },
            ],
            findings: [],
          },
        ],
      },
      catalog,
      {},
    );
    assert.deepEqual(scoring.remediations[0].evidence, {
      exitCode: 1,
      cause: "The maven dependency tree did not succeed.",
    });
    // A rule-derived entry has no failure facts and carries no block.
    const withRule = scoreReflection(
      {
        ledgerSource: "memory",
        ledgerComplete: true,
        ecosystems: [
          {
            ...gradedRow("java", 3),
            findings: [
              {
                ruleId: "BF-GEN-001",
                message: "flat graph",
                tierSignal: "manifest",
              },
            ],
          },
        ],
      },
      catalog,
      {},
    );
    const ruleEntry = withRule.remediations.find(
      (entry) => entry.source === "rule",
    );
    assert.equal(ruleEntry?.evidence, undefined);
  });

  it("merges duplicate degradations deterministically and keeps the best evidence", () => {
    const base = {
      ledgerSource: "memory",
      ledgerComplete: true,
      ecosystems: [
        {
          ...gradedRow("java", 3),
          findings: [],
        },
      ],
    };
    const buildReflection = (degradations) => ({
      ...base,
      ecosystems: [{ ...base.ecosystems[0], degradations }],
    });
    const forward = scoreReflection(
      buildReflection([
        {
          remediationId: "jvm.gradle.invocation-failed",
          impact: "transitive-deps",
          detail: "second failure",
        },
        {
          remediationId: "jvm.gradle.invocation-failed",
          impact: "transitive-deps",
          detail: "first failure",
          command: "gradle dependencies",
          exitCode: 1,
          outputExcerpt: "FAILURE: Build failed",
        },
      ]),
      catalog,
      {},
    );
    const entry = forward.remediations[0];
    assert.equal(entry.evidenceCount, 2);
    assert.equal(entry.evidence.failedCommand, "gradle dependencies");
    assert.equal(entry.evidence.exitCode, 1);
    assert.equal(entry.evidence.outputExcerpt, "FAILURE: Build failed");
    // The reverse order must reach the same merged record.
    const reverse = scoreReflection(
      buildReflection([
        {
          remediationId: "jvm.gradle.invocation-failed",
          impact: "transitive-deps",
          detail: "first failure",
          command: "gradle dependencies",
          exitCode: 1,
          outputExcerpt: "FAILURE: Build failed",
        },
        {
          remediationId: "jvm.gradle.invocation-failed",
          impact: "transitive-deps",
          detail: "second failure",
        },
      ]),
      catalog,
      {},
    );
    assert.deepEqual(reverse.remediations[0].evidence, entry.evidence);
    assert.equal(
      reverse.remediations[0].summary,
      forward.remediations[0].summary,
    );
  });

  it("keeps a zero exit code recorded by the representative degradation", () => {
    // A producer that keys its degradation on the tool's output rather than
    // its status records a successful exit code beside a real failure, and
    // the merged record must report the status the command actually returned.
    const scoring = scoreReflection(
      {
        ledgerSource: "memory",
        ledgerComplete: true,
        ecosystems: [
          {
            ...gradedRow("java", 3),
            findings: [],
            degradations: [
              {
                remediationId: "jvm.maven.build-first",
                impact: "transitive-deps",
                detail: "artifacts could not be resolved",
                command: "mvn dependency:tree",
                exitCode: 0,
              },
              {
                remediationId: "jvm.maven.build-first",
                impact: "transitive-deps",
                detail: "artifacts could not be resolved",
                exitCode: 1,
              },
            ],
          },
        ],
      },
      catalog,
      {},
    );
    assert.equal(scoring.remediations[0].evidence.exitCode, 0);
  });

  it("keeps a rule entry whose ledger fix did not survive ranking", () => {
    const scoring = scoreReflection(
      {
        ledgerSource: "memory",
        ledgerComplete: true,
        ecosystems: [
          {
            ...gradedRow("java", 3),
            findings: [
              { ruleId: "BF-JVM-001", message: "m", tierSignal: "manifest" },
            ],
          },
        ],
      },
      catalog,
      {},
    );
    assert.deepEqual(
      scoring.remediations.map((entry) => entry.remediationId),
      ["BF-JVM-001"],
    );
  });

  it("keeps a sub-hundredth gain rather than rounding it away", () => {
    const scoring = scoreReflection(
      {
        ledgerSource: "memory",
        ledgerComplete: true,
        ecosystems: [
          gradedRow("npm", 200000),
          {
            ...gradedRow("java", 1),
            degradations: [
              {
                remediationId: "jvm.maven.manifest-fallback",
                impact: "transitive-deps",
                detail: "x",
              },
            ],
          },
        ],
      },
      catalog,
      {},
    );
    const [remediation] = scoring.remediations;
    assert.equal(remediation?.ecosystem, "java");
    assert.equal(remediation.expectedGain, 0);
    assert.equal(remediation.projectedScore > remediation.currentScore, true);
  });

  it("scores the tier base with no deductions", () => {
    for (const tier of TIER_LADDER) {
      const row = { ...gradedRow("dart", 10), tier };
      const scored = scoreEcosystemRow(row, catalog);
      assert.equal(scored.score, TIER_BASE_SCORES[tier]);
    }
  });

  it("caps deductions at the tier base minus 15", () => {
    const row = {
      ...gradedRow("java", 10),
      tier: "lockfile",
      toolsMissing: [{ tool: "maven" }],
      toolsMismatched: [{ tool: "java" }],
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
        {
          remediationId: "jvm.maven.tree-unparseable",
          impact: "transitive-deps",
        },
      ],
    };
    const scored = scoreEcosystemRow(row, catalog);
    // 8 + 5 + 10 + (10 + 6 for the command.failed kind) = 39; the lockfile
    // floor is 70, so the score stops there instead of falling to 46.
    assert.equal(scored.deduction, 39);
    assert.equal(scored.score, 70);
  });

  it("scores an at-ceiling row 100 whatever its tier", () => {
    const row = {
      ...gradedRow("helm", 52),
      state: "at-ceiling",
      tier: "manifest",
      ceilingTier: "manifest",
      toolsMissing: [{ tool: "lein" }],
      degradations: [
        { remediationId: "clojure.lein.missing", impact: "transitive-deps" },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    assert.equal(scoring.ecosystems[0].score, 100);
    assert.equal(scoring.ecosystems[0].remediations.length, 0);
    assert.equal(scoring.remediations.length, 0);
    assert.equal(scoring.overallScore, 100);
  });

  it("excludes unsupported rows from the mean and reports them as gaps", () => {
    const reflection = {
      ledgerSource: "sidecar",
      ledgerComplete: true,
      ecosystems: [
        { ...gradedRow("go", 100), tier: "resolved" },
        {
          ecosystem: "elm",
          state: "unsupported",
          tier: null,
          ceilingTier: null,
          tierReasons: [
            { source: "disk", id: "unsupported-ecosystem", determining: true },
          ],
          componentCount: 0,
          dependencyEdgeCount: 0,
          markersOnDisk: ["elm.json"],
          toolsExpected: [],
          toolsResolved: [],
          toolsMissing: [],
          toolsMismatched: [],
          degradations: [],
          findings: [],
        },
      ],
    };
    const withUnsupported = scoreReflection(reflection, catalog);
    assert.deepEqual(
      withUnsupported.unsupported.map((row) => row.ecosystem),
      ["elm"],
    );
    assert.equal(withUnsupported.ecosystems.length, 1);
    // (100 * 100) / 100 with and without the excluded row alike.
    assert.equal(withUnsupported.overallScore, 100);
    reflection.ecosystems = reflection.ecosystems.filter(
      (row) => row.state !== "unsupported",
    );
    assert.equal(
      scoreReflection(reflection, catalog).overallScore,
      withUnsupported.overallScore,
    );
  });

  it("counts absent rows at weight 1 so a silent ecosystem stays visible", () => {
    const scoring = scoreReflection(
      {
        ledgerSource: "sidecar",
        ledgerComplete: true,
        ecosystems: [
          { ...gradedRow("go", 100), tier: "resolved", state: "graded" },
          { ...gradedRow("ruby", 0), tier: "absent", state: "absent" },
        ],
      },
      catalog,
    );
    // (100 * 100 + 0 * 1) / 101 = 99.0099 -> 99. Weight 0 would report 100.
    assert.equal(scoring.overallScore, 99);
  });

  it("is bounded for empty, null-ish and hostile inputs", () => {
    for (const reflection of [
      {},
      { ecosystems: [] },
      { ecosystems: [gradedRow("dart", 0)] },
      {
        ecosystems: [
          {
            ...gradedRow("dart", 1),
            tier: "not-a-tier",
            state: "mystery",
            componentCount: -5,
            toolsMissing: new Array(50).fill({ tool: "maven" }),
            degradations: new Array(50).fill({
              remediationId: "unknown-id",
              impact: "unknown-impact",
            }),
          },
        ],
      },
    ]) {
      const scoring = scoreReflection(reflection, catalog);
      assert.ok(Number.isFinite(scoring.overallScore));
      assert.ok(scoring.overallScore >= 0 && scoring.overallScore <= 100);
      for (const row of scoring.ecosystems) {
        assert.ok(Number.isFinite(row.score));
        assert.ok(row.score >= 0 && row.score <= 100);
      }
    }
    const nullCatalog = scoreReflection(gradedReflection(), null);
    assert.ok(nullCatalog.overallScore >= 0 && nullCatalog.overallScore <= 100);
  });

  it("deduplicates ten identical degradations into one remediation", () => {
    const row = {
      ...gradedRow("java", 10),
      degradations: new Array(10).fill({
        remediationId: "jvm.maven.manifest-fallback",
        impact: "transitive-deps",
        detail: "maven build failed",
      }),
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const entries = scoring.ecosystems[0].remediations;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].remediationId, "jvm.maven.manifest-fallback");
    assert.equal(entries[0].evidenceCount, 10);
    // One transitive-deps deduction, not ten.
    assert.equal(scoring.ecosystems[0].deduction, 10);
  });

  it("ranks by expected gain, then confidence, then id", () => {
    const row = {
      ...gradedRow("java", 10),
      tier: "manifest",
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
        {
          remediationId: "jvm.maven.tree-unparseable",
          impact: "transitive-deps",
        },
      ],
      findings: [
        {
          ruleId: "BF-GEN-001",
          message: "flat graph",
          severity: "high",
          tierSignal: "manifest",
        },
        {
          ruleId: "BF-JVM-001",
          message: "no maven graph",
          severity: "high",
          tierSignal: "manifest",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const ranked = scoring.remediations.map((entry) => entry.remediationId);
    // Every catalog remediation here targets resolved; the command.failed id
    // removes a larger deduction of the same total, so it projects higher.
    // Both rank above the rule-derived entries, which only promise lockfile.
    assert.equal(ranked[0], "jvm.maven.tree-unparseable");
    assert.equal(ranked[1], "jvm.maven.manifest-fallback");
    // BF-JVM-001 is named by both catalog entries' verify clauses, so it is
    // folded into the higher-ranked one rather than ranked on its own.
    assert.deepEqual(ranked.slice(2), ["BF-GEN-001"]);
    assert.deepEqual(scoring.remediations[0].subsumes, ["BF-JVM-001"]);
    assert.ok(
      scoring.remediations[0].expectedGain >=
        scoring.remediations[1].expectedGain,
    );
    assert.ok(scoring.remediations[0].expectedGain > 0);

    // The measured corpus shape for the maven fallback carries only the
    // manifest-fallback id, and that entry must rank first overall.
    const soloRow = {
      ...row,
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const solo = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [soloRow] },
      catalog,
    );
    assert.equal(
      solo.remediations[0].remediationId,
      "jvm.maven.manifest-fallback",
    );
    assert.equal(solo.remediations[0].targetTier, "resolved");
  });

  it("substitutes expected versions into action commands", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsExpected: [
        { tool: "java", wanted: "21.0.7-tem", source: "sdkmanrc" },
        { tool: "maven", wanted: "3.9.11", source: "wrapper" },
      ],
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const actions = scoring.remediations[0].actions;
    assert.equal(actions[0].command, "sdk install java 21.0.7-tem");
    assert.equal(
      actions[0].windows,
      "winget install --id EclipseAdoptium.Temurin.21.JDK",
    );
    assert.equal(actions[1].command, "sdk install maven 3.9.11");
  });

  it("leaves placeholders intact when the run recorded no expected version", () => {
    const row = {
      ...gradedRow("java", 10),
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    assert.equal(
      scoring.remediations[0].actions[0].command,
      "sdk install java {{version}}",
    );
  });

  it("resolves a java version the build itself refused and named", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsMismatched: [
        {
          tool: "java",
          wanted: "17",
          found: "8",
          source: "invocation",
          detail:
            "The gradle launcher requires Java 17; the active JDK is older and refused its class files.",
        },
      ],
      degradations: [
        {
          remediationId: "jvm.gradle.invocation-failed",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const install = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    assert.equal(install.command, "sdk install java 17");
    assert.equal(install.versionFrom, "mismatch");
    assert.equal(
      install.versionSource,
      "The gradle launcher requires Java 17; the active JDK is older and refused its class files.",
    );
    assert.equal(install.versionSourceMissing, undefined);
    // The winget id derives its major line from the same version.
    assert.equal(
      install.windows,
      "winget install --id EclipseAdoptium.Temurin.17.JDK",
    );
  });

  it("prefers the project's pin file over a weaker environment expectation", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsExpected: [
        { tool: "java", wanted: "17", source: "env" },
        { tool: "java", wanted: "21", source: ".java-version" },
      ],
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const install = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    assert.equal(install.command, "sdk install java 21");
    assert.equal(install.versionFrom, "pin");
    assert.equal(install.versionSource, "pinned in .java-version");
  });

  it("puts a version the user asked for ahead of an inferred one", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsExpected: [
        { tool: "java", wanted: "11", source: "env" },
        { tool: "java", wanted: "17", source: "cli" },
      ],
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const install = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    assert.equal(install.command, "sdk install java 17");
    assert.equal(install.versionFrom, "expected");
    assert.equal(install.versionSource, "requested via cli");
  });

  it("falls back to the remaining expected entries with existing behaviour", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsExpected: [{ tool: "java", wanted: "11", source: "env" }],
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const install = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    assert.equal(install.command, "sdk install java 11");
    assert.equal(install.versionFrom, "expected");
    assert.equal(install.versionSource, "declared by env");
  });

  it("breaks ties inside a band by source, then wanted value", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsExpected: [
        { tool: "java", wanted: "20", source: ".tool-versions" },
        { tool: "java", wanted: "21", source: ".java-version" },
      ],
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const install = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    // ".java-version" sorts before ".tool-versions", so its pin wins.
    assert.equal(install.command, "sdk install java 21");
  });

  it("resolves a mismatch over a weaker pin and names the mismatch", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsMismatched: [
        {
          tool: "java",
          wanted: "21",
          found: "17",
          source: "invocation",
          detail: "gradle refused the running JVM and named 21 as its minimum",
        },
      ],
      toolsExpected: [{ tool: "java", wanted: "11", source: ".java-version" }],
      degradations: [
        {
          remediationId: "jvm.gradle.invocation-failed",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const install = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    assert.equal(install.command, "sdk install java 21");
    assert.equal(install.versionFrom, "mismatch");
    assert.equal(
      install.versionSource,
      "gradle refused the running JVM and named 21 as its minimum",
    );
  });

  it("keeps the unresolved case honest with versionSourceMissing", () => {
    const row = {
      ...gradedRow("java", 10),
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const install = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    // The unsubstituted command must survive verbatim: the agent shows it to
    // the user rather than inventing a version.
    assert.equal(install.command, "sdk install java {{version}}");
    assert.equal(
      install.windows,
      "winget install --id EclipseAdoptium.Temurin.{{major}}.JDK",
    );
    assert.equal(install.versionFrom, "unresolved");
    assert.equal(install.versionSourceMissing, true);
    assert.equal(install.versionSource, undefined);
  });

  it("omits the versionSource when the mismatch entry carries no diagnosis", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsMismatched: [{ tool: "java", wanted: "17", found: "8" }],
      degradations: [
        {
          remediationId: "jvm.gradle.invocation-failed",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const install = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    assert.equal(install.command, "sdk install java 17");
    assert.equal(install.versionFrom, "mismatch");
    assert.equal(install.versionSource, undefined);
  });

  it("substitutes a full pin version verbatim and derives the winget major", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsExpected: [
        { tool: "java", wanted: "21.0.5", source: ".java-version" },
      ],
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const install = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    assert.equal(install.command, "sdk install java 21.0.5");
    assert.equal(
      install.windows,
      "winget install --id EclipseAdoptium.Temurin.21.JDK",
    );
    assert.equal(install.versionFrom, "pin");
  });

  it("leaves actions without placeholders exactly as the catalog authored them", () => {
    const row = {
      ...gradedRow("java", 10),
      toolsExpected: [{ tool: "java", wanted: "21", source: ".java-version" }],
      degradations: [
        {
          remediationId: "jvm.maven.manifest-fallback",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
    );
    const build = scoring.remediations[0].actions.find(
      (action) => action.kind === "build",
    );
    assert.equal(build.command, "mvn -q package -DskipTests");
    assert.equal(build.versionFrom, undefined);
    assert.equal(build.versionSource, undefined);
    assert.equal(build.versionSourceMissing, undefined);
  });

  it("shapes the build command from the run's command facts and names the detection", () => {
    const row = {
      ...gradedRow("java", 10),
      degradations: [
        {
          remediationId: "jvm.gradle.invocation-failed",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
      { commandFacts: { wrappers: { gradlew: true } } },
    );
    const build = scoring.remediations[0].actions.find(
      (action) => action.kind === "build",
    );
    assert.equal(build.command, "./gradlew -q build");
    assert.equal(build.shapedBy, "wrapper:./gradlew");
    // A shaped build command carries no version facts: it never named a
    // version to install.
    assert.equal(build.versionFrom, undefined);
    assert.equal(build.versionSourceMissing, undefined);
    const javaInstall = scoring.remediations[0].actions.find(
      (action) => action.kind === "install" && action.tool === "java",
    );
    // A version install keeps its unresolved placeholder and gains no
    // shaping from the same pass.
    assert.match(javaInstall.command, /\{\{version\}\}/);
    assert.equal(javaInstall.shapedBy, undefined);
    assert.equal(javaInstall.versionFrom, "unresolved");
  });

  it("resolves the python split entry through the manager fact", () => {
    const row = {
      ...gradedRow("python", 10),
      degradations: [
        {
          remediationId: "python.lockfile-unparseable.uv",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
      { commandFacts: { pythonManager: "uv" } },
    );
    const entry = scoring.remediations[0];
    assert.equal(entry.remediationId, "python.lockfile-unparseable.uv");
    const install = entry.actions.find((action) => action.kind === "install");
    // A latest-version install stays exactly as authored: placeholder-free,
    // so the resolution pass leaves it and its latest versionFrom alone.
    assert.equal(install.command, "pip install uv");
    assert.equal(install.versionFrom, "latest");
    assert.equal(install.shapedBy, undefined);
    const build = entry.actions.find((action) => action.kind === "build");
    assert.equal(build.command, "uv lock");
    assert.equal(build.shapedBy, "manager:uv");
  });

  it("names both managers on the summary when the manager fact is ambiguous", () => {
    const row = {
      ...gradedRow("python", 10),
      degradations: [
        {
          remediationId: "python.lockfile-unparseable.uv",
          impact: "transitive-deps",
        },
      ],
    };
    const scoring = scoreReflection(
      { ledgerSource: "sidecar", ledgerComplete: true, ecosystems: [row] },
      catalog,
      { commandFacts: { pythonManagerCandidates: ["poetry", "uv"] } },
    );
    const entry = scoring.remediations[0];
    assert.equal(entry.blocked, false);
    assert.match(entry.summary, /poetry and uv/);
    const build = entry.actions.find((action) => action.kind === "build");
    assert.equal(build.command, "{{pythonManager}} lock");
    assert.equal(build.shapedBy, "manager:ambiguous");
  });
});

describe("confidence", () => {
  const baseRow = gradedRow("dart", 10);

  it("is high when the ledger and a rule corroborate each other", () => {
    const row = {
      ...baseRow,
      tierReasons: [
        { source: "rule", id: "BF-GEN-001", determining: true },
        {
          source: "ledger",
          id: "jvm.maven.manifest-fallback",
          determining: true,
        },
      ],
    };
    assert.equal(
      confidenceFor(row, { ledgerSource: "sidecar", ledgerComplete: true }),
      "high",
    );
  });

  it("is medium for one source with a complete ledger", () => {
    assert.equal(
      confidenceFor(baseRow, { ledgerSource: "sidecar", ledgerComplete: true }),
      "medium",
    );
  });

  it("is low without a ledger, with an incomplete ledger, or from disk alone", () => {
    assert.equal(
      confidenceFor(baseRow, { ledgerSource: "none", ledgerComplete: true }),
      "low",
    );
    assert.equal(
      confidenceFor(baseRow, {
        ledgerSource: "sidecar",
        ledgerComplete: false,
      }),
      "low",
    );
    assert.equal(
      confidenceFor(
        {
          ...baseRow,
          tierReasons: [{ source: "disk", id: "markers", determining: true }],
        },
        { ledgerSource: "sidecar", ledgerComplete: true },
      ),
      "low",
    );
  });
});

describe("blocked remediations", () => {
  const mavenRow = () => ({
    ...gradedRow("java", 10),
    degradations: [
      {
        remediationId: "jvm.maven.manifest-fallback",
        impact: "transitive-deps",
      },
    ],
  });
  const reflection = (rows, observations = []) => ({
    ledgerSource: "sidecar",
    ledgerComplete: true,
    ecosystems: rows,
    observations,
  });

  it("blocks network actions in secure mode but keeps the gain", () => {
    const scoring = scoreReflection(reflection([mavenRow()]), catalog, {
      secureMode: true,
    });
    const entry = scoring.remediations.find(
      (candidate) => candidate.remediationId === "jvm.maven.manifest-fallback",
    );
    assert.equal(entry.blocked, true);
    assert.match(entry.blockedReason, /network/);
    assert.ok(entry.expectedGain > 0);
  });

  it("blocks a provisioner the run recorded as unavailable", () => {
    const row = mavenRow();
    row.toolsMissing.push({ tool: "maven", source: "sdkman" });
    const scoring = scoreReflection(reflection([row]), catalog, {});
    const entry = scoring.remediations.find(
      (candidate) => candidate.remediationId === "jvm.maven.manifest-fallback",
    );
    assert.equal(entry.blocked, true);
    assert.match(entry.blockedReason, /sdkman provisioner/);
  });

  it("leaves actions unblocked when the provisioner was not recorded unavailable", () => {
    const row = mavenRow();
    row.toolsMissing.push({ tool: "maven", source: "PATH" });
    const scoring = scoreReflection(reflection([row]), catalog, {});
    const entry = scoring.remediations.find(
      (candidate) => candidate.remediationId === "jvm.maven.manifest-fallback",
    );
    assert.equal(entry.blocked, false);
  });

  it("blocks container actions inside a container", () => {
    const row = {
      ...gradedRow("cocoa", 10),
      degradations: [
        { remediationId: "cocoa.pods.missing", impact: "transitive-deps" },
      ],
    };
    const scoring = scoreReflection(reflection([row]), catalog, {
      inContainer: true,
    });
    const entry = scoring.remediations.find(
      (candidate) => candidate.remediationId === "cocoa.pods.missing",
    );
    assert.equal(entry.blocked, true);
    assert.match(entry.blockedReason, /container/);
  });

  it("derives offline from the ledger observations", () => {
    const row = {
      ...gradedRow("npm", 10),
      degradations: [{ remediationId: "js.no-lockfile", impact: "versions" }],
    };
    const scoring = scoreReflection(
      reflection(
        [row],
        [{ kind: "evidence.degraded", remediationId: "policy.offline" }],
      ),
      catalog,
      {},
    );
    const entry = scoring.remediations.find(
      (candidate) => candidate.remediationId === "js.no-lockfile",
    );
    assert.equal(entry.blocked, true);
    assert.match(entry.blockedReason, /network/);
  });
});

describe("the three scoring properties", () => {
  const GENERATED = 30;
  const generated = [];
  for (let seed = 1; seed <= GENERATED; seed += 1) {
    generated.push(generateReflection(seed));
  }

  it("is bounded: every score is a finite number in [0, 100]", () => {
    for (const reflection of generated) {
      const scoring = scoreReflection(reflection, catalog);
      assert.ok(
        Number.isFinite(scoring.overallScore),
        "overall must be finite",
      );
      assert.ok(
        scoring.overallScore >= 0 && scoring.overallScore <= 100,
        `overall out of bounds: ${scoring.overallScore}`,
      );
      for (const row of scoring.ecosystems) {
        assert.ok(Number.isFinite(row.score), "row score must be finite");
        assert.ok(row.score >= 0 && row.score <= 100);
        for (const entry of row.remediations) {
          assert.ok(Number.isFinite(entry.expectedGain));
        }
      }
    }
  });

  it("is monotonic: fixing anything never lowers the score", () => {
    for (const reflection of generated) {
      const baseline = scoreReflection(reflection, catalog);
      const fixes = [];
      for (const row of reflection.ecosystems) {
        if (row.toolsMissing?.length) {
          fixes.push(() => {
            row.toolsMissing = row.toolsMissing.slice(1);
          });
        }
        if (row.toolsMismatched?.length) {
          fixes.push(() => {
            row.toolsMismatched = row.toolsMismatched.slice(1);
          });
        }
        if (row.degradations?.length) {
          fixes.push(() => {
            row.degradations = row.degradations.slice(1);
          });
        }
        const tierRank = TIER_LADDER.indexOf(row.tier);
        if (row.state !== "unsupported" && tierRank > 0) {
          fixes.push(() => {
            row.tier = TIER_LADDER[tierRank - 1];
            if (row.tier === row.ceilingTier) {
              row.state = "at-ceiling";
            }
          });
        }
      }
      for (const fix of fixes) {
        const snapshot = JSON.stringify(reflection);
        fix();
        const fixed = scoreReflection(reflection, catalog);
        assert.ok(
          fixed.overallScore >= baseline.overallScore,
          `fixing lowered the overall from ${baseline.overallScore} to ${fixed.overallScore}`,
        );
        const originalRows = JSON.parse(snapshot).ecosystems;
        reflection.ecosystems.forEach((row, index) => {
          const original = originalRows[index];
          row.tier = original.tier;
          row.state = original.state;
          row.toolsMissing = original.toolsMissing;
          row.toolsMismatched = original.toolsMismatched;
          row.degradations = original.degradations;
        });
      }
    }
  });

  it("is stable: the same inputs score the same, including under shuffling", () => {
    for (const reflection of generated) {
      const first = scoreReflection(reflection, catalog);
      const second = scoreReflection(reflection, catalog);
      assert.deepEqual(second, first);
      const random = prng(97);
      const shuffledReflection = {
        ...reflection,
        ecosystems: reflection.ecosystems.map((row) => ({
          ...row,
          tierReasons: shuffled(row.tierReasons || [], random),
          toolsExpected: shuffled(row.toolsExpected || [], random),
          toolsMissing: shuffled(row.toolsMissing || [], random),
          toolsMismatched: shuffled(row.toolsMismatched || [], random),
          degradations: shuffled(row.degradations || [], random),
          findings: shuffled(row.findings || [], random),
        })),
      };
      const shuffledScoring = scoreReflection(shuffledReflection, catalog);
      assert.equal(shuffledScoring.overallScore, first.overallScore);
      assert.deepEqual(
        shuffledScoring.remediations.map((entry) => [
          entry.ecosystem,
          entry.remediationId,
          entry.expectedGain,
        ]),
        first.remediations.map((entry) => [
          entry.ecosystem,
          entry.remediationId,
          entry.expectedGain,
        ]),
      );
    }
  });
});

/**
 * A small healthy reflection used by the null-catalog bound test.
 *
 * @returns {Object} Reflection document.
 */
function gradedReflection() {
  return {
    ledgerSource: "sidecar",
    ledgerComplete: true,
    ecosystems: [gradedRow("dart", 10)],
    observations: [],
  };
}

describe("scoring over real reflections", () => {
  it("scores the swift-smoke ceiling at 100 with nothing to do", async () => {
    const { reflectOnRun } = await import("./reflect.js");
    const bom = JSON.parse(
      readFileSync(
        join(
          repoRoot,
          "test",
          "repotests",
          "swift-smoke",
          "expected",
          "default.json",
        ),
        "utf-8",
      ),
    );
    const reflection = await reflectOnRun(
      bom,
      { projectType: ["swift"] },
      { ledgerEvents: [], projectPath: "" },
    );
    const scoring = scoreReflection(reflection, catalog, {});
    assert.equal(scoring.overallScore, 100);
    assert.equal(scoring.ecosystems[0].state, "at-ceiling");
    assert.equal(scoring.ecosystems[0].score, 100);
    assert.equal(scoring.remediations.length, 0);
  });

  it("scores the pubspec-smoke dart row at its manifest ceiling with nothing to do", async () => {
    const { reflectOnRun } = await import("./reflect.js");
    const bom = JSON.parse(
      readFileSync(
        join(
          repoRoot,
          "test",
          "repotests",
          "pubspec-smoke",
          "expected",
          "default.json",
        ),
        "utf-8",
      ),
    );
    const reflection = await reflectOnRun(
      bom,
      { projectType: ["dart"] },
      { ledgerEvents: [], projectPath: "" },
    );
    const scoring = scoreReflection(reflection, catalog, {});
    assert.equal(scoring.ecosystems[0].state, "at-ceiling");
    assert.equal(scoring.ecosystems[0].tier, "manifest");
    assert.equal(scoring.ecosystems[0].score, 100);
    assert.deepEqual(scoring.remediations, []);
  });
});

describe("ranking helper", () => {
  it("orders equal gains by confidence and then by id", () => {
    const ranked = rankRemediations([
      {
        remediationId: "b.id",
        ecosystem: "java",
        confidence: "high",
        expectedGain: 10,
      },
      {
        remediationId: "c.id",
        ecosystem: "java",
        confidence: "low",
        expectedGain: 10,
      },
      {
        remediationId: "a.id",
        ecosystem: "java",
        confidence: "high",
        expectedGain: 10,
      },
    ]);
    assert.deepEqual(
      ranked.map((entry) => entry.remediationId),
      ["a.id", "b.id", "c.id"],
    );
  });
});
