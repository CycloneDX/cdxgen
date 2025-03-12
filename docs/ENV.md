# Configuration

The following environment variables are available to configure the bom generation behavior.

## General

These variables are used either by cdxgen itself or by multiple scanners.

| Variable                                    | Description                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASTGEN_IGNORE_DIRS                          | Comma-separated list of directories to ignore during abstract syntax tree (AST) generation. Defaults to a predefined list such as `venv` to avoid unnecessary parsing of certain directories.                                               |
| ASTGEN_IGNORE_FILE_PATTERN                  | Ignore regex to use                                                                                                                                                                                                                         |
| CDXGEN_DEBUG_MODE                           | Set to `debug` to enable debug messages. Set to `verbose` to also enable the think mode.                                                                                                                                                    |
| CDXGEN_IN_CONTAINER                         | Set to `true` to indicate that the process is running inside a containerized environment. Affects the configuration of certain container-specific settings and optimizations.                                                               |
| CDXGEN_MAX_BUFFER                           | Max buffer for stdout and stderr. Defaults to 100MB                                                                                                                                                                                         |
| CDXGEN_PLUGINS_DIR                          | Defines the directory where cdxgen plugins are stored. If not set, defaults to an empty value, and a global node_modules path is used if available.                                                                                         |
| CDXGEN_REPL_HISTORY                         | Specifies the path to save REPL command history. If not set and the default directory does not exist, REPL history will not be saved.                                                                                                       |
| CDXGEN_SERVER_TIMEOUT_MS                    | Default timeout in server mode                                                                                                                                                                                                              |
| CDXGEN_TEMP_DIR                             | Specifies the parent temporary directory used for storing intermediate files during SBOM generation. The directory is automatically cleaned up after the process completes.                                                                 |
| CDXGEN_THOUGHT_LOG                          | To log cdxgen's internal thinking to a log file, set the environment variable `CDXGEN_THINK_MODE` and define `CDXGEN_THOUGHT_LOG` with the desired file path. Without `CDXGEN_THOUGHT_LOG`, cdxgen defaults to logging to `process.stdout`. |
| CDXGEN_TIMEOUT_MS                           | Default timeout for known execution involving maven, gradle or sbt                                                                                                                                                                          |
| FETCH_LICENSE                               | Set this variable to `true` or `1` to fetch license information from the registry. npm and golang                                                                                                                                           |
| GITHUB_TOKEN                                | Specify GitHub token to prevent traffic shaping while querying license and repo information                                                                                                                                                 |
| GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE | Specifies the namespace for HTTP_PROXY variable usage. If not set by the user, it defaults to an empty string to support standard HTTP proxy configurations.                                                                                |
| JAVA8_TOOL                                  | Specifies the Java 8 toolchain version to use. Defaults to `8.0.432-tem` if not explicitly set. Can be overridden to point to a custom Java 8 version.                                                                                      |
| JAVA11_TOOL                                 | Specifies the Java 11 toolchain version to use. Defaults to `11.0.25-tem` if not explicitly set. Can be overridden to point to a custom Java 11 version.                                                                                    |
| JAVA17_TOOL                                 | Specifies the Java 17 toolchain version to use. Defaults to `17.0.14-tem` if not explicitly set. Can be overridden to point to a custom Java 17 version.                                                                                    |
| JAVA21_TOOL                                 | Specifies the Java 21 toolchain version to use. Defaults to `21.0.6-tem` if not explicitly set. Can be overridden to point to a custom Java 21 version.                                                                                     |
| JAVA22_TOOL                                 | Specifies the Java 22 toolchain version to use. Defaults to `22.0.2-tem` if not explicitly set. Can be overridden to point to a custom Java 22 version.                                                                                     |
| JAVA23_TOOL                                 | Specifies the Java 23 toolchain version to use. Defaults to `23.0.2-tem` if not explicitly set. Can be overridden to point to a custom Java 23 version.                                                                                     |
| NODE_NO_READLINE                            | Set to `1` to disable canonical terminal settings and enable custom readline behavior for Node.js REPL or command-line tools.                                                                                                               |
| SBOM_SIGN_ALGORITHM                         | Signature algorithm. Some valid values are RS256, RS384, RS512, PS256, PS384, PS512, ES256 etc                                                                                                                                              |
| SBOM_SIGN_PRIVATE_KEY                       | Private key to use for signing                                                                                                                                                                                                              |
| SBOM_SIGN_PUBLIC_KEY                        | Optional. Public key to include in the SBOM signature                                                                                                                                                                                       |
| SDKMAN_VERSION                              | Specifies the version of SDKMAN to use. Useful for managing SDKs and ensuring compatibility with tools and environments.                                                                                                                    |
| SEARCH_MAVEN_ORG                            | If maven metadata is missing in jar file, a search is performed on search.maven.org. Set to `false` or `0` to disable search. (defaults to `true`)                                                                                          |

## Specific environment variables

These variables are specifically for a single language or tool.

### Bazel

| Variable                 | Description                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| BAZEL_ARGS               | Additional arguments for Bazel command. Eg: --bazelrc=bazelrc.remote                                                |
| BAZEL_STRIP_MAVEN_PREFIX | Strip Maven group prefix (e.g. useful when private repo is used, defaults to `/maven2/`)                            |
| BAZEL_TARGET             | Bazel target to build. Default :all (Eg: //java-maven)                                                              |
| BAZEL_USE_ACTION_GRAPH   | SBOM for specific Bazel target, uses `bazel aquery 'outputs(".*.jar", deps(<BAZEL_TARGET>))'` (defaults to `false`) |

### Clojure

| Variable | Description                             |
| -------- | --------------------------------------- |
| CLJ_CMD  | Set to override the clojure cli command |

### Cocoa

| Variable                                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| COCOA_EXCLUDED_TARGETS                  | Comma-separated list of targets to exclude from resolution of dependencies. If a target has nested targets, these are also excluded. For excluding only those nested targets, use a `/` to describe the target, eg `target/subtarget/subsubtarget` -- this excludes only `subsubtarget` from the resolution.                                                                                                                                                                                                                         |
| COCOA_FULL_SCAN                         | Whether or not to do a full (deep) scan of the pods. This requires CocoaPods to be installed and runnable from the `PATH`. When set to `false` or `0`, only the most basic of information will be gathered (name, version, purl and, if applicable, sub-spec) -- can be useful if run on Windows. Defaults to `true`.                                                                                                                                                                                                                |
| COCOA_INCLUDED_TARGETS                  | Comma-separated list of target to include for resolution of dependencies. Usage is the same as `COCOA_EXCLUDED_TARGETS` above.                                                                                                                                                                                                                                                                                                                                                                                                       |
| COCOA_MERGE_SUBSPECS                    | Should all sub-specs (and their dependencies) be merged into the root spec. This can be useful if you are importing your SBOM into a tool that doesn't handle sub-specs as separate dependencies (eg dependency-track). Defaults to `true`.                                                                                                                                                                                                                                                                                          |
| COCOA_PODSPEC_JSON_REPLACEMENTS         | Comma-separated list of 'text_to_find=replacement'. This can be used if you have local pods in JSON format that are not (correctly) parsable by the `pod ipc spec`-command, eg because some variables or functions would be inserted by the `Podfile` -- users of react-native / expo might need this. This will be interpreted as a `regex` if the 'text_to_find' is both prefixed and suffixed with a `/` and then references like `$1` can be used in the 'replacement'. To find or insert a newline, use the String `<NEWLINE>`. |
| COCOA_PODSPEC_REPLACEMENTS              | Similar to `COCOA_PODSPEC_JSON_REPLACEMENTS`, but for local pods that are in the 'podspec' format.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| COCOA_RESOLVE_FROM_NODE                 | If some of your local pods are included from node (eg when using expo or react-native), they will be resolved as such. If you don't want this, set this to `false`.                                                                                                                                                                                                                                                                                                                                                                  |
| COCOA_RESOLVE_FROM_NODE_EXCLUSION_DIRS  | If `COCOA_RESOLVE_FROM_NODE` is used, this can be used to exclude certain directories from resolving the node modules. Both full and partial paths can be used.                                                                                                                                                                                                                                                                                                                                                                      |

### Docker

| Variable              | Description                                                                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOCKER_AUTH_CONFIG    | Perform docker login prior to invoking cdxgen. The file $HOME/.docker/config.json would be automatically read if available. Base64 encoded (json) with credentials: `{'username': string, 'password': string, 'email': string, 'serveraddress' : string}`. Alternatively, set the below 4 environment variables. |
| DOCKER_CERT_PATH      | Path to the certs directory containing cert.pem and key.pem                                                                                                                                                                                                                                                      |
| DOCKER_CMD            | Override docker command. Use with nerdctl or podman                                                                                                                                                                                                                                                              |
| DOCKER_CONFIG         | Alternative path to $HOME/.docker                                                                                                                                                                                                                                                                                |
| DOCKER_EMAIL          | Docker email                                                                                                                                                                                                                                                                                                     |
| DOCKER_HOST           | Docker host. For tcp and ssh hosts, docker cli would be used to pull the image                                                                                                                                                                                                                                   |
| DOCKER_PASSWORD       | Docker password                                                                                                                                                                                                                                                                                                  |
| DOCKER_SERVER_ADDRESS | Docker server address                                                                                                                                                                                                                                                                                            |
| DOCKER_TLS_VERIFY     | Set to empty value to disable tls for insecure registries                                                                                                                                                                                                                                                        |
| DOCKER_USER           | Docker username                                                                                                                                                                                                                                                                                                  |

### Go

| Variable     | Description                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| GO_FETCH_VCS | Set this variable to `true` or `1` to fetch vcs url from pkg.go.dev. For golang                                             |
| GO_PKG_URL   | Override Go pkg URL. Default: https://pkg.go.dev/                                                                           |
| USE_GOSUM    | Set to `true` or `1` to generate BOMs for golang projects using go.sum as the dependency source of truth, instead of go.mod |

### Gradle

| Variable                        | Description                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GRADLE_ARGS                     | Set to pass additional arguments such as profile or settings to gradle (all tasks). Eg: `--init-script <your-script>.gradle`                                                                                                                                                                                                        |
| GRADLE_ARGS_DEPENDENCIES        | Set to pass additional arguments only to the `gradle dependencies` task, used for listing actual project dependencies. Eg: `--configuration runtimeClassPath`                                                                                                                                                                       |
| GRADLE_ARGS_PROPERTIES          | Set to pass additional arguments only to the `gradle properties` task, used for collecting metadata about the project.                                                                                                                                                                                                              |
| GRADLE_CACHE_DIR                | Specify gradle cache directory. Useful for class name resolving                                                                                                                                                                                                                                                                     |
| GRADLE_CMD                      | Set to override gradle command                                                                                                                                                                                                                                                                                                      |
| GRADLE_DEPENDENCY_TASK          | By default cdxgen use the task "dependencies" to collect packages. Set to override the task name.                                                                                                                                                                                                                                   |
| GRADLE_HOME                     | Specify gradle home                                                                                                                                                                                                                                                                                                                 |
| GRADLE_INCLUDED_BUILDS          | Comma-separated list of 'includedBuilds' modules that should be scanned on top of all the modules of your projects. Use this to override the auto-detected values. Use gradle-conventions (include the ':'-prefix) for the names.                                                                                                   |
| GRADLE_MULTI_PROJECT_MODE       | Unused. Automatically handled                                                                                                                                                                                                                                                                                                       |
| GRADLE_RESOLVE_FROM_NODE        | If some of your gradle modules are included from node (eg when using expo or react-native), they will be resolved as such. If you don't want this, set this to `false`.                                                                                                                                                             |
| GRADLE_SKIP_MODULE_DEPENDENCIES | Comma-separated list of modules to skip during the "dependencies" task. This can be useful if you have modules that would fail the gradle build, eg when they do not have dependencies in the given configuration. Use "root" if the top most module should be skipped, use their gradle-name (so WITH leading ":") for all others. |
| GRADLE_SKIP_MODULES             | Comma-separated list of modules to skip for both "properties" and "dependencies" task. Use the gradle-name (so WITH leading ":"). NOTICE: when using this, neither the configured ID (group, name & version) nor the dependencies of these modules will be available!                                                               |
| GRADLE_USER_HOME                | Specifies the directory for the Gradle user home, which typically contains cache files, build dependencies, and other configuration files used by Gradle.                                                                                                                                                                           |

### Maven

| Variable                     | Description                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ANDROID_MAVEN_URL            | Specify URL of Android Maven Repository for metadata fetching (e.g. when private repo is used)                                                        |
| CDX_MAVEN_PLUGIN             | CycloneDX Maven plugin to use. Default "org.cyclonedx:cyclonedx-maven-plugin:2.9.1"                                                                   |
| CDX_MAVEN_GOAL               | CycloneDX Maven plugin goal to use. Default makeAggregateBom. Other options: makeBom, makePackageBom                                                  |
| CDX_MAVEN_INCLUDE_TEST_SCOPE | Whether test scoped dependencies should be included from Maven projects, Default: true                                                                |
| MAVEN_CENTRAL_URL            | Specify URL of Maven Central for metadata fetching (e.g. when private repo is used)                                                                   |
| MAVEN_HOME                   | Specify maven home                                                                                                                                    |
| MVN_ARGS                     | Set to pass additional arguments such as profile or settings to maven                                                                                 |
| MVN_CMD                      | Set to override maven command                                                                                                                         |
| PREFER_MAVEN_DEPS_TREE       | Use maven `dependency:tree` command instead of the cyclonedx maven plugin. Defaults to true from v11. Set to false to use the cyclonedx-maven-plugin. |

### NodeJS

| Variable                 | Description                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CDXGEN_NODE_OPTIONS      | Addtional, NODE_OPTIONS to pass to the node runtime dynamically.                                                                                       |
| GLOBAL_NODE_MODULES_PATH | Specifies the path to the global `node_modules` directory. Used when a local plugins directory is not provided.                                        |
| NODE_OPTIONS             | If you are experiencing Out Of Memory issues, consider increase the node heap (ie: `--max-old-space-size=8192`)                                        |
| NPM_INSTALL_ARGS         | Set to pass additional arguments such as `--package-lock` or `--legacy-peer-deps` to the npm install command                                           |
| NPM_INSTALL_COUNT        | Limit the number of automatic npm install to this count. Default: 2. Since cdxgen 11.0.5                                                               |
| NPM_URL                  | Override NPM registry URL. Default: https://registry.npmjs.org/                                                                                        |
| NVM_DIR                  | Defines the directory where Node Version Manager (NVM) is installed. Used to locate and manage Node.js versions in environments where NVM is utilized. |

### Nuget

| Variable  | Description                                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NUGET_URL | Override NuGet URL. Default is URL from registration hive "RegistrationsBaseUrl/3.6.0" at NuGet V3 API (https://api.nuget.org/v3/index.json). See more at https://learn.microsoft.com/en-us/nuget/api/registration-base-url-resource/ |

### Pip

| Variable         | Description                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PIP_INSTALL_ARGS | Provides additional arguments for `pip install` commands, such as `--python-version`, `--ignore-requires-python`, and `--no-warn-conflicts`. Useful for custom Python dependency installations. |
| PIP_TARGET       | Specifies the target directory for pip installations, often used when dependencies are installed into temporary or isolated directories.                                                        |
| PYPI_URL         | Override PyPi URL. Default: https://pypi.org/pypi/                                                                                                                                              |

### Ruby

| Variable            | Description                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUNDLE_INSTALL_ARGS | Additional arguments to pass to bundle install command. Example: `--redownload` or `--without=test`                                                                                                                                                               |
| BUNDLE_UPDATE_ARGS  | Additional arguments to pass to bundle update command.                                                                                                                                                                                                            |
| CDXGEN_GEM_HOME     | Customize the GEM_HOME directory to use, while collecting the module names for all the gems in deep mode. This could be different from the system gems directory too. Can be used in addition to `GEM_PATH` environment variable too to improve the success rate. |
| RBENV_CMD           | rbenv command to use                                                                                                                                                                                                                                              |
| RBENV_ROOT          | Set the rbenv root directory for custom rbenv installations.                                                                                                                                                                                                      |

### Rust

| Variable        | Description                                                         |
| --------------- | ------------------------------------------------------------------- |
| RUST_CRATES_URL | Override Rust Crates URL. Default: https://crates.io/api/v1/crates/ |

### sbt

| Variable      | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| SBT_CACHE_DIR | Specify sbt cache directory. Useful for class name resolving |

### Swift

| Variable                  | Description                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SWIFT_COMPILER_ARGS       | Full compiler arguments string to use for semantic analysis. Eg: -sdk <path> -F <path> -Xcc -I <path>                                                                                      |
| SWIFT_COMPILER_EXTRA_ARGS | Extra compiler arguments to add to the auto-detected string. Eg: -suppress-warnings -track-system-dependencies                                                                             |
| SWIFT_SDK_ARGS            | Swift sdk arguments. Eg: -sdk <path>                                                                                                                                                       |
| SWIFT_PACKAGE_ARGS        | Additional arguments to pass to the swift package command. The values gets inserted before the 'show-dependencies' sub-command. Example: --swift-sdks-path <swift-sdks-path> --jobs <jobs> |
