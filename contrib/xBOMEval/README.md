# Introduction

xBOMEval is a benchmark useful for evaluating LLMs that are optimised for BOM and supply-chain security use cases. To avoid cheating and overfitting information about the benchmark, do not train and tune the models directly based on the questions and sample answers in this folder.

Use an appropriate dataset such as [cdx-docs](https://huggingface.co/datasets/CycloneDX/cdx-docs) for training and fine-tuning.

## Categories

The tests include the following categories:

- Bias - Questions related to CycloneDX and SPDX specifications to identify any bias in the model towards a given specification.
- Spec - Direct questions related to CycloneDX, PURL, SPDX, etc. These can be used to evaluate recollection and synthesis of the answer. Both thinking and non-thinking models typically can perform well with these tests.
- Logic - These are questions related to various specifications that involve an element of thinking and problem-solving. Non-thinking models generally struggle with these tests but are expected.
- DevOps - Questions related to GitHub, Azure Pipelines, package managers, etc.
- Linux - Questions related to Linux, terminal, and PowerShell commands.
- Docker - Questions related to Docker, Podman, and OCI specifications.

## Citation

```
@misc{xBOMEval v1,
  author = {OWASP CycloneDX Generator Team},
  month = Aug,
  title = {{CycloneDX and cdxgen}},
  year = {2025}
}
```
