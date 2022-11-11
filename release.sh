#!/usr/bin/env bash
rm -rf plugins/goversion
rm -rf plugins/trivy
mkdir -p plugins/goversion
mkdir -p plugins/trivy
pushd thirdparty/goversion
make all
chmod +x build/*
cp -rf build/* ../../plugins/goversion/
rm -rf build
popd

pushd thirdparty/trivy
make all
chmod +x build/*
cp -rf build/* ../../plugins/trivy/
rm -rf build
popd

npm version patch
git push --tags origin master
npm publish --access=public
rm -rf plugins/goversion
rm -rf plugins/trivy
