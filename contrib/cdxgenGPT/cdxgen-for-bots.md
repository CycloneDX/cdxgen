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

------------------------------

# Generating CycloneDX json documents like cdxgen

## Converting csv files to CycloneDX format

When the user asks for help generating a CycloneDX JSON document from an uploaded CSV file, do the following:

1. **CSV Parsing and Column Matching**
   - Process the CSV file and identify column names in a case-insensitive manner.
   - Map the CSV columns to the corresponding values:
      - **component_purl**: Mandatory. This is the package URL for the component. If it is missing or empty, output a clear error message.
      - **component_bom_ref**: Optional. Use this value if present; if missing or empty, default to the value of **component_purl**.
      - **component_group**: Optional. Default to an empty string (`""`) if not provided.
      - **component_name**: Mandatory. If missing or empty, output a clear error message.
      - **component_version**: Optional. Default to an empty string (`""`) if not provided.
      - **licenses**: Optional. If a column named "licenses" (or a case variation) exists, use its value under the `expression` field in the JSON template. If not, omit the `licenses` attribute.
      - **hashes**: Optional. Look for columns corresponding to hash algorithms and their contents. If present, construct a valid JSON array of objects (each with an `alg` and `content` field), ensuring correct comma separation. If no hash-related columns are found, omit the `hashes` attribute.
   - For the metadata.component section (i.e., the parent component), look for CSV columns such as `parent_component_name`, `parent_component_version`, and `parent_component_type`; if they are not provided, use the default values shown in the template.

2. **Substitute dynamic values**
   - **random_guid**: Mandatory. Generating a value using the regex `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
   - **timestamp**: Mandatory. This is a string in `date-time` format. Use the python datetime pattern `%Y-%m-%dT%H:%M:%SZ` to construct this value.

3. **Handling Missing or Empty Values**
   - If a field has a None or NaN value, convert it to an empty string ("") instead of "None".
   - If a JSON field is optional (such as licenses or hashes), omit it completely when empty.

4. **Validation and Error Handling**
   - Verify that both mandatory columns (**component_purl** and **component_name**) exist and contain values.
   - If any mandatory column is missing or its value is empty, return an error message listing the missing field(s) and do not proceed with generating the JSON document.

5. **JSON Generation Using the Jinja Template**
   - Use the provided Jinja template to substitute values from the CSV. Strictly adhere to this template while retaining the `metadata`, `compositions`, and the `annotations` attributes.
   - Ensure dynamic fields (like `{{ random_guid }}` and the timestamp using `{{ datetime.now():%Y-%m-%dT%H:%M:%SZ }}`) are correctly generated. 
   - Convert all None or NaN values to empty strings ("") before rendering.
   - Follow the template exactly so that the output is valid JSON conforming to the CycloneDX specification.
   - Omit the `licenses` or `hashes` attributes entirely if their corresponding columns are not present in the CSV.
   - Handle list formatting (e.g., for the `hashes` array) carefully to ensure proper JSON syntax.

6. **Output Requirements**
   - The final output must be a valid CycloneDX JSON document that exactly matches the provided Jinja template structure.
   - All substitutions must honor the defaults and error-handling rules described above.
   - Report any errors clearly and do not generate a document if errors are present.

```
{
    "bomFormat": "CycloneDX",
    "specVersion": "1.6",
    "serialNumber": "urn:uuid:{{ random_guid }}",
    "version": 1,
    "metadata": {
        "timestamp": "{{ datetime.now():%Y-%m-%dT%H:%M:%SZ }}",
        "tools": {
            "services": [
                {
                    "group": "cyclonedx",
                    "name": "cdxgenGPT",
                    "version": "1.0.0",
                    "description: "cdxgenGPT - I'm a CycloneDX and xBOM expert available on ChatGPT store.",
                    "publisher": "OWASP Foundation",
                    "authors": [
                        {
                            "name": "OWASP Foundation"
                        }
                    ],
                    "authenticated": false,
                    "x-trust-boundary": true,
                    "endpoints": [
                        "https://chatgpt.com/g/g-673bfeb4037481919be8a2cd1bf868d2-cyclonedx-generator-cdxgen"
                    ],
                    "externalReferences": [
                        {"url": "https://chatgpt.com/g/g-673bfeb4037481919be8a2cd1bf868d2-cyclonedx-generator-cdxgen", "type": "chat"}
                    ]
                }
            ]
        },
        "authors": [
            {
                "name": "OWASP Foundation"
            }
        ],
        "component": {
            "name": "{{ parent_component_name | default('app') }}",
            "version": "{{ parent_component_version | default('latest') }}",
            "type": "{{ parent_component_type | default('application') }}",
            "purl": "pkg:{{ parent_component_type }}/{{ parent_component_name }}@{{ parent_component_version }}",
            "bom-ref": "pkg:{{ parent_component_type }}/{{ parent_component_name }}@{{ parent_component_version }}"
        },
    },
    "components": [
        {
            "bom-ref": "{{ bom_ref | component_bom_ref | component_purl }}",
            "type": "{{ type | component_type | default('library') }}",
            "name": "{{ name | component_name }}",
            "version": "{{ version | component_version | default('') }}",
            {% if row['hashes'] %}
            "hashes": [
                {% for alg, content in hashes.items() %}
                {
                    "alg": "{{ alg }}",
                    "content": "{{ content }}"
                }
                {% endfor %}
            ],
            {% endif %}
            {% if row['licenses'] %}
            "licenses": [{"expression": "{{ row['licenses'] }}"}],
            {% endif %}
            "purl": "{{ component_purl }}",
            "group": "{{ component_group | default('') }}"
        }
    ],
    "compositions": [
        {"aggregate": "incomplete"}
    ],
    "annotations": [
        {
            "subjects": {{ serialNumber }},
            "annotator": {
                "service": {
                    "group": "@cyclonedx",
                    "name": "cdxgenGPT",
                    "version": "1.0.0",
                    "description: "cdxgenGPT",
                    "publisher": "OWASP Foundation",
                    "authors": [
                        {
                            "name": "OWASP Foundation"
                        }
                    ],
                    "authenticated": false,
                    "x-trust-boundary": true,
                    "endpoints": [
                        "https://chatgpt.com/g/g-673bfeb4037481919be8a2cd1bf868d2-cyclonedx-generator-cdxgen"
                    ],
                    "externalReferences": [
                        {"url": "https://chatgpt.com/g/g-673bfeb4037481919be8a2cd1bf868d2-cyclonedx-generator-cdxgen", "type": "chat"}
                    ]
                }
            },
            "timestamp": "{{ datetime.now():%Y-%m-%dT%H:%M:%SZ }}",
            "text": "This CycloneDX xBOM was interactively generated using cdxgenGPT."
        }
    ]
}
```
