---
position: 2
title: Getting Started with Development
---

# Getting Started (Development)

This is a comprehensive guide to contributing for developers of all experience level.

## Setting up the Development Environment

Here are steps to clone and run cdxgen locally.

Clone `CycloneDX/cdxgen` project repository.

```bash
git clone https://github.com/CycloneDX/cdxgen
cd cdxgen

corepack enable pnpm
pnpm install --config.strict-dep-builds=true
pnpm test
```

## devenv setup

Install devenv by following the official [instructions](https://devenv.sh/getting-started/).

```shell
devenv shell
pnpm test
```

### Language-specific profile

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

### Tasks

```shell
devenv tasks run pr:prepare
devenv tasks run pnpm:outdated
```
