# CLI Usage

## Overview

In CLI mode, you can invoke cdxgen with Source Code, Container Image, or Binary Artifact as input to generate a Software Bill-of-Materials document. This can be subsequently used for a range of use cases as shown.

```mermaid
flowchart LR
    A[Source Code] --> B([fa:fa-terminal cdxgen])
    A1[Container Image] --> B([fa:fa-terminal cdxgen])
    A2[Binary Artifact] --> B([fa:fa-terminal cdxgen])
    B --> C(fa:fa-file SBOM)---|fa:fa-hashtag Sign| C
    C --> D{Use Cases}
    subgraph BOM Use Cases
      D -->|Break build| E[fa:fa-shield Invoke depscan]
      D -->|Vulnerability Management| F[fa:fa-shield-halved Dependency Track]
      D -->|License Compliance| G[fa:fa-rectangle-list Dependency Track]
    end
```

## Installing

```shell
sudo npm install -g @cyclonedx/cdxgen
```

If you are a [Homebrew](https://brew.sh/) user, you can also install [cdxgen](https://formulae.brew.sh/formula/cdxgen) via:

```shell
$ brew install cdxgen
```

Deno install is also supported.

```shell
deno install --allow-read --allow-env --allow-run --allow-sys=uid,systemMemoryInfo,gid,homedir --allow-write --allow-net -n cdxgen "npm:@cyclonedx/cdxgen/cdxgen"
```

You can also use the cdxgen container image

```bash
docker run --rm -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen -r /app -o /app/bom.json

docker run --rm -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen:v8.6.0 -r /app -o /app/bom.json
```

To use the deno version, use `ghcr.io/cyclonedx/cdxgen-deno` as the image name.

```bash
docker run --rm -v /tmp:/tmp -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen-deno -r /app -o /app/bom.json
```

In deno applications, cdxgen could be directly imported without any conversion. Please see the section on [integration as library](#integration-as-library)

```ts
import { createBom, submitBom } from "npm:@cyclonedx/cdxgen@^9.0.1";
```

## Getting Help

```text
$ cdxgen -h
cdxgen [command]

Commands:
  cdxgen completion  Generate bash/zsh completion

Options:
  -o, --output                 Output file. Default bom.json                                       [default: "bom.json"]
  -t, --type                   Project type. Please refer to https://cyclonedx.github.io/cdxgen/#/PROJECT_TYPES for supp
                               orted languages/platforms.                                                        [array]
      --exclude-type           Project types to exclude. Please refer to https://cyclonedx.github.io/cdxgen/#/PROJECT_TY
                               PES for supported languages/platforms.
  -r, --recurse                Recurse mode suitable for mono-repos. Defaults to true. Pass --no-recurse to disable.
                                                                                               [boolean] [default: true]
  -p, --print                  Print the SBOM as a table with tree.                                            [boolean]
  -c, --resolve-class          Resolve class names for packages. jars only for now.                            [boolean]
      --deep                   Perform deep searches for components. Useful while scanning C/C++ apps, live OS and oci i
                               mages.                                                                          [boolean]
      --server-url             Dependency track url. Eg: https://deptrack.cyclonedx.io
      --skip-dt-tls-check      Skip TLS certificate check when calling Dependency-Track.      [boolean] [default: false]
      --api-key                Dependency track api key
      --project-group          Dependency track project group
      --project-name           Dependency track project name. Default use the directory name
      --project-version        Dependency track project version                                   [string] [default: ""]
      --project-id             Dependency track project id. Either provide the id or the project name and version togeth
                               er                                                                               [string]
      --parent-project-id      Dependency track parent project id                                               [string]
      --required-only          Include only the packages with required scope on the SBOM. Would set compositions.aggrega
                               te to incomplete unless --no-auto-compositions is passed.                       [boolean]
      --fail-on-error          Fail if any dependency extractor fails.                                         [boolean]
      --no-babel               Do not use babel to perform usage analysis for JavaScript/TypeScript projects.  [boolean]
      --generate-key-and-sign  Generate an RSA public/private key pair and then sign the generated SBOM using JSON Web S
                               ignatures.                                                                      [boolean]
      --server                 Run cdxgen as a server                                                          [boolean]
      --server-host            Listen address                                                     [default: "127.0.0.1"]
      --server-port            Listen port                                                             [default: "9090"]
      --install-deps           Install dependencies automatically for some projects. Defaults to true but disabled for c
                               ontainers and oci scans. Use --no-install-deps to disable this feature.         [boolean]
      --validate               Validate the generated SBOM using json schema. Defaults to true. Pass --no-validate to di
                               sable.                                                          [boolean] [default: true]
      --evidence               Generate SBOM with evidence for supported languages.           [boolean] [default: false]
      --spec-version           CycloneDX Specification version to use. Defaults to 1.6           [number] [default: 1.6]
      --filter                 Filter components containing this word in purl or component.properties.value. Multiple va
                               lues allowed.                                                                     [array]
      --only                   Include components only containing this word in purl. Useful to generate BOM with first p
                               arty components alone. Multiple values allowed.                                   [array]
      --author                 The person(s) who created the BOM. Set this value if you're intending the modify the BOM
                               and claim authorship.                               [array] [default: "OWASP Foundation"]
      --profile                BOM profile to use for generation. Default generic.
  [choices: "appsec", "research", "operational", "threat-modeling", "license-compliance", "generic", "machine-learning",
                                                       "ml", "deep-learning", "ml-deep", "ml-tiny"] [default: "generic"]
      --exclude                Additional glob pattern(s) to ignore                                              [array]
      --include-formulation    Generate formulation section with git metadata and build tools. Defaults to false.
                                                                                              [boolean] [default: false]
      --include-crypto         Include crypto libraries as components.                        [boolean] [default: false]
      --standard               The list of standards which may consist of regulations, industry or organizational-specif
                               ic standards, maturity models, best practices, or any other requirements which can be eva
                               luated against or attested to.
  [array] [choices: "asvs-4.0.3", "bsimm-v13", "masvs-2.0.0", "nist_ssdf-1.1", "pcissc-secure-slc-1.1", "scvs-1.0.0", "s
                                                                                                     saf-DRAFT-2023-11"]
      --min-confidence         Minimum confidence needed for the identity of a component from 0 - 1, where 1 is 100% con
                               fidence.                                                            [number] [default: 0]
      --technique              Analysis technique to use
  [array] [choices: "auto", "source-code-analysis", "binary-analysis", "manifest-analysis", "hash-comparison", "instrume
                                                                                                   ntation", "filename"]
      --auto-compositions      Automatically set compositions when the BOM was filtered. Defaults to true
                                                                                               [boolean] [default: true]
  -h, --help                   Show help                                                                       [boolean]
  -v, --version                Show version number                                                             [boolean]

Examples:
  cdxgen -t java .                       Generate a Java SBOM for the current directory
  cdxgen -t java -t js .                 Generate a SBOM for Java and JavaScript in the current directory
  cdxgen -t java --profile ml .          Generate a Java SBOM for machine learning purposes.
  cdxgen -t python --profile research .  Generate a Python SBOM for appsec research.
  cdxgen --server                        Run cdxgen as a server

for documentation, visit https://cyclonedx.github.io/cdxgen
```

All boolean arguments accept `--no` prefix to toggle the behavior.
