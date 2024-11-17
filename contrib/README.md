# Useful scripts

## Validate SBOM using jsonschema

```shell
python bom-validate.py --json ../test/data/vuln-spring-1.5.bom.json
```

## Generate wrapdb releases

```shell
git clone https://github.com/mesonbuild/wrapdb --depth=1
cd wrapdb
python <path to cdxgen>/contrib/wrapdb.py
```

Copy the generated wrapdb-releases.json to the `data` directory.
