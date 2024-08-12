# image statement
FROM hello-world

# image statement with build stage name
FROM hello-world AS HELLO

# image statement with tag
FROM hello-world:latest

# image statement with sha only
FROM hello-world@sha256:1234567890abcdef

# image statement with tag and sha
FROM hello-world:latest@sha256:1234567890abcdef

# reusing previous build stage as new stage
FROM HELLO as WORLD

# image statement with base image name from build arg
ARG BASE_IMAGE=docker.io/hello-world@sha256:1234567890abcdef
FROM $BASE_IMAGE

# image statement with base image name from build arg with curly braces
ARG BASE_IMAGE=docker.io/hello-world:latest@sha256:1234567890abcdef
FROM ${BASE_IMAGE}

# image statement with multiple build args
ARG IMAGE_REGISTRY=docker.io
ARG IMAGE_NAME=hello-world
ARG IMAGE_TAG="latest"
ARG IMAGE_PATH=$IMAGE_NAME:$IMAGE_TAG
FROM $IMAGE_REGISTRY/$IMAGE_PATH

# image statement with base image name from build arg without default
ARG BASE_IMAGE_WITHOUT_DEFAULT
FROM $BASE_IMAGE_WITHOUT_DEFAULT

# Commented out image statement
# FROM hello-world
