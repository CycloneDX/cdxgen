# CycloneDX Generator

This script creates a valid CycloneDX Software Bill-of-Materials (SBOM) containing an aggregate of all project dependencies for node.js, python and java projects. CycloneDX is a lightweight SBOM specification that is easily created, human and machine readable, and simple to parse.

## Supported languages and package format

| Language | Package format                         |
| -------- | -------------------------------------- |
| node.js  | package-lock.json                      |
| java     | maven (pom.xml), gradle (build.gradle) |
| python   | requirements.txt, Pipfile.lock         |
| golang   | go.sum, Gopkg.lock                     |

NOTE:

- Apache maven is required for parsing pom.xml
- gradle or gradlew is required to parse gradle projects
- License information is not available for golang projects as of now. It might be possible to build this information by parsing all folders in the GOPATH and extracting license files. Any PR welcome :)

This is a fork of [cyclonedx-node-module](https://github.com/CycloneDX/cyclonedx-node-module)

## Usage

## Installing

```bash
npm install -g @appthreat/cdxgen
```

## Getting Help

```bash
$ cdxgen -h
Usage:  cdxgen [OPTIONS] [path]
Options:
  -h        - this help
  -o <path> - write to file instead of stdout
  --version - print version number
```

## Example

```bash
cdxgen -o bom.xml
```

## License

Permission to modify and redistribute is granted under the terms of the Apache 2.0 license. See the [LICENSE] file for the full license.

[license]: https://github.com/AppThreat/cdxgen/blob/master/LICENSE
