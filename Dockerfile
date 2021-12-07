# Build
# docker build . -t cyclonedx/cyclonedx-node:test

# Usage
# docker run --rm \
#   -v `pwd`:/src \
#   -w /src \
#   cyclonedx/cyclonedx-node:test -o /src/bom.xml /src

## use active LTS verson of node - see https://nodejs.org/en/about/releases/
FROM node:16.13-alpine3.12

WORKDIR /usr/src/cyclonedx-bom

COPY package*.json /usr/src/cyclonedx-bom/
RUN npm ci --only=production

COPY . /usr/src/cyclonedx-bom

ENTRYPOINT ["/usr/src/cyclonedx-bom/bin/make-bom.js"]
CMD ["-h"]
