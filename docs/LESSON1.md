# Create an SBOM with reachable evidence

## Learning Objective

In this lesson, we will learn about generating an SBOM with reachable evidence for Dependency-Track, a Java application.

## Pre-requisites

Ensure the following tools are installed.

```
Java >= 21
Maven
Node.js > 20
```

## Getting started

Install cdxgen

```shell
sudo npm install -g @cyclonedx/cdxgen
```

Clone and compile dependency track

```shell
git clone https://github.com/DependencyTrack/dependency-track
cd dependency-track
mvn clean compile -P clean-exclude-wars -P enhance -P embedded-jetty -DskipTests
```

Create SBOM with the research profile

```shell
cd dependency-track
# Takes around 5 mins
cdxgen -o bom.json -t java --profile research . -p
```

The resulting BOM file would include components with the occurrence and call stack evidence.
