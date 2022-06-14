#!/bin/bash

# Exit on any failure
set -e

 # Load PREDEFINED_DIRS:
source predefined-projects.sh

function main(){
	local SUFFIX="$1"

	for i in "${PREDEFINED_DIRS[@]}"; do 
		IFS=',' read LANG SUBMODULE DIR <<< "${i}"
		run_cdx "$LANG" "$SUBMODULE" "$DIR" "$SUFFIX"
	done
}

function run_cdx(){
	local LANG="$1"
	local SUBMODULE="$2"
	local DIR="$3"
	local OUT_SUFFIX="$4"
	if [ -n "$SUBMODULE" ]; then
		../bin/cdxgen --deterministic-for-tests -s $SUBMODULE -t $LANG -o "$DIR/cdx$OUT_SUFFIX.out.xml" -r $DIR	
	else
		../bin/cdxgen --deterministic-for-tests -t $LANG -o "$DIR/cdx$OUT_SUFFIX.out.xml" -r $DIR	
	fi
}


main "$1"
