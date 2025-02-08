#!/usr/bin/env bash
set -e
export HF_HUB_ENABLE_HF_TRANSFER=0
HF_ORG=CycloneDX
TUNING_TOOL=mlx
TOOL_BASE_MODEL=cdx1
FUSED_MODEL=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}
QUANT_MODEL_8BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-8bit
QUANT_MODEL_6BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-6bit
QUANT_MODEL_4BIT=${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}-4bit

huggingface-cli whoami

echo "Uploading datasets"
huggingface-cli upload --quiet --repo-type dataset CycloneDX/cdx-docs ./cdxgen-docs cdxgen-docs
huggingface-cli upload --quiet --repo-type dataset CycloneDX/cdx-docs ./guides guides
huggingface-cli upload --quiet --repo-type dataset CycloneDX/cdx-docs ./semantics semantics

echo "Uploading models. Please wait ..."
huggingface-cli upload --quiet --repo-type model ${QUANT_MODEL_8BIT} ./${QUANT_MODEL_8BIT} .
huggingface-cli upload --quiet --repo-type model ${QUANT_MODEL_6BIT} ./${QUANT_MODEL_6BIT} .
huggingface-cli upload --quiet --repo-type model ${QUANT_MODEL_4BIT} ./${QUANT_MODEL_4BIT} .

huggingface-cli upload --quiet --repo-type model ${FUSED_MODEL} ./${FUSED_MODEL} .
