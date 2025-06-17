# Introduction

These are two different scripts to generate SBOMs for multiple git repos using cdxgen container images and testing cdxgen container images existance.

## Generate SBOMs script

### Usage

```shell
node index.js <csv file> <output directory>
```

### Example csv file

```
project,link,commit,image,language,cdxgen_vars
astro,https://github.com/withastro/astro.git,9d6bcdb88fcb9df0c5c70e2b591bcf962ce55f63,ghcr.io/cyclonedx/cdxgen-node20:v11,js,,
```

## Image existance script

### Usage

```shell
node image-avail.js <csv file>
```

### Example csv file

```
owner,repo,tag
cyclonedx,cdxgen,master,,
```