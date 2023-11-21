# Server Usage

## Overview

```mermaid
sequenceDiagram
    actor User
    User->>+cdxgen server: Invoke /sbom
    cdxgen server-->>-User: SBOM Response
```

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

| Argument         | Description                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| type             | Project type                                                                                                                                     |
| multiProject     | [boolean]                                                                                                                                        |
| requiredOnly     | Include only the packages with required scope on the SBOM. [boolean]                                                                             |
| noBabel          | Do not use babel to perform usage analysis for JavaScript/TypeScript projects. [boolean]                                                         |
| installDeps      | Install dependencies automatically for some projects. Defaults to true but disabled for containers and oci scans. [boolean] [default: true]      |
| projectId        | The UUID of the project. You must provide the UUID or the projectName and projectVersion (or all three).                                         |
| projectName      | Dependency Track project name. Default use the directory name                                                                                    |
| projectGroup     | Dependency Track project group                                                                                                                   |
| projectVersion   | Dependency Track project version [default: ""]                                                                                                   |
| parentUUID       | UUID of the parent project.                                                                                                                      |
| serverUrl        | URL to the Dependency Track API server.                                                                                                          |
| apiKey           | API key for the Dependency Track API server.                                                                                                     |
| specVersion      | CycloneDX Specification version to use. [default: 1.5]                                                                                           |
| filter           | Filter components containing this word in purl. Multiple values allowed. [array]                                                                 |
| only             | Include components only containing this word in purl. Useful to generate BOM with first party components alone. Multiple values allowed. [array] |
| autoCompositions | Automatically set compositions when the BOM was filtered. [boolean] [default: true]                                                              |
| gitBranch        | Git branch used when cloning the repository. If not specified will use the default branch assigned to the repository.                            |

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

Using requests.post in Python:

```python
import requests
data = {
    "url": f"https://user:{github_api_key}@github.com/{organization}/{repository}.git",
    "serverUrl": dependencytrack_api_url,
    "apiKey": dependencytrack_api_key
    "projectId": project_uuid,
    "projectName": project_name,
    "projectVersion": project_version,
    "parentUUID": parent_uuid
}
response = requests.post(url=cdxgen_server_url, json=data, allowed_retries=0)
```

### Health endpoint

Use the /health endpoint to check if the SBOM server is up and running.

```shell
curl "http://127.0.0.1:9090/health"
```

### Docker compose

Use the provided docker-compose file to quickly launch a cdxgen server instance.

```shell
git clone https://github.com/cyclonedx/cdxgen.git
docker compose up
```
