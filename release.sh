#!/usr/bin/env bash

npm version patch
git push --tags origin master
npm publish --access=public
