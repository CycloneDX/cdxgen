/**
 * Reflection: join what cdxgen did (the build ledger) with what it produced
 * (the BOM, through the build-fidelity rule pack) and commit to a per-
 * ecosystem fidelity verdict.
 *
 * The two evidence sources are kept independent on purpose. A finding backed
 * by both the ledger and a BOM-side rule is high confidence; either alone is
 * lower confidence. A ledger event with no BOM-side corroboration is reported
 * as an observation, never as a defect: an event says the run degraded
 * somewhere, but only the BOM shows whether the output paid for it. The
 * rule-only path is a first-class path — reflecting over a foreign BOM with
 * no ledger at all still produces a complete verdict.
 *
 * Every ecosystem present in the scan is assigned exactly one tier from the
 * ladder `resolved > lockfile > manifest > heuristic > absent`, or excluded
 * from scoring entirely as `unsupported` when its markers name an ecosystem
 * cdxgen has no project type for. Ties break toward the worse tier: a report
 * that overstates fidelity stops the remediation loop early, while one that
 * understates it merely costs an extra iteration.
 */

import { createHash, randomUUID } from "node:crypto";
import { basename, join } from "node:path";

import { Purl } from "@cdxgen/cdx-purl";

import { readEnvironmentVariable } from "../../../core/activity.js";
import {
  getLedgerEvents,
  LEDGER_EVENT_IMPACTS,
  LEDGER_EVENT_KINDS,
  LEDGER_TOOL_ECOSYSTEM,
  loadLedgerFile,
} from "../../../core/buildLedger.js";
import {
  isVersionedJvmToolProjectType,
  PROJECT_TYPE_ALIASES,
} from "../../../core/env.js";
import { safeExistsSync } from "../../../core/fs.js";
import { dirNameStr } from "../../../core/paths.js";
import { CDXGEN_VERSION } from "../../../core/state.js";
import { evaluateRules, loadRules } from "../ruleEngine.js";
import {
  findRuntimeToolMismatch,
  readFormulationEvidence,
  TOOL_NAME_ECOSYSTEMS,
} from "./formulationEvidence.js";
import { detectEcosystemMarkers, MARKERS_BY_NAME } from "./markers.js";

/**
 * The fidelity tier ladder, from healthiest to worst.
 *
 * @type {string[]}
 */
export const FIDELITY_TIERS = [
  "resolved",
  "lockfile",
  "manifest",
  "heuristic",
  "absent",
];

/** Ladder position of each tier; higher is worse. */
const TIER_SEVERITY = new Map([
  ["resolved", 0],
  ["lockfile", 1],
  ["manifest", 2],
  ["heuristic", 3],
  ["absent", 4],
]);

/**
 * Ecosystem states. `graded` rows carry a tier below their ceiling and are
 * the remediation loop's business; `at-ceiling` rows already parse as
 * completely as their ecosystem permits; `absent` rows produced zero
 * components for a supported ecosystem and are real failures; `unsupported`
 * rows are coverage gaps in cdxgen itself, excluded from the score.
 *
 * @type {string[]}
 */
export const ECOSYSTEM_STATES = [
  "graded",
  "at-ceiling",
  "absent",
  "unsupported",
];

/**
 * Ecosystems whose best achievable tier is below `resolved`, because the
 * ecosystem has no resolved graph for cdxgen to read. Any ecosystem not
 * listed here defaults to a ceiling of `resolved`, so a newly supported
 * ecosystem fails safe by demanding the most. Every entry below is backed by
 * a measurement recorded in the deliverable handoff; none is added from
 * reading a table.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ECOSYSTEM_CEILINGS = Object.freeze({
  // Helm charts carry pinned dependencies in Chart.yaml with no resolver to
  // run; measured 52 components / 0 dependency nodes on helm-charts.
  helm: "manifest",
  // deps.edn and project.clj pin exact versions; measured 23 components /
  // 0 dependency nodes on babashka.
  clojure: "manifest",
  // cdxgen parses Package.resolved but never builds a Swift dependency
  // graph; measured 3 components / 0 dependency nodes with a byte-identical
  // BOM whether or not the swift toolchain was available.
  swift: "lockfile",
  // pubspec.lock records only a direct/transitive classification per package
  // and no cdxgen code path invokes a dart toolchain, so no environment can
  // add the missing graph; measured 344 components / 1 dependency node on
  // spotube, the parser's maximum for the format.
  dart: "manifest",
  // The npm, rust and python parsers derive every BOM they emit from a
  // lockfile or an equivalent pinned source, so the components always carry
  // the lockfile-only evidence the checks below key on - npm integrity
  // strings, Cargo.lock checksums, cdx:pypi provenance properties - whether
  // or not the dependencies were installed. `resolved` is therefore not a
  // state any environment can produce evidence for in these ecosystems; the
  // graph itself is still guarded by the build-fidelity rules, which demote
  // to `manifest` the moment coverage drops.
  npm: "lockfile",
  python: "lockfile",
  rust: "lockfile",
});

/**
 * Canonical ecosystem names used by the ledger's producers and by this
 * module's rows, mapped from the PROJECT_TYPE_ALIASES keys that describe the
 * same ecosystem. Ecosystems absent from this map (containers, osquery,
 * universal and similar non-package types) never get a fidelity row.
 *
 * @type {Readonly<Record<string, string>>}
 */
const ECOSYSTEM_ALIAS_KEYS = Object.freeze({
  java: "java",
  js: "npm",
  py: "python",
  go: "go",
  rust: "rust",
  php: "php",
  ruby: "ruby",
  csharp: "csharp",
  dart: "dart",
  helm: "helm",
  clojure: "clojure",
  swift: "swift",
  cocoa: "cocoa",
  elixir: "elixir",
  c: "c",
  haskell: "haskell",
});

/** Alias or project type → canonical ecosystem. The first assignment of an
 * alias wins, so an alias claimed by two ecosystems (e.g. `swift` under both
 * swift and cocoa) keeps the more specific ecosystem. */
const ALIAS_TO_ECOSYSTEM = new Map();
for (const [key, canonical] of Object.entries(ECOSYSTEM_ALIAS_KEYS)) {
  for (const alias of [key, ...(PROJECT_TYPE_ALIASES[key] || [])]) {
    const normalizedAlias = alias.toLowerCase();
    if (!ALIAS_TO_ECOSYSTEM.has(normalizedAlias)) {
      ALIAS_TO_ECOSYSTEM.set(normalizedAlias, canonical);
    }
  }
}

/**
 * Every project type cdxgen recognizes, keys and aliases alike. An ecosystem
 * outside {@link ECOSYSTEM_ALIAS_KEYS} but present here — containers, os,
 * universal, github, binary — is supported and simply has no package-fidelity
 * ladder, so it gets no row at all. Only a name cdxgen cannot dispatch on is
 * a coverage gap.
 *
 * @type {Set<string>}
 */
const KNOWN_PROJECT_TYPES = new Set();
for (const [key, aliases] of Object.entries(PROJECT_TYPE_ALIASES)) {
  KNOWN_PROJECT_TYPES.add(key.toLowerCase());
  for (const alias of aliases) {
    KNOWN_PROJECT_TYPES.add(alias.toLowerCase());
  }
}

/**
 * Purl type → canonical ecosystem for every type the build-fidelity pack and
 * the ledger's producers name. Components with other purl types never form a
 * fidelity row.
 *
 * @type {Readonly<Record<string, string>>}
 */
const PURL_TYPE_ECOSYSTEMS = Object.freeze({
  maven: "java",
  npm: "npm",
  pypi: "python",
  golang: "go",
  cargo: "rust",
  gem: "ruby",
  nuget: "csharp",
  composer: "php",
  pub: "dart",
  helm: "helm",
  clojars: "clojure",
  swift: "swift",
  cocoapods: "cocoa",
  hex: "elixir",
  conan: "c",
  hackage: "haskell",
});

/** Canonical ecosystem → the purl types that belong to it. */
const ECOSYSTEM_PURL_TYPES = new Map();
for (const [purlType, ecosystem] of Object.entries(PURL_TYPE_ECOSYSTEMS)) {
  const types = ECOSYSTEM_PURL_TYPES.get(ecosystem) || [];
  types.push(purlType);
  ECOSYSTEM_PURL_TYPES.set(ecosystem, types);
}

/**
 * Ledger event kinds whose event says the run degraded. `tool.missing` and
 * `tool.mismatch` are excluded: they are tool facts first and live in the
 * row's toolsMissing/toolsMismatched arrays.
 *
 * @type {Set<string>}
 */
const DEGRADATION_KINDS = new Set([
  LEDGER_EVENT_KINDS.FALLBACK_ENGAGED,
  LEDGER_EVENT_KINDS.EVIDENCE_DEGRADED,
  LEDGER_EVENT_KINDS.COMMAND_FAILED,
]);

/**
 * Per-ecosystem checks for lockfile evidence: BOM features that only a
 * lockfile parse produces. The tier only reaches `lockfile` when no demoting
 * rule or event fired, so a lockfile marker on an unhealthy BOM never hides
 * a demotion. For the ecosystems whose ceiling is `lockfile` this evidence is
 * what carries a healthy row onto its ceiling.
 *
 * @type {Readonly<Record<string, (bomJson: Object, facts: Object) => boolean>>}
 */
const LOCKFILE_EVIDENCE_CHECKS = Object.freeze({
  // npm lockfiles are the only npm source that carries integrity strings.
  npm: (_bomJson, facts) => facts.hashesByEcosystem.get("npm") === true,
  // Cargo.lock checksums are the only cargo source that carries hashes.
  rust: (_bomJson, facts) => facts.hashesByEcosystem.get("rust") === true,
  // Python parses record per-package provenance properties only when a
  // requirements file or a lockfile was read.
  python: (_bomJson, facts) =>
    facts.provenanceByEcosystem.get("python") === true,
});

/** Degradation kinds eligible to become remediation entries, joined with the
 * rule findings that corroborate them. */
const REMEDIABLE_KINDS = DEGRADATION_KINDS;

/** Fidelity rules from data/rules/build-fidelity.yaml, loaded once. */
let fidelityRulesPromise;

/**
 * True when introspection is enabled for a run: the CLI option is set or the
 * documented environment opt-in is present. Everything in this module sits
 * behind this check, so a disabled run pays one boolean test.
 *
 * @param {Object} options CLI options.
 * @returns {boolean} True when the reflection should run.
 */
export { isIntrospectionEnabled } from "../../../core/buildLedger.js";

/**
 * Resolve the fidelity rule pack, loading it once per process.
 *
 * @returns {Promise<Object[]>} Rules in the build-fidelity category.
 */
async function getFidelityRules() {
  if (!fidelityRulesPromise) {
    fidelityRulesPromise = loadRules(join(dirNameStr, "data", "rules")).then(
      (rules) => rules.filter((rule) => rule.category === "build-fidelity"),
    );
  }
  return fidelityRulesPromise;
}

/**
 * Extract the purl type from a purl string, matching the segment the
 * build-fidelity conditions gate on. Falls back to the same substring split
 * the rule conditions use when the purl cannot be parsed.
 *
 * @param {string|undefined} purl Package URL.
 * @returns {string|undefined} Purl type, or undefined when absent.
 */
function purlTypeOf(purl) {
  if (!purl || typeof purl !== "string") {
    return undefined;
  }
  try {
    return Purl.parse(purl)?.type || undefined;
  } catch {
    const schemeIndex = purl.indexOf("pkg:");
    if (schemeIndex < 0) {
      return undefined;
    }
    return purl.slice(schemeIndex + 4).split("/")[0] || undefined;
  }
}

/**
 * Collect the BOM facts the verdict reads: components and dependency edges
 * per canonical ecosystem, lockfile evidence markers, and the parent
 * component's purl type.
 *
 * @param {Object} bomJson CycloneDX BOM.
 * @returns {Object} Aggregated facts.
 */
function collectBomFacts(bomJson) {
  const components = Array.isArray(bomJson?.components)
    ? bomJson.components
    : [];
  const dependencies = Array.isArray(bomJson?.dependencies)
    ? bomJson.dependencies
    : [];
  const componentCountByEcosystem = new Map();
  const hashesByEcosystem = new Map();
  const provenanceByEcosystem = new Map();
  const refEcosystem = new Map();
  for (const component of components) {
    const purlType = purlTypeOf(component.purl);
    const ecosystem = PURL_TYPE_ECOSYSTEMS[purlType];
    if (!ecosystem) {
      continue;
    }
    componentCountByEcosystem.set(
      ecosystem,
      (componentCountByEcosystem.get(ecosystem) || 0) + 1,
    );
    if (component["bom-ref"]) {
      refEcosystem.set(component["bom-ref"], ecosystem);
    }
    if (Array.isArray(component.hashes) && component.hashes.length) {
      hashesByEcosystem.set(ecosystem, true);
    }
    if (
      Array.isArray(component.properties) &&
      component.properties.some((property) =>
        property?.name?.startsWith(`cdx:${purlType}:`),
      )
    ) {
      provenanceByEcosystem.set(ecosystem, true);
    }
  }
  const edgeCountByEcosystem = new Map();
  let totalEdgeCount = 0;
  for (const dependency of dependencies) {
    const edgeCount = Array.isArray(dependency.dependsOn)
      ? dependency.dependsOn.length
      : 0;
    totalEdgeCount += edgeCount;
    const ecosystem = refEcosystem.get(dependency.ref);
    if (ecosystem) {
      edgeCountByEcosystem.set(
        ecosystem,
        (edgeCountByEcosystem.get(ecosystem) || 0) + edgeCount,
      );
    }
  }
  return {
    componentCountByEcosystem,
    edgeCountByEcosystem,
    hashesByEcosystem,
    provenanceByEcosystem,
    refEcosystem,
    totalEdgeCount,
    dependencyCount: dependencies.length,
    parentPurlType: purlTypeOf(bomJson?.metadata?.component?.purl),
  };
}

/**
 * Resolve the events the reflection joins against: the caller's override, the
 * JSONL sidecar when configured, or the in-memory buffer. Prefer the sidecar
 * whenever it exists — worker threads append there, so it is the only
 * complete record of a multi-worker run.
 *
 * @param {Object} context Reflection overrides.
 * @returns {{events: Object[], source: string}} Events and their origin.
 */
function resolveLedgerEvents(context) {
  if (Array.isArray(context.ledgerEvents)) {
    return {
      events: context.ledgerEvents,
      source: context.ledgerEvents.length ? "provided" : "none",
    };
  }
  const sidecarPath = readEnvironmentVariable("CDXGEN_INTROSPECT_LEDGER");
  // A sidecar the run could not create (the permission model denies writes
  // outside the granted paths) holds nothing; the buffer still has the events.
  if (sidecarPath && safeExistsSync(sidecarPath)) {
    return { events: loadLedgerFile(sidecarPath), source: "sidecar" };
  }
  const events = getLedgerEvents();
  return { events, source: events.length ? "memory" : "none" };
}

/**
 * Resolve the host runtime from the ledger's runtime event when present,
 * falling back to direct runtime detection. The ledger event is preferred
 * because it is what the run itself recorded, and reading it avoids re-running
 * the environment probes.
 *
 * @param {Object[]} events Ledger events.
 * @returns {{name: string, version: string}} Runtime name and version.
 */
function resolveRuntime(events) {
  const runtimeEvent = events.find(
    (event) =>
      event.kind === LEDGER_EVENT_KINDS.TOOL_RESOLVED &&
      event.ecosystem === "generic" &&
      event.source === "runtime",
  );
  if (runtimeEvent) {
    const names = { node: "Node.js", deno: "Deno", bun: "Bun" };
    return {
      name: names[runtimeEvent.tool] || runtimeEvent.tool || "Unknown",
      version: runtimeEvent.found || "N/A",
    };
  }
  if (globalThis.Deno?.version?.deno !== undefined) {
    return { name: "Deno", version: globalThis.Deno.version.deno };
  }
  if (globalThis.Bun?.version !== undefined) {
    return { name: "Bun", version: globalThis.Bun.version };
  }
  if (globalThis.process?.versions?.node !== undefined) {
    return { name: "Node.js", version: globalThis.process.versions.node };
  }
  return { name: "Unknown", version: "N/A" };
}

/**
 * Drop a trailing version pin such as the `3.9.9` of `maven3.9.9`, scanning
 * backwards over digits and dots so the cost stays linear in the length of
 * the project type.
 *
 * @param {string} projectType Lower-cased project type.
 * @returns {string} The type without its trailing version characters.
 */
function withoutVersionSuffix(projectType) {
  let end = projectType.length;
  while (end > 0) {
    const char = projectType[end - 1];
    if (char !== "." && (char < "0" || char > "9")) {
      break;
    }
    end -= 1;
  }
  return projectType.slice(0, end);
}

/**
 * Canonical ecosystem for a CLI project type, resolving versioned JVM tool
 * pins such as `maven3.9.9` to their base ecosystem.
 *
 * @param {string} projectType Project type from the CLI options.
 * @returns {string|undefined} Canonical ecosystem, or undefined for types outside the fidelity scope.
 */
function canonicalEcosystemFor(projectType) {
  const normalizedType = `${projectType || ""}`.toLowerCase();
  return (
    ALIAS_TO_ECOSYSTEM.get(normalizedType) ||
    (isVersionedJvmToolProjectType(normalizedType)
      ? ALIAS_TO_ECOSYSTEM.get(withoutVersionSuffix(normalizedType))
      : undefined)
  );
}

/**
 * Requested project types from the CLI options, accepting the string and
 * array forms and comma-separated members.
 *
 * @param {Object} options CLI options.
 * @returns {string[]} Requested project types.
 */
function requestedProjectTypes(options) {
  const rawTypes = Array.isArray(options?.projectType)
    ? options.projectType
    : options?.projectType
      ? [options.projectType]
      : [];
  return rawTypes
    .flatMap((type) => `${type}`.split(","))
    .map((type) => type.trim())
    .filter(Boolean);
}

/**
 * Attribute a rule finding to one ecosystem. Scoped rules are attributed to
 * the ecosystem owning the most components among the purl types the rule
 * applies to; the empty-component rule is attributed through the parent purl
 * type it reports; purely structural rules stay global.
 *
 * @param {Object} finding Rule finding.
 * @param {Object} ruleById Rule definitions keyed by id.
 * @param {Object} facts Aggregated BOM facts.
 * @returns {string|undefined} Canonical ecosystem, or undefined when the finding is global.
 */
function attributeFinding(finding, ruleById, facts) {
  const rule = ruleById.get(finding.ruleId);
  const appliesTo = Array.isArray(rule?.["applies-to"])
    ? rule["applies-to"]
    : [];
  if (appliesTo.length) {
    const present = appliesTo
      .map((purlType) => PURL_TYPE_ECOSYSTEMS[purlType])
      .filter((ecosystem) => facts.componentCountByEcosystem.has(ecosystem))
      .sort(
        (a, b) =>
          (facts.componentCountByEcosystem.get(b) || 0) -
            (facts.componentCountByEcosystem.get(a) || 0) || a.localeCompare(b),
      );
    return present[0];
  }
  const reportedPurlType = finding._match?.parentPurlType;
  if (reportedPurlType && PURL_TYPE_ECOSYSTEMS[reportedPurlType]) {
    return PURL_TYPE_ECOSYSTEMS[reportedPurlType];
  }
  return undefined;
}

/**
 * Stable JSON serialization for fingerprints and dedup keys: object keys are
 * sorted recursively so the result depends on values, never on insertion
 * order.
 *
 * @param {*} value Value to serialize.
 * @returns {string} Deterministic JSON text.
 */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Hash the inputs that must change before a re-run can improve the verdict:
 * the scanned path, the requested project types, the *resolved* tool versions
 * the run observed, and the cdxgen version. Expected versions are excluded on
 * purpose — the fingerprint exists so an agent loop can detect that an
 * install took effect, and only found versions move when it did.
 *
 * @param {Object} params Fingerprint inputs.
 * @param {string} params.projectPath Scanned directory.
 * @param {string[]} params.projectTypes Requested project types.
 * @param {Object[]} params.events Ledger events.
 * @returns {string} Hex sha256 of the canonical inputs.
 */
function computeInputsFingerprint({ projectPath, projectTypes, events }) {
  const resolvedTools = [];
  const seenTools = new Set();
  for (const event of events) {
    if (
      event.kind !== LEDGER_EVENT_KINDS.TOOL_RESOLVED ||
      !event.tool ||
      event.found === undefined ||
      event.ecosystem === LEDGER_TOOL_ECOSYSTEM
    ) {
      continue;
    }
    const key = `${event.ecosystem}|${event.tool}|${event.found}`;
    if (seenTools.has(key)) {
      continue;
    }
    seenTools.add(key);
    resolvedTools.push({
      ecosystem: event.ecosystem,
      tool: event.tool,
      found: event.found,
    });
  }
  resolvedTools.sort((a, b) =>
    `${a.ecosystem}|${a.tool}|${a.found}`.localeCompare(
      `${b.ecosystem}|${b.tool}|${b.found}`,
    ),
  );
  const payload = stableStringify({
    projectPath: projectPath || "",
    projectTypes: [...projectTypes].sort(),
    resolvedTools,
    cdxgenVersion: CDXGEN_VERSION,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Deduplicate row tool facts by their full tuple so repeated probes of the
 * same tool collapse into one entry.
 *
 * @param {Object[]} entries Tool fact entries.
 * @returns {Object[]} Deduplicated entries in first-seen order.
 */
function dedupeToolEntries(entries) {
  const seen = new Set();
  const deduped = [];
  for (const entry of entries) {
    const key = stableStringify(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

/**
 * Tier signal a finding's rule declares, resolved through the rule pack
 * because findings do not carry pack metadata.
 *
 * @param {Object} finding Rule finding.
 * @param {Object} ruleById Rule definitions keyed by id.
 * @returns {string|undefined} The rule's tier-signal, when declared.
 */
function tierSignal(finding, ruleById) {
  return ruleById.get(finding.ruleId)?.["tier-signal"];
}

/**
 * The evidence source a finding's tier reason is attributed to. Rules whose
 * findings read the BOM's formulation carry `reason-source: formulation`;
 * everything else reasons from the rule pack's BOM-structural match.
 *
 * @param {Object} finding Rule finding.
 * @param {Object} ruleById Rule definitions keyed by id.
 * @returns {string} The reason's source label.
 */
function reasonSourceOf(finding, ruleById) {
  return ruleById.get(finding.ruleId)?.["reason-source"] || "rule";
}

/**
 * Compact observation record for an event that is reported but never scored.
 * The failure facts a remediation would need — the command, its exit code, a
 * bounded output excerpt and the diagnosed cause — travel with the record, so
 * an observation explains itself as well as a remediation does.
 *
 * @param {Object} event Ledger event.
 * @returns {Object} Observation.
 */
function observationFromEvent(event) {
  return {
    kind: event.kind,
    ecosystem: event.ecosystem,
    tool: event.tool,
    remediationId: event.remediationId,
    impact: event.impact,
    detail: event.detail,
    command: event.command,
    exitCode: typeof event.exitCode === "number" ? event.exitCode : undefined,
    causeDetail: event.causeDetail,
    outputExcerpt: event.outputExcerpt,
  };
}

/**
 * The failure facts one degradation record carries alongside its remediation
 * id and impact, taken from the event that reported it. Every field is
 * optional: a producer that had no output in hand records none.
 *
 * @param {Object} event Ledger event.
 * @returns {Object} Failure facts, with absent fields left undefined.
 */
function failureFactsFromEvent(event) {
  return {
    command: event.command,
    exitCode: typeof event.exitCode === "number" ? event.exitCode : undefined,
    causeDetail: event.causeDetail,
    outputExcerpt: event.outputExcerpt,
  };
}

/**
 * Build one ecosystem's assessment: tool facts, corroborated degradations,
 * findings, and the tier assigned by the deterministic ladder. Every
 * contributing reason is recorded, and the reasons behind the winning tier
 * are marked determining.
 *
 * @param {Object} row Row inputs.
 * @param {string} row.ecosystem Canonical ecosystem.
 * @param {boolean} row.unsupported True when cdxgen has no project type for the ecosystem.
 * @param {Object[]} row.events Ledger events for this ecosystem.
 * @param {Object[]} row.findings Rule findings attributed to this ecosystem.
 * @param {Object} row.ruleById Rule definitions keyed by id.
 * @param {string[]} row.markersOnDisk Marker paths found on disk or in ledger event paths.
 * @param {number} row.componentCount Components of this ecosystem in the BOM.
 * @param {number} row.dependencyEdgeCount Dependency edges anchored in this ecosystem.
 * @param {Object[]} [row.formulationTools] Tool facts the BOM's formulation records for this ecosystem, used only when no ledger observed the run.
 * @param {Object} bomJson CycloneDX BOM.
 * @param {Object} facts Aggregated BOM facts.
 * @returns {{assessment: Object, observed: Object[]}} The assessment and the events routed to observations.
 */
function assessEcosystem(row, bomJson, facts) {
  const observed = [];
  const toolsExpected = [];
  const toolsResolved = [];
  const toolsMissing = [];
  const toolsMismatched = [];
  for (const event of row.events) {
    switch (event.kind) {
      case LEDGER_EVENT_KINDS.TOOL_EXPECTED:
        toolsExpected.push({
          tool: event.tool,
          wanted: event.wanted,
          source: event.source,
        });
        break;
      case LEDGER_EVENT_KINDS.TOOL_RESOLVED:
        toolsResolved.push({
          tool: event.tool,
          found: event.found,
          source: event.source,
          path: event.path,
        });
        break;
      case LEDGER_EVENT_KINDS.TOOL_MISSING:
        toolsMissing.push({
          tool: event.tool,
          wanted: event.wanted,
          source: event.source,
        });
        break;
      case LEDGER_EVENT_KINDS.TOOL_MISMATCH:
        toolsMismatched.push({
          tool: event.tool,
          wanted: event.wanted,
          found: event.found,
          source: event.source,
          detail: event.detail,
        });
        break;
      default:
        break;
    }
  }
  // On a foreign BOM no ledger observed the run, so the formulation's
  // platform record is the primary tool evidence and substitutes for the
  // absent `tool.resolved` events. On a same-run scan the probes were
  // already counted once as ledger events, and adding them here would
  // report one probe twice.
  for (const tool of Array.isArray(row.formulationTools)
    ? row.formulationTools
    : []) {
    toolsResolved.push(tool);
  }

  if (row.unsupported) {
    return {
      assessment: {
        ecosystem: row.ecosystem,
        state: "unsupported",
        tier: null,
        ceilingTier: null,
        tierReasons: [
          {
            source: "disk",
            id: "unsupported-ecosystem",
            detail:
              "cdxgen has no project type for this ecosystem, so nothing was parsed even though its manifest is on disk; this is a cdxgen coverage gap, not a project defect.",
            determining: true,
          },
        ],
        componentCount: 0,
        dependencyEdgeCount: 0,
        markersOnDisk: row.markersOnDisk,
        toolsExpected: [],
        toolsResolved: [],
        toolsMissing: [],
        toolsMismatched: [],
        degradations: [],
        findings: [],
      },
      observed,
    };
  }

  const hasFindings = row.findings.length > 0;
  // A ledger event corroborates when the BOM shows the damage it explains:
  // a finding fired for this ecosystem, or the ecosystem contributed no
  // dependency graph at all — no components, or components with no edge
  // anchored in them. That second shape is the one an umbrella rule cannot
  // see in a polyglot BOM, where another ecosystem's graph keeps the global
  // rule quiet. Uncorroborated events stay observations — they describe a
  // degraded step that did not cost the output anything measurable.
  const corroborated = hasFindings || row.dependencyEdgeCount === 0;

  // Gather every candidate reason with the tier it argues for, then pick the
  // worst tier argued: the ladder steps are first-match-wins in the plan's
  // order, which is exactly a tie-break toward the worse tier.
  const candidates = [];
  if (row.markersOnDisk.length > 0 && row.componentCount === 0) {
    candidates.push({
      tier: "absent",
      reason: {
        source: "disk",
        id: "markers",
        detail: `${row.markersOnDisk.length} marker file(s) on disk and no components produced for this ecosystem.`,
      },
    });
  }
  for (const finding of row.findings) {
    const signal = tierSignal(finding, row.ruleById);
    if (signal && TIER_SEVERITY.has(signal)) {
      candidates.push({
        tier: signal,
        reason: {
          source: reasonSourceOf(finding, row.ruleById),
          id: finding.ruleId,
          detail: finding.message,
        },
      });
    }
  }
  const fallbackWithComponentCost = row.events.find(
    (event) =>
      corroborated &&
      event.kind === LEDGER_EVENT_KINDS.FALLBACK_ENGAGED &&
      (event.impact === LEDGER_EVENT_IMPACTS.VERSIONS ||
        event.impact === LEDGER_EVENT_IMPACTS.COMPONENTS),
  );
  if (fallbackWithComponentCost) {
    candidates.push({
      tier: "heuristic",
      reason: {
        source: "ledger",
        id:
          fallbackWithComponentCost.remediationId ||
          fallbackWithComponentCost.kind,
        detail:
          fallbackWithComponentCost.detail ||
          "A fallback produced components from artifacts instead of a manifest.",
      },
    });
  }
  const fallbackWithTransitiveCost = row.events.find(
    (event) =>
      corroborated &&
      (event.kind === LEDGER_EVENT_KINDS.FALLBACK_ENGAGED ||
        event.kind === LEDGER_EVENT_KINDS.EVIDENCE_DEGRADED) &&
      event.impact === LEDGER_EVENT_IMPACTS.TRANSITIVE_DEPS,
  );
  if (fallbackWithTransitiveCost) {
    candidates.push({
      tier: "manifest",
      reason: {
        source: "ledger",
        id:
          fallbackWithTransitiveCost.remediationId ||
          fallbackWithTransitiveCost.kind,
        detail:
          fallbackWithTransitiveCost.detail ||
          "Transitive dependency resolution was skipped or failed.",
      },
    });
  }
  const lockfileEvidence = LOCKFILE_EVIDENCE_CHECKS[row.ecosystem];
  if (lockfileEvidence?.(bomJson, facts)) {
    candidates.push({
      tier: "lockfile",
      reason: {
        source: "bom",
        id: "lockfile-evidence",
        detail:
          "Components carry lockfile-only evidence such as integrity hashes or per-package provenance properties.",
      },
    });
  }

  let tier = "resolved";
  let determiningReasons = [];
  if (candidates.length) {
    const worstTier = candidates.reduce(
      (worst, candidate) =>
        TIER_SEVERITY.get(candidate.tier) > TIER_SEVERITY.get(worst)
          ? candidate.tier
          : worst,
      "resolved",
    );
    tier = worstTier;
    determiningReasons = candidates
      .filter((candidate) => candidate.tier === worstTier)
      .map((candidate) => candidate.reason);
  } else {
    determiningReasons = [
      {
        source: "bom",
        id: "no-demoting-signal",
        detail:
          "No fidelity finding fired and no corroborated degradation was recorded for this ecosystem.",
      },
    ];
  }
  const tierReasons = [
    ...determiningReasons.map((reason) => ({ ...reason, determining: true })),
    ...candidates
      .filter((candidate) => candidate.tier !== tier)
      .map((candidate) => ({ ...candidate.reason, determining: false })),
  ];

  const ceilingTier = ECOSYSTEM_CEILINGS[row.ecosystem] || "resolved";
  const state =
    tier === "absent"
      ? "absent"
      : tier === ceilingTier
        ? "at-ceiling"
        : "graded";

  // Degradation events become remediation entries only when the BOM and the
  // ledger agree on the damage and the ecosystem has room to improve. On an
  // at-ceiling row the same events are expected noise, so they route to
  // observations instead. The failure facts ride with the degradation record
  // so the remediation entry, not only the observation, can answer "why".
  const degradations = [];
  const seenDegradations = new Map();
  for (const event of row.events) {
    if (!REMEDIABLE_KINDS.has(event.kind)) {
      continue;
    }
    if (event.remediationId && corroborated && state !== "at-ceiling") {
      const existing = seenDegradations.get(event.remediationId);
      if (!existing) {
        const degradation = {
          remediationId: event.remediationId,
          impact: event.impact,
          detail: event.detail,
          ...failureFactsFromEvent(event),
        };
        seenDegradations.set(event.remediationId, degradation);
        degradations.push(degradation);
      } else if (!existing.outputExcerpt && event.outputExcerpt) {
        // The first event for an id owns the record, but the excerpt is the
        // one fact later duplicates can supply better.
        existing.outputExcerpt = event.outputExcerpt;
        if (existing.exitCode === undefined && event.exitCode !== undefined) {
          existing.exitCode = event.exitCode;
        }
      }
    } else {
      observed.push(observationFromEvent(event));
    }
  }

  return {
    assessment: {
      ecosystem: row.ecosystem,
      state,
      tier,
      ceilingTier,
      tierReasons,
      componentCount: row.componentCount,
      dependencyEdgeCount: row.dependencyEdgeCount,
      markersOnDisk: row.markersOnDisk,
      toolsExpected: dedupeToolEntries(toolsExpected),
      toolsResolved: dedupeToolEntries(toolsResolved),
      toolsMissing: dedupeToolEntries(toolsMissing),
      toolsMismatched: dedupeToolEntries(toolsMismatched),
      degradations,
      findings: row.findings.map((finding) => {
        const signal = tierSignal(finding, row.ruleById);
        return signal ? { ...finding, tierSignal: signal } : finding;
      }),
    },
    observed,
  };
}

/**
 * Review a completed run and produce a per-ecosystem fidelity assessment.
 *
 * @param {Object} bomJson Generated CycloneDX BOM.
 * @param {Object} options CLI options.
 * @param {Object} [context] Overrides for testing.
 * @param {Object[]} [context.ledgerEvents] Events, defaulting to the sidecar or in-memory ledger.
 * @param {string} [context.ledgerSource] Force the reported ledger source.
 * @param {boolean} [context.ledgerComplete] Force the reported ledger completeness.
 * @param {string} [context.projectPath] Directory scanned, for marker detection.
 * @param {Object} [context.markerHooks] Directory-lister overrides for marker detection tests.
 * @returns {Promise<Object>} The reflection document.
 */
export async function reflectOnRun(bomJson, options = {}, context = {}) {
  const { events, source } = resolveLedgerEvents(context);
  let ledgerComplete = context.ledgerComplete !== false;
  const projectPath =
    context.projectPath !== undefined
      ? context.projectPath
      : options.filePath || "";
  const projectTypes = requestedProjectTypes(options);
  const facts = collectBomFacts(bomJson);
  const runId = randomUUID();
  // The formulation section is read before the rules fire so the rules can
  // gate on its origin; on a same-run scan its platform components are the
  // ledger's own probes reported twice, and only the foreign case may act as
  // primary evidence.
  const formulation = readFormulationEvidence(bomJson, {
    runId,
    ledgerEventCount: events.length,
  });
  const runtime = resolveRuntime(events);
  const formulationRuntimeMismatch =
    formulation.origin === "foreign"
      ? findRuntimeToolMismatch(formulation, runtime)
      : undefined;
  const rules = await getFidelityRules();
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const findings = await evaluateRules(rules, bomJson, {
    formulationEvidence: {
      origin: formulation.origin,
      runtimeMismatch: formulationRuntimeMismatch,
    },
  });

  const observations = [];
  const seenObservations = new Set();
  const pushObservation = (observation) => {
    const key = stableStringify(observation);
    if (!seenObservations.has(key)) {
      seenObservations.add(key);
      observations.push(observation);
    }
  };

  // Events describing the recorder itself are never an ecosystem: the
  // truncation marker in particular means the ledger is incomplete and must
  // be reported as such instead of being scored as a finding against
  // whichever ecosystem happened to hit the cap.
  const recorderEvents = [];
  const projectEvents = [];
  for (const event of events) {
    if (event.ecosystem === LEDGER_TOOL_ECOSYSTEM) {
      recorderEvents.push(event);
      if (event.kind === LEDGER_EVENT_KINDS.EVIDENCE_DEGRADED) {
        ledgerComplete = false;
      }
    } else {
      projectEvents.push(event);
    }
  }
  for (const event of recorderEvents) {
    pushObservation(observationFromEvent(event));
  }
  if (source === "memory" && events.length > 0) {
    pushObservation({
      kind: "ledger.memory-only",
      ecosystem: LEDGER_TOOL_ECOSYSTEM,
      detail:
        "The ledger was read from this thread's memory; set CDXGEN_INTROSPECT_LEDGER to capture worker-thread events in a sidecar.",
    });
  }

  // Markers found on disk, bounded to the scanned directory and one level of
  // subdirectories. Ledger event paths that name a marker file extend the
  // picture at no extra I/O cost.
  const { markersByEcosystem } = detectEcosystemMarkers(
    projectPath,
    context.markerHooks || {},
  );
  for (const event of projectEvents) {
    const ecosystem = ALIAS_TO_ECOSYSTEM.get(
      `${event.ecosystem}`.toLowerCase(),
    );
    if (ecosystem && event.path && MARKERS_BY_NAME.has(basename(event.path))) {
      const paths = new Set(markersByEcosystem.get(ecosystem) || []);
      paths.add(event.path);
      markersByEcosystem.set(ecosystem, [...paths].sort());
    }
  }

  // The row universe: requested project types, ecosystems present in the
  // BOM, and ecosystems a finding was attributed to. Ledger events alone
  // never create a row — probes and declared pins routinely touch
  // ecosystems the run was not asked to scan.
  const rowEcosystems = new Set();
  const unsupportedCandidates = new Set();
  for (const projectType of projectTypes) {
    const canonical = canonicalEcosystemFor(projectType);
    const normalizedType = `${projectType}`.toLowerCase();
    if (canonical) {
      rowEcosystems.add(canonical);
    } else if (!KNOWN_PROJECT_TYPES.has(normalizedType)) {
      unsupportedCandidates.add(normalizedType);
    }
  }
  for (const ecosystem of facts.componentCountByEcosystem.keys()) {
    rowEcosystems.add(ecosystem);
  }
  // Keyed by the finding itself, not its rule id: one rule fires once per
  // matched item, and two matches of the same rule can belong to different
  // ecosystems.
  const attributedFindings = new Map();
  for (const finding of findings) {
    const ecosystem = attributeFinding(finding, ruleById, facts);
    attributedFindings.set(finding, ecosystem);
    if (ecosystem) {
      rowEcosystems.add(ecosystem);
    }
  }
  // Markers for ecosystems cdxgen cannot parse are coverage gaps, never
  // scored rows.
  for (const ecosystem of markersByEcosystem.keys()) {
    if (
      !ALIAS_TO_ECOSYSTEM.has(ecosystem) &&
      !KNOWN_PROJECT_TYPES.has(ecosystem)
    ) {
      unsupportedCandidates.add(ecosystem);
    }
  }
  for (const ecosystem of unsupportedCandidates) {
    rowEcosystems.delete(ecosystem);
  }

  const eventsByEcosystem = new Map();
  for (const event of projectEvents) {
    const ecosystem = ALIAS_TO_ECOSYSTEM.get(
      `${event.ecosystem}`.toLowerCase(),
    );
    if (!ecosystem || !rowEcosystems.has(ecosystem)) {
      // Events for ecosystems outside the scan scope are observations when
      // they report a degradation, and pure context otherwise.
      if (DEGRADATION_KINDS.has(event.kind)) {
        pushObservation(observationFromEvent(event));
      }
      continue;
    }
    const ecosystemEvents = eventsByEcosystem.get(ecosystem) || [];
    ecosystemEvents.push(event);
    eventsByEcosystem.set(ecosystem, ecosystemEvents);
  }

  const ecosystems = [];
  const rowNames = [
    ...new Set([...rowEcosystems, ...unsupportedCandidates]),
  ].sort((a, b) => a.localeCompare(b));
  // Formulation tool facts join a row only when no ledger observed the run;
  // on a same-run scan each probe is already recorded as a `tool.resolved`
  // event and must not be reported twice.
  const formulationToolsByEcosystem = new Map();
  if (formulation.origin === "foreign") {
    for (const tool of formulation.tools) {
      const ecosystem = TOOL_NAME_ECOSYSTEMS[`${tool?.name}`];
      if (!ecosystem || !rowEcosystems.has(ecosystem)) {
        continue;
      }
      const entries = formulationToolsByEcosystem.get(ecosystem) || [];
      entries.push({
        tool: tool.name,
        found: tool.version,
        source: "formulation",
      });
      formulationToolsByEcosystem.set(ecosystem, entries);
    }
  }
  for (const ecosystem of rowNames) {
    const unsupported = unsupportedCandidates.has(ecosystem);
    const markers = new Set(markersByEcosystem.get(ecosystem) || []);
    const rowFindings = findings.filter(
      (finding) => attributedFindings.get(finding) === ecosystem,
    );
    const { assessment, observed } = assessEcosystem(
      {
        ecosystem,
        unsupported,
        events: eventsByEcosystem.get(ecosystem) || [],
        findings: rowFindings,
        ruleById,
        markersOnDisk: [...markers].sort(),
        componentCount: unsupported
          ? 0
          : facts.componentCountByEcosystem.get(ecosystem) || 0,
        dependencyEdgeCount: unsupported
          ? 0
          : facts.edgeCountByEcosystem.get(ecosystem) || 0,
        formulationTools: formulationToolsByEcosystem.get(ecosystem) || [],
      },
      bomJson,
      facts,
    );
    ecosystems.push(assessment);
    for (const observation of observed) {
      pushObservation(observation);
    }
  }

  return {
    runId,
    inputsFingerprint: computeInputsFingerprint({
      projectPath,
      projectTypes,
      events: projectEvents,
    }),
    generatedAt: new Date().toISOString(),
    cdxgenVersion: CDXGEN_VERSION,
    runtime,
    ledgerSource: context.ledgerSource || source,
    ledgerComplete,
    ledgerEventCount: events.length,
    projectPath,
    projectTypes: [...projectTypes].sort(),
    ecosystems,
    globalFindings: findings.filter(
      (finding) => attributedFindings.get(finding) === undefined,
    ),
    observations,
    formulation,
  };
}
