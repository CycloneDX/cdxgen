const cpeLib = require("./cpe");
const fs = require("fs");
jest.useFakeTimers();

test("open database", () => {
  const db = cpeLib.openDatabase("foo");
  expect(db).toBeUndefined();
});

test("test query", () => {
  if (fs.existsSync("purl2cpe.db")) {
    const db = cpeLib.openDatabase("purl2cpe.db");
    expect(db).toBeDefined();
    let cpeString = cpeLib.convertPurl(
      "pkg:github/aerospike/aerospike-server@5.5.5"
    );
    expect(cpeString).toEqual(
      "cpe:2.3:a:aerospike:aerospike_server:5.5.5:*:*:*:community:*:*:*"
    );
    cpeString = cpeLib.convertPurl(
      "pkg:maven/org.springframework.integration/spring-integration-jms@5.5.5"
    );
    expect(cpeString).toEqual(
      "cpe:2.3:a:org.springframework.integration:spring-integration-jms:5.5.5:*:*:*:*:*:*:*"
    );
    cpeLib.closeDatabase();
  }
});

test("test query db less", () => {
  let cpeString = cpeLib.convertPurl(
    "pkg:github/aerospike/aerospike-server@5.5.5"
  );
  expect(cpeString).toEqual(
    "cpe:2.3:a:aerospike:aerospike-server:5.5.5:*:*:*:*:*:*:*"
  );
  cpeString = cpeLib.convertPurl(
    "pkg:maven/org.springframework.integration/spring-integration-jms@5.5.5"
  );
  expect(cpeString).toEqual(
    "cpe:2.3:a:org.springframework.integration:spring-integration-jms:5.5.5:*:*:*:*:*:*:*"
  );
});
