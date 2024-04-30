# Attach signed SBOM to a container image

## Learning Objective

In this lesson, we will learn about signing and attaching a signed SBOM to a container image.

## Pre-requisites

Ensure the following tools are installed.

- ORAS [CLI](https://oras.land/docs/installation)
- Node.js > 20
- docker or podman

Additionally, you need to have access to a container registry to push the image.

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
docker build -t docker.io/<repo>/sign-test:latest -f Dockerfile .
docker push docker.io/<repo>/sign-test:latest
```

### Create an SBOM with cdxgen

```shell
cdxgen --generate-key-and-sign -t docker -o bom.json docker.io/<repo>/sign-test:latest
oras attach --artifact-type sbom/cyclonedx docker.io/<repo>/sign-test:latest ./bom.json:application/json
oras discover -o tree docker.io/<repo>/sign-test:latest
```
