#!/usr/bin/env bash
## INTENDED TO BE RUN FROM PROJECT ROOT DIR
set -ex

## install project
npm ci

## install testing-projects
npm ci --prefix 'tests/with-packages'
npm ci --prefix 'tests/with-dev-dependencies'
npm ci --prefix 'tests/no-name'

## run tests
npm test

## try to build project
npm run build --if-present
