const sbtUtils = require("./sbt-utils");
const fs = require("fs");

test("parse scala sbt list", async () => {
  let deps = sbtUtils.parseKVDep(
    // File sbt-dl.list contains some blank lines to test that our parser handles them correctly, i.e. ignores them
    fs.readFileSync("./test/data/sbt-dl.list", { encoding: "utf-8" })
  );
  expect(deps.length).toEqual(57);
});

test("parse scala sbt lock", async () => {
  let deps = sbtUtils.parseSbtLock("./test/data/build.sbt.lock");
  expect(deps.length).toEqual(117);
});
