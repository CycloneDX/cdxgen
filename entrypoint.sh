#!/bin/bash
echo "Running scan in $GITHUB_WORKSPACE with FETCH_LICENSE=${INPUT_FETCH_LICENSES}"
if [ ! -z "${INPUT_FETCH_LICENSES}" ]
then
    echo "Detecting license information from dependencies"
fi
FETCH_LICENSE=${INPUT_FETCH_LICENSES} node /app/bin/cdxgen $GITHUB_WORKSPACE -o $GITHUB_WORKSPACE/bom.json
if [ ! -z "${INPUT_SERVER_URL}" ]
then
    echo "Posting to ${INPUT_SERVER_URL}"
    cat ${GITHUB_WORKSPACE}/bom.json
    curl -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${INPUT_TOKEN}" --data @${GITHUB_WORKSPACE}/bom.json ${INPUT_SERVER_URL}
fi