#!/bin/bash

# Exit on any failure
set -e

function main() {
  local BASELINE_BRANCH="$1"

  ./run.sh
  git checkout $BASELINE_BRANCH
  ./run.sh "-baseline"
  git checkout -
  ./diff.sh "" "-baseline"
}

main "${1:-master}"
