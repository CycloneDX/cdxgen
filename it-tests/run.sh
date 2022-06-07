#!/bin/bash

# Exit on any failure
set -e

 # Load PREDEFINED_DIRS:
source predefined-projects.sh

function main(){
	local SUFFIX="$1"

	for i in "${PREDEFINED_DIRS[@]}"; do 
		IFS=',' read LANG DIR <<< "${i}"
		run_cdx $LANG $DIR $SUFFIX
	done
}

function run_cdx(){
	local LANG="$1"
	local DIR="$2"
	local OUT_SUFFIX="$3"
	../bin/cdxgen --deterministic-for-tests -t $LANG -o "$DIR/cdx$OUT_SUFFIX.out.xml" -r $DIR
}


main "$1"
