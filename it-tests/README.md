Tests in this directory are supposed to detect changes in output produced by cdxgen by verifying the actual XML/JSON files produced by the tool. Therefore, they assume that the required build tools (e.g., maven or sbt) are installed on the machine they run.

## Running integration tests

The list of directories to be checked resides in `predefined-projects.sh`. Once you have configured that file, run the integration tests with:

```bash
./verify.sh
```

## How to update expectations

If you introduced a change that affecs the output and you're sure that's your intention, then:

```bash
./verify.sh --update
```

## How to add a new test

* Put a new build configuration somewhere into `samples` directory
* Add a path to the above directory to `predefined-projects.sh`
* Run `./verify.sh --update`. That will generate `cdx-expected.out.xml` file in a new directory
