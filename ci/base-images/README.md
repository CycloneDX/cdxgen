# Introduction

Custom language specific base images contributed by AppThreat from this [repo](https://github.com/AppThreat/base-images).

## Custom Container Images

Below table summarizes all available container image versions. These images include additional language-specific build tools and development libraries to enable automatic restore and build operations.

| Language | Version                      | Container Image Tags                                                              | Comments                                                                                                                                  |
| -------- | ---------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Java     | 23                           | ghcr.io/cyclonedx/cdxgen:master                                                   | Default all-in-one container image with all the latest and greatest tools with Node 23 runtime. Permission model is opt-in.               |
| Java     | 23                           | ghcr.io/cyclonedx/cdxgen-deno:master                                              | Default all-in-one container image with all the latest and greatest tools with deno runtime. Uses deno permissions model by default.      |
| Java     | 23                           | ghcr.io/cyclonedx/cdxgen-secure:master                                            | Secure all-in-one container image with all the latest and greatest tools with Node 23 runtime. Uses Node.js permissions model by default. |
| Java     | 11                           | ghcr.io/cyclonedx/cdxgen-java11-slim:v11, ghcr.io/cyclonedx/cdxgen-java11:v11     | Java 11 version with and without Android 33 SDK.                                                                                          |
| Java     | 17                           | ghcr.io/cyclonedx/cdxgen-java17-slim:v11, ghcr.io/cyclonedx/cdxgen-java17:v11     | Java 17 version with and without Android 34 SDK.                                                                                          |
| Dotnet   | .Net Framework 4.6 - 4.8     | ghcr.io/cyclonedx/cdxgen-debian-dotnet6:v11                                       | .Net Framework                                                                                                                            |
| Dotnet   | .Net Core 2.1, 3.1, .Net 5.0 | ghcr.io/cyclonedx/cdxgen-debian-dotnet6:v11                                       | Invoke with --platform=linux/amd64 for better compatibility.                                                                              |
| Dotnet   | .Net 6                       | ghcr.io/cyclonedx/cdxgen-debian-dotnet6:v11                                       | .Net 6                                                                                                                                    |
| Dotnet   | .Net 7                       | ghcr.io/cyclonedx/cdxgen-dotnet7:v11                                              | .Net 7                                                                                                                                    |
| Dotnet   | .Net 8                       | ghcr.io/cyclonedx/cdxgen-debian-dotnet8:v11, ghcr.io/cyclonedx/cdxgen-dotnet8:v11 | .Net 8                                                                                                                                    |
| Dotnet   | .Net 9                       | ghcr.io/cyclonedx/cdxgen-debian-dotnet9:v11, ghcr.io/cyclonedx/cdxgen-dotnet9:v11 | .Net 9                                                                                                                                    |
| Python   | 3.6                          | ghcr.io/cyclonedx/cdxgen-python36:v11                                             | No dependency tree                                                                                                                        |
| Python   | 3.9                          | ghcr.io/cyclonedx/cdxgen-python39:v11                                             |                                                                                                                                           |
| Python   | 3.10                         | ghcr.io/cyclonedx/cdxgen-python310:v11                                            |                                                                                                                                           |
| Python   | 3.11                         | ghcr.io/cyclonedx/cdxgen-python311:v11                                            |                                                                                                                                           |
| Python   | 3.12                         | ghcr.io/cyclonedx/cdxgen-python312:v11                                            |                                                                                                                                           |
| Node.js  | 20                           | ghcr.io/cyclonedx/cdxgen-node20:v11                                               | Use `--platform=linux/amd64` in case of `npm install` errors.                                                                             |
| Node.js  | 23                           | ghcr.io/cyclonedx/cdxgen:master                                                   | Supports automatic node installation. Example: Pass `-t node20` to install node 20.                                                       |
| Ruby     | 3.3.6                        | ghcr.io/cyclonedx/cdxgen-debian-ruby33:v11                                        | Supports automatic Ruby installation for 3.3.x. Example: Pass `-t ruby3.3.1` to install Ruby 3.3.1.                                       |
| Ruby     | 3.4.1                        | ghcr.io/cyclonedx/cdxgen-debian-ruby34:v11                                        | Supports automatic Ruby installation for 3.4.x. Example: Pass `-t ruby3.4.0` to install Ruby 3.4.0.                                       |
| Ruby     | 2.5.0                        | ghcr.io/cyclonedx/cdxgen-ruby25:v11                                               | Supports automatic Ruby installation for 2.5.x. Example: Pass `-t ruby2.5.1` to install Ruby 2.5.1.                                       |
| Ruby     | 2.6.10                       | ghcr.io/cyclonedx/cdxgen-debian-ruby26:v11                                        | Supports automatic Ruby installation for 2.6.x. Example: Pass `-t ruby2.6.1` to install Ruby 2.6.1.                                       |
| Ruby     | 1.8.x                        | ghcr.io/cyclonedx/debian-ruby18:master                                            | Base image for `bundle install` only. No cdxgen equivalent with Ruby 1.8.x. `--deep` mode and research profile unsupported.               |

Replace `:v11` with a release version tag or sha256 hash for fine-grained control over the image tag.

## cdxgen variants

### Legacy Java applications

The official cdxgen image bundles Java >= 23 with the latest maven and gradle. Legacy applications that rely on Java 11 can use the custom image `ghcr.io/cyclonedx/cdxgen-java11-slim:v11`. For Java 17, use `ghcr.io/cyclonedx/cdxgen-java17-slim:v11`.

Example invocations:

Java 11 version

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $HOME/.m2:$HOME/.m2 -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-java11-slim:v11 -r /app -o /app/bom.json -t java
```

Java 11 version with Android 33 SDK and gcc

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $HOME/.m2:$HOME/.m2 -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-java11:v11 -r /app -o /app/bom.json -t java
```

Java 8

Use the java 11 image but pass `-t java8`.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $HOME/.m2:$HOME/.m2 -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-java11-slim:v11 -r /app -o /app/bom.json -t java8
```

Java 17 version

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $HOME/.m2:$HOME/.m2 -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-java17-slim:v11 -r /app -o /app/bom.json -t java
```

Java 17 version with Android 34 SDK and gcc

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $HOME/.m2:$HOME/.m2 -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-java17:v11 -r /app -o /app/bom.json -t java
```

### .Net Framework, .Net Core 3.1, and .Net 6.0 applications

Use the custom image `ghcr.io/cyclonedx/cdxgen-dotnet6:v11`.

Example invocation:

.Net Framework 4.6 - 4.8

A bundled version of [nuget](./nuget/) and mono is used to support .Net framework apps.

```shell
docker run --rm --platform=linux/amd64 -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-debian-dotnet6:v11 -r /app -o /app/bom.json -t dotnet
```

Dotnet 3.1 or Dotnet 6.0 (debian)

```shell
docker run --rm --platform=linux/amd64 -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-debian-dotnet6:v11 -r /app -o /app/bom.json -t dotnet
```

Dotnet 7.0

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-dotnet7:v11 -r /app -o /app/bom.json -t dotnet
```

Dotnet 8.0

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-dotnet8:v11 -r /app -o /app/bom.json -t dotnet
```

Dotnet 8.0 (debian)

Use the debian version of the image in case of any crashes with the SLE version used by the image above.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-debian-dotnet8:v11 -r /app -o /app/bom.json -t dotnet
```

Dotnet 9.0

Dotnet 9 is also bundled with the official `ghcr.io/cyclonedx/cdxgen` image.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-dotnet9:v11 -r /app -o /app/bom.json -t dotnet
```

Dotnet 9.0 (debian)

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-debian-dotnet9:v11 -r /app -o /app/bom.json -t dotnet
```

## Including .NET Global Assembly Cache dependencies in the results

For `dotnet` and `dotnet-framework`, SBOM could include components without a version number. Often, these components begin with the prefix `System.`.

Global Assembly Cache (GAC) dependencies (System Runtime dependencies) must be made available in the build output of the project for version detection. A simple way to have the dotnet build copy the GAC dependencies into the build directory is to place the file `Directory.Build.props` into the root of the project and ensure the contents include the following:

```
<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
<ItemDefinitionGroup>
  <Reference>
    <Private>True</Private>
  </Reference>
</ItemDefinitionGroup>
</Project>
```

Then, run cdxgen cli with the `--deep` argument.

### Python applications

Use the custom image `ghcr.io/cyclonedx/cdxgen-python312:v11` or `ghcr.io/cyclonedx/cdxgen-python311:v11`. This includes additional build tools and libraries to build a range of Python applications. Construction of the dependency tree is supported with Python >= 3.9.

Example invocation:

Python 3.6 (Direct dependencies only without dependency tree)

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-python36:v11 -r /app -o /app/bom.json -t python
```

NOTE: dependency tree is unavailable with Python 3.6

Python 3.9

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-python39:v11 -r /app -o /app/bom.json -t python
```

Python 3.10

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-python310:v11 -r /app -o /app/bom.json -t python
```

Python 3.11

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-python311:v11 -r /app -o /app/bom.json -t python
```

Python 3.12

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-python312:v11 -r /app -o /app/bom.json -t python
```

### Node.js applications

Use the custom image `ghcr.io/cyclonedx/cdxgen-node20:v11`.

Node.js 20

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-node20:v11 -r /app -o /app/bom.json -t js
```

### Ruby applications

Use the custom image `ghcr.io/cyclonedx/cdxgen-debian-ruby34:v11`.

Ruby 3.3.6 (debian version)

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-debian-ruby33:v11 -r /app -o /app/bom.json -t ruby
```

Ruby 3.4.1 (debian version)

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-debian-ruby34:v11 -r /app -o /app/bom.json -t ruby
```

Ruby 2.6.0 (Debian version)

Use the custom image `ghcr.io/cyclonedx/cdxgen-debian-ruby26:v11`.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-debian-ruby26:v11 -r /app -o /app/bom.json -t ruby
```

Ruby 2.5.0 (SLE version)

Use the custom image `ghcr.io/cyclonedx/cdxgen-ruby25:v11`.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-ruby25:v11 -r /app -o /app/bom.json -t ruby
```

Pass any Ruby version with the type argument to make cdxgen automatically install the appropriate version using `rbenv` prior to BOM generation.

Example: Pass `-t ruby3.3.1` to install Ruby 3.3.1

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-debian-ruby34:v11 -r /app -o /app/bom.json -t ruby3.3.1
```

Working with Ruby 1.8 applications? We have a Ruby 1.8 image that uses `debian:jessie` as the base image. Unfortunately, we couldn't find a way to install nodejs >= 20 in jessie, so we need a split workflow:

1. Perform bundle install with our debian-ruby18 image.

```shell
docker run --rm -v /tmp:/tmp:rw -e GEM_HOME=/tmp/gems -v $(pwd):/app:rw -w /app -t ghcr.io/cyclonedx/debian-ruby18:master bundle install

# Optionally, pass any bundle install args to build those stubborn projects
# docker run --rm -v /tmp:/tmp:rw -e GEM_HOME=/tmp/gems -e "BUNDLE_INSTALL_ARGS=--without test" -v $(pwd):/app:rw -w /app -t ghcr.io/cyclonedx/debian-ruby18:master bundle install
```

2. Run cdxgen using ruby25 image.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -e CDXGEN_GEM_HOME=/tmp/gems -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-ruby25:v11 -r /app -o /app/bom.json -t ruby --lifecycle pre-build
```

Notice the use of `GEM_HOME` and `CDXGEN_GEM_HOME` environment variables. `--deep` mode is currently not supported for Ruby 1.8.

## Troubleshooting

### .Net restore crashes

We have observed the below error on Mac M series, while cdxgen attempts to perform a restore.

```text
Restore has failed. Check if dotnet is installed and available in PATH.
Authenticate with any private registries such as Azure Artifacts feed before running cdxgen.
 Fatal error. System.AccessViolationException: Attempted to read or write protected memory. This is often an indication that other memory is corrupt.
   at System.Collections.Immutable.ImmutableDictionary`2[[System.__Canon, System.Private.CoreLib, Version=8.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e],[System.__Canon, System.Private.CoreLib, Version=8.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e]].AddRange(System.Collections.Generic.IEnumerable`1<System.Collections.Generic.KeyValuePair`2<System.__Canon,System.__Canon>>, MutationInput<System.__Canon,System.__Canon>, KeyCollisionBehavior<System.__Canon,System.__Canon>)
```

A workaround could be to perform the `dotnet restore` using the official image, before using cdxgen-dotnet images.

```shell
docker run --rm -v /tmp:/tmp -v $(pwd):/app:rw -w /app -it mcr.microsoft.com/dotnet/sdk:8.0 dotnet restore
```

### .Net framework issues

Old .Net framework applications (<= 4.7) are well known for their dislike of linux and hence may not restore/build easily. To troubleshoot, try running the `nuget restore` command manually using the `bci-dotnet` image as shown.

```shell
docker run --rm -v /tmp:/tmp -v $(pwd):/app:rw -w /app -it ghcr.io/cyclonedx/bci-dotnet:master nuget restore -Verbosity detailed /app/<solution file name>
```

If you see any mono-related crashes, there isn't a lot that can be done other than using the correct version of Windows for the restore step.

### View the assemblies in the Global Assembly Cache

Assemblies that are present in the Global Assembly Cache can be referred to and used directly without specifying a version number. This style of includes is common with namespaces such as `System.`, `Microsoft.`, and `Mono.`. Use the command `gacutil -l` to [obtain](https://learn.microsoft.com/en-us/dotnet/framework/app-domains/how-to-view-the-contents-of-the-gac#view-the-assemblies-in-the-gac) the version details for libraries from GAC.

```shell
docker run --rm -v /tmp:/tmp -v $(pwd):/app:rw -w /app -it ghcr.io/cyclonedx/bci-dotnet:master gacutil -l
```

Sample output:

```text
System, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.ComponentModel.Composition, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.ComponentModel.DataAnnotations, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35
System.Configuration, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Configuration.Install, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Core, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Data, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Data.DataSetExtensions, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Data.Entity, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Data.Linq, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Data.OracleClient, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Data.Services, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Data.Services.Client, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Deployment, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Design, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.DirectoryServices, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.DirectoryServices.Protocols, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Drawing, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Drawing.Design, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Dynamic, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.EnterpriseServices, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.IO.Compression, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.IO.Compression.FileSystem, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.IdentityModel, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.IdentityModel.Selectors, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Json, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35
System.Json.Microsoft, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35
System.Management, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Messaging, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Net, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Net.Http, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Net.Http.Formatting, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35
System.Net.Http.WebRequest, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Numerics, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089
System.Numerics.Vectors, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a
System.Reactive.Core, Version=2.2.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35
```

### Testing arm64 from x64 machines

- Install [Rancher Desktop](https://rancherdesktop.io/) and setup [nerdctl](https://docs.rancherdesktop.io/tutorials/working-with-containers) instead of docker
- Setup multi-platform by following this [doc](https://github.com/containerd/nerdctl/blob/main/docs/multi-platform.md)

Include the below argument with the `nerdctl run` command.

```
--platform=linux/arm64
```

Example:

```shell
nerdctl run --rm --platform=linux/arm64 -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-node20:v11 -r /app -o /app/bom.json -t js
```

## License

MIT

## Useful links

- [Identifying .Net vs .Net Framework](https://learn.microsoft.com/en-us/dotnet/standard/frameworks)
