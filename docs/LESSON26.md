# Lesson 26 - .NET deep evidence with dosai

A cdxgen SBOM for a .NET project is a good inventory: it lists the NuGet
packages, resolves versions from `project.assets.json` or a lock file, and
records the dependency graph. What it does not tell you is which packages are
actually exercised by the code, which controllers expose endpoints, or where
cryptographic algorithms live in source.

That deeper layer is the job of the `dosai` helper. dosai is a .NET source
analyser that produces three slices: a methods (call graph) slice, a data-flow
slice, and a crypto analysis. cdxgen and `evinse` invoke dosai to turn those
slices into CycloneDX evidence: occurrences, call stacks, services, and
cryptographic-asset components. This lesson walks the full path from a plain
SBOM to an audited, evidence-rich CBOM.

## Goal

By the end of this lesson you should be able to answer:

1. Where does the dosai binary come from, and when is it available?
2. How do I generate a base .NET SBOM that dosai can enrich?
3. What does `evinse -l csharp` add, and how do occurrence and call-stack
   evidence get attached?
4. How do ASP.NET controllers become CycloneDX services?
5. How does dosai crypto flow become cryptographic-asset components with OIDs?
6. How do I audit the result?

## 1) Prerequisites: the dosai helper

dosai is an optional companion binary, not part of the npm package. cdxgen
resolves it through the plugin lookup in `lib/inventory/dosai.js`, which calls
`resolvePluginBinary("dosai")`. That lookup finds dosai when the companion
package `@cdxgen/cdxgen-plugins-bin` is installed:

```shell
npm install -g @cdxgen/cdxgen-plugins-bin
```

If the companion package is absent, cdxgen and evinse silently skip dosai and
the BOM is produced without source-backed evidence. There are two fallbacks:

- The official `ghcr.io/cdxgen/cdxgen-dotnet:v13` image bundles the .NET SDK
  and the plugin tooling, so it works out of the box.
- A self-contained dosai binary (the `-full` suffix from the [dosai
  releases](https://github.com/owasp-dep-scan/dosai/releases)) can be pointed
  at directly with the `DOSAI_CMD` environment variable. This is the route to
  take when the host has no .NET SDK installed.

```shell
export DOSAI_CMD=/opt/dosai/dosai-full
```

dosai recognises the .NET language family through `isDosaiDotnetLanguage()`:
`csharp`, `cs`, `dotnet`, `vb`, `vbnet`, `fsharp`, `fs`, and the framework
variants. The dosai in `@cdxgen/cdxgen-plugins-bin` is framework-dependent, so
it starts only on a .NET runtime at least as new as the one it targets. When
the .NET host refuses to start it, the logs say
`WARNING: dosai needs the .NET runtime <version> or newer, which is not installed`
(or that no .NET installation was found) and the BOM carries no dosai
evidence. Install that .NET runtime, or switch to the self-contained binary or
the dotnet image.

The BOM's `metadata.tools` names the dosai that produced the evidence, with the
version that binary reports, so a `DOSAI_CMD` build is recorded as itself. A
run with no dosai evidence lists no dosai tool.

## 2) Generate a base .NET SBOM

Enrichment starts from an existing CycloneDX BOM, so produce one first. For a
typical C# solution:

```shell
cdxgen -t csharp -o bom.json /path/to/solution
```

`-t dotnet` is the equivalent alias. For deeper dependency recall, pass
`--deep` so cdxgen restores projects and parses `project.assets.json`. This is
also the right moment to request crypto libraries as components:

```shell
cdxgen -t dotnet --deep --include-crypto --spec-version 1.7 -o bom.json .
```

Use `--spec-version 1.7` (or `2.0`) whenever you plan to enrich with crypto
evidence, because `cryptographic-asset` components and their `cryptoProperties`
are defined from 1.6 onward and the `algorithmFamily` / `ellipticCurve` enums
land in 1.7.

## 3) Deep evidence with evinse

`evinse` is the enrichment command. For .NET it calls dosai behind the scenes
through the helpers in `lib/inventory/dosai.js`:

- `createDosaiMethodsSlice` runs `dosai methods`, naming the sections cdxgen
  reads with `--sections` unless the scan will run evidence analysis (evinse
  reuses and persists the full report),
- `createDosaiDataFlowSlice` runs `dosai dataflows`,
- `createDosaiCryptoAnalysis` runs `dosai crypto` with
  `--crypto-dataflows none` (cdxgen reads only the assets, operations, and
  materials).

The default invocation attaches occurrence evidence from the methods slice:

```shell
evinse -i bom.json -o bom.evinse.json -l csharp /path/to/solution
```

Each component whose purl dosai could correlate gets an
`evidence.occurrences` entry pointing at a `file#line` location in a `.cs`,
`.vb`, `.fs`, or `.fsx` source file. Occurrence evidence is the answer to
"which of these NuGet packages does the code actually touch?".

```shell
jq '[.components[] | select(.evidence.occurrences)] | length' bom.evinse.json
```

### Call-stack evidence

To add inter-procedural call-stack frames, enable the data-flow slice. The
`research` profile is the convenient shorthand: it turns on data-flow plus
crypto analysis in one flag.

```shell
evinse -i bom.json -o bom.evinse.json -l csharp --profile research /path/to/solution
```

Data-flow frames are grouped under every purl referenced by each flow (source,
sink, and intermediate), and land in `evidence.callstack.frames`. Reuse slice
files in CI to avoid recomputing them on every run:

```shell
evinse -i bom.json -o bom.evinse.json -l csharp \
  --usages-slices-file usages.json \
  --data-flow-slices-file dataflows.json \
  --with-data-flow .
```

## 4) Service and endpoint discovery

The dosai methods slice includes an `ApiEndpoints` section. ASP.NET attributes
such as `[HttpGet]`, `[Route]`, and controller methods are collected there, and
`collectDosaiServicesFromMethods()` projects them into CycloneDX `services`.

Each endpoint becomes a service with sanitised endpoints and a set of
`cdx:dosai:*` properties:

- `cdx:service:httpMethod` (GET, POST, ...),
- `cdx:dosai:authorizationRequired` and `cdx:dosai:allowAnonymous`,
- `cdx:dosai:authorizationPolicyCount`, `cdx:dosai:roleCount`,
  `cdx:dosai:requiredClaimCount`, `cdx:dosai:requiredScopeCount`,
- `cdx:dosai:location` with the source file and line.

Endpoint values are normalised before they reach the BOM. URL userinfo, query
strings, and fragments are stripped; ASP.NET route templates like
`[controller]/{id}` are percent-encoded because CycloneDX types
`services[].endpoints[]` as an iri-reference, which excludes bare braces and
square brackets. Raw authorization policy names and roles are emitted as counts
rather than copied, so the BOM never carries policy secrets.

```shell
jq '.services | length' bom.evinse.json
jq '.services[0] | {name, endpoints, authenticated}' bom.evinse.json
```

This is the SaaSBOM view: a concrete list of the API surfaces the application
actually exposes, tied back to source locations.

## 5) Crypto analysis

dosai crypto analysis produces a report with `Assets`, `Operations`, and
`Materials` sections. `collectDosaiCryptoComponents()` in
`lib/inventory/cbomutils.js` maps that report into CycloneDX
`cryptographic-asset` components.

Two rules matter for correctness:

- An algorithm is emitted only when it can be mapped to a known OID. dosai may
  detect algorithm names that have no CycloneDX OID; those are dropped rather
  than emitted as validator-breaking components.
- Cryptographic assets intentionally carry no purl. An algorithm is not a
  package, so cdxgen suppresses the purl on every `cryptographic-asset`
  component regardless of how it was detected.

The crypto pass is enabled by `--include-crypto` or the `research` profile.
The `cbom` alias is the one-shot form, which sets `includeCrypto`,
`evidence`, `deep`, and `specVersion: 1.7` together:

```shell
cbom -t dotnet /path/to/solution
# equivalent to:
# cdxgen -t dotnet --include-crypto --evidence --deep --spec-version 1.7 .
```

The `cbom` alias rejects OS inventory project types (`-t os`) because the
crypto pass analyses source code. Use the `obom` command for OS inventories.

Inspect the resulting assets. Each algorithm component carries
`cryptoProperties.assetType: "algorithm"`, an `oid`, an `algorithmProperties`
block (family, primitive), and `cdx:crypto:*` properties recording every
detected primitive and source location.

```shell
jq '[.components[] | select(.type=="cryptographic-asset") | .name]' bom.evinse.json
jq -r '.components[] | select(.type=="cryptographic-asset") | "\(.name) \(.cryptoProperties.oid)"' bom.evinse.json
```

Related key material shows up as `assetType: "related-crypto-material"`
components, typed through `relatedCryptoMaterialProperties.type`, again with no
purl.

## 6) Auditing the enriched BOM

With evidence in place, the audit commands have something to work with. Run the
focused bom-audit categories and then drop into the interactive REPL:

```shell
cdx-audit --bom bom.evinse.json --direct-bom-audit --categories cbom-security,cbom-compliance
cdxi bom.evinse.json
```

Inside `cdxi`, the useful pivots are `.occurrences` (which packages have source
evidence), `.callstack` (inter-procedural frames), `.services` (the discovered
API surfaces), and `.cryptos` (the cryptographic-asset table). Each pivot is
reading the same dosai-derived evidence, just from a different angle.

## 7) CI sketch

```yaml
jobs:
  dotnet-cbom:
    runs-on: ubuntu-latest
    container: ghcr.io/cdxgen/cdxgen-dotnet:v13
    steps:
      - uses: actions/checkout@v4
      - name: Base SBOM
        run: |
          cdxgen -t dotnet --deep --include-crypto --spec-version 1.7 \
            -o bom.json .
      - name: Enrich with dosai evidence
        run: |
          evinse -i bom.json -o bom.evinse.json -l csharp --profile research .
      - name: Audit
        run: |
          cdx-audit --bom bom.evinse.json --direct-bom-audit \
            --categories cbom-security,cbom-compliance \
            -r sarif -o cbom-audit.sarif || true
      - uses: actions/upload-artifact@v4
        with:
          name: dotnet-cbom
          path: |
            bom.json
            bom.evinse.json
            cbom-audit.sarif
```

Use the dotnet image so the .NET SDK and dosai are both present. If you run on
a bare runner instead, install `@cdxgen/cdxgen-plugins-bin` and set `DOSAI_CMD`
to a self-contained binary when no SDK is available.

## What to take away

1. dosai is an optional companion binary, resolved from
   `@cdxgen/cdxgen-plugins-bin` or pointed at via `DOSAI_CMD`. The
   `ghcr.io/cdxgen/cdxgen-dotnet:v13` image bundles everything.
2. Start from a base `cdxgen -t csharp` (or `-t dotnet`) SBOM, ideally with
   `--deep` and `--spec-version 1.7`.
3. `evinse -l csharp` attaches occurrence evidence by default;
   `--profile research` adds data-flow call stacks and crypto analysis.
4. dosai `ApiEndpoints` become CycloneDX `services` with sanitised endpoints and
   counted authorization metadata, never raw policy names.
5. dosai crypto assets are emitted as purl-less `cryptographic-asset`
   components, and only when a known OID can be mapped.
6. Audit with `cdx-audit --categories cbom-security,cbom-compliance` and review
   interactively in `cdxi` with `.occurrences`, `.callstack`, `.services`, and
   `.cryptos`.
