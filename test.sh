#!/usr/bin/env bash
npm ci
cd tests/with-packages
npm ci
cd ..
npm test