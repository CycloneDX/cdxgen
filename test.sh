#!/usr/bin/env bash
cd tests/with-packages
npm ci
cd ..
npm test