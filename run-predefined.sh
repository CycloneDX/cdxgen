#!/bin/bash

# Exit on any failure
set -e

function run(){
	local LANG="$1"
	local DIR="$2"
	local OUT_SUFFIX="$3"
	./bin/cdxgen -t $LANG -o "$DIR/cdx$OUT_SUFFIX.out.xml" -r $DIR
}

function main(){
	local SUFFIX="$1"
	run "java" "../it-tests/sbt1.1" $SUFFIX
	run "java" "../it-tests/sbt1.3" $SUFFIX
}

main $1
