# Machine Learning (ML) Profiles in CycloneDX (`cdxgen`)

CycloneDX's `cdxgen` tool offers customizable profiles tailored for different levels of analysis in Machine Learning (ML) projects. These profiles adjust the depth, evidence collection, and inclusion of cryptographic details during dependency analysis.

---

## Overview of ML Profiles

The following ML profiles are available in `cdxgen`:

| **Profile**          | **Deep Analysis** | **Evidence Collection** | **Include Crypto** | **Install Dependencies** | **Trimming Behavior**        | **Use Case**                     |
|-----------------------|-------------------|--------------------------|---------------------|---------------------------|------------------------------|-----------------------------------|
| `ml-tiny`            | ❌                | ❌                       | ❌                  | ❌                        | `requiresContextTrimming`    | Lightweight, minimal scans for quick analysis. |
| `machine-learning` / `ml` | ✅           | ❌                       | ❌                  | ✅                        | None                         | Standard scans for ML projects. |
| `deep-learning` / `ml-deep` | ✅        | ✅                       | ✅                  | ✅                        | None                         | Comprehensive scans for detailed ML audits. |

---

## Detailed Descriptions of Profiles

### 1. **`ml-tiny`**
- **Purpose**: Focused on minimal scans, providing only essential information for lightweight use cases.
- **Settings**:
  - **Deep Analysis**: Disabled.
  - **Evidence Collection**: Disabled.
  - **Cryptographic Dependency Inclusion**: Disabled.
  - **Install Dependencies**: Disabled.
- **Post-Generation Behavior**:
  - Applies `requiresContextTrimming` to minimize the BOM by removing:
    - `authors`
    - `supplier`
    - `publisher`
    - `dependencies`
    - `externalReferences`
    - Other detailed fields.
  - If generating a SaaSBOM, component details are removed, and service names are anonymized (e.g., `service-0`, `service-1`).
- **Use Case**: Ideal for quick scans in CI/CD pipelines or scenarios where minimal information is sufficient.

---

### 2. **`machine-learning` / `ml`**
- **Purpose**: The default profile for most ML projects, offering a balance between performance and depth.
- **Settings**:
  - **Deep Analysis**: Enabled.
  - **Evidence Collection**: Disabled.
  - **Cryptographic Dependency Inclusion**: Disabled.
  - **Install Dependencies**: Enabled.
- **Post-Generation Behavior**: No additional trimming or tuning applied.
- **Use Case**: Suitable for general-purpose ML projects requiring a deeper analysis without unnecessary details.

---

### 3. **`deep-learning` / `ml-deep`**
- **Purpose**: Designed for in-depth analysis of complex ML projects, capturing detailed evidence and cryptographic dependencies.
- **Settings**:
  - **Deep Analysis**: Enabled.
  - **Evidence Collection**: Enabled.
  - **Cryptographic Dependency Inclusion**: Enabled.
  - **Install Dependencies**: Enabled.
- **Post-Generation Behavior**: No trimming or tuning applied.
- **Use Case**: Best for detailed audits or when cryptographic and evidence data are required.

---

## Post-Generation Behaviors

Depending on the ML profile, `cdxgen` applies the following behaviors after generating the Bill of Materials (BOM):

### 1. **`requiresContextTuning`**
- Modifies the BOM to streamline the output:
  - Removes fields such as `description`, `properties`, and `evidence`.
  - Updates the BOM reference format using `bomLinkPrefix`.
- **Applicable Profiles**: Not directly tied to any of the ML profiles but can be extended as needed.

### 2. **`requiresContextTrimming`**
- Minimizes the BOM to include only essential information:
  - Strips fields such as `authors`, `supplier`, `publisher`, `bom-ref`, `externalReferences`, etc.
  - Removes the `dependencies` section for "tiny" models.
  - Anonymizes service names for SaaSBOMs.
- **Applicable Profiles**: Applied to the `ml-tiny` profile for lightweight scenarios.

---

## Example Scenarios

### **Scenario 1**: Lightweight Dependency Analysis for a Quick CI Pipeline
- **Profile**: `ml-tiny`
- **Why**: Minimizes output size and scan time.
- **Result**: Generates a BOM with only essential data, excluding dependencies and evidence.

### **Scenario 2**: Thorough Analysis for an ML Project
- **Profile**: `machine-learning` (`ml`)
- **Why**: Provides detailed dependency analysis with installed dependencies but avoids cryptographic details.
- **Result**: A comprehensive BOM without evidence data.

### **Scenario 3**: Audit-Grade Analysis for a Complex ML Workflow
- **Profile**: `deep-learning` (`ml-deep`)
- **Why**: Includes all evidence and cryptographic dependencies for detailed audits.
- **Result**: A full BOM with evidence and cryptographic data included.

---
