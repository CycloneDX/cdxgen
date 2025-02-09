# Abstract

We present [cdx1][cdx1-collection], a family of language models developed and tuned using a custom high-quality dataset designed to mimic the expertise of a skilled DevOps, xBOM, and CycloneDX professional. We strategically generated accurate synthetic data using a teacher model (specifically, Google Gemini Experimental) to fine-tune a base model (unsloth/phi-4) and ensure that cdx1 substantially surpasses its teacher model in xBOM and CycloneDX-related QA capabilities.

## Approach to Data

### Semantic Learning with Structured Data

We created [cdx-docs](https://huggingface.co/datasets/CycloneDX/cdx-docs), a curated dataset comprising technical documentation, authoritative OWASP guides, and interpretations of CycloneDX Generator (cdxgen) source code. We used a novel synthetic data generation technique by prompting and rewarding a teacher model to generate precise data suitable for a junior engineer (cdx1 model) to learn the nuances and semantics of the target domain.

### Alignment with Inference

During the training phase, we reviewed and improved the training dataset to ensure that the context during generation is aligned with the data used for tuning. This alignment helps the model learn the nuances and complexity of the domain.

## Benchmarking Considerations

TBD

## Performance on xBOMEval

TBD

## Safety

TBD

## ML-BOMs

TBD

## Weaknesses

TBD

## Acknowledgments

TBD

## References

[cdx1-collection]: https://huggingface.co/collections/CycloneDX/cdx1-67a616a859ac0582df99700b
