# Server Usage

## Running as a server

Invoke cdxgen with `--server` argument to run it in server mode. By default, it listens to port `9090`, which can be customized with the arguments `--server-host` and `--server-port`.

```shell
cdxgen --server
```

Or use the container image.

```bash
docker run --rm -v /tmp:/tmp -p 9090:9090 -v $(pwd):/app:rw -t ghcr.io/cyclonedx/cdxgen -r /app --server --server-host 0.0.0.0
```

Use curl or your favorite tool to pass arguments to the `/sbom` route.

## Server arguments

Arguments can be passed either via the query string or as a JSON body. The following arguments are supported.

| Argument       | Description                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| type           | Project type                                                                                                                                |
| multiProject   | [boolean]                                                                                                                                   |
| requiredOnly   | Include only the packages with required scope on the SBOM. [boolean]                                                                        |
| noBabel        | Do not use babel to perform usage analysis for JavaScript/TypeScript projects. [boolean]                                                    |
| installDeps    | Install dependencies automatically for some projects. Defaults to true but disabled for containers and oci scans. [boolean] [default: true] |
| project        |                                                                                                                                             |
| projectName    | Dependency track project name. Default use the directory name                                                                               |
| projectGroup   | Dependency track project group                                                                                                              |
| projectVersion | Dependency track project version [default: ""]                                                                                              |

## Ways to use server mode

### Scanning a local path

```shell
curl "http://127.0.0.1:9090/sbom?path=/Volumes/Work/sandbox/vulnerable-aws-koa-app&multiProject=true&type=js"
```

### Scanning a git repo

```shell
curl "http://127.0.0.1:9090/sbom?url=https://github.com/HooliCorp/vulnerable-aws-koa-app.git&multiProject=true&type=js"
```

You can POST the arguments.

```bash
curl -H "Content-Type: application/json" http://localhost:9090/sbom -XPOST -d $'{"url": "https://github.com/HooliCorp/vulnerable-aws-koa-app.git", "type": "nodejs", "multiProject": "true"}'
```

### Docker compose

```shell
git clone https://github.com/cyclonedx/cdxgen.git
docker compose up
```
