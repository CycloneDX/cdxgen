#!/bin/bash
echo "Running scan in $GITHUB_WORKSPACE with FETCH_LICENSE=${INPUT_FETCH_LICENSES}"
if [ ! -z "${INPUT_FETCH_LICENSES}" ]
then
    echo "Detecting license information from dependencies"
fi
FETCH_LICENSE=${INPUT_FETCH_LICENSES} node /usr/local/bin/cdxgen $GITHUB_WORKSPACE -o $GITHUB_WORKSPACE/bom.json

cd $GITHUB_WORKSPACE
remote=$(git remote show origin | grep Fetch | awk '{print $3}' | sed -e "s/https:\/\/github.com\///g")
echo "git remote was $remote"

if [ ! -z "${INPUT_SERVER_URL}" ]
then
    echo "Posting to ${INPUT_SERVER_URL}"
    curl -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${INPUT_TOKEN}" --data @${GITHUB_WORKSPACE}/bom.json ${INPUT_SERVER_URL}?repo=$remote
fi
