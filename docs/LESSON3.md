# Attach signed SBOM to a container image

## Learning Objective

In this lesson, we will learn about signing and attaching a signed SBOM to a built container image.

## Pre-requisites

Ensure the following tools are installed.

- ORAS [CLI](https://oras.land/docs/installation)
- Node.js > 18
- docker or podman

## Getting started

Install cdxgen

```shell
sudo npm install -g @cyclonedx/cdxgen
```

### Create and Build a container image

Paste the below contents to a file named `Dockerfile`

```
FROM ubuntu:latest
```

Build and push the image to the registry

```shell
docker build -t docker.io/library/sign-test:latest -f Dockerfile .
```

### Create an SBOM with cdxgen

```shell
cdxgen --generate-key-and-sign -t docker -o bom.json docker.io/library/sign-test:latest
oras attach --artifact-type sbom/cyclonedx docker.io/library/sign-test:latest ./bom.json:application/json
oras discover -o tree docker.io/library/sign-test:latest
```

## Sample output
