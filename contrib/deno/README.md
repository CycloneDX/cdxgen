# Introduction

This folder demonstrates the following:

- Using deno to develop and build cdxgen
- Using cdxgen as a library to build custom SBOM tool.

## Installation

Install deno by following the [instructions](https://docs.deno.com/runtime/manual/) for your OS

## Develop and build cdxgen

```shell
deno run --allow-read --allow-env --allow-run --allow-sys=uid,systemMemoryInfo,gid,homedir --allow-write --allow-net main.ts <path to repo>
```

### Produce native builds

Use the `exe` task.

```
deno task exe
```

## Use cdxgen as a library

Take a look at deps.ts and main.ts for a simple example that builds a cli tool on top of the npm package.
