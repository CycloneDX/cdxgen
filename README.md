[![shield_gh-workflow-test]][link_gh-workflow-test]
[![shield_npm-version]][link_npm]
[![shield_docker-version]][link_docker]
[![shield_license]][license_file]  
[![shield_website]][link_website]
[![shield_slack]][link_slack]
[![shield_groups]][link_discussion]
[![shield_twitter-follow]][link_twitter]

----

# CycloneDX Node.js Module

The CycloneDX module for Node.js creates a valid CycloneDX Software Bill-of-Materials (SBOM) containing an aggregate of all project dependencies. CycloneDX is a lightweight SBOM specification that is easily created, human and machine readable, and simple to parse.

## Requirements

Node.js v12.0.0 or higher

## Usage

### Installing

```sh
npm install -g @cyclonedx/bom
```

### Getting Help

```text
$ cyclonedx-node -h
Usage: cyclonedx-node [options] [path]

Creates CycloneDX Software Bill of Materials (SBOM) from Node.js projects

Arguments:
  path                        Path to analyze

Options:
  -v, --version               output the version number
  -d, --include-dev           Include devDependencies (default: false)
  -l, --include-license-text  Include full license text (default: false)
  -o, --output <output>       Write BOM to file (default: "bom.xml")
  -t, --type <type>           Project type (default: "library")
  -ns, --no-serial-number     Do not include BOM serial number
  -h, --help                  display help for command

Environment variable BOM_REPRODUCIBLE causes bom result to be more consistent
over multiple runs by omitting time/rand-based values, and sorting lists.
```

### Example (default: XML)

```shell
cyclonedx-node
```

### Example (XML)

```shell
cyclonedx-node --output bom.xml
```

### Example (JSON)

```shell
cyclonedx-node --output bom.json
```

### Usage with docker

Run `cyclonedx/cyclonedx-node` docker image inside your project folder, just like:

```shell
docker run --rm \
  --volume "$PWD":/src \
  cyclonedx/cyclonedx-node --output bom.xml
```

All options explained above are supported.

## CycloneDX Schema Support

The following table provides information on the version of
this node module,
the CycloneDX schema version supported,
as well as the output format options.  
Use the latest possible version of this node module that is the compatible with
the CycloneDX version supported by the target system.
Or use the [CycloneDX CLI Tool](https://github.com/CycloneDX/cyclonedx-cli/)
to convert to older specification versions as required.

| Version | Schema Version | Format(s) |
| --- | --- | --- |
| `3.*.*` | CycloneDX v1.3 | XML/JSON |
| `2.*.*` | CycloneDX v1.2 | XML/JSON |
| `1.1.*` | CycloneDX v1.1 | XML |
| `1.0.*` | CycloneDX v1.0 | XML |

## Contributing

Feel free to open issues, bugreports or pull requests.  
See the [CONTRIBUTING][contributing_file] file for details.

## Copyright & License

CycloneDX Node Module is Copyright (c) OWASP Foundation. All Rights Reserved.

Permission to modify and redistribute is granted under the terms of the Apache 2.0 license.
See the [LICENSE][license_file] file for the full license.

[license_file]: https://github.com/CycloneDX/cyclonedx-node-module/blob/master/LICENSE
[contributing_file]: https://github.com/CycloneDX/cyclonedx-node-module/blob/master/CONTRIBUTING.md

[shield_gh-workflow-test]: https://img.shields.io/github/workflow/status/CycloneDX/cyclonedx-node-module/Node%20CI/master?logo=GitHub&logoColor=white "build"
[shield_npm-version]: https://img.shields.io/npm/v/@cyclonedx/bom?logo=npm&logoColor=white "npm"
[shield_docker-version]: https://img.shields.io/docker/v/cyclonedx/cyclonedx-node?logo=docker&logoColor=white&label=docker "docker"
[shield_license]: https://img.shields.io/badge/license-Apache%202.0-brightgreen.svg?logo=open%20source%20initiative&logoColor=white "license"
[shield_website]: https://img.shields.io/badge/https://-cyclonedx.org-blue.svg "homepage"
[shield_slack]: https://img.shields.io/badge/slack-join-blue?logo=Slack&logoColor=white "slack join"
[shield_groups]: https://img.shields.io/badge/discussion-groups.io-blue.svg "groups discussion"
[shield_twitter-follow]: https://img.shields.io/badge/Twitter-follow-blue?logo=Twitter&logoColor=white "twitter follow"
[link_gh-workflow-test]: https://github.com/CycloneDX/cyclonedx-node-module/actions/workflows/nodejs.yml?query=branch%3Amaster
[link_npm]: https://www.npmjs.com/package/%40cyclonedx/bom
[link_docker]: https://hub.docker.com/r/cyclonedx/cyclonedx-node
[link_website]: https://cyclonedx.org/
[link_slack]: https://cyclonedx.org/slack/invite
[link_discussion]: https://groups.io/g/CycloneDX
[link_twitter]: https://twitter.com/CycloneDX_Spec
