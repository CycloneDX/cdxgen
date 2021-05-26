#!/bin/bash
echo "Running scan in $GITHUB_WORKSPACE with FETCH_LICENSE=$FETCH_LICENSE"
ls -la $GITHUB_WORKSPACE
FETCH_LICENSE=$FETCH_LICENSE node /app/bin/cdxgen $GITHUB_WORKSPACE -o  $GITHUB_WORKSPACE/bom.json
if [ ! -z "$SERVER_URL" ]
then
    curl -X POST -H "Authorization: Bearer $TOKEN" --data @/bom.json $SERVER_URL
fi
ls -la $GITHUB_WORKSPACE