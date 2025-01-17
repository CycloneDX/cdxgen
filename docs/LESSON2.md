# Create an SBOM with reachable evidence

## Learning Objective

In this lesson, we will learn about generating an SBOM with reachable evidence for two projects.

1. Dependency-Track frontend - a JavaScript application.
2. bionomia - a Ruby application.

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

Create SBOM with the research profile for JavaScript application.

```shell
cd frontend
npm install
# Takes around 5 mins
cdxgen -o bom.json -t js --profile research . -p
```

The resulting BOM file would include components with the occurrence and call stack evidence.

### bionomia - Ruby

In case of the Ruby application, usage of the container image `ghcr.io/cyclonedx/cdxgen-debian-ruby33:v11` is recommended.

```shell
git clone https://github.com/bionomia/bionomia
docker run --rm -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-debian-ruby33:v11 -r /app -o /app/bom.json -t ruby --profile research
```

cdxgen would automatically detect the version of Ruby required for this project, install, and generate an SBOM with the occurrence and call stack evidence.
