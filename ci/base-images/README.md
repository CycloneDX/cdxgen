# Introduction

Custom language specific base images contributed by AppThreat from this [repo](https://github.com/AppThreat/base-images).

## cdxgen variants

### Legacy Java applications

The official cdxgen image bundles Java >= 23 with the latest maven and gradle. Legacy applications that rely on Java 11 can use the custom image `ghcr.io/cyclonedx/cdxgen-java11-slim:v10`. For Java 17, use `ghcr.io/cyclonedx/cdxgen-java17-slim:v10`.

Example invocations:

Java 11 version

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $HOME/.m2:$HOME/.m2 -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-java11-slim:v11 -r /app -o /app/bom.json -t java
```

Java 11 version with Android 33 SDK and gcc

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $HOME/.m2:$HOME/.m2 -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-java11:v11 -r /app -o /app/bom.json -t java
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

Use the custom image `ghcr.io/cyclonedx/cdxgen-dotnet:v11`.

Example invocation:

.Net Framework 4.6 - 4.8

A bundled version of [nuget](./nuget/) and mono is used to support .Net framework apps.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-dotnet6:v11 -r /app -o /app/bom.json -t dotnet-framework
```

Dotnet 3.1 or Dotnet 6.0

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-dotnet6:v11 -r /app -o /app/bom.json -t dotnet
```

Dotnet 7.0

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-dotnet7:v11 -r /app -o /app/bom.json -t dotnet
```

Dotnet 8.0

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-dotnet8:v11 -r /app -o /app/bom.json -t dotnet
```

Dotnet 9.0

Dotnet 9 is also bundled with the official `ghcr.io/cyclonedx/cdxgen` image.

```shell
docker run --rm -e CDXGEN_DEBUG_MODE=debug -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-dotnet9:v11 -r /app -o /app/bom.json -t dotnet
```

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

## Troubleshooting

### .Net framework issues

Old .Net framework applications (<= 4.7) are well known for their dislike of linux and hence may not restore/build easily. To troubleshoot, try running the `nuget restore` command manually using the `bci-dotnet` image as shown.

```shell
docker run --rm -v /tmp:/tmp -v $(pwd):/app:rw -w /app -it ghcr.io/cyclonedx/bci-dotnet:main nuget restore -Verbosity detailed /app/<solution file name>
```

If you see any mono-related crashes, there isn't a lot that can be done other than using the correct version of Windows for the restore step.

### View the assemblies in the Global Assembly Cache

Assemblies that are present in the Global Assembly Cache can be referred to and used directly without specifying a version number. This style of includes is common with namespaces such as `System.`, `Microsoft.`, and `Mono.`. Use the command `gacutil -l` to [obtain](https://learn.microsoft.com/en-us/dotnet/framework/app-domains/how-to-view-the-contents-of-the-gac#view-the-assemblies-in-the-gac) the version details for libraries from GAC.

```shell
docker run --rm -v /tmp:/tmp -v $(pwd):/app:rw -w /app -it ghcr.io/cyclonedx/bci-dotnet:main gacutil -l
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
