# Build environment for Anthropic's OSS Scanner (https://github.com/anthropics/oss-scanner).
# The scanner builds this file with the repository as the build context, then analyses the finished
# image with no network, so everything cdxgen and its tests need is fetched here.
# Node.js matches .nvmrc.
FROM node:24.22.1-trixie@sha256:016f604a11c4c725f0a4c62e29ff11adab153d297bf97046c9bf2ddb9f1011d3

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git python3 python3-pip python3-venv unzip xz-utils \
    && rm -rf /var/lib/apt/lists/*

# scanner contract: the checkout lives inside the image, at /src
COPY . /src
WORKDIR /src

# corepack installs the pnpm release pinned in package.json and keeps it in the image, so pnpm
# works offline afterwards.
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack install && pnpm --version

# Same install as CI (.github/workflows/nodejs.yml). The optional dependencies stay: the server
# middleware, the plugins-bin helpers used for container and rootfs scans, and safer-exec for tracebom.
RUN pnpm run install:frozen

# Put the package's commands (cdxgen, cdx-verify, cdxi, ...) on PATH, as a global install would.
RUN node -e 'const fs = require("node:fs"); const path = require("node:path"); \
      const { bin } = JSON.parse(fs.readFileSync("package.json", "utf8")); \
      for (const [name, file] of Object.entries(bin)) fs.symlinkSync(path.resolve(file), `/usr/local/bin/${name}`);' \
    && cdxgen --version

# Run the unit tests while the network is up, so a broken image shows in the build log. Failures are
# reported, not fatal.
RUN pnpm test || echo "WARNING: pnpm test reported failures"
