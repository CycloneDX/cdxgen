# Project Types

## Overview

The following **Project Types** are supported:
- When in `CLI` mode, passed as `t` or `--type` flag
- When in `Server` mode, passed as `projectType` parameter.

_Note: there are multiple project types / aliases that will produce the same output_ 

## Supported Types

| BOM Generated | Project Types |
| - | - |
| Java | `java`, `groovy`, `kotlin`, `scala`, `jvm`, `gradle`, `mvn`, `maven`, `sbt`|
| Android | `android`, `apk`, `aab`|
| JAR | `jar` |
| JAR (Gradle Cache) | `gradle-index`, `gradle-cache` |
| JAR (SBT Cache) | `sbt-index`, `sbt-cache` |
| JAR (Maven Cache) | `maven-index`, `maven-cache`, `maven-repo` |
| Node.js | `npm`, `pnpm`, `nodejs`, `js`, `javascript`, `typescript`, `ts`, `tsx` |
| Python | `python`, `py`, `pypi` |
| Golang | `go`, `golang` |
| Rust | `rust`, `rust-lang`, `cargo` |
| PHP | `ruby`, `gems` |
| .NET (#C) | `csharp`, `netcore`, `dotnet`, `vb` |
| Dart | `dart`, `flutter`, `pub` |
| Haskell | `haskell`, `hackage`, `cabal` |
| Elixir | `elixir`, `hex`, `mix` | 
| C++ | `c`, `cpp`, `c++`, `conan` |
| Clojure | `clojure`, `edn`, `clj`, `leiningen` |
| GitHub | `github`, `actions` |
| Operation System (OS) | `os`, `osquery`, `windows`, `linux`, `mac`, `macos`, `darwin` |
| Jenkins | `jenkins` |
| Helm | `helm`, `charts` |
| Helm (Cache) | `helm-index`, `helm-repo` |
| Container | `universal`, `containerfile`, `docker-compose`, `dockerfile`, `swarm`, `tekton`, `kustomize`, `operator`, `skaffold`, `kubernetes`, `openshift`, `yaml-manifest` |
| Cloud Build (GCP) | `cloudbuild` |
| Swift (iOS) | `swift` |
| Binary | `binary`, `blint` |

