#!/usr/bin/env bash
# Need the latest master from https://github.com/ml-explore/mlx-lm
set -e
TUNING_TOOL=mlx
TOOL_BASE_MODEL=${1:-cdx1}
MAX_SEQ=262144
MAX_TOKENS=16384
ITERS=1500
NUM_LAYERS=48
case "$TOOL_BASE_MODEL" in
  cdx1-mini)
    NUM_LAYERS=36
    BASE_MODEL="unsloth/Qwen3-4B-Instruct-2507"
    ;;
  cdx1-pro)
    ITERS=2500
    BASE_MODEL="unsloth/Qwen3-Coder-30B-A3B-Instruct"
    ;;
  *)
    ITERS=2000
    BASE_MODEL="unsloth/Qwen2.5-Coder-14B-Instruct"
    ;;
esac
BASE_MODEL_MLX=${BASE_MODEL}-${TUNING_TOOL}
HF_ORG=CycloneDX
ADAPTERS_PATH=adapters
DATASET_PATH=dataset

FUSED_MODEL=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}
# FUSED_GGUF_MODEL=${HF_ORG}/${TOOL_BASE_MODEL}-gguf
QUANT_MODEL_8BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-8bit
QUANT_MODEL_6BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-6bit
QUANT_MODEL_4BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-4bit
DWQ_QUANT_MODEL_4BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-4bit-DWQ

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
mlx_lm.generate --model ${BASE_MODEL} --prompt "Tell me about cdxgen" --temp 0.7 --max-tokens ${MAX_TOKENS}

# We use LoRA fine-tuning over DoRA due to better compatibility with vLLM and llama.cpp
if [ "$TOOL_BASE_MODEL" = "cdx1-mini" ]; then
  echo "Full fine-tune with cdx-docs dataset. This might take a while ..."
  mlx_lm.lora --model ${BASE_MODEL} --train --data ${DATASET_PATH} --adapter-path ${ADAPTERS_PATH} --mask-prompt --fine-tune-type full --batch-size 2 --num-layers ${NUM_LAYERS} --iters ${ITERS} --grad-checkpoint --max-seq-length ${MAX_SEQ} --learning-rate "1e-5" --optimizer adamw
elif [ "$TOOL_BASE_MODEL" = "cdx1" ]; then
  echo "Low-Rank Adaptation (LoRA) fine-tuning ${BASE_MODEL} with cdx-docs dataset. This might take a while ..."
  mlx_lm.lora --model ${BASE_MODEL} --train --data ${DATASET_PATH} --adapter-path ${ADAPTERS_PATH} --mask-prompt --fine-tune-type lora --batch-size 1 --num-layers ${NUM_LAYERS} --iters ${ITERS} --grad-checkpoint --max-seq-length ${MAX_SEQ} --learning-rate "1e-4" --optimizer adamw
else
  echo "Low-Rank Adaptation (LoRA) fine-tuning ${BASE_MODEL} with cdx-docs dataset. This might take a while ..."
  mlx_lm.lora --model ${BASE_MODEL} --train --data ${DATASET_PATH} --adapter-path ${ADAPTERS_PATH} --mask-prompt --fine-tune-type lora --batch-size 1 --num-layers ${NUM_LAYERS} --iters ${ITERS} --grad-checkpoint --max-seq-length ${MAX_SEQ} --learning-rate "1e-4" --optimizer adamw
fi

echo "Fuse model to ${FUSED_MODEL} using the cdx1 adapters"
rm -rf ${FUSED_MODEL}
# gguf export via mlx isn't working
# mlx_lm.fuse --model ${BASE_MODEL} --adapter-path adapters --save-path ${FUSED_MODEL} --de-quantize --export-gguf --gguf-path cdx1-f16.gguf
mlx_lm.fuse --model ${BASE_MODEL} --adapter-path adapters --save-path ${FUSED_MODEL} --de-quantize

echo "Test fused model with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ./${FUSED_MODEL} --prompt "Tell me about cdxgen" --temp 0.7 --max-tokens ${MAX_TOKENS}

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
mlx_lm.generate --model ./${QUANT_MODEL_8BIT} --prompt "Tell me about cdxgen" --temp 0.7 --max-tokens ${MAX_TOKENS}

rm -rf ${QUANT_MODEL_6BIT}
mlx_lm.convert --hf-path ${FUSED_MODEL} --mlx-path ${QUANT_MODEL_6BIT} -q --q-bits 6 --dtype bfloat16
echo "Test ${QUANT_MODEL_6BIT} with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ./${QUANT_MODEL_6BIT} --prompt "Tell me about cdxgen" --temp 0.7 --max-tokens ${MAX_TOKENS}

# 4-bit for a small model has very poor performance
if [ "$TOOL_BASE_MODEL" != "cdx1-mini" ]; then
  rm -rf ${QUANT_MODEL_4BIT}
  mlx_lm.convert --hf-path ${FUSED_MODEL} --mlx-path ${QUANT_MODEL_4BIT} -q --q-bits 4 --dtype bfloat16
  echo "Test ${QUANT_MODEL_4BIT} with the prompt 'Tell me about cdxgen'. Must yield a better response."
  mlx_lm.generate --model ./${QUANT_MODEL_4BIT} --prompt "Tell me about cdxgen" --temp 0.7 --max-tokens ${MAX_TOKENS}
fi

#if [ "$TOOL_BASE_MODEL" = "cdx1-mini" ]; then
#  rm -rf ${DWQ_QUANT_MODEL_4BIT}
#  echo "Generating DWQ Quantized model ${DWQ_QUANT_MODEL_4BIT} with the teacher model ${FUSED_MODEL}. This might take several hours ..."
#  mlx_lm.dwq --model ${FUSED_MODEL} --quantized-model ${QUANT_MODEL_8BIT} --mlx-path ${DWQ_QUANT_MODEL_4BIT} --learning-rate "2e-5" --batch-size 1 --data-path dataset --grad-checkpoint
#  echo "Test ${DWQ_QUANT_MODEL_4BIT} with the prompt 'Tell me about cdxgen'. Must yield a better response."
#  mlx_lm.generate --model ./${DWQ_QUANT_MODEL_4BIT} --prompt "Tell me about cdxgen" --temp 0.7 --max-tokens ${MAX_TOKENS}
#fi
