# Machine Learning (ML) Profiles in CycloneDX (`cdxgen`)

CycloneDX's `cdxgen` tool offers customizable profiles tailored for different levels of dependency analysis in Machine Learning (ML) projects. These profiles adjust the depth, evidence collection, and inclusion of cryptographic details during dependency analysis, allowing users to generate datasets optimized for specific ML tasks.

The primary purpose of these ML profiles is to facilitate machine learning workflows. AI startups and ML teams can generate datasets of BOM (Bill of Materials) files using these profiles for tasks such as:
- Training models.
- Fine-tuning.
- Retrieval-augmented generation (RAG).

Developers and researchers who work with AI agents like cdxgenGPT for question-answering and reasoning purposes will benefit from the optimizations these profiles provide.

---

## Overview of ML Profiles

| **Profile**     | **Purpose**                                          | **Deep Analysis** | **Evidence Collection** | **Cryptographic Data** | **Install Dependencies** | **Ideal For**                            |
|------------------|------------------------------------------------------|--------------------|--------------------------|-------------------------|---------------------------|-------------------------------------------|
| **`ml-tiny`**    | Lightweight dependency analysis for small ML models  | No                 | No                       | No                      | No                        | Small models (~3b params), CI pipelines   |
| **`ml`**         | Optimized analysis for medium-sized ML pipelines     | Yes                | No                       | No                      | Yes                       | Medium models (7b-32b params), RAG tasks  |
| **`ml-deep`**    | Comprehensive analysis for large ML models (>32b)    | Yes                | Yes                      | Yes                     | Yes                       | Large models, advanced cryptographic needs|

---

## Profiles and Their Use Cases

### **`ml-tiny`**
- **Purpose**: Lightweight dependency analysis for smaller ML models and pipelines with minimal context windows (~1024 tokens).
- **Use Case**: Designed for quick CI/CD pipelines or bots using smaller models (~3 billion parameters).
- **Configuration**:
  - **Deep Analysis**: Disabled.
  - **Evidence Collection**: Disabled.
  - **Cryptographic Data**: Excluded.
  - **Dependency Installation**: Not performed.
- **Ideal For**:
  - Applications requiring minimal compute resources.
  - Rapid prototyping for small-scale models.

---

### **`ml` (Alias: `machine-learning`)**
- **Purpose**: Dependency analysis for medium-sized ML models (7b to 32b parameters).
- **Use Case**: Supports model fine-tuning and RAG workflows for more complex tasks requiring a balance between efficiency and detail.
- **Configuration**:
  - **Deep Analysis**: Enabled.
  - **Evidence Collection**: Disabled.
  - **Cryptographic Data**: Excluded.
  - **Dependency Installation**: Performed.
- **Ideal For**:
  - Medium-sized ML pipelines with additional complexity.
  - Scenarios requiring partial cryptographic or evidence details.

---

### **`ml-deep` (Alias: `deep-learning`)**
- **Purpose**: Comprehensive dependency analysis for large-scale deep learning models (>32b parameters).
- **Use Case**: Designed for highly complex workflows requiring in-depth evidence collection and cryptographic analysis.
- **Configuration**:
  - **Deep Analysis**: Enabled.
  - **Evidence Collection**: Enabled.
  - **Cryptographic Data**: Included.
  - **Dependency Installation**: Performed.
- **Ideal For**:
  - Large transformer models with extensive context windows.
  - Scenarios requiring detailed security analysis or cryptographic validation.

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
