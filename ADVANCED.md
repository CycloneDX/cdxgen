# Advanced usage

## Evinse Mode

Evinse (Evinse Verification Is Nearly SBoM Evidence) is a new command with cdxgen to generate component evidence for supported languages. The tool is powered by [atom](https://github.com/AppThreat/atom)

### Pre-requisites

- Java > 17 installed
- Application source code
- Input SBoM in CycloneDX >1.5 format. Use cdxgen to generate one.

### Usage

```shell
evinse -h
Options:
  -i, --input                    Input SBoM file. Default bom.json
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
                                                       [boolean] [default: true]
      --with-data-flow           Enable inter-procedural data-flow slicing.
                                                      [boolean] [default: false]
      --usages-slices-file       Use an existing usages slices file.
                                                 [default: "usages.slices.json"]
      --data-flow-slices-file    Use an existing data-flow slices file.
                                              [default: "data-flow.slices.json"]
  -p, --print                    Print the evidences as table          [boolean]
      --version                  Show version number                   [boolean]
  -h                             Show help                             [boolean]
```

To generate an SBoM with evidence for a java project.

```shell
evinse -i bom.json -o bom.evinse.json <path to the application>
```

## Generate SBoM from maven or gradle cache

There could be java applications with complex dependency requirements. Or you might be interested in cataloging your maven or gradle cache.

```shell
# export MAVEN_CACHE_DIR=<custom path>
cdxgen -t maven-cache -o <bom json>
# export GRADLE_CACHE_DIR=<custom path>
cdxgen -t gradle-cache -o <bom json>
```

An added bonus of this mode is that the resulting SBoM would have a property called `Namespaces` with a list of class names belonging to each jar.

### Generate evidence of usage

After generating an SBoM from a cache, we can now look for evidence of direct usage with evinse!

```shell
# compile or build your application
evinse -i <bom from cache> -o bom.evinse.json <application path>
# Generate data-flow evidence (Takes a while)
# evinse -i <bom from cache> -o bom.evinse.json --with-data-flow <application path>
```

Evinse would populate component.evidence object with occurrences (default) and callstack (in data-flow mode). Those without evidence are either transitive or unused dependencies.

## Interactive mode

`cdxi` is a new interactive REPL server to interactively create, import and search an SBoM. All the exported functions from cdxgen and node.js could be used in this mode. In addition, several custom commands are defined.

[![cdxi demo](https://asciinema.org/a/602361.svg)](https://asciinema.org/a/602361)

### Custom commands

| Command      | Description                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| .create      | Create an SBoM from a path                                                                                                                                                                                     |
| .import      | Import an existing SBoM from a path. Any SBoM in CycloneDX format is supported.                                                                                                                                |
| .search      | Search the given string in the components name, group, purl and description                                                                                                                                    |
| .sort        | Sort the components based on the given attribute. Eg: .sort name to sort by name. Accepts full jsonata [order by](http://docs.jsonata.org/path-operators#order-by-) clause too. Eg: `.sort components^(>name)` |
| .query       | Pass a raw query in [jsonata](http://docs.jsonata.org/) format                                                                                                                                                 |
| .print       | Print the SBoM as a table                                                                                                                                                                                      |
| .tree        | Print the dependency tree if available                                                                                                                                                                         |
| .validate    | Validate the SBoM                                                                                                                                                                                              |
| .exit        | To exit the shell                                                                                                                                                                                              |
| .save        | To save the modified SBoM to a new file                                                                                                                                                                        |
| .update      | Update components based on query expression. Use syntax `\| query \| new object \|`. See example.                                                                                                              |
| .occurrences | View components with evidence.occurrences as a table. Use evinse command to generate such an SBoM                                                                                                              |
| .callstack   | View components with evidence.callstack.frames as a table. Use evinse command to generate such an SBoM                                                                                                         |
| .services    | View services as a table                                                                                                                                                                                       |

### Sample REPL usage

Start the REPL server.

```shell
cdxi
```

Below are some example commands to create an SBoM for a spring application and perform searches and queries.

```
.create /mnt/work/vuln-spring
.print
.search spring
.query components[name ~> /spring/ and scope = "required"]
.sort name
.sort components^(>name)
.update | components[name ~> /spring/] | {'publisher': "foo"} |
```

### REPL History

Repl history will get persisted under `$HOME/.config/.cdxgen` directory. To override this location, use the environment variable `CDXGEN_REPL_HISTORY`.

## Mixed Java Projects

If a java project use both maven and gradle, maven is selected for SBoM generation under default settings. To force cdxgen to use gradle, use the argument `-t gradle`. Similarly, use `-t scala` for scala SBT.
