# Standards & Attestations

## Learning Objective

In this lesson, we will learn about generating SBOM based on a security standard template.

## Pre-requisites

Ensure the following tools are installed.

- Node.js > 20

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

Create SBOM with the standard `asvs-4.0.3`

```shell
cd dependency-track
cdxgen -o bom.json -t java --standard asvs-4.0.3
```

The resulting BOM file would include `definitions.standards` section containing the requirements for ASVS 4.0.3.

## Declarations

Manually complete the `declarations` section to describe the conformance to standards. Each declaration may include attestations, claims, counter-claims, evidence, and counter-evidence along with conformance and confidence. Signatories can also be declared and support both digital and analog signatures.
