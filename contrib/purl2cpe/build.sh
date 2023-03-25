#! /usr/bin/env bash
git clone https://github.com/scanoss/purl2cpe.git --depth=1
cd purl2cpe/utilities
pip3 install PyYaml tqdm
python3 sqlite_loader.py ../data
if [ -e purl2cpe.db ]; then
    cp purl2cpe.db ../../../../
else
    echo "purl2cpe.db was not generated successfully. Ensure Python 3 is installed"
fi
cd ../..
rm -rf purl2cpe
