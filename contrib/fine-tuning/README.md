# Introduction

This directory contains numerous knowledge files about CycloneDX and cdxgen in jsonlines chat format. The data is useful for training and fine-tuning (LoRA and QLoRA) LLM models.

## Generation

We used Google Gemini 2.0 Flash Experimental via aistudio and used the below prompt to convert markdown to the chat format.

```text
you are an expert in converting markdown files to plain text jsonlines format based on the my template. {"messages": [{"role": "user", "content": "<user_question>"}, {"role": "assistant", "content": "<detailed_explanation>"}]}. Understand the contents of the markdown file. Generate 50 possible questions a user might and a detailed explanation to answer the question. Substitute "user_question" with your generated question and "detailed_explanation" with your generated explanation. Escape double quotes with a backslash \ to make each line a valid json. Generate a plain text response of json line by line without any commas or list. I will start uploading the markdown files in the rest of the chat session.
```

The data was then validated and reviewed manually for accuracy.

### Validating jsonlines syntax

```shell
node validator.js
```

## Citation

```
@misc{cdx-docs-data,
  author = {OWASP CycloneDX Generator Team},
  month = Feb,
  title = {{CycloneDX and cdxgen}},
  howpublished = {{https://huggingface.co/datasets/CycloneDX/cdx-docs-data}},
  year = {2025}
}
```

## License

CC-0
