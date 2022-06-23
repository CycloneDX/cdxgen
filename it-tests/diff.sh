#!/bin/bash

 # Load PREDEFINED_DIRS:
source predefined-projects.sh

GREEN="\033[0;32m"
RED="\033[0;31m"
ENDCOLOR="\033[0m"

function main(){
  local SUFFIX_1="$1"
  local SUFFIX_2="$2"

  for i in "${PREDEFINED_DIRS[@]}"; do 
    IFS=',' read LANG SUBMODULE DIR <<< "${i}"
    if diff "$DIR/cdx$SUFFIX_1.out.xml" "$DIR/cdx$SUFFIX_2.out.xml"; then
      echo -e "${GREEN}PASSED:${ENDCOLOR} $DIR/cdx$SUFFIX_2.out.xml"
    else
      echo -e "${RED}FAILED:${ENDCOLOR} $DIR/cdx$SUFFIX_1.out.xml and $DIR/cdx$SUFFIX_2.out.xml differ"
    fi
    
  done
}

main $1 $2
