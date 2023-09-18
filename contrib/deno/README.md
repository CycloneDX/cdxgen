# Introduction

This folder demonstates the use of cdxgen as a library with [deno](https://deno.land)

## Installation

Install deno by following the [instructions](https://deno.land/manual@v1.34.3/getting_started/installation) for your OS

## Usage

```shell
cd contrib/deno
deno run --allow-read --allow-env --allow-run --allow-sys=uid,systemMemoryInfo,gid --allow-write --allow-net main.ts <path to repo>
```
