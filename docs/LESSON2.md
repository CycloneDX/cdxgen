# Create an SBOM with reachable evidence

## Learning Objective

In this lesson, we will learn about generating an SBOM with reachable evidence for Dependency-Track frontend, a JavaScript application.

## Pre-requisites

Ensure the following tools are installed.

```
Java >= 21
Node.js > 20
```

## Getting started

Install cdxgen

```shell
sudo npm install -g @cyclonedx/cdxgen
```

Clone

```shell
git clone https://github.com/DependencyTrack/frontend
```

Create SBOM with the research profile

```shell
cd frontend
npm install
# Takes around 5 mins
cdxgen -o bom.json -t js --profile research . -p
```

The resulting BOM file would include components with the occurrence and call stack evidence.
