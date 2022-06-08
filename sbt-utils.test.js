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

test("parse sbt projectInfo for a real world example", async () => {
  let input = `[info] Loading global plugins from /Users/michal/.sbt/1.0/plugins
  [info] Loading project definition from /Users/michal/sl/cdxgen/it-tests/samples/sbt/sbt1.3/project
  [info] Loading settings for project app from build.sbt ...
  [info] Loading settings for project core from build.sbt ...
  [info] Loading settings for project sbt1-3 from build.sbt ...
  [info] Set current project to sbt1-3 (in build file:/Users/michal/sl/cdxgen/it-tests/samples/sbt/sbt1.3/)
  [info] app / projectInfo
  [info] 	ModuleInfo(app, app, None, None, Vector(), app, None, None, Vector())
  [info] core / projectInfo
  [info] 	ModuleInfo(core, core, None, None, Vector(), core, None, None, Vector())
  [info] projectInfo
  [info] 	ModuleInfo(sbt1-3, sbt1-3, None, None, Vector(), default, None, None, Vector())
  `;

  let res = sbtUtils.parseProjectInfo(input);

  expect(res).toEqual(['app', 'core', 'sbt1-3']);
});

test("parse sbt projectInfo for a contrived example", async () => {
  let input = `[info] Loading global plugins from /Users/ModuleInfo/.sbt/1.0/plugins
  [info] Loading project definition from /Users/ModuleInfo/sl/cdxgen/it-tests/samples/sbt/sbt1.3/project
  [info] Loading settings for project app from build.sbt ...
  [info] Loading settings for project core from build.sbt ...
  [info] Loading settings for project sbt1-3 from ModuleInfo.sbt ...
  [info] Set current project to sbt1-3 (in build file:/Users/ModuleInfo/sl/cdxgen/it-tests/samples/sbt/sbt1.3/)
  [info] app / projectInfo
  [info] 	ModuleInfo(app, app, None, None, Vector(), app, None, None, Vector())
  [info] core / projectInfo
  [info] 	ModuleInfo(core, core, None, None, Vector(), core, None, None, Vector())
  [info] projectInfo
  [info] 	ModuleInfo(sbt1-3, sbt1-3, None, None, Vector(), default, None, None, Vector())
  `;

  let res = sbtUtils.parseProjectInfo(input);

  expect(res).toEqual(['app', 'core', 'sbt1-3']);
});
