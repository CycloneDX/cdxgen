# Advanced Usage

## Filtering components

cdxgen can filter the components and the dependency tree before writing to a BOM json file. Three kinds of filters are allowed:

### Required only filter

Pass `--required-only` to only store components with the `scope` attribute set to `required`. These are usually considered direct dependencies.

```shell
cdxgen -t java -o /tmp/bom.json -p --required-only
```

Languages supported:

- Java with Maven
- Node.js
- Go
- Php

### Purl filter

Use `--filter` to filter components containing the string in the purl.

```shell
cdxgen -t java -o /tmp/bom.json -p --filter org.springframework
```

### Include only filter

Use `--only` to include only those components containing the string in the purl. This can be used to generate BOM with "first party" components only.

```shell
cdxgen -t java -o /tmp/bom.json -p --only org.springframework
```

## Automatic compositions

When using any filters, cdxgen would automatically set the [compositions.aggregate](https://cyclonedx.org/docs/1.5/json/#compositions_items_aggregate) property to "incomplete" or "incomplete_first_party_only".

To disable this behavior, pass `--no-auto-compositions`.

## Configuration files

Tired of passing command line arguments to cdxgen?

JSON format

- .cdxgenrc
- .cdxgen.json

YAML format

- .cdxgen.yml
- .cdxgen.yaml

Examples:

```json
{
  "type": "java",
  "print": true,
  "output": "bom.json"
}
```

```yaml
# Java type
type: java
# Print the BOM as table and tree
print: true
# Set the output file
output: bom.json
# Only include these components in the BOM
only: org.springframework
```

### Environment variables

All command line arguments can also be passed as environment variables using the "CDXGEN\_" prefix.

```shell
export CDXGEN_TYPE=java
export CDXGEN_PROJECT_NAME=foo
```

Environment variables override values from the configuration files.

### Config value ordering

- Command-line arguments
- Environment variables
- Configuration files (JSON first, followed by yaml)

## Evinse Mode / SaaSBOM

Evinse (Evinse Verification Is Nearly SBOM Evidence) is a new command with cdxgen to generate component evidence and SaaSBOM for supported languages. The tool is powered by [atom](https://github.com/AppThreat/atom).

<img src="_media/occurrence-evidence.png" alt="occurrence evidence" width="256">

<img src="_media/callstack-evidence.png" alt="occurrence evidence" width="256">

<img src="_media/saasbom-services.png" alt="occurrence evidence" width="256">

### Pre-requisites

- Java > 17 installed
- Application source code
- Input SBOM in CycloneDX >1.5 format. Use cdxgen to generate one.

### Usage

```shell
evinse -h
Options:
  -i, --input                    Input SBOM file. Default bom.json
                                                           [default: "bom.json"]
  -o, --output                   Output file. Default bom.evinse.json
                                                    [default: "bom.evinse.json"]
  -l, --language                 Application language
  [choices: "java", "jar", "javascript", "python", "android", "cpp"] [default: "
                                                                          java"]
      --db-path                  Atom slices DB path. Default /home/prabhu/.loca
                                 l/share/.atomdb
                                  [default: "/home/prabhu/.local/share/.atomdb"]
      --force                    Force creation of the database
                                                      [boolean] [default: false]
      --skip-maven-collector     Skip collecting jars from maven and gradle cach
                                 es. Can speedup re-runs if the data was cached
                                 previously.          [boolean] [default: false]
      --with-deep-jar-collector  Enable collection of all jars from maven cache
                                 directory. Useful to improve the recall for cal
                                 lstack evidence.     [boolean] [default: false]
      --annotate                 Include contents of atom slices as annotations
                                                      [boolean] [default: false]
      --with-data-flow           Enable inter-procedural data-flow slicing.
                                                      [boolean] [default: false]
      --with-reachables          Enable auto-tagged reachable slicing. Requires
                                 SBOM generated with --deep mode.
                                                      [boolean] [default: false]
      --usages-slices-file       Use an existing usages slices file.
                                                 [default: "usages.slices.json"]
      --data-flow-slices-file    Use an existing data-flow slices file.
                                              [default: "data-flow.slices.json"]
      --reachables-slices-file   Use an existing reachables slices file.
                                             [default: "reachables.slices.json"]
  -p, --print                    Print the evidences as table          [boolean]
      --version                  Show version number                   [boolean]
  -h                             Show help                             [boolean]
```

To generate an SBOM with evidence for a java project.

```shell
evinse -i bom.json -o bom.evinse.json <path to the application>
```

By default, only occurrence evidences are determined by creating usages slices. To generate callstack evidence, pass either `--with-data-flow` or `--with-reachables`.

#### Reachability-based callstack evidence

atom supports reachability-based slicing for Java applications. Two necessary prerequisites for this slicing mode are that the input SBOM must be generated in deep mode (with --deep argument) and must be placed within the application directory.

```shell
cd <path to the application>
cdxgen -t java --deep -o bom.json .
evinse -i bom.json -o bom.evinse.json --with-reachables .
```

This is because

#### Data Flow based slicing

Often reachability cannot be computed reliably due to the presence of wrapper libraries or mitigating layers. In such cases, data-flow based slicing can be used to compute callstack using a reverse reachability algorithm. This is however a time and resource-consuming operation and might even require atom to be run externally in [java mode](https://cyclonedx.github.io/cdxgen/#/ADVANCED?id=use-atom-in-java-mode).

```shell
evinse -i bom.json -o bom.evinse.json --with-data-flow <path to the application>
```

#### Performance tuning

To improve performance, you can cache the generated usages and data-flow slices file along with the bom file.

```shell
evinse -i bom.json -o bom.evinse.json --usages-slices-file usages.json --data-flow-slices-file data-flow.json --with-data-flow <path to the application>
```

#### Other languages

For JavaScript or TypeScript projects, pass `-l javascript`.

```shell
evinse -i bom.json -o bom.evinse.json --usages-slices-file usages.json --data-flow-slices-file data-flow.json -l javascript --with-data-flow <path to the application>
```

## Generate SBOM from maven or gradle cache

There could be Java applications with complex dependency requirements. Or you might be interested in cataloging your Maven or gradle cache.
A bonus of this mode is that the resulting SBOM would have a property called `Namespaces` with a list of class names belonging to each jar.

### Generate evidence of usage

After generating an SBOM from a cache, we can now look for evidence of direct usage with evinse!

```shell
# compile or build your application
evinse -i <bom from cache> -o bom.evinse.json <application path>
# Generate data-flow evidence (Takes a while)
# evinse -i <bom from cache> -o bom.evinse.json --with-data-flow <application path>
```

Evinse would populate `component.evidence` objects with occurrences (default) and call stack (in data-flow mode). Those without evidence are either transitive or unused dependencies.

To improve performance for re-runs, pass the argument `--skip-maven-collector` to use the data cached in the SQLite database from the previous runs.

## Mixed Java Projects

If a java project uses maven and gradle, maven is selected for SBOM generation under default settings. To force cdxgen to use gradle, use the argument `-t gradle`. Similarly, use `-t scala` for scala SBT.

## Generating container SBOM on Windows

cdxgen supports generating container SBOM for Linux images on Windows. Follow the steps listed below.

- Ensure cdxgen-plugins-bin > 1.4.0 is installed.

```shell
npm install -g @cyclonedx/cdxgen-plugins-bin
```

- Run "Docker for Desktop" as an administrator with the 'Exposing daemon on TCP without TLS' setting turned on.
  Run Powershell terminal as administrator. Without this, cdxgen would fail while extracting symlinks.
- Invoke cdxgen with `-t docker`

```shell
cdxgen -t docker -o bom.json <image name>
```

## Generate SBOM with evidence for the cdxgen repo

Why not?

```shell
cdxgen -t js -o bom.json -p --no-recurse
evinse -i bom.json -o bom.evinse.json -l javascript

# Don't be surprised to see the service endpoint offered by cdxgen!
```

It is currently not possible to generate data-flow evidence for cdxgen in constant time since the graph is too large for pre-computation. If you have experience with source code analysis, please suggest some improvements to the [atom](https://github.com/AppThreat/atom) project.

## Use Atom in Java mode

For large projects (> 1 million lines of code), atom must be invoked separately for the slicing operation. Follow the instructions below.

- Download the latest [atom.zip release](https://github.com/AppThreat/atom/releases)

```shell
unzip atom.zip
cd atom-1.0.0/bin

# Java project
./atom -J-Xmx16g usages -o app.atom --slice-outfile usages.json -l java <path to repo>

# C project
./atom -J-Xmx16g usages -o app.atom --slice-outfile usages.json -l c <path to repo>

node bin/cdxgen.js -o bom.json -t c --usages-slices-file usages.json <path to repo>
```

Change 16g to 32g or above for very large projects. For the Linux kernel, a minimum of 128GB is required.

## Remove the SQLite cache db used by evinse

If you face a situation where the namespaces cached by evinse are outdated or incorrect, you can try deleting the file `.atomdb` to recreate it. Below are the locations where this file gets stored by default. This can be overridden by setting the environment variable `ATOM_DB`.

```javascript
// linux
let ATOM_DB = join(homedir(), ".local", "share", ".atomdb");

// Windows
ATOM_DB = join(homedir(), "AppData", "Local", ".atomdb");

// Mac
ATOM_DB = join(homedir(), "Library", "Application Support", ".atomdb");
```
