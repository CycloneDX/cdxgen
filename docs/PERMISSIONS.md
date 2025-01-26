# Node.js 20 Permissions API

When the experimental permission model is enabled, cdxgen would be prevented from operating with the below error.

```shell
❯ node --permission bin/cdxgen.js -o /tmp/bom.json ~/work/sandbox/vuln-spring -t java
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
node --permission --allow-fs-read="/home/almalinux/work*" --allow-fs-write="/tmp/*" --allow-child-process bin/cdxgen.js -o /tmp/bom.json /home/almalinux/work/sandbox/vuln-spring -t java
```

The above command is too simple. For example, below is a command I use on my macOS machine. When sdkman, nvm, etc. are used, more `--allow-fs-read` arguments are required. Use "\*" to get things working.

```shell
node --permission --allow-fs-read=\* --allow-fs-write="/tmp/*" --allow-fs-write="/Volumes/Work/sandbox/pnpm 2/*.json" --allow-fs-write="/Users/prabhu/Library/Application Support/.atomdb" --allow-fs-write="/var/folders/h5/43_6kqvs4w7cclqtdbpj_7g80000gn/T/*" --allow-child-process --allow-addons /Volumes/Work/CycloneDX/cdxgen/bin/cdxgen.js --evidence -o bom.json -t js "$(pwd)"
```

Below example uses the environment variable `NODE_OPTIONS` to pass additional options to the node runtime dynamically.

```shell
NODE_OPTIONS='--permission --allow-fs-read="*" --allow-fs-write="/tmp/*" --allow-fs-write="/Volumes/Work/sandbox/pnpm 2/*.json" --allow-fs-write="/Users/prabhu/Library/Application Support/.atomdb" --allow-fs-write="/var/folders/h5/43_6kqvs4w7cclqtdbpj_7g80000gn/T/*" --allow-child-process --allow-addons' node /Volumes/Work/CycloneDX/cdxgen/bin/cdxgen.js --evidence -o bom.json -t js "$(pwd)"
```

## Warning messages

This warning could be ignored, if the particular language requires executing external commands.

```
SecurityWarning: The flag --allow-child-process must be used with extreme caution. It could invalidate the permission model.
```
