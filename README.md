CycloneDX Generator
=========

This script creates a valid CycloneDX Software Bill-of-Materials (SBOM) containing an aggregate of all project dependencies for node.js, python and java projects. CycloneDX is a lightweight SBOM specification that is easily created, human and machine readable, and simple to parse.

This is a fork of [cyclonedx-node-module](https://github.com/CycloneDX/cyclonedx-node-module)

Usage
-------------------

#### Installing

```bash
npm install -g @appthreat/cdxgen
```

#### Getting Help
```bash
$ cdxgen -h
Usage:  cdxgen [OPTIONS] [path]
Options:
  -h        - this help
  -o <path> - write to file instead of stdout
  -d        - include devDependencies
  --version - print version number
```

#### Example
```bash
cdxgen -o bom.xml
```

License
-------------------

Permission to modify and redistribute is granted under the terms of the Apache 2.0 license. See the [LICENSE] file for the full license.

[License]: https://github.com/AppThreat/cdxgen/blob/master/LICENSE
