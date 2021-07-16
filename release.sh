#!/usr/bin/env bash
rm -rf plugins/goversion
mkdir -p plugins/goversion
pushd thirdparty/goversion
make all
chmod +x build/*
cp -rf build/* ../../plugins/goversion/
rm -rf build
popd
npm version patch
git push --tags origin master
npm publish --access=public
rm -rf plugins/goversion
