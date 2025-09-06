#!/bin/bash
set -e

# Simple setup script to reproduce issue #2236 with the Jupyter Notebook project.
# It clones the repo, checks for the relevant pyproject.toml files,
# and runs cdxgen to verify SBOM generation.

REPO=https://github.com/jupyter/notebook.git
BRANCH=v7.4.5
DIR=notebook

if [ ! -d "$DIR" ]; then
  echo "Cloning Jupyter Notebook ($BRANCH)..."
  git clone --branch $BRANCH --depth 1 $REPO $DIR
fi

cd $DIR
echo "Installing Node.js dependencies (this may take a minute)..."
npm install node-gyp --no-audit --no-fund --legacy-peer-deps

echo "Checking project structure..."
[ -f pyproject.toml ] && echo "  Found root pyproject.toml" || echo "  Missing root pyproject.toml"
[ -f package.json ] && echo "  Found package.json" || echo "  Missing package.json"
[ -f node_modules/node-gyp/gyp/pyproject.toml ] && echo "  Found nested pyproject.toml" || echo "  Missing nested pyproject.toml"

echo "Running cdxgen..."
cdxgen -r . --type python --output bom.json --no-install-deps

if [ -f bom.json ]; then
  echo "SBOM successfully generated (bom.json)"
  if command -v jq >/dev/null; then
    echo "Components: $(jq '.components | length' bom.json)"
  fi
else
  echo "Error: SBOM not generated"
  exit 1
fi

