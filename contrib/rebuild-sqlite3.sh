#!/usr/bin/env bash

npm install --ignore-scripts
cd node_modules/sqlite3
CFLAGS="${CFLAGS:-} -include ../src/gcc-preinclude.h"
CXXFLAGS="${CXXFLAGS:-} -include ../src/gcc-preinclude.h"
npx node-pre-gyp configure
npx node-pre-gyp build

if case $VARIANT in "alpine"*) false;; *) true;; esac; then ldd lib/binding/*/node_sqlite3.node; nm lib/binding/*/node_sqlite3.node | grep \"GLIBC_\" | c++filt || true ; fi

npx node-pre-gyp package
cd ../../
node -e 'require("sqlite3")' 
