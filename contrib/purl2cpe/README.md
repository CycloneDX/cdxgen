# purl2cpe

Contains scripts to create purl2cpe database from [scanoss](https://github.com/scanoss/purl2cpe)

## Usage

Have a scheduled workflow to execute this script on a daily basis

```
bash build.sh
```

purl2cpe.db would then be copied to the root directory of cdxgen

Alternatively, download the pre-built database using [ORAS cli](https://oras.land/cli/)

```
oras pull ghcr.io/appthreat/purl2cpe:v1
```
