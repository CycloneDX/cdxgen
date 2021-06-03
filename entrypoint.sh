#!/bin/bash
echo "Running scan in $GITHUB_WORKSPACE with FETCH_LICENSE=$FETCH_LICENSE"
if [ ! -z "$SERVER_URL" ]
then
    echo "Detecting license information from dependencies"
fi
FETCH_LICENSE=$FETCH_LICENSE node /app/bin/cdxgen $GITHUB_WORKSPACE -o  $GITHUB_WORKSPACE/bom.json
if [ ! -z "$SERVER_URL" ]
then
    echo "Posting to $SERVER_URL"
    curl -X POST -H "Authorization: Bearer $TOKEN" --data @/bom.json $SERVER_URL
fi