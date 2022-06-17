# CycloneDX Generator

This script creates a valid and compliant CycloneDX Software Bill-of-Materials (SBOM) containing an aggregate of all project dependencies for c/c++, node.js, php, python, ruby, rust, java, .Net, dart, haskell, elixir, and Go projects in XML and JSON format. CycloneDX 1.4 is a lightweight SBOM specification that is easily created, human and machine readable, and simple to parse.

## Supported languages and package format

| Language           | Package format                                                                                  | Transitive dependencies                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| node.js            | npm-shrinkwrap.json, package-lock.json, pnpm-lock.yaml, yarn.lock, rush.js, bower.json, .min.js | Yes except .min.js                                                                                 |
| java               | maven (pom.xml [1]), gradle (build.gradle, .kts), scala (sbt), bazel                            | Yes unless pom.xml is manually parsed due to unavailability of maven or errors with maven plugins  |
| php                | composer.lock                                                                                   | Yes                                                                                                |
| python             | setup.py, requirements.txt [2], Pipfile.lock, poetry.lock, bdist_wheel, .whl                    | Only with Pipfile.lock and poetry.lock                                                             |
| go                 | binary, go.mod, go.sum, Gopkg.lock                                                              | Yes except binary                                                                                  |
| ruby               | Gemfile.lock, gemspec                                                                           | Only for Gemfile.lock                                                                              |
| rust               | Cargo.toml, Cargo.lock                                                                          | Only for Cargo.lock                                                                                |
| .Net               | .csproj, packages.config, project.assets.json [3], packages.lock.json, .nupkg                   | Only for project.assets.json, packages.lock.json                                                   |
| dart               | pubspec.lock, pubspec.yaml                                                                      | Only for pubspec.lock                                                                              |
| haskell            | cabal.project.freeze                                                                            | Yes                                                                                                |
| elixir             | mix.lock                                                                                        | Yes                                                                                                |
| c/c++              | conan.lock, conanfile.txt                                                                       | Yes only for conan.lock                                                                            |
| clojure            | Clojure CLI (deps.edn), Leiningen (project.clj)                                                 | Yes unless the files are parsed manually due to unavailability of clojure cli or leiningen command |
| docker / oci image | All supported languages excluding OS packages                                                   | Best effort based on lock files                                                                    |

NOTE:

- Apache maven 3.x is required for parsing pom.xml
- gradle or gradlew is required to parse gradle projects
- sbt is required for parsing scala sbt projects. Only scala 2.10 + sbt 0.13.6+ and 2.12 + sbt 1.0+ is supported for now.
  - Alternatively, create a lock file using sbt-dependency-lock [plugin](https://github.com/stringbean/sbt-dependency-lock)

Footnotes:

- [1] - For multi-module application, the BoM file could include components that may not be included in the packaged war or ear file.
- [2] - Use pip freeze to improve the accuracy for requirements.txt based parsing. `python -m pip freeze > requirements.txt`
- [3] - Perform dotnet or nuget restore to generate project.assets.json. Without this file cdxgen would not include indirect dependencies.

### Automatic usage detection

For node.js projects, lock files are parsed initially so the SBoM would include all dependencies including dev dependencies. An AST parser powered by babel-parser is then used to detect packages that are imported and used by non-test code. Such imported packages would automatically have their `scope` property set to `required` in the resulting SBoM.

This attribute can be later used for various purposes. For example, [dep-scan](https://github.com/appthreat/dep-scan) use this attribute to prioritize vulnerabilities. Tools such dependency track, unfortunately, do not include this feature and hence might over-report the CVEs.

By passing the argument `--required-only`, you can limit the SBoM to only include packages with the scope "required", commonly referred to as production or non-dev dependencies.

For go, `go mod why` command is used to identify required packages. For php, composer lock file is used to distinguish required (packages) from optional (packages-dev).

## Usage

## Installing

```bash
npm install -g @appthreat/cdxgen
```

## Getting Help

```bash
$ cdxgen -h
Options:
  -o, --output           Output file for bom.xml or bom.json. Default console
  -t, --type             Project type
  -r, --recurse          Recurse mode suitable for mono-repos          [boolean]
  -p, --print            Print the SBoM as a table                     [boolean]
  -c, --resolve-class    Resolve class names for packages. jars only for now.
                                                                       [boolean]
      --server-url       Dependency track or AppThreat server url. Eg:
                         https://deptrack.appthreat.io
      --api-key          Dependency track or AppThreat server api key
      --project-name     Dependency track or AppThreat project name. Default use
                         the directory name
      --project-version  Dependency track or AppThreat project version. Default
                         master                              [default: "master"]
      --project-id       Dependency track or AppThreat project id. Either
                         provide the id or the project name and version together
      --required-only    Include only the packages with required scope on the
                         SBoM.                                         [boolean]
      --version          Show version number                           [boolean]
  -h                     Show help                                     [boolean]
```

## Example

Minimal example.

```bash
cdxgen -o bom.json
```

NOTE:

cdxgen would always produce bom in both xml and json format as per CycloneDX 1.4 specification. json is the recommended format.

For a java project. This would automatically detect maven, gradle or sbt and build bom accordingly

```bash
cdxgen -t java -o bom.json
```

To print the SBoM as a table pass `-p` argument.

```bash
cdxgen -t java -o bom.json -p
```

To recursively generate a single BoM for all languages pass `-r` argument.

```bash
cdxgen -r -o bom.json
```

### Docker / OCI container support

`docker` type is automatically detected based on the presence of values such as `sha256` or `docker.io` prefix etc.

```bash
cdxgen odoo@sha256:4e1e147f0e6714e8f8c5806d2b484075b4076ca50490577cdf9162566086d15e -o /tmp/bom.json
```

You can also pass `-t docker` for simple labels. Only the `latest` tag would be pulled if none was specified.

```bash
cdxgen shiftleft/scan-slim -o /tmp/bom.json -t docker
```

You can also pass the .tar file of a container image.

```bash
docker save -o /tmp/slim.tar shiftleft/scan-slim
podman save -q --format oci-archive -o /tmp/slim.tar shiftleft/scan-slim
cdxgen /tmp/slim.tar -o /tmp/bom.json -t docker
```

NOTE:

- Only application related packages are collected by cdxgen. Support for OS installed packages is coming soon.

### Podman in rootless mode

Setup podman in either [rootless](https://github.com/containers/podman/blob/master/docs/tutorials/rootless_tutorial.md) or [remote](https://github.com/containers/podman/blob/master/docs/tutorials/mac_win_client.md) mode

On Linux, do not forget to start the podman socket which is required for API access.

```bash
systemctl --user enable --now podman.socket
systemctl --user start podman.socket
podman system service -t 0 &
```

### War file support

cdxgen can generate a BoM file from a given war file.

```bash
# cdxgen -t java app.war
cdxgen app.war
```

### Resolving class names

Sometimes it is necessary to resolve class names contained in jar files. By passing an optional argument `--resolve-class`, it is possible to get cdxgen create a separate mapping file with the jar name (including the version) as the key and class names list as a value.

```bash
cdxgen -t java --resolve-class -o bom.json
```

This would create a bom.json.map file with the jar - class name mapping. Refer to [these](test/data/bom-maven.json.map) [examples](test/data/bom-gradle.json.map) to learn about the structure.

## Resolving licenses

cdxgen can automatically query the public registries such as maven or npm or nuget to resolve the package licenses. This is a time consuming operation and is disabled by default. To enable, set the environment variable `FETCH_LICENSE` to `true` as shown.

```bash
export FETCH_LICENSE=true
```

## Environment variables

| Variable                  | Description                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SCAN_DEBUG_MODE           | Set to debug to enable debug messages                                                                              |
| GITHUB_TOKEN              | Specify GitHub token to prevent traffic shaping while querying license and repo information                        |
| MVN_CMD                   | Set to override maven command                                                                                      |
| MVN_ARGS                  | Set to pass additional arguments such as profile or settings to maven                                              |
| MAVEN_HOME                | Specify maven home                                                                                                 |
| GRADLE_CACHE_DIR          | Specify gradle cache directory. Useful for class name resolving                                                    |
| GRADLE_MULTI_PROJECT_MODE | Set this variable for gradle multi-project applications. Do not use this with recurse mode.                        |
| GRADLE_ARGS               | Set to pass additional arguments such as profile or settings to gradle. Eg: --configuration runtimeClassPath       |
| GRADLE_HOME               | Specify gradle home                                                                                                |
| GRADLE_CMD                | Set to override gradle command                                                                                     |
| GRADLE_DEPENDENCY_TASK    | By default cdxgen use the task "dependencies" to collect packages. Set to override the task name.                  |
| SBT_CACHE_DIR             | Specify sbt cache directory. Useful for class name resolving                                                       |
| FETCH_LICENSE             | Set to true to fetch license information from the registry. npm and golang only                                    |
| USE_GOSUM                 | Set to true to generate BOMs for golang projects using go.sum as the dependency source of truth, instead of go.mod |
| CDXGEN_TIMEOUT_MS         | Default timeout for known execution involving maven, gradle or sbt                                                 |
| BAZEL_TARGET              | Bazel target to build. Default :all (Eg: //java-maven)                                                             |
| CLJ_CMD                   | Set to override the clojure cli command                                                                            |
| LEIN_CMD                  | Set to override the leiningen command                                                                              |

## Integration with GitHub action

Use the GitHub [action](https://github.com/AppThreat/cdxgen-action) to automatically generate and upload bom to the server. Refer to `nodejs.yml` in this repo for a working example.

## Integration with Google CloudBuild

Use this [custom builder](https://github.com/CloudBuildr/google-custom-builders/tree/master/cdxgen) and refer to the readme for instruction.

## Plugins

The package published on npm would include additional binary executables under the plugins directory. These executables provide functionality that are difficult to implement with node.js alone. Example for this is the `goversion` [plugin](thirdparty/goversion) which helps with module identification for go binaries. The source code for all the plugins would be published inside the [thirdparty](thirdparty) directory.

## Conversion to SPDX format or SBoM Signing

Use the [CycloneDX CLI](https://github.com/CycloneDX/cyclonedx-cli) tool for advanced use cases such as conversion, diff and signing.

## License

Permission to modify and redistribute is granted under the terms of the Apache 2.0 license. See the [LICENSE] file for the full license.

[license]: https://github.com/AppThreat/cdxgen/blob/master/LICENSE
