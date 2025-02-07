#!/usr/bin/env bash
set -e
TUNING_TOOL=mlx
BASE_MODEL=unsloth/phi-4
BASE_MODEL_MLX=${BASE_MODEL}-${TUNING_TOOL}
HF_ORG=CycloneDX
TOOL_BASE_MODEL=cdx1
NUM_LAYERS=16

FUSED_MODEL=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}
FUSED_GGUF_MODEL=${HF_ORG}/${TOOL_BASE_MODEL}-gguf
QUANT_MODEL_8BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-8bit
QUANT_MODEL_6BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-6bit
QUANT_MODEL_4BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-4bit

### mlx-lm needs train.jsonl and valid.jsonl
rm -rf dataset ${HF_ORG} adapters ${BASE_MODEL}
mkdir -p dataset ${HF_ORG}

node prepare.js dataset
node validator.js dataset

echo "Test base model with the prompt 'Tell me about cdxgen'. Usually yields a low-quality response."
mlx_lm.generate --model ${BASE_MODEL} --prompt "Tell me about cdxgen" --temp 0.05

# We first convert from HF to mlx
rm -rf ${BASE_MODEL_MLX}
mlx_lm.convert --hf-path ${BASE_MODEL} --mlx-path ${BASE_MODEL_MLX}

echo "Weight-Decomposed Low-Rank Adaptation (DoRA) fine-tuning ${BASE_MODEL_MLX} with cdx1 dataset. This might take a while ..."
mlx_lm.lora --model ${BASE_MODEL_MLX} --train --data dataset --fine-tune-type dora --batch-size 1 --num-layers ${NUM_LAYERS} --iters 1000 --grad-checkpoint

echo "Fuse model to ${FUSED_MODEL} using the cdx1 adapters"
rm -rf ${FUSED_MODEL} ${FUSED_GGUF_MODEL}
mlx_lm.fuse --model ${BASE_MODEL_MLX} --adapter-path adapters --hf-path ${FUSED_MODEL} --save-path ${FUSED_MODEL} --export-gguf --gguf-path cdx1-bf16.gguf

echo "Test fused model with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ${FUSED_MODEL} --prompt "Tell me about cdxgen" --temp 0.05

mkdir -p ${FUSED_GGUF_MODEL}
mv ${FUSED_MODEL}/cdx1-bf16.gguf ${FUSED_GGUF_MODEL}
cp Modelfile ${FUSED_GGUF_MODEL}/

echo "Create quantized models"
rm -rf ${QUANT_MODEL_8BIT}
mlx_lm.convert --hf-path ${FUSED_MODEL} --mlx-path ${QUANT_MODEL_8BIT} -q --q-bits 8 --dtype bfloat16
echo "Test ${QUANT_MODEL_8BIT} with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ${QUANT_MODEL_8BIT} --prompt "Tell me about cdxgen" --temp 0.05

rm -rf ${QUANT_MODEL_6BIT}
mlx_lm.convert --hf-path ${FUSED_MODEL} --mlx-path ${QUANT_MODEL_6BIT} -q --q-bits 6 --dtype bfloat16
echo "Test ${QUANT_MODEL_6BIT} with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ${QUANT_MODEL_6BIT} --prompt "Tell me about cdxgen" --temp 0.05

rm -rf ${QUANT_MODEL_4BIT}
mlx_lm.convert --hf-path ${FUSED_MODEL} --mlx-path ${QUANT_MODEL_4BIT} -q --q-bits 4 --dtype bfloat16
echo "Test ${QUANT_MODEL_4BIT} with the prompt 'Tell me about cdxgen'. Must yield a better response."
mlx_lm.generate --model ${QUANT_MODEL_4BIT} --prompt "Tell me about cdxgen" --temp 0.05

rm -rf dataset adapters ${BASE_MODEL}
