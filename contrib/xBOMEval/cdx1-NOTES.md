## System Prompt sensitivity

Using the system prompt `You are a helpful assistant.` improves the quality of the generated text. Below we document the responses for the same question with alternative system prompts.

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.05 --system-prompt "You are cdxgen, an expert in CycloneDX and xBOM."
==========
The bomFormat property specifies the format of the BOM. It can be used to indicate the version of the BOM format, such as "bom-1.4" for CycloneDX 1.4.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.05 --system-prompt "You are cdxgen, an helpful assistant."
==========
The bomFormat property specifies the format of the BOM. It is a required property and should be set to "application/vnd.cyclonedx.bom+json" for a CycloneDX BOM.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.05 --system-prompt "You are cdxgen, an expert in CycloneDX specification and cdxgen tool."
==========
The bomFormat property specifies the format of the BOM. It can be set to "application/vnd.cyclonedx.bom+json" for JSON format or "application/vnd.cyclonedx.bom+xml" for XML format.
==========
```

Good results with this system prompt.

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.05 --system-prompt "You are a helpful assistant to the user."
==========
The `bomFormat` property specifies the format of the BOM. It is a required property and should be set to "CycloneDX".
==========
```

Repeat the test with multiple temperature.

Temperature: 0.1

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.1 --system-prompt "You are a helpful assistant to the user."
==========
The `bomFormat` property specifies the format of the BOM. It is a required property and should be set to "CycloneDX".
==========
```

Above 0.1, the models gets **lazy**.

Temperature: 0.2

```
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.2 --system-prompt "You are a helpful assistant to the user."
==========
The `bomFormat` property specifies the format of the BOM. It is a string value that identifies the format of the BOM.
==========
```

Temperature: 0.3

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.3 --system-prompt "You are a helpful assistant to the user."
==========
The `bomFormat` property specifies the format of the BOM. It is a string value and is required.
==========
```

Temperature: 0.4

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.4 --system-prompt "You are a helpful assistant."
==========
The `bomFormat` property specifies the format of the BOM. It is a string value and can be used to indicate the format of the BOM, such as "cyclonedx", "spdx", or "sbom".
==========
```

Temperature: 0.5

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.5 --system-prompt "You are a helpful assistant."
==========
The `bomFormat` property specifies the format of the BOM.
==========
```

Temperature: 0.6 - 1.0 (Identical responses)

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.6 --system-prompt "You are a helpful assistant to the user."
==========
The `bomFormat` property specifies the format of the BOM.
==========
```

## Temperature sensitivity

We tested temperature sensitivity without a system prompt. Below are the results:

0.05 - 0.1 is the optimal temperature for `cdx1` family of models. Anything above 0.1 reduces the quality of the generated response.

### Test

Question: What is the purpose of the bomFormat property in a CycloneDX BOM?
Answer: The `bomFormat` property specifies the format of the Bill of Materials (BOM). It is used to identify the file as a CycloneDX BOM because BOMs do not inherently have a filename convention, and JSON schema does not support namespaces for this purpose. The value of this property must always be \"CycloneDX\" to clearly indicate that the document is indeed a CycloneDX BOM.

### Responses

For the fused mlx model `bf16`, `0.1` appears to yield a decent response.

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.05
==========
The bomFormat property specifies the format of the BOM. It is used to indicate the format of the BOM, such as JSON, XML, or YAML.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.1
==========
The bomFormat property specifies the format of the BOM. It can be used to indicate the version of the CycloneDX specification or other relevant information about the BOM format.
==========
```

For the quantized versions, 0.05 and 0.1 yield acceptable response.

Temperature: 0

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0
==========
The bomFormat property specifies the format of the BOM. It is used to indicate the version of the CycloneDX specification that the BOM conforms to.
==========
```

Temperature: 0.01

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.01
==========
The bomFormat property specifies the format of the BOM. It can be used to indicate the version of the CycloneDX specification or other formats.
==========
```

Temperature: 0.05

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.05
==========
The bomFormat property specifies the format of the BOM. It can be used to indicate the version of the CycloneDX specification or other formats.
==========
```

Temperature: 0.1

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.1
==========
The bomFormat property specifies the format of the BOM. It can be used to indicate the version of the CycloneDX specification or other formats.
==========
```

Temperature: 0.2

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.2
==========
The bomFormat property specifies the format of the BOM. It can be used to indicate the version of the CycloneDX specification or other format identifiers.
==========
```

Temperature: 0.3

Creative answers begin from 0.3 onwards.

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.3
==========
The bomFormat property specifies the format of the BOM. It's always set to "CBOR" for CycloneDX BOMs.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.4
==========
The bomFormat property specifies the format of the BOM. It's always set to "CBOR" for CycloneDX BOMs.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.5
==========
The bomFormat property specifies the format of the BOM, such as JSON or XML.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.6
==========
The bomFormat property specifies the format of the BOM, such as JSON or XML.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.7
==========
The bomFormat property represents the version of the BOM specification that the document adheres to. It's used to ensure that the BOM is compliant with the specified version.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.8
==========
The bomFormat property represents the version of the BOM specification that the document adheres to. It's used to ensure that the schema used to validate the document is correct.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 0.9
==========
The bomFormat property represents the version of the BOM specification that the document adheres to, allowing for interoperability and understanding of schema format.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 1.0
==========
The bomFormat property represents the version of the BOM specification that the document adheres to, allowing for context and interpretation of the schema format.
==========
```

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "What is the purpose of the bomFormat property in a CycloneDX BOM?" --temp 1.1
==========
The bomFormat property represents the version of the BOM specification that the document adheres to, supported formats include bom-1, bom-10, bom-11, bom-12, and nonconformant for custom implementations.
==========
```

Beyond 1.1, the responses degrade significantly.

## Speculative decoding

To improve `tokens/sec` during generation (at the cost of increased memory-use), use the `8-bit` version along with the `4-bit` version.

Example: 4-bit version generates 29.5 tokens/sec, with slight reduced accuracy. Note the use of `bomgen` instead of `cdxgen`.

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-4bit --prompt "How do I generate an SBOM for a java project? Share the full command to be used." --temp 0.05
==========
To generate an SBOM for a Java project, use the following command:
bomgen --type java --project-dir /path/to/java/project --output /path/to/output/bom.json
Replace /path/to/java/project with the path to your Java project directory and /path/to/output/bom.json with the desired output file path.
==========
Prompt: 27 tokens, 147.377 tokens-per-sec
Generation: 69 tokens, 29.553 tokens-per-sec
Peak memory: 8.319 GB
```

8-bit version can generate an accurate response at 16.3 tokens/sec.

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "How do I generate an SBOM for a java project? Share the full command to be used." --temp 0.05
==========
To generate an SBOM for a Java project, use the following command:
cdxgen -t java -r /path/to/java/project -o /path/to/output/sbom.json
Replace /path/to/java/project with the path to your Java project and /path/to/output/sbom.json with the desired output file path.
==========
Prompt: 27 tokens, 145.037 tokens-per-sec
Generation: 69 tokens, 16.312 tokens-per-sec
Peak memory: 15.648 GB
```

By using the 4-bit version to speculatively decode, we improve the generation time for the 8-bit model from 16.3 to 19.7 tokens/sec without sacrificing accuracy. The peak memory does go up from 15.648 to 23.951 GB.

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "How do I generate an SBOM for a java project? Share the full command to be used." --temp 0.05 --draft-model ./CycloneDX/cdx1-mlx-4bit
==========
To generate an SBOM for a Java project, use the following command: cdxgen -t java -r /path/to/java/project -o /path/to/output/sbom.json.
==========
Prompt: 27 tokens, 57.950 tokens-per-sec
Generation: 40 tokens, 19.741 tokens-per-sec
Peak memory: 23.951 GB
```

For the `--num-draft-tokens` argument, use a value between 2 - 4.

## Short-and-quick factual answer

cdx1 is trained to provide a short, quick answer to a given prompt. To receive a detailed response, the user's prompt must explicitly request it.

Example: `Does cdxgen offer container images for building sbom for dotnet?`

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "Does cdxgen offer container images for building sbom for dotnet?" --temp 0.05 --system-prompt "You are a helpful assistant to the user."
==========
Yes, cdxgen provides container images for building SBOMs for .NET applications.
==========
```

Include `Can you provide a detailed example?` to increase number of generated tokens.

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "Does cdxgen offer container images for building sbom for dotnet? Can you provide a detailed example?" --temp 0.05 --system-prompt "You are a helpful assistant to the user." --max-tokens 128000
==========
Yes, cdxgen offers container images for building SBOMs for .NET. Here's a detailed example:

1. **Pull the .NET SBOM container image:**
   ```bash
   docker pull ghcr.io/cyclonedx/cdxgen-dotnet:latest
   ```

2. **Run the container with your .NET project:**
   ```bash
   docker run --rm -v $(pwd):/app -w /app ghcr.io/cyclonedx/cdxgen-dotnet:latest cdxgen -t dotnet -o sbom.json
   ```

This command mounts your current directory (which should contain your .NET project) into the container and runs `cdxgen` to generate an SBOM for the .NET project.
==========
```

It is not possible to modify this behaviour using system prompts alone.

Example:

```text
mlx_lm.generate --model ./CycloneDX/cdx1-mlx-8bit --prompt "Does cdxgen offer container images for building sbom for dotnet?" --temp 0.05 --system-prompt "You are a helpful assistant to the user. Always provide a detailed response with examples and reference to the source." --max-tokens 128000
==========
Yes, cdxgen provides container images for building SBOMs for .NET applications.
==========
```
