#!/usr/bin/env bash
APPDIR=$1
OPTDIR=${APPDIR}/opt
NODE_VERSION=18.16.0
export PATH=$PATH:${APPDIR}/usr/bin:

curl -LO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    && tar -C ${APPDIR}/usr/bin/ -xvf node-v${NODE_VERSION}-linux-x64.tar.xz \
    && mv ${APPDIR}/usr/bin/node-v${NODE_VERSION}-linux-x64 ${APPDIR}/usr/bin/nodejs \
    && rm -rf ${APPDIR}/usr/bin/nodejs/include \
    && rm -rf ${APPDIR}/usr/bin/nodejs/share \
    && chmod +x ${APPDIR}/usr/bin/nodejs/bin/node \
    && chmod +x ${APPDIR}/usr/bin/nodejs/bin/npm \
    && rm node-v${NODE_VERSION}-linux-x64.tar.xz
