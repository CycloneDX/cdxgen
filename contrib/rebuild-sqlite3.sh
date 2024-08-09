#!/usr/bin/env bash

pnpm install --ignore-scripts
cd node_modules/.pnpm/sqlite3@5.1.7/node_modules/sqlite3
pnpm install
cd ../../../../../
node -e 'require("sqlite3")' 
