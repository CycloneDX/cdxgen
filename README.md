# CycloneDX Generator

This script creates a valid CycloneDX Software Bill-of-Materials (SBOM) containing an aggregate of all project dependencies for node.js, php, python, java and Go projects in XML or JSON format. CycloneDX 1.2 is a lightweight SBOM specification that is easily created, human and machine readable, and simple to parse.

## Supported languages and package format

| Language  | Package format                                        |
| --------- | ----------------------------------------------------- |
| node.js   | package-lock.json, pnpm-lock.yaml, yarn.lock, rush.js |
| java      | maven (pom.xml), gradle (build.gradle, .kts)          |
| php       | composer.lock                                         |
| python    | setup.py, requirements.txt, Pipfile.lock, poetry.lock |
| go        | go.sum, Gopkg.lock                                    |
| rust      | Cargo.lock                                            |
| .Net core | .csproj                                               |

NOTE:

- Apache maven is required for parsing pom.xml
- gradle or gradlew is required to parse gradle projects

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
  --output, -o       Output file for bom.xml or bom.json. Default console
  --type, -t         Project type
  --recurse, -r      Recurse mode suitable for mono-repos              [boolean]
  --json, -j         Produce JSON output instead of XML based on CycloneDX 1.2
                     specification                                     [boolean]
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

## Integration with GitHub action

Use the GitHub [action](https://github.com/AppThreat/cdxgen-action) to automatically generate and upload bom to the server. Refer to `nodejs.yml` in this repo for a working example.

## Integration with Google CloudBuild

Use this [custom builder](https://github.com/CloudBuildr/google-custom-builders/tree/master/cdxgen) and refer to the readme for instruction.

## License

Permission to modify and redistribute is granted under the terms of the Apache 2.0 license. See the [LICENSE] file for the full license.

[license]: https://github.com/AppThreat/cdxgen/blob/master/LICENSE
