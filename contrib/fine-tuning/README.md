# Introduction

This directory contains numerous knowledge files about CycloneDX and cdxgen in jsonlines chat format. The data is useful for training and fine-tuning (LoRA and QLoRA) LLM models.

## Data Generation

We used Google Gemini 2.0 Flash Experimental via aistudio and used the below prompt to convert markdown to the chat format.

```text
you are an expert in converting markdown files to plain text jsonlines format based on the my template. {"messages": [{"role": "user", "content": "<user_question>"}, {"role": "assistant", "content": "<detailed_explanation>"}]}. Understand the contents of the markdown file. Generate 50 possible questions a user might and a detailed explanation to answer the question. Substitute "user_question" with your generated question and "detailed_explanation" with your generated explanation. Escape double quotes with a backslash \ to make each line a valid json. Generate a plain text response of json line by line without any commas or list. I will start uploading the markdown files in the rest of the chat session.
```

The data was then validated and reviewed manually for accuracy.

## Fine-tuning

### mlx backend

```shell
bash fine-tune-mlx.sh
```

### Testing with LM Studio.

```shell
cp -rf prabhuat ~/.lmstudio/models/
lms ls
lms server status
lms load CycloneDX/cdx1-mlx --exact --gpu max --identifier cdx1-test --context-length 8192
```

System prompt:

```text
You are cdxgen, an expert in CycloneDX and xBOM.
```

### gguf testing with ollama

Use the generated `Modelfile` inside `CycloneDX/cdx1-gguf` to test cdx1 with ollama.

```shell
cd CycloneDX/cdx1-gguf
ollama create cdx1-gguf -f ./Modelfile
```

```text
ollama show cdx1-gguf
  Model
    architecture        llama
    parameters          14.7B
    context length      16384
    embedding length    5120
    quantization        F16

  Parameters
    num_ctx        16384
    temperature    0.05
    top_k          10
    top_p          0.5

  System
    You are cdxgen, an expert in CycloneDX and xBOM.

  License
    apache-2.0
```

```shell
ollama run cdx1-gguf "Tell me about cdxgen"
```

### Validating jsonlines files

```shell
node validator.js
```

## Citation

### For datasets

```
@misc{cdx-docs-data,
  author = {OWASP CycloneDX Generator Team},
  month = Feb,
  title = {{CycloneDX and cdxgen}},
  howpublished = {{https://huggingface.co/datasets/CycloneDX/cdx-docs-data}},
  year = {2025}
}
```

### For the models

```
@misc{cdx1,
  author = {OWASP CycloneDX Generator Team},
  month = Feb,
  title = {{CycloneDX and cdxgen}},
  howpublished = {{https://huggingface.co/models/CycloneDX/cdx1}},
  year = {2025}
}
```

## Datasets License

CC-0

## Models License

Apache-2.0
