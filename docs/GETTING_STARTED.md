---
position: 2
title: Getting Started with Development
---

# Getting Started (Development)

This is a comprehensive guide to contributing for developers of all experience level.

## Setting up the Development Environment
Here are steps to download and run cdxgen software.

Clone `CycloneDX/cdxgen` project repository.

```bash
git clone https://github.com/CycloneDX/cdxgen
cd cdxgen
```

## devenv setup

Install devenv by following the official [instructions](https://devenv.sh/getting-started/).

```shell
devenv shell
pnpm run test
```

Language-specific profile:

```shell
# Ruby environment
devenv --option config.profile:string ruby shell

# dotnet environment
devenv --option config.profile:string dotnet shell

# android environment
devenv --option config.profile:string android shell

# flutter environment
devenv --option config.profile:string flutter shell
```