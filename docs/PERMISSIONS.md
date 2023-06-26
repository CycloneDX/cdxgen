# Node.js 20 Permissions API

When the experimental permission model is enabled, cdxgen would be prevented from operating with the below error.

```shell
❯ node --experimental-permission bin/cdxgen.js -o /tmp/bom.json ~/work/sandbox/vuln-spring -t java
node:internal/modules/cjs/loader:179
  const result = internalModuleStat(filename);
                 ^

Error: Access to this API has been restricted
    at stat (node:internal/modules/cjs/loader:179:18)
    at Module._findPath (node:internal/modules/cjs/loader:653:16)
    at resolveMainPath (node:internal/modules/run_main:15:25)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:76:24)
    at node:internal/main/run_main_module:23:47 {
  code: 'ERR_ACCESS_DENIED',
  permission: 'FileSystemRead',
  resource: '/home/almalinux/work/CycloneDX/cdxgen/bin/cdxgen.js'
}

Node.js v20.3.1
```

## Required permissions

| Argument              | Comment                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| --allow-fs-read       | Read permission to the application or current directory                   |
| --allow-fs-write      | Write permission to the temp directory                                    |
| --allow-child-process | For some languages, ChildProcess permission is required to spawn commands |

Example invocation:

```shell
node --experimental-permission --allow-fs-read="/home/almalinux/work*" --allow-fs-write=/tmp --allow-child-process bin/cdxgen.js -o /tmp/bom.json ~/work/sandbox/vuln-spring -t java
```

## Warning messages

This warning could be ignored, if the particular language requires executing external commands.

```
SecurityWarning: The flag --allow-child-process must be used with extreme caution. It could invalidate the permission model.
```
