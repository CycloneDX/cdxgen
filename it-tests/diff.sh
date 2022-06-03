#!/bin/bash

# Exit on any failure
set -e
# Print commands
set -x

 # Load PREDEFINED_DIRS:
source predefined-projects.sh

function main(){
  local SUFFIX_1="$1"
  local SUFFIX_2="$2"

  for i in "${PREDEFINED_DIRS[@]}"; do 
		IFS=',' read LANG DIR <<< "${i}"
    diff "$DIR/cdx$SUFFIX_1.out.xml" "$DIR/cdx$SUFFIX_2.out.xml"
	done
}

main $1 $2
