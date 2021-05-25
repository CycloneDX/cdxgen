#!/bin/bash
echo "Running scan in $GITHUB_WORKSPACE"

node bin/cdxgen $GITHUB_WORKSPACE -o /bom.json
curl -X POST -H "Authorization: Bearer $TOKEN" --data @/bom.json $SERVER_URL