#!/usr/bin/env bash
set -e
# Path to the latest llama.cpp compiled with all packages installed under conda
# git clone https://github.com/ggerganov/llama.cpp.git
# cd llama.cpp
# conda create --name llama.cpp python=3.12
# conda activate llama.cpp
# python -m pip install -r requirements.txt
# cmake -B build
# cmake --build build --config Release -j $(sysctl -n hw.logicalcpu)

# For uv
# uv venv -p 3.12
# source .venv/bin/activate
# uv pip install -r requirements.txt --index-strategy unsafe-best-match
# cmake -B build
# cmake --build build --config Release -j $(sysctl -n hw.logicalcpu)

export TOKENIZERS_PARALLELISM=false

TUNING_TOOL=mlx
FORMAT=GGUF
HF_ORG=CycloneDX
TOOL_BASE_MODEL=${1:-cdx1}
case "$TOOL_BASE_MODEL" in
  cdx1-pro)
    PARAM_SIZE="30B"
    ;;
  cdx1)
    PARAM_SIZE="14B"
    ;;
  *)
    PARAM_SIZE="gguf"
    ;;
esac
LLAMA_CPP_PATH=/Users/appthreat/work/llama.cpp
cd $LLAMA_CPP_PATH
source .venv/bin/activate
CDXGEN_FT_PATH=/Users/appthreat/work/cdxgen/contrib/fine-tuning

GGUF_MODEL_Q8_0_NAME=${HF_ORG}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-Q8_0-${FORMAT}
GGUF_MODEL_Q8_0_PATH=${CDXGEN_FT_PATH}/${HF_ORG}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-Q8_0-${FORMAT}
FUSED_MODEL=${CDXGEN_FT_PATH}/${HF_ORG}/${TOOL_BASE_MODEL}-${TUNING_TOOL}

rm -rf ${GGUF_MODEL_Q8_0_PATH}
mkdir -p ${GGUF_MODEL_Q8_0_PATH}
python convert_hf_to_gguf.py --outtype q8_0 --outfile ${CDXGEN_FT_PATH}/${HF_ORG}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-Q8_0-${FORMAT}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-q8_0.gguf --model-name ${GGUF_MODEL_Q8_0_NAME} ${FUSED_MODEL}
cp ${CDXGEN_FT_PATH}/Modelfile ${GGUF_MODEL_Q8_0_PATH}/
cp ${FUSED_MODEL}/*.json ${FUSED_MODEL}/merges.txt ${GGUF_MODEL_Q8_0_PATH}/

GGUF_MODEL_BF16_NAME=${HF_ORG}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-BF16-${FORMAT}
GGUF_MODEL_BF16_PATH=${CDXGEN_FT_PATH}/${HF_ORG}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-BF16-${FORMAT}
rm -rf ${GGUF_MODEL_BF16_PATH}
mkdir -p ${GGUF_MODEL_BF16_PATH}
python convert_hf_to_gguf.py --outtype bf16 --outfile ${CDXGEN_FT_PATH}/${HF_ORG}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-BF16-${FORMAT}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-bf16.gguf --model-name ${GGUF_MODEL_BF16_NAME} ${FUSED_MODEL}
cp ${CDXGEN_FT_PATH}/Modelfile ${GGUF_MODEL_BF16_PATH}/
sed -i '' 's|./cdx1-${PARAM_SIZE}-q8_0.gguf|./cdx1-${PARAM_SIZE}-bf16.gguf|g' ${GGUF_MODEL_BF16_PATH}/Modelfile
cp ${FUSED_MODEL}/*.json ${FUSED_MODEL}/merges.txt ${GGUF_MODEL_BF16_PATH}/

GGUF_MODEL_Q4_K_M_NAME=${HF_ORG}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-Q4_K_M-${FORMAT}
GGUF_MODEL_Q4_K_M_PATH=${CDXGEN_FT_PATH}/${HF_ORG}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-Q4_K_M-${FORMAT}
rm -rf ${GGUF_MODEL_Q4_K_M_PATH}
mkdir -p ${GGUF_MODEL_Q4_K_M_PATH}
llama-quantize ${CDXGEN_FT_PATH}/${HF_ORG}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-BF16-${FORMAT}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-bf16.gguf ${GGUF_MODEL_Q4_K_M_PATH}/${TOOL_BASE_MODEL}-${PARAM_SIZE}-Q4_K_M.gguf Q4_K_M
cp ${CDXGEN_FT_PATH}/Modelfile ${GGUF_MODEL_Q4_K_M_PATH}/
sed -i '' 's|./cdx1-${PARAM_SIZE}-q8_0.gguf|./cdx1-${PARAM_SIZE}-Q4_K_M.gguf|g' ${GGUF_MODEL_Q4_K_M_PATH}/Modelfile
cp ${FUSED_MODEL}/*.json ${FUSED_MODEL}/merges.txt ${GGUF_MODEL_Q4_K_M_PATH}/

### Testing with ollama
# cd ${GGUF_MODEL_Q8_0_PATH}
# ollama create cdx1-${FORMAT} -f Modelfile
# ollama show cdx1-${FORMAT}
# ollama run cdx1-${FORMAT} "tell me about cdxgen"

export HF_HUB_ENABLE_HF_TRANSFER=0
hf auth whoami
hf upload --quiet --repo-type model ${GGUF_MODEL_Q8_0_NAME} ${GGUF_MODEL_Q8_0_PATH} .
hf upload --quiet --repo-type model ${GGUF_MODEL_Q4_K_M_NAME} ${GGUF_MODEL_Q4_K_M_PATH} .
hf upload --quiet --repo-type model ${GGUF_MODEL_BF16_NAME} ${GGUF_MODEL_BF16_PATH} .

ollama pull hf.co/${GGUF_MODEL_Q8_0_NAME}
ollama cp hf.co/${GGUF_MODEL_Q8_0_NAME} ${GGUF_MODEL_Q8_0_NAME}
ollama push ${GGUF_MODEL_Q8_0_NAME}
ollama rm hf.co/${GGUF_MODEL_Q8_0_NAME}

ollama pull hf.co/${GGUF_MODEL_Q4_K_M_NAME}
ollama cp hf.co/${GGUF_MODEL_Q4_K_M_NAME} ${GGUF_MODEL_Q4_K_M_NAME}
ollama push ${GGUF_MODEL_Q4_K_M_NAME}
ollama rm hf.co/${GGUF_MODEL_Q4_K_M_NAME}

ollama pull hf.co/${GGUF_MODEL_BF16_NAME}
ollama cp hf.co/${GGUF_MODEL_BF16_NAME} ${GGUF_MODEL_BF16_NAME}
ollama push ${GGUF_MODEL_BF16_NAME}
ollama rm hf.co/${GGUF_MODEL_BF16_NAME}
