# Create custom SBOMs for OWASP juice-shop

## Learning Objective

This guide demonstrates how to generate various SBOMs for the OWASP [Juice Shop](https://github.com/juice-shop/juice-shop), a known vulnerable web application featuring a Node.js backend and an Angular.js frontend.

## Pre-requisites

Ensure the following tools are installed.

```
Java >= 21
Node.js > 20 - 22
```

## Getting started

Install cdxgen

```shell
sudo npm install -g @cyclonedx/cdxgen
```

Clone

```shell
git clone https://github.com/juice-shop/juice-shop
```

### Important Considerations

- Custom .npmrc: Juice Shop uses a .npmrc that prevents lock file creation. Without a lock file, SBOM accuracy decreases since dependency trees cannot be fully resolved.
- Native Builds: Some packages require native builds and may fail on certain Node.js versions (>23), CPU architectures (e.g., linux/arm64), or Windows platforms.

For best results, use Node.js 20–22 on Linux (amd64) or macOS. Set the environment variable `NPM_INSTALL_ARGS="--package-lock --legacy-peer-deps"` prior to invoking cdxgen.

```shell
cd juice-shop
export NPM_INSTALL_ARGS="--package-lock --legacy-peer-deps"
cdxgen -o bom.json -t js .
```

## container-based invocations

Using the cdxgen container images could simplify the SBOM generation. However, be aware of the various configurations needed for a successful generation.

### Option 1: Use the node20 image

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -e "NPM_INSTALL_ARGS=--package-lock --legacy-peer-deps" -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-node20:latest -t js -r /app -o /app/bom.json
```

For nerdctl users:

```shell
nerdctl run --rm -e CDXGEN_DEBUG_MODE=debug -e "NPM_INSTALL_ARGS=--package-lock --legacy-peer-deps" -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-node20:latest -t js -r /app -o /app/bom.json
```

### Option 2: Use the default image with specific type

The default image of cdxgen `ghcr.io/cyclonedx/cdxgen:latest` bundles node 23 or higher, which is incompatible with juice-shop. Pass the type `-t node20` to automatically install node.js 20 and use the same for the SBOM generation.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -e "NPM_INSTALL_ARGS=--package-lock --legacy-peer-deps" -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen:latest -t node20 -r /app -o /app/bom.json
```

For nerdctl users:

```shell
nerdctl run --rm -e CDXGEN_DEBUG_MODE=debug -e "NPM_INSTALL_ARGS=--package-lock --legacy-peer-deps" -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen:latest -t node20 -r /app -o /app/bom.json
```

## ML profile

To generate an SBOM designed for AI-driven analysis (e.g., with [cdxgenGPT](https://chatgpt.com/g/g-673bfeb4037481919be8a2cd1bf868d2-cyclonedx-generator-cdxgen)), include the `--profile ml` argument.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -e "NPM_INSTALL_ARGS=--package-lock --legacy-peer-deps" -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-node20:latest -t js --profile ml -r /app -o /app/bom.json
```

This process may take 5–10 minutes. Once complete, you can use the resulting SBOM file for AI-driven analysis, dataset creation, or ML model training.
