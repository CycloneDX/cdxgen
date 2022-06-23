#!/bin/bash

# Exit on any failure
set -e
 
if [ "$1" == "--update" ]; then
    echo "Updating expectations..."
    ./run.sh "-expected"
else
    echo "Removing potential leftovers of the previous run..."
    find . -iname "cdx-actual.out.xml" -delete
    echo "Verifying..."
    ./run.sh "-actual"
    ./diff.sh "-actual" "-expected"
fi
