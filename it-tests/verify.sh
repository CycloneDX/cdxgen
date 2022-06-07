#!/bin/bash

# Exit on any failure
set -e
 
if [ "$1" == "--update" ]; then
    echo "Updating expectations..."
    ./run.sh "-expected"
else
    echo "Verifying..."
    ./run.sh "-actual"
    ./diff.sh "-actual" "-expected"
fi
