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

To download the SBOM attachment from the OCI image, use the `oras pull` command with the correct digest from the `discover` command.

```shell
IMAGE_REF=$(oras discover --format json --artifact-type sbom/cyclonedx docker.io/<repo>/sign-test:latest | jq -r '.manifests[0].reference')
oras pull $IMAGE_REF -o sbom_output_dir
ls -l sbom_output_dir/bom.json
```
