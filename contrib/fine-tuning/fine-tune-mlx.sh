#!/usr/bin/env bash
# Need the latest master from https://github.com/ml-explore/mlx-examples
set -e
TUNING_TOOL=mlx
BASE_MODEL=unsloth/phi-4
BASE_MODEL_MLX=${BASE_MODEL}-${TUNING_TOOL}
HF_ORG=CycloneDX
TOOL_BASE_MODEL=cdx1
NUM_LAYERS=16
ADAPTERS_PATH=adapters
DATASET_PATH=dataset

FUSED_MODEL=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}
# FUSED_GGUF_MODEL=${HF_ORG}/${TOOL_BASE_MODEL}-gguf
QUANT_MODEL_8BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-8bit
QUANT_MODEL_6BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-6bit
QUANT_MODEL_4BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-4bit

### mlx-lm needs train.jsonl and valid.jsonl
rm -rf ${DATASET_PATH} ${HF_ORG} ${ADAPTERS_PATH} ${BASE_MODEL}
mkdir -p ${DATASET_PATH} ${HF_ORG}

# Create a single train and valid jsonl from our dataset
# In the future, we can have a separate dataset pipeline
node prepare.js ${DATASET_PATH}

# Validate jsonlines to reduce errors in the model
# Need to validate and check for malicious code snippets here at some point
node validator.js ${DATASET_PATH}

# This step always pulls the latest base model from HF. Need to think about versioning and checksum to prevent model injection attacks
echo "Test base model with the prompt 'Tell me about cdxgen'. Usually yields a low-quality response."
mlx_lm.generate --model ${BASE_MODEL} --prompt "Tell me about cdxgen" --temp 0.05

# We use LoRA fine-tuning over DoRA due to better compatibility with vLLM and llama.cpp
echo "Low-Rank Adaptation (LoRA) fine-tuning ${BASE_MODEL} with cdx1 dataset. This might take a while ..."
mlx_lm.lora --model ${BASE_MODEL} --train --data ${DATASET_PATH} --adapter-path ${ADAPTERS_PATH} --mask-prompt --fine-tune-type lora --batch-size 1 --num-layers ${NUM_LAYERS} --iters 2000 --grad-checkpoint --max-seq-length 16000 --learning-rate "3e-5"

echo "Fuse model to ${FUSED_MODEL} using the cdx1 adapters"
rm -rf ${FUSED_MODEL}
# gguf export via mlx isn't working
# mlx_lm.fuse --model ${BASE_MODEL} --adapter-path adapters --hf-path ${FUSED_MODEL} --save-path ${FUSED_MODEL} --de-quantize --export-gguf --gguf-path cdx1-f16.gguf
mlx_lm.fuse --model ${BASE_MODEL} --adapter-path adapters --hf-path ${FUSED_MODEL} --save-path ${FUSED_MODEL} --de-quantize

echo "Test fused model with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ./${FUSED_MODEL} --prompt "Tell me about cdxgen" --temp 0.05

rm -rf ${BASE_MODEL_MLX}
mlx_lm.convert --hf-path ${BASE_MODEL} --mlx-path ${BASE_MODEL_MLX}

# Not working
# mkdir -p ${FUSED_GGUF_MODEL}
# mv ${FUSED_MODEL}/cdx1-f16.gguf ${FUSED_GGUF_MODEL}
# cp Modelfile ${FUSED_GGUF_MODEL}/
# cp ${FUSED_MODEL}/*.json ${FUSED_MODEL}/merges.txt ${FUSED_GGUF_MODEL}/
# sed -i'' 's|CycloneDX/cdx1-gguf|./cdx1-f16.gguf|g' ${FUSED_GGUF_MODEL}/Modelfile

echo "Create quantized models"
rm -rf ${QUANT_MODEL_8BIT}
mlx_lm.convert --hf-path ${FUSED_MODEL} --mlx-path ${QUANT_MODEL_8BIT} -q --q-bits 8 --dtype bfloat16
echo "Test ${QUANT_MODEL_8BIT} with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ./${QUANT_MODEL_8BIT} --prompt "Tell me about cdxgen" --temp 0.05

rm -rf ${QUANT_MODEL_6BIT}
mlx_lm.convert --hf-path ${FUSED_MODEL} --mlx-path ${QUANT_MODEL_6BIT} -q --q-bits 6 --dtype bfloat16
echo "Test ${QUANT_MODEL_6BIT} with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ./${QUANT_MODEL_6BIT} --prompt "Tell me about cdxgen" --temp 0.05

rm -rf ${QUANT_MODEL_4BIT}
mlx_lm.convert --hf-path ${FUSED_MODEL} --mlx-path ${QUANT_MODEL_4BIT} -q --q-bits 4 --dtype bfloat16
echo "Test ${QUANT_MODEL_4BIT} with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ./${QUANT_MODEL_4BIT} --prompt "Tell me about cdxgen" --temp 0.05
