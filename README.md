[![Build Status](https://travis-ci.org/CycloneDX/cyclonedx-node-module.svg?branch=master)](https://travis-ci.org/CycloneDX/cyclonedx-node-module)
[![License](https://img.shields.io/badge/license-Apache%202.0-brightgreen.svg)][License]


CycloneDX Node.js Module
=========

The CycloneDX module for Node.js creates a valid CycloneDX bill-of-material document containing an aggregate of all project dependencies. CycloneDX is a lightweight BoM specification that is easily created, human readable, and simple to parse. The resulting bom.xml can be used with tools such as [OWASP Dependency-Track](https://dependencytrack.org/) for the continuous analysis of components.

Usage
-------------------

#### Installing

```bash
npm install -g @cyclonedx/bom
```

#### Getting Help
```bash
$ bom -h
Usage:  bom [OPTIONS] [path]
Options:
  -h        - this help
  -a <path> - merge in additional modules from other scanner
  -o <path> - write to file instead of stdout

```

#### Example
```bash
bom -o bom.xml
```

License
-------------------

Permission to modify and redistribute is granted under the terms of the Apache 2.0 license. See the [LICENSE] file for the full license.

[License]: https://github.com/CycloneDX/cyclonedx-node-module/blob/master/LICENSE
