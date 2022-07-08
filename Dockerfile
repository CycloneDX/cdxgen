# Build
# docker build --tag cyclonedx/cyclonedx-node:test .

# Usage:
# docker run --rm \
#   --volume "$PWD":/src \
#   cyclonedx/cyclonedx-node:test --help

## use active LTS verson of node - see https://nodejs.org/en/about/releases/
FROM node:16.13-alpine3.12

RUN mkdir -p /usr/src/cyclonedx-bom
COPY package*.json /usr/src/cyclonedx-bom/
RUN npm --prefix /usr/src/cyclonedx-bom ci --only=production
COPY . /usr/src/cyclonedx-bom

ENTRYPOINT ["/usr/src/cyclonedx-bom/bin/make-bom.js"]
CMD ["--help"]

WORKDIR /src
