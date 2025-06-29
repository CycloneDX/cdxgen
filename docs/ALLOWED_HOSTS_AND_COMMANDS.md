| Language / Platform                   | Project Types                                                                  | Allowed Commands | Remote Hosts Typically Accessed                 |
| ------------------------------------- | ------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------- |
| **Node.js** | `npm`, `pnpm`, `nodejs`, `js`, `javascript`, `typescript`, `ts`, `tsx`, `yarn`, `rush` | `npm`, `pnpm`, `yarn`, `rush`, `ldd` | `registry.npmjs.org` |
| **Node.js (Specific version)** | `node8`, `node10`, `node12`, `node14`, `node16`, `node18`, `node20`, `node22`, `node23`, `nodejs8`, `nodejs10`, `nodejs12`, `nodejs14`, `nodejs16`, `nodejs18`, `nodejs20`, `nodejs22`, `nodejs23` | `npm`, `pnpm`, `yarn`, `rush`, `ldd` | `registry.npmjs.org` |
| **Java (Default)** | `java`, `groovy`, `kotlin`, `scala`, `jvm`, `gradle`, `mvn`, `maven`, `sbt`, `quarkus`, `mill` | `mvn`, `gradle`, `sbt`, `ldd` | `*.maven.org` |
| **Java (Specific version)** | `java8`, `java11`, `java17`, `java21`, `java22`, `java23`, `java24` | `mvn`, `gradle`, `sbt`, `ldd` | `*.maven.org` |
| **Android** | `android`, `apk`, `aab` | `ldd` | Usually none |
| **JAR** | `jar` | `ldd` | Usually none |
| **JAR (Gradle Cache)** | `gradle-index`, `gradle-cache` | `ldd` | Usually none |
| **JAR (SBT Cache)** | `sbt-index`, `sbt-cache` | `ldd` | Usually none |
| **JAR (Maven Cache)** | `maven-index`, `maven-cache`, `maven-repo` | `ldd` | Usually none |
| **Python (Default)** | `python`, `py`, `pypi`, `uv`, `pip`, `poetry`, `pdm`, `hatch` | `pip`, `poetry`, `uv`, `ldd` | `pypi.org` |
| **Python (Specific version)** | `python36`, `python38`, `python39`, `python310`, `python311`, `python312` | `pip`, `poetry`, `uv`, `ldd` | `pypi.org` |
| **Golang** | `go`, `golang` | `go`, `ldd` | `pkg.go.dev`, `proxy.golang.org` |
| **Rust** | `rust`, `rust-lang`, `cargo` | `cargo`, `ldd` | `crates.io` |
| **Ruby** | `ruby`, `gems`, `rubygems`, `bundler`, `rb`, `gemspec` | `bundle`, `ldd` | `rubygems.org` |
| **Ruby (Specific version)** | `ruby*` (Example: ruby2.5.4, ruby3.4.0) | `bundle`, `ldd` | `rubygems.org` |
| **cocoapods** | `cocoa`, `ios`, `objective-c` | `ldd` | Usually none |
| **PHP** | `php`, `composer` | `composer`, `ldd` | Usually none *(add `api.github.com` if using packages that fetch from GitHub)* |
| **.NET (#C)** | `csharp`, `netcore`, `dotnet`, `vb`, `dotnet-framework` | `dotnet`, `ldd` | `nuget.org` *(add `api.github.com` if using packages that fetch from GitHub)* |
| **Dart** | `dart`, `flutter`, `pub` | `pub`, `ldd` | `pub.dev` |
| **Haskell** | `haskell`, `hackage`, `cabal` | `cabal`, `ldd` | Usually none |
| **Elixir** | `elixir`, `hex`, `mix` | `mix`, `ldd` | Usually none |
| **C++** | `c`, `cpp`, `c++`, `conan` | `conan`, `cmake`, `ldd` | Usually none |
| **Clojure** | `clojure`, `edn`, `clj`, `leiningen` | `clj`, `lein`, `ldd` | Usually none |
| **GitHub Actions** | `github`, `actions` | `ldd` | Usually none |
| **Operation System (OS)** | `os`, `osquery`, `windows`, `linux`, `mac`, `macos`, `darwin` | `osquery`, `dpkg`, `rpm`, `apk` | Usually none |
| **Jenkins Plugins** | `jenkins` | `ldd` | Usually none |
| **Helm** | `helm`, `charts` | `helm`, `ldd` | Usually none |
| **Helm (Cache)** | `helm-index`, `helm-repo` | `helm`, `ldd` | Usually none |
| **Container** | `oci`, `docker`, `podman`, `container` | `docker`, `podman`, `ldd`, `dpkg`, `rpm`, `apk` | Usually none |
| **Container File** | `universal`, `containerfile`, `docker-compose`, `dockerfile`, `swarm`, `tekton`, `kustomize`, `operator`, `skaffold`, `kubernetes`, `openshift`, `yaml-manifest` | `ldd` | Usually none |
| **Google Cloud Build** | `cloudbuild` | `ldd` | Usually none |
| **Swift (iOS)** | `swift` | `swift`, `ldd` | Usually none *(add `api.github.com` if using packages that fetch from GitHub)* |
| **Binary** | `binary`, `blint` | `ldd` | Usually none |
| **Open API** | `yaml-manifest` | `ldd` | Usually none |