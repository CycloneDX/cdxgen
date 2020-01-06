# CycloneDX Generator

This script creates a valid CycloneDX Software Bill-of-Materials (SBOM) containing an aggregate of all project dependencies for node.js, python, java and golang projects. Optionally, it can submit the generated BOM to dependency track or AppThreat server for analysis. CycloneDX is a lightweight SBOM specification that is easily created, human and machine readable, and simple to parse.

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
Options:
  --version, -v      Print version number                              [boolean]
  --output, -o       Output file for bom.xml. Default console
  --type, -t         Project type
  --server-url       Dependency track or AppThreat server url. Eg:
                     https://deptrack.appthreat.io
  --api-key          Dependency track or AppThreat server api key
  --project-name     Dependency track or AppThreat project name. Default use the
                     directory name
  --project-version  Dependency track or AppThreat project version. Default
                     master                                  [default: "master"]
  --project-id       Dependency track or AppThreat project id. Either provide
                     the id or the project name and version together
  -h                 Show help                                         [boolean]
```

## Example

```bash
cdxgen -o bom.xml
```

## License

Permission to modify and redistribute is granted under the terms of the Apache 2.0 license. See the [LICENSE] file for the full license.

[license]: https://github.com/AppThreat/cdxgen/blob/master/LICENSE
