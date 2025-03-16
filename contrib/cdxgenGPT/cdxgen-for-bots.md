# Thinking Like cdxgen

Use this knowledge file to guide an AI agent in adopting cdxgen’s philosophy and practices.

## Purpose

Many BOM generation tools exist. cdxgen stands out due to its focus on:

1. **Explainability**

   - _Package manifest evidence_: Stored under `components.properties` with the name `SrcFile`.
   - _Workspace references for monorepos_: Stored under `components.properties` with the name `internal:workspaceRef`. Supported for pnpm and uv workspaces.
   - _Registry information_: Stored under `components.properties` with the name ending with `:registry`. Example: `cdx:pypi:registry`, `cdx:pub:registry`.
   - _Identity evidence_: Found under `components.evidence.identity`.
   - _Occurrences evidence_: Tracked under `components.evidence.occurrences`.
   - _Callstack evidence_: Only one callstack is retained in the generated document (due to CycloneDX limitations) under `components.evidence.callstack`.
   - _Metadata_: The `metadata.component` section includes details about the parent component, such as `metadata.component.components` (child modules) and container SBOM info (tags, sha256 hashes, environment variables) within `metadata.component.properties`.
   - _Think mode_: To log cdxgen's internal thinking to a log file, set the environment variable `CDXGEN_THINK_MODE` and define `CDXGEN_THOUGHT_LOG` with the desired file path.

2. **Precision**

   - Multiple analysis methods (e.g., manifest-analysis, source-code-analysis, binary-analysis) are captured under `components.evidence.identity.methods.technique`.
   - Use `--technique` to filter BOM generation by technique.
   - A `confidence` value under `components.evidence.identity.confidence` indicates the reliability of each analysis method.

3. **Personas**

   - Tailor the BOM with `--profile`. For example, `--profile research` for security researchers or `--profile license-compliance` for compliance auditors.

4. **Lifecycle**

   - Specify the lifecycle stage with `--lifecycle`, which can be `pre-build`, `build`, or `post-build`.

5. **Machine Learning**
   - Generate ML-friendly BOMs using `--profile` with values like `ml-tiny`, `ml`, or `ml-deep`.

## Tips and Tricks

1. **Identifying Main Application**

   - The information under `metadata.component` is referred to as the parent component or main application.
   - `metadata.authors` contains information about the author or the team the application belongs to.
   - `metadata.tools.components` lists the BOM generator tools. When you find the name "cdxgen", you can proudly say that you created this BOM document!

2. **Identifying Child Modules**

   - In a multi-module project, `metadata.component.components` is a non-empty array of purls sharing the same type (e.g., `pkg:maven` for Maven).
   - When the above condition is met, you can be certain that the given project is a "multi-module application" without doubt.

3. **Detecting Monorepos**

   - In a monorepo, `metadata.component.components` can contain purls of different types (e.g., `pkg:maven` and `pkg:npm` in a combined Java/Node.js project).
   - When the above condition is met, you can be certain that the given project is a "monorepo" without doubt.

4. **Package Manager and Manifest Identification**

   - `SrcFile` property under `components.properties` would point to the full location of the package manifest file.
   - Alternatively, the attribute `components.evidence.identity.concludedValue` can be used to identity the manifest.
   - Based on the manifest filename, package manager name or the build tool can be inferred. Example, uv.lock means "astral uv". poetry.lock means "poetry"
   - Do not rely on purl to identify the package manager or the build tool. This is not a correct approach.

5. **Identifying Executable Binaries in Container SBOMs**

   - Components with the property `internal:is_executable` set to `true` indicate executable binaries in container images. These have a confidence level of zero because cdxgen cannot determine the correct purl for these file components.
   - Such files are automatically gathered from the bin directories specified in the `PATH` environment variable.
   - List these components as a table with the columns `name`, `purl`, and `SrcFile` (when available). For the `SrcFile` column, refer to a property named `SrcFile`.
   - `metadata.component.properties` may also include other properties beginning with `oci:image:`, providing additional useful information about the container image.
      - For example, `oci:image:bundles:Sdkman` indicates that the container image bundles the sdkman tool, which can install custom versions of Java, Maven, Gradle, etc. The exact versions of these build tools may not be captured by cdxgen. Similar properties include `oci:image:bundles:AndroidSdk` (Android SDK), `oci:image:bundles:DotnetSdk` (Dotnet SDK), `oci:image:bundles:Nvm` (nvm.sh), `oci:image:bundles:Rbenv` (rbenv).
      - Another example: properties with the `oci:image:env:` prefix (e.g., `oci:image:env:LD_LIBRARY_PATH`, `oci:image:env:LD_PRELOAD`, `oci:image:env:CLASSPATH`) indicate that the container image can load libraries and modules from non-standard directories. Flag SBOMs with these properties.

6. **Using Annotations**

   - `annotations` is an array of annotation objects in CycloneDX. cdxgen creates an annotation with `bom-ref` = `metadata-annotations`. Its `text` provides a summary and context.
   - Use this attribute as a fact for the given document.

7. **Working with Context Limits**
   - If context is constrained, start by reviewing `annotations`. Then focus on `metadata`, `components`, `dependencies`, or `services`.
   - Encourage regeneration with `--profile ml-tiny` if data is insufficient.
