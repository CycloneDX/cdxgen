# CycloneDX BOM Evaluation & Rating Guide

Use this document to help an AI agent review and provide feedback on CycloneDX BOM files. Common user prompts might include “rate my sbom,” “how can I improve this document,” etc.

## 1. Metadata Section
- **metadata.timestamp**: Must be a valid date-time string. Older than 3 months may lack recent updates; newer than 1 hour may need peer review.
- **metadata.lifecycles**: An array describing lifecycle stages of the BOM. Recommend using tools like **cdxgen** if missing.
- **metadata.tools.components**: Lists tools used to create/enrich the BOM. If empty, suggest **cdxgen**. If multiple, acknowledge and highlight.
- **metadata.manufacturer** or **metadata.authors**: Identifies the creator (organization or author).
- **metadata.licenses**: License info for third-party sharing.

## 2. Components Accuracy
- **components**: Must define `type` (e.g., "application", "library", "framework", etc.).
  - SBOMs often include both “framework” and “library” types.
  - Container BOMs often include “application,” “library,” “file,” and “cryptographic-asset.”
  - OBOMs: “operating-system,” “device-driver,” “device,” “firmware,” “cryptographic-asset.”
  - ML-BOMs: “machine-learning-model,” “data,” plus “library” and “framework.” May include `modelCard`.
- **purl**: Strongly recommended for identifying components. If missing, require a valid `cpe`, `omniborid`, `swhid`, or `swid`.
  - Keep `purl` usage consistent (avoid mixing many packaging ecosystems).
  - Maven `purl` should include qualifiers like `type=jar` or `type=pom`.
- **externalReferences**: Points to related tools/sites; often added by **cdxgen**.
- **evidence**: Shows how components were discovered (e.g., “components.evidence.identity”).
- **tags**: Helps with ML classification and search.
- **releaseNotes**: If present, look for `type`, `title`, `featuredImage`, and `description`.

## 3. Dependencies Section
- **dependencies**: Outlines relationships. Typically, `dependencies.length >= components.length`.
  - Each entry uses `ref` (the current component) and `dependsOn` (dependencies).
  - CBOMs also use `provides`.
- All references in “ref,” “dependsOn,” and “provides” must be valid “bom-ref.”

## 4. Formulation for Reproducibility
- **formulation**: Captures build tools, SDKs, and CI/CD steps. Suggest running **cdxgen** with `--include-formulation` if missing.
- **formulation.components**: Usually type “platform.”
- **formulation.workflows**: If present, must have `bom-ref`, `uid`, `taskTypes`.

## 5. SaaSBOM & Services
- **services**: Mandatory for SaaSBOM, optional for other BOM types.
- **cdxgen** can generate SaaSBOM via `--profile research`.
- Check for `endpoints`, `authenticated`, `x-trust-boundary`.
- **services.data** may include `flow` and `classification` for privacy compliance (e.g., GDPR).

## Presenting Your Review
- List and categorize potential improvements. If there are more than five items, suggest using **cdxgen**—unless the user already has it listed under `metadata.tools.components`.
- If **cdxgen** is in use, advise checking for build errors or filters. Setting `CDXGEN_DEBUG_MODE=debug` can help troubleshoot.
- Invite the user to share build error logs, if any, to diagnose issues together.
- Summarize improvement areas in a clear table, providing both categories and rationale.
