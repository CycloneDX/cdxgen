[![Build Status](https://github.com/CycloneDX/cyclonedx-node-module/workflows/Node%20CI/badge.svg)](https://github.com/CycloneDX/cyclonedx-node-module/actions?workflow=Node+CI)
[![License](https://img.shields.io/badge/license-Apache%202.0-brightgreen.svg)][License]
[![Latest](
https://img.shields.io/npm/v/@cyclonedx/bom)](https://www.npmjs.com/package/@cyclonedx/bom)
[![Website](https://img.shields.io/badge/https://-cyclonedx.org-blue.svg)](https://cyclonedx.org/)
[![Slack Invite](https://img.shields.io/badge/Slack-Join-blue?logo=slack&labelColor=393939)](https://cyclonedx.org/slack/invite)
[![Group Discussion](https://img.shields.io/badge/discussion-groups.io-blue.svg)](https://groups.io/g/CycloneDX)
[![Twitter](https://img.shields.io/twitter/url/http/shields.io.svg?style=social&label=Follow)](https://twitter.com/CycloneDX_Spec)

CycloneDX Node.js Module
=========

The CycloneDX module for Node.js creates a valid CycloneDX Software Bill-of-Materials (SBOM) containing an aggregate of all project dependencies. CycloneDX is a lightweight SBOM specification that is easily created, human and machine readable, and simple to parse.

Requirements
-------------------
Node.js v12.0.0 or higher

Usage
-------------------

#### Installing

```bash
npm install -g @cyclonedx/bom
```

#### Getting Help
```bash
$ cyclonedx-bom -h
Usage: cyclonedx-bom [OPTIONS] [path]

Creates CycloneDX Software Bill-of-Materials (SBOM) from Node.js projects

Options:
  -v, --version              output the version number
  -d, --include-dev          Include devDependencies (default: false)
  -l, --include-license-text Include full license text (default: false)
  -o, --output <output>      Write BOM to file (default: "bom.xml")
  -t, --type <type>          Project type (default: "library")
  -ns, --no-serial-number    Do not include BOM serial number
  -h, --help                 display help for command
```

#### Example (default: XML)
```bash
cyclonedx-bom
```

#### Example (XML)
```bash
cyclonedx-bom -o bom.xml
```

#### Example (JSON)
```bash
cyclonedx-bom -o bom.json
```

## Usage with docker

Run `cyclonedx/cyclonedx-node` docker image inside your project folder using:

```bash
docker run --rm \
  -v "$PWD":/src \
  -w /src \
  cyclonedx/cyclonedx-node -o /src/bom.xml
```

All options explained above are supported.


## CycloneDX Schema Support

The following table provides information on the version of this node module, the CycloneDX schema version supported, 
as well as the output format options. Use the latest possible version of this node module that is the compatible with 
the CycloneDX version supported by the target system. Or use the [CycloneDX CLI Tool](https://github.com/CycloneDX/cyclonedx-cli/)
to convert to older specification versions as required.

| Version | Schema Version | Format(s) |
| ------- | ----------------- | --------- |
| 3.0.x | CycloneDX v1.3 | XML/JSON |
| 2.0.x | CycloneDX v1.2 | XML/JSON |
| 1.1.x | CycloneDX v1.1 | XML |
| 1.0x | CycloneDX v1.0 | XML |

Copyright & License
-------------------

CycloneDX Node Module is Copyright (c) OWASP Foundation. All Rights Reserved.

Permission to modify and redistribute is granted under the terms of the Apache 2.0 license. See the [LICENSE] file for the full license.

[License]: https://github.com/CycloneDX/cyclonedx-node-module/blob/master/LICENSE
