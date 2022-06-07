Tests in this directory are supposed to detect changes in output produced by cdxgen by verifying the actual XML/JSON files produced by the tool. Therefore, they assume that the required build tools (e.g., maven or sbt) are installed on the machine they run.

## Running integration tests

The list of directories to be checked resides in `predefined-projects.sh`. Once you have configured that file, run the integration tests with:

```bash
./diff.sh
```

## Current status

Integration tests are in an early stage of development. There are two areas of improvement:

### 1. Deterministic output

For the tests to yield sensible results, it's assumed that output is deterministic. `cdxgen` offers a `--deterministic-for-tests` flag that hardcodes certain parts of the output, like BOM generation serial number and timestamps.

Another potential source of indeterminism is a different ordering of outputs. For SBT, the output is already sorted. We may add it for other tools as well.

### 2. Including test repositories in the cdxgen repository

The eventual goal is to include test repositories in the cdxgen repository, along with their expected output. Then, each time the change affects output, we would need to "confirm" it's expected by changing files with
expectations.
