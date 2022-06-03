#!/bin/bash

# Exit on any failure
set -e

 # Load PREDEFINED_DIRS:
source predefined-projects.sh

# If you want to verify that your refactoring doesn't change the behavior, you can run:
# ./run-predefined.sh && git checkout master && ./run-predefined.sh -baseline
# And then, for each test directory:
# diff cdx.out.xml cdx-baseline.out.xml
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
