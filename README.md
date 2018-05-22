[![Build Status](https://travis-ci.org/CycloneDX/cyclonedx-node-module.svg?branch=master)](https://travis-ci.org/CycloneDX/cyclonedx-node-module)
[![License](https://img.shields.io/badge/license-Apache%202.0-brightgreen.svg)][Apache 2.0]


CycloneDX Node.js Module
=========

The CycloneDX module for Node.js creates a valid CycloneDX bill-of-material document containing an aggregate of all project dependencies. CycloneDX is a lightweight BoM specification that is easily created, human readable, and simple to parse. The resulting bom.xml can be used with tools such as [OWASP Dependency-Track](https://dependencytrack.org/) for the continuous analysis of components.

Usage
-------------------

```bash
npm install -g cyclonedx-bom
cyclone-dx [path]
```

The BOM is printed to stdout. If no path is given, it defaults to the current directory.

License
-------------------

Permission to modify and redistribute is granted under the terms of the Apache 2.0 license. See the [LICENSE] [Apache 2.0] file for the full license.

[LICENSE]: https://github.com/CycloneDX/cyclonedx-node-module/blob/master/LICENSE
