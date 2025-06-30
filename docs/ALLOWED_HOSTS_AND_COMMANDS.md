# List of allowed hosts and commands

To allow commands and hosts correctly, make sure to add Operating System specific [commands](#platform-specific-commands) along with common [commands](#common-commands-all-platforms) if there is any!

## Common Commands (All Platforms)

| Language / Platform | Project Types | Allowed Commands | Remote Hosts Typically Accessed |
| ------------------------------------- | ------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------- |
| **Node.js** | `npm`, `pnpm`, `nodejs`, `js`, `javascript`, `typescript`, `ts`, `tsx`, `yarn`, `rush` | `npm`, `pnpm`, `yarn`, `rush` | `registry.npmjs.org` |
| **Node.js (Specific version)** | `node8`, `node10`, `node12`, `node14`, `node16`, `node18`, `node20`, `node22`, `node23` | `npm`, `pnpm`, `yarn`, `rush` | `registry.npmjs.org` |
| **Java (Default)** | `java`, `groovy`, `kotlin`, `scala`, `jvm`, `gradle`, `mvn`, `maven`, `sbt`, `quarkus`, `mill` | `mvn`, `gradle`, `sbt` | `*.maven.org` |
| **Java (Specific version)** | `java8`, `java11`, `java17`, `java21`, `java22`, `java23`, `java24` | `mvn`, `gradle`, `sbt` | `*.maven.org` |
| **Android** | `android`, `apk`, `aab` | Usually none | Usually none |
| **JAR** | `jar` | Usually none | Usually none |
| **JAR (Gradle Cache)** | `gradle-index`, `gradle-cache` | Usually none | Usually none |
| **JAR (SBT Cache)** | `sbt-index`, `sbt-cache` | Usually none | Usually none |
| **JAR (Maven Cache)** | `maven-index`, `maven-cache`, `maven-repo` | Usually none | Usually none |
| **Python (Default)** | `python`, `py`, `pypi`, `uv`, `pip`, `poetry`, `pdm`, `hatch` | `pip`, `poetry`, `uv` | `pypi.org` |
| **Python (Specific version)** | `python36`, `python38`, `python39`, `python310`, `python311`, `python312` | `pip`, `poetry`, `uv` | `pypi.org` |
| **Golang** | `go`, `golang` | `go` | `pkg.go.dev`, `proxy.golang.org` |
| **Rust** | `rust`, `rust-lang`, `cargo` | `cargo` | `crates.io` |
| **Ruby** | `ruby`, `gems`, `rubygems`, `bundler`, `rb`, `gemspec` | `bundle` | `rubygems.org` |
| **Ruby (Specific version)** | `ruby*` (Example: ruby2.5.4, ruby3.4.0) | `bundle` | `rubygems.org` |
| **PHP** | `php`, `composer` | `composer` | Usually none *(add `api.github.com` if using packages that fetch from GitHub)* |
| **.NET (C#)** | `csharp`, `netcore`, `dotnet`, `vb`, `dotnet-framework` | `dotnet` | `api.nuget.org` *(add `api.github.com` if using packages that fetch from GitHub)* |
| **Dart** | `dart`, `flutter`, `pub` | `pub` | `pub.dev` |
| **Haskell** | `haskell`, `hackage`, `cabal` | `cabal` | Usually none |
| **Elixir** | `elixir`, `hex`, `mix` | `mix` | Usually none |
| **C++** | `c`, `cpp`, `c++`, `conan` | `conan`, `cmake` | Usually none |
| **Clojure** | `clojure`, `edn`, `clj`, `leiningen` | `clj`, `lein` | Usually none |
| **GitHub Actions** | `github`, `actions` | Usually none | Usually none |
| **Jenkins Plugins** | `jenkins` | Usually none | Usually none |
| **Helm** | `helm`, `charts` | `helm` | Usually none |
| **Helm (Cache)** | `helm-index`, `helm-repo` | `helm` | Usually none |
| **Container** | `oci`, `docker`, `podman`, `container` | `docker`, `podman` | `docker.io`, `api.nuget.org`, `*.maven.org` |
| **Container File** | `universal`, `containerfile`, `docker-compose`, `dockerfile`, `swarm`, `tekton`, `kustomize`, `operator`, `skaffold`, `kubernetes`, `openshift`, `yaml-manifest` | Usually none | Usually none |
| **Google Cloud Build** | `cloudbuild` | Usually none | Usually none |
| **Swift (iOS)** | `swift` | `swift` | Usually none *(add `api.github.com` if using packages that fetch from GitHub)* |
| **Binary** | `binary`, `blint` | Usually none | Usually none |
| **Open API** | `yaml-manifest` | Usually none | Usually none |
| **Operating System** | `os`, `osquery`, `windows`, `linux`, `mac`, `macos`, `darwin` | `osquery` | Usually none |

## Platform-Specific Commands

### Linux Only

| Language / Platform | Additional Commands | Purpose |
| ------------------------------------- | ------------------- | ------- |
| **All Languages** | `ldd` | List dynamic dependencies |
| **Operating System** | `dpkg`, `rpm`, `apk` | Package managers |
| **Container** | `dpkg`, `rpm`, `apk` | Container package inspection |

### macOS Only

| Language / Platform | Additional Commands | Purpose |
| ------------------------------------- | ------------------- | ------- |
| **cocoapods** | `pod` | CocoaPods dependency manager |
| **Operating System** | `brew` | Homebrew package manager |

### Windows Only

| Language / Platform | Additional Commands | Purpose |
| ------------------------------------- | ------------------- | ------- |
| **.NET (C#)** | `nuget` | NuGet package manager |
| **Operating System** | `choco` | Chocolatey package manager |