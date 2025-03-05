import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { load as loadYaml } from "js-yaml";
import { parse } from "ssri";
import {
  buildObjectForCocoaPod,
  buildObjectForGradleModule,
  encodeForPurl,
  findLicenseId,
  getCratesMetadata,
  getDartMetadata,
  getGoPkgLicense,
  getLicenses,
  getMvnMetadata,
  getNugetMetadata,
  getPyMetadata,
  getRepoLicense,
  guessPypiMatchingVersion,
  hasAnyProjectType,
  isPackageManagerAllowed,
  isPartialTree,
  isValidIriReference,
  mapConanPkgRefToPurlStringAndNameAndVersion,
  parseBazelActionGraph,
  parseBazelBuild,
  parseBazelSkyframe,
  parseBdistMetadata,
  parseBitbucketPipelinesFile,
  parseBowerJson,
  parseCabalData,
  parseCargoAuditableData,
  parseCargoData,
  parseCargoDependencyData,
  parseCargoTomlData,
  parseCljDep,
  parseCloudBuildData,
  parseCmakeDotFile,
  parseCmakeLikeFile,
  parseCocoaDependency,
  parseComposerLock,
  parseConanData,
  parseConanLockData,
  parseContainerFile,
  parseContainerSpecData,
  parseCsPkgData,
  parseCsPkgLockData,
  parseCsProjAssetsData,
  parseCsProjData,
  parseEdnData,
  parseGemfileLockData,
  parseGemspecData,
  parseGitHubWorkflowData,
  parseGoListDep,
  parseGoModData,
  parseGoModGraph,
  parseGoModWhy,
  parseGoVersionData,
  parseGopkgData,
  parseGosumData,
  parseGradleDep,
  parseGradleProjects,
  parseGradleProperties,
  parseHelmYamlData,
  parseKVDep,
  parseLeinDep,
  parseLeiningenData,
  parseMakeDFile,
  parseMavenTree,
  parseMixLockData,
  parseNodeShrinkwrap,
  parseNupkg,
  parseNuspecData,
  parseOpenapiSpecData,
  parsePackageJsonName,
  parsePaketLockData,
  parsePiplockData,
  parsePkgJson,
  parsePkgLock,
  parsePnpmLock,
  parsePnpmWorkspace,
  parsePodfileLock,
  parsePodfileTargets,
  parsePom,
  parsePrivadoFile,
  parsePubLockData,
  parsePubYamlData,
  parsePyLockData,
  parsePyProjectTomlFile,
  parsePyRequiresDist,
  parseReqFile,
  parseSbtLock,
  parseSbtTree,
  parseSetupPyFile,
  parseSwiftJsonTree,
  parseSwiftResolved,
  parseYarnLock,
  readZipEntry,
  splitOutputByGradleProjects,
  toGemModuleNames,
  yarnLockToIdentMap,
} from "./utils.js";
import { validateRefs } from "./validator.js";

test("SSRI test", () => {
  // gopkg.lock hash
  let ss = parse(
    "2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf",
  );
  expect(ss).toEqual(null);
  ss = parse(
    "sha256-2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf",
  );
  expect(ss.sha256[0].digest).toStrictEqual(
    "2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf",
  );
  ss = parse(
    `sha256-${Buffer.from(
      "2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf",
      "hex",
    ).toString("base64")}`,
  );
  expect(ss.sha256[0].digest).toStrictEqual(
    "LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78=",
  );
  ss = parse(
    "sha512-Vn0lE2mprXEFPcRoI89xjw1fk1VJiyVbwfaPnVnvCXxEieByioO8Mj6sMwa6ON9PRuqbAjIxaQpkzccu41sYlw==",
  );
  expect(ss.sha512[0].digest).toStrictEqual(
    "Vn0lE2mprXEFPcRoI89xjw1fk1VJiyVbwfaPnVnvCXxEieByioO8Mj6sMwa6ON9PRuqbAjIxaQpkzccu41sYlw==",
  );
});

test("Parse requires dist string", () => {
  expect(parsePyRequiresDist("lazy-object-proxy (&gt;=1.4.0)")).toEqual({
    name: "lazy-object-proxy",
    version: "1.4.0",
  });
  expect(parsePyRequiresDist("wrapt (&lt;1.13,&gt;=1.11)")).toEqual({
    name: "wrapt",
    version: "1.13",
  });
  expect(
    parsePyRequiresDist(
      'typed-ast (&lt;1.5,&gt;=1.4.0) ; implementation_name == "cpython" and python_version &lt; "3.8"',
    ),
  ).toEqual({ name: "typed-ast", version: "1.5" });
  expect(parsePyRequiresDist("asgiref (&lt;4,&gt;=3.2.10)")).toEqual({
    name: "asgiref",
    version: "4",
  });
  expect(parsePyRequiresDist("pytz")).toEqual({
    name: "pytz",
    version: "",
  });
  expect(parsePyRequiresDist("sqlparse (&gt;=0.2.2)")).toEqual({
    name: "sqlparse",
    version: "0.2.2",
  });
  expect(
    parsePyRequiresDist("argon2-cffi (&gt;=16.1.0) ; extra == 'argon2'"),
  ).toEqual({ name: "argon2-cffi", version: "16.1.0" });
  expect(parsePyRequiresDist("bcrypt ; extra == 'bcrypt'")).toEqual({
    name: "bcrypt",
    version: "",
  });
});

test("finds license id from name", () => {
  expect(findLicenseId("Apache License Version 2.0")).toEqual("Apache-2.0");
  expect(findLicenseId("GNU General Public License (GPL) version 2.0")).toEqual(
    "GPL-2.0-only",
  );
});

test("splits parallel gradle properties output correctly", () => {
  const parallelGradlePropertiesOutput = readFileSync(
    "./test/gradle-prop-parallel.out",
    { encoding: "utf-8" },
  );
  const relevantTasks = ["properties"];
  const propOutputSplitBySubProject = splitOutputByGradleProjects(
    parallelGradlePropertiesOutput,
    relevantTasks,
  );

  expect(propOutputSplitBySubProject.size).toEqual(4);
  expect(propOutputSplitBySubProject.has("dependency-diff-check")).toBe(true);
  expect(
    propOutputSplitBySubProject.has(":dependency-diff-check-service"),
  ).toBe(true);
  expect(
    propOutputSplitBySubProject.has(":dependency-diff-check-common-core"),
  ).toBe(true);
  expect(
    propOutputSplitBySubProject.has(":dependency-diff-check-client-starter"),
  ).toBe(true);

  const retMap = parseGradleProperties(
    propOutputSplitBySubProject.get("dependency-diff-check"),
  );
  expect(retMap.rootProject).toEqual("dependency-diff-check");
  expect(retMap.projects.length).toEqual(3);
  expect(retMap.metadata.group).toEqual("com.ajmalab");
  expect(retMap.metadata.version).toEqual("0.0.1-SNAPSHOT");
});

test("splits parallel gradle dependencies output correctly", async () => {
  const parallelGradleDepOutput = readFileSync(
    "./test/gradle-dep-parallel.out",
    { encoding: "utf-8" },
  );
  const relevantTasks = ["dependencies"];
  const depOutputSplitBySubProject = splitOutputByGradleProjects(
    parallelGradleDepOutput,
    relevantTasks,
  );

  expect(depOutputSplitBySubProject.size).toEqual(4);
  expect(depOutputSplitBySubProject.has("dependency-diff-check")).toBe(true);
  expect(depOutputSplitBySubProject.has(":dependency-diff-check-service")).toBe(
    true,
  );
  expect(
    depOutputSplitBySubProject.has(":dependency-diff-check-common-core"),
  ).toBe(true);
  expect(
    depOutputSplitBySubProject.has(":dependency-diff-check-client-starter"),
  ).toBe(true);

  const retMap = await parseGradleDep(
    depOutputSplitBySubProject.get("dependency-diff-check"),
    "dependency-diff-check",
    new Map().set(
      "dependency-diff-check",
      await buildObjectForGradleModule("dependency-diff-check", {
        version: "latest",
      }),
    ),
  );
  expect(retMap.pkgList.length).toEqual(12);
  expect(retMap.dependenciesList.length).toEqual(13);
});

test("splits parallel custom gradle task outputs correctly", async () => {
  const parallelGradleOutputWithOverridenTask = readFileSync(
    "./test/gradle-build-env-dep.out",
    { encoding: "utf-8" },
  );
  const overridenTasks = ["buildEnvironment"];
  const customDepTaskOuputSplitByProject = splitOutputByGradleProjects(
    parallelGradleOutputWithOverridenTask,
    overridenTasks,
  );
  expect(customDepTaskOuputSplitByProject.size).toEqual(4);
  expect(customDepTaskOuputSplitByProject.has("dependency-diff-check")).toBe(
    true,
  );
  expect(
    customDepTaskOuputSplitByProject.has(":dependency-diff-check-service"),
  ).toBe(true);
  expect(
    customDepTaskOuputSplitByProject.has(":dependency-diff-check-common-core"),
  ).toBe(true);
  expect(
    customDepTaskOuputSplitByProject.has(
      ":dependency-diff-check-client-starter",
    ),
  ).toBe(true);

  const retMap = await parseGradleDep(
    customDepTaskOuputSplitByProject.get(
      ":dependency-diff-check-client-starter",
    ),
    "dependency-diff-check",
    new Map().set(
      "dependency-diff-check",
      await buildObjectForGradleModule("dependency-diff-check", {
        version: "latest",
      }),
    ),
  );
  expect(retMap.pkgList.length).toEqual(22);
  expect(retMap.dependenciesList.length).toEqual(23);
});

test("parse gradle dependencies", async () => {
  const modulesMap = new Map();
  modulesMap.set(
    "test-project",
    await buildObjectForGradleModule("test-project", {
      version: "latest",
    }),
  );
  modulesMap.set(
    "dependency-diff-check-common-core",
    await buildObjectForGradleModule("dependency-diff-check-common-core", {
      version: "latest",
    }),
  );
  modulesMap.set(
    "app",
    await buildObjectForGradleModule("app", {
      version: "latest",
    }),
  );
  modulesMap.set(
    "failing-project",
    await buildObjectForGradleModule("failing-project", {
      version: "latest",
    }),
  );
  expect(await parseGradleDep(null)).toEqual({});
  let parsedList = await parseGradleDep(
    readFileSync("./test/gradle-dep.out", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(33);
  expect(parsedList.dependenciesList.length).toEqual(34);
  expect(parsedList.pkgList[0]).toEqual({
    group: "org.ethereum",
    name: "solcJ-all",
    qualifiers: {
      type: "jar",
    },
    version: "0.4.25",
    "bom-ref": "pkg:maven/org.ethereum/solcJ-all@0.4.25?type=jar",
    purl: "pkg:maven/org.ethereum/solcJ-all@0.4.25?type=jar",
  });

  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-android-dep.out", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(104);
  expect(parsedList.dependenciesList.length).toEqual(105);
  expect(parsedList.pkgList[0]).toEqual({
    group: "com.android.support.test",
    name: "runner",
    qualifiers: {
      type: "jar",
    },
    scope: "optional",
    version: "1.0.2",
    properties: [
      {
        name: "GradleProfileName",
        value: "androidTestImplementation",
      },
    ],
    "bom-ref": "pkg:maven/com.android.support.test/runner@1.0.2?type=jar",
    purl: "pkg:maven/com.android.support.test/runner@1.0.2?type=jar",
  });
  expect(parsedList.pkgList[103]).toEqual({
    group: "androidx.core",
    name: "core",
    qualifiers: {
      type: "jar",
    },
    version: "1.7.0",
    scope: "optional",
    properties: [
      {
        name: "GradleProfileName",
        value: "releaseUnitTestRuntimeClasspath",
      },
    ],
    "bom-ref": "pkg:maven/androidx.core/core@1.7.0?type=jar",
    purl: "pkg:maven/androidx.core/core@1.7.0?type=jar",
  });
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-out1.dep", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(89);
  expect(parsedList.dependenciesList.length).toEqual(90);
  expect(parsedList.pkgList[0]).toEqual({
    group: "org.springframework.boot",
    name: "spring-boot-starter-web",
    version: "2.2.0.RELEASE",
    qualifiers: { type: "jar" },
    properties: [
      {
        name: "GradleProfileName",
        value: "compileClasspath",
      },
    ],
    "bom-ref":
      "pkg:maven/org.springframework.boot/spring-boot-starter-web@2.2.0.RELEASE?type=jar",
    purl: "pkg:maven/org.springframework.boot/spring-boot-starter-web@2.2.0.RELEASE?type=jar",
  });

  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-rich1.dep", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(4);
  expect(parsedList.pkgList[parsedList.pkgList.length - 1]).toEqual({
    group: "ch.qos.logback",
    name: "logback-core",
    qualifiers: { type: "jar" },
    version: "1.4.5",
    "bom-ref": "pkg:maven/ch.qos.logback/logback-core@1.4.5?type=jar",
    purl: "pkg:maven/ch.qos.logback/logback-core@1.4.5?type=jar",
  });
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-rich2.dep", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(2);
  expect(parsedList.pkgList).toEqual([
    {
      group: "io.appium",
      name: "java-client",
      qualifiers: { type: "jar" },
      version: "8.1.1",
      "bom-ref": "pkg:maven/io.appium/java-client@8.1.1?type=jar",
      purl: "pkg:maven/io.appium/java-client@8.1.1?type=jar",
    },
    {
      group: "org.seleniumhq.selenium",
      name: "selenium-support",
      qualifiers: { type: "jar" },
      version: "4.5.0",
      "bom-ref":
        "pkg:maven/org.seleniumhq.selenium/selenium-support@4.5.0?type=jar",
      purl: "pkg:maven/org.seleniumhq.selenium/selenium-support@4.5.0?type=jar",
    },
  ]);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-rich3.dep", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(1);
  expect(parsedList.pkgList).toEqual([
    {
      group: "org.seleniumhq.selenium",
      name: "selenium-remote-driver",
      version: "4.5.0",
      qualifiers: { type: "jar" },
      "bom-ref":
        "pkg:maven/org.seleniumhq.selenium/selenium-remote-driver@4.5.0?type=jar",
      purl: "pkg:maven/org.seleniumhq.selenium/selenium-remote-driver@4.5.0?type=jar",
    },
  ]);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-rich4.dep", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(1);
  expect(parsedList.pkgList).toEqual([
    {
      group: "org.seleniumhq.selenium",
      name: "selenium-api",
      version: "4.5.0",
      qualifiers: { type: "jar" },
      "bom-ref":
        "pkg:maven/org.seleniumhq.selenium/selenium-api@4.5.0?type=jar",
      purl: "pkg:maven/org.seleniumhq.selenium/selenium-api@4.5.0?type=jar",
    },
  ]);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-rich5.dep", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(67);
  expect(parsedList.dependenciesList.length).toEqual(68);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-out-249.dep", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(21);
  expect(parsedList.dependenciesList.length).toEqual(22);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-service.out", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(35);
  expect(parsedList.dependenciesList.length).toEqual(36);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-s.out", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(28);
  expect(parsedList.dependenciesList.length).toEqual(29);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-core.out", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(18);
  expect(parsedList.dependenciesList.length).toEqual(19);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-single.out", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(152);
  expect(parsedList.dependenciesList.length).toEqual(153);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-android-app.dep", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(102);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-android-jetify.dep", {
      encoding: "utf-8",
    }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(1);
  expect(parsedList.pkgList).toEqual([
    {
      group: "androidx.appcompat",
      name: "appcompat",
      version: "1.2.0",
      qualifiers: { type: "jar" },
      "bom-ref": "pkg:maven/androidx.appcompat/appcompat@1.2.0?type=jar",
      purl: "pkg:maven/androidx.appcompat/appcompat@1.2.0?type=jar",
    },
  ]);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-sm.dep", { encoding: "utf-8" }),
    "test-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(6);
  expect(parsedList.dependenciesList.length).toEqual(7);
  parsedList = await parseGradleDep(
    readFileSync("./test/data/gradle-dependencies-559.txt", {
      encoding: "utf-8",
    }),
    "failing-project",
    modulesMap,
  );
  expect(parsedList.pkgList.length).toEqual(372);
});

test("parse gradle projects", () => {
  expect(parseGradleProjects(null)).toEqual({
    projects: [],
    rootProject: "root",
  });
  let retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-projects.out", { encoding: "utf-8" }),
  );
  expect(retMap.rootProject).toEqual("elasticsearch");
  expect(retMap.projects.length).toEqual(368);
  retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-projects1.out", { encoding: "utf-8" }),
  );
  expect(retMap.rootProject).toEqual("elasticsearch");
  expect(retMap.projects.length).toEqual(409);
  retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-projects2.out", { encoding: "utf-8" }),
  );
  expect(retMap.rootProject).toEqual("fineract");
  expect(retMap.projects.length).toEqual(22);
  retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-android-app.dep", { encoding: "utf-8" }),
  );
  expect(retMap.rootProject).toEqual("root");
  expect(retMap.projects).toEqual([":app"]);
  retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-properties-sm.txt", {
      encoding: "utf-8",
    }),
  );
  expect(retMap.rootProject).toEqual("root");
  expect(retMap.projects).toEqual([
    ":module:dummy:core",
    ":module:dummy:service",
    ":module:dummy:starter",
    ":custom:foo:service",
  ]);
});

test("parse gradle properties", () => {
  expect(parseGradleProperties(null)).toEqual({
    projects: [],
    rootProject: "root",
    metadata: {
      group: "",
      version: "latest",
      properties: [],
    },
  });
  let retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties.txt", { encoding: "utf-8" }),
  );
  expect(retMap).toEqual({
    rootProject: "dependency-diff-check",
    projects: [
      ":dependency-diff-check-client-starter",
      ":dependency-diff-check-common-core",
      ":dependency-diff-check-service",
    ],
    metadata: {
      group: "com.ajmalab",
      version: "0.0.1-SNAPSHOT",
      properties: [
        {
          name: "GradleModule",
          value: "dependency-diff-check",
        },
        {
          name: "buildFile",
          value:
            "/home/almalinux/work/sandbox/dependency-diff-check/build.gradle",
        },
        {
          name: "projectDir",
          value: "/home/almalinux/work/sandbox/dependency-diff-check",
        },
        {
          name: "rootDir",
          value: "/home/almalinux/work/sandbox/dependency-diff-check",
        },
      ],
    },
  });
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-single.txt", {
      encoding: "utf-8",
    }),
  );
  expect(retMap).toEqual({
    rootProject: "java-test",
    projects: [":app"],
    metadata: {
      group: "com.ajmalab.demo",
      version: "latest",
      properties: [
        {
          name: "GradleModule",
          value: "java-test",
        },
        {
          name: "buildFile",
          value: "/home/almalinux/work/sandbox/java-test/build.gradle",
        },
        {
          name: "projectDir",
          value: "/home/almalinux/work/sandbox/java-test",
        },
        { name: "rootDir", value: "/home/almalinux/work/sandbox/java-test" },
      ],
    },
  });
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-single2.txt", {
      encoding: "utf-8",
    }),
  );
  expect(retMap).toEqual({
    rootProject: "java-test",
    projects: [],
    metadata: {
      group: "com.ajmalab.demo",
      version: "latest",
      properties: [
        {
          name: "GradleModule",
          value: "java-test",
        },
        {
          name: "buildFile",
          value: "/home/almalinux/work/sandbox/java-test/build.gradle",
        },
        { name: "projectDir", value: "/home/almalinux/work/sandbox/java-test" },
        { name: "rootDir", value: "/home/almalinux/work/sandbox/java-test" },
      ],
    },
  });
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-elastic.txt", {
      encoding: "utf-8",
    }),
  );
  expect(retMap.rootProject).toEqual("elasticsearch");
  expect(retMap.projects.length).toEqual(409);
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-android.txt", {
      encoding: "utf-8",
    }),
  );
  expect(retMap.rootProject).toEqual("CdxgenAndroidTest");
  expect(retMap.projects.length).toEqual(2);
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-sm.txt", {
      encoding: "utf-8",
    }),
  );
  expect(retMap.rootProject).toEqual("root");
  expect(retMap.projects).toEqual([]);
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-559.txt", {
      encoding: "utf-8",
    }),
  );
  expect(retMap.rootProject).toEqual("failing-project");
  expect(retMap.projects).toEqual([]);
});

test("parse maven tree", () => {
  expect(parseMavenTree(null)).toEqual({});
  let parsedList = parseMavenTree(
    readFileSync("./test/data/sample-mvn-tree.txt", { encoding: "utf-8" }),
  );
  expect(parsedList.pkgList.length).toEqual(61);
  expect(parsedList.dependenciesList.length).toEqual(61);
  expect(parsedList.pkgList[0]).toEqual({
    "bom-ref": "pkg:maven/com.pogeyan.cmis/copper-server@1.15.2?type=war",
    group: "com.pogeyan.cmis",
    name: "copper-server",
    version: "1.15.2",
    qualifiers: { type: "war" },
    properties: [],
    purl: "pkg:maven/com.pogeyan.cmis/copper-server@1.15.2?type=war",
    scope: undefined,
  });
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/com.pogeyan.cmis/copper-server@1.15.2?type=war",
    dependsOn: [
      "pkg:maven/com.fasterxml.jackson.core/jackson-core@2.12.0?type=jar",
      "pkg:maven/com.fasterxml.jackson.core/jackson-databind@2.12.0?type=jar",
      "pkg:maven/com.github.davidb/metrics-influxdb@0.9.3?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-api@1.15.2?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-impl@1.15.2?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-ldap@1.15.2?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-mongo@1.15.2?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-repo@1.15.2?type=jar",
      "pkg:maven/com.typesafe.akka/akka-actor_2.11@2.4.14?type=jar",
      "pkg:maven/com.typesafe.akka/akka-cluster_2.11@2.4.14?type=jar",
      "pkg:maven/commons-fileupload/commons-fileupload@1.4?type=jar",
      "pkg:maven/commons-io/commons-io@2.6?type=jar",
      "pkg:maven/io.dropwizard.metrics/metrics-core@3.1.2?type=jar",
      "pkg:maven/javax/javaee-web-api@7.0?type=jar",
      "pkg:maven/junit/junit@4.12?type=jar",
      "pkg:maven/org.apache.chemistry.opencmis/chemistry-opencmis-server-support@1.0.0?type=jar",
      "pkg:maven/org.apache.commons/commons-lang3@3.4?type=jar",
      "pkg:maven/org.codehaus.jackson/jackson-mapper-asl@1.9.13?type=jar",
      "pkg:maven/org.slf4j/slf4j-log4j12@1.7.21?type=jar",
    ],
  });
  parsedList = parseMavenTree(
    readFileSync("./test/data/mvn-dep-tree-simple.txt", {
      encoding: "utf-8",
    }),
  );
  expect(parsedList.pkgList.length).toEqual(39);
  expect(parsedList.dependenciesList.length).toEqual(39);
  expect(parsedList.pkgList[0]).toEqual({
    "bom-ref":
      "pkg:maven/com.gitlab.security_products.tests/java-maven@1.0-SNAPSHOT?type=jar",
    purl: "pkg:maven/com.gitlab.security_products.tests/java-maven@1.0-SNAPSHOT?type=jar",
    group: "com.gitlab.security_products.tests",
    name: "java-maven",
    version: "1.0-SNAPSHOT",
    qualifiers: { type: "jar" },
    properties: [],
    scope: undefined,
  });
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/com.gitlab.security_products.tests/java-maven@1.0-SNAPSHOT?type=jar",
    dependsOn: [
      "pkg:maven/com.fasterxml.jackson.core/jackson-databind@2.9.2?type=jar",
      "pkg:maven/com.github.jnr/jffi@1.3.11?classifier=native&type=jar",
      "pkg:maven/com.github.jnr/jffi@1.3.11?type=jar",
      "pkg:maven/io.netty/netty@3.9.1.Final?type=jar",
      "pkg:maven/junit/junit@3.8.1?type=jar",
      "pkg:maven/org.apache.geode/geode-core@1.1.1?type=jar",
      "pkg:maven/org.apache.maven/maven-artifact@3.3.9?type=jar",
      "pkg:maven/org.mozilla/rhino@1.7.10?type=jar",
      "pkg:maven/org.powermock/powermock-api-mockito@1.7.3?type=jar",
    ],
  });
  parsedList = parseMavenTree(
    readFileSync("./test/data/mvn-p2-plugin.txt", {
      encoding: "utf-8",
    }),
  );
  expect(parsedList.pkgList.length).toEqual(79);
  expect(parsedList.pkgList[0]).toEqual({
    "bom-ref":
      "pkg:maven/example.group/eclipse-repository@1.0.0-SNAPSHOT?type=eclipse-repository",
    purl: "pkg:maven/example.group/eclipse-repository@1.0.0-SNAPSHOT?type=eclipse-repository",
    group: "example.group",
    name: "eclipse-repository",
    version: "1.0.0-SNAPSHOT",
    qualifiers: { type: "eclipse-repository" },
    scope: undefined,
    properties: [],
  });
  expect(parsedList.pkgList[4]).toEqual({
    "bom-ref":
      "pkg:maven/p2.eclipse.plugin/com.ibm.icu@67.1.0.v20200706-1749?type=eclipse-plugin",
    purl: "pkg:maven/p2.eclipse.plugin/com.ibm.icu@67.1.0.v20200706-1749?type=eclipse-plugin",
    group: "p2.eclipse.plugin",
    name: "com.ibm.icu",
    version: "67.1.0.v20200706-1749",
    qualifiers: { type: "eclipse-plugin" },
    scope: undefined,
    properties: [],
  });
  expect(parsedList.dependenciesList.length).toEqual(79);
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/example.group/eclipse-repository@1.0.0-SNAPSHOT?type=eclipse-repository",
    dependsOn: [
      "pkg:maven/example.group/example-bundle@0.1.0-SNAPSHOT?type=eclipse-plugin",
      "pkg:maven/example.group/example-feature-2@0.2.0-SNAPSHOT?type=eclipse-feature",
      "pkg:maven/example.group/example-feature@0.1.0-SNAPSHOT?type=eclipse-feature",
      "pkg:maven/example.group/org.tycho.demo.rootfiles.win@1.0.0-SNAPSHOT?type=p2-installable-unit",
      "pkg:maven/example.group/org.tycho.demo.rootfiles@1.0.0?type=p2-installable-unit",
    ],
  });
  parsedList = parseMavenTree(
    readFileSync("./test/data/mvn-metrics-tree.txt", {
      encoding: "utf-8",
    }),
  );
  expect(parsedList.pkgList.length).toEqual(58);
  expect(parsedList.parentComponent["bom-ref"]).toEqual(
    "pkg:maven/org.apache.dubbo/dubbo-metrics@3.3.0?type=pom",
  );
  expect(parsedList.dependenciesList.length).toEqual(58);
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/org.apache.dubbo/dubbo-metrics@3.3.0?type=pom",
    dependsOn: [
      "pkg:maven/org.apache.dubbo/dubbo-test-check@3.3.0?type=jar",
      "pkg:maven/org.awaitility/awaitility@4.2.0?type=jar",
      "pkg:maven/org.hamcrest/hamcrest@2.2?type=jar",
      "pkg:maven/org.junit.jupiter/junit-jupiter-engine@5.9.3?type=jar",
      "pkg:maven/org.junit.jupiter/junit-jupiter-params@5.9.3?type=jar",
      "pkg:maven/org.mockito/mockito-core@4.11.0?type=jar",
      "pkg:maven/org.mockito/mockito-inline@4.11.0?type=jar",
    ],
  });
  parsedList = parseMavenTree(
    readFileSync("./test/data/mvn-sbstarter-tree.txt", {
      encoding: "utf-8",
    }),
  );
  expect(parsedList.pkgList.length).toEqual(90);
  expect(parsedList.parentComponent["bom-ref"]).toEqual(
    "pkg:maven/org.apache.dubbo/dubbo-spring-boot-starter@3.3.0?type=jar",
  );
  expect(parsedList.dependenciesList.length).toEqual(90);
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/org.apache.dubbo/dubbo-spring-boot-starter@3.3.0?type=jar",
    dependsOn: [
      "pkg:maven/net.bytebuddy/byte-buddy-agent@1.15.0?type=jar",
      "pkg:maven/net.bytebuddy/byte-buddy@1.15.0?type=jar",
      "pkg:maven/org.apache.dubbo/dubbo-spring-boot-autoconfigure@3.3.0?type=jar",
      "pkg:maven/org.apache.dubbo/dubbo-test-check@3.3.0?type=jar",
      "pkg:maven/org.apache.logging.log4j/log4j-slf4j-impl@2.17.2?type=jar",
      "pkg:maven/org.awaitility/awaitility@4.2.0?type=jar",
      "pkg:maven/org.hamcrest/hamcrest@2.2?type=jar",
      "pkg:maven/org.junit.jupiter/junit-jupiter-engine@5.8.2?type=jar",
      "pkg:maven/org.junit.jupiter/junit-jupiter-params@5.8.2?type=jar",
      "pkg:maven/org.junit.vintage/junit-vintage-engine@5.8.2?type=jar",
      "pkg:maven/org.mockito/mockito-core@4.11.0?type=jar",
      "pkg:maven/org.mockito/mockito-inline@4.11.0?type=jar",
      "pkg:maven/org.yaml/snakeyaml@1.30?type=jar",
    ],
  });
});

// Slow test
/*
test("get maven metadata", async () => {
  let data = await utils.getMvnMetadata([
    {
      group: "com.squareup.okhttp3",
      name: "okhttp",
      version: "3.8.1",
    },
  ]);
  expect(data).toEqual([
    {
      description: "",
      group: "com.squareup.okhttp3",
      name: "okhttp",
      version: "3.8.1",
    },
  ]);

  data = await utils.getMvnMetadata([
    {
      group: "com.fasterxml.jackson.core",
      name: "jackson-databind",
      version: "2.8.5",
    },
    {
      group: "com.github.jnr",
      name: "jnr-posix",
      version: "3.0.47",
    },
  ]);
  expect(data).toEqual([
    {
      group: "com.fasterxml.jackson.core",
      name: "jackson-databind",
      version: "2.8.5",
      description:
        "General data-binding functionality for Jackson: works on core streaming API",
      repository: { url: "http://github.com/FasterXML/jackson-databind" },
    },
    {
      group: "com.github.jnr",
      name: "jnr-posix",
      version: "3.0.47",
      license: ["EPL-2.0", "GPL-2.0-only", "LGPL-2.1-only"],
      description: "\n    Common cross-project/cross-platform POSIX APIs\n  ",
      repository: { url: "git@github.com:jnr/jnr-posix.git" },
    },
  ]);
});
*/

test("get py metadata", async () => {
  const data = await getPyMetadata(
    [
      {
        group: "",
        name: "Flask",
        version: "1.1.0",
      },
    ],
    false,
  );
  expect(data).toEqual([
    {
      group: "",
      name: "Flask",
      version: "1.1.0",
    },
  ]);
}, 240000);

test("parseGoModData", async () => {
  let retMap = await parseGoModData(null);
  expect(retMap).toEqual({});
  const gosumMap = {
    "google.golang.org/grpc@v1.21.0":
      "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
    "github.com/aws/aws-sdk-go@v1.38.47": "sha256-fake-sha-for-aws-go-sdk=",
    "github.com/spf13/cobra@v1.0.0":
      "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
    "github.com/spf13/viper@v1.3.0":
      "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
    "github.com/stretchr/testify@v1.6.1":
      "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
  };
  retMap = await parseGoModData(
    readFileSync("./test/gomod/go.mod", { encoding: "utf-8" }),
    gosumMap,
  );
  expect(retMap.pkgList.length).toEqual(6);
  expect(retMap.pkgList).toEqual([
    {
      group: "",
      name: "github.com/aws/aws-sdk-go",
      version: "v1.38.47",
      _integrity: "sha256-fake-sha-for-aws-go-sdk=",
      purl: "pkg:golang/github.com/aws/aws-sdk-go@v1.38.47",
      "bom-ref": "pkg:golang/github.com/aws/aws-sdk-go@v1.38.47",
    },
    {
      group: "",
      name: "github.com/spf13/cobra",
      version: "v1.0.0",
      _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
      purl: "pkg:golang/github.com/spf13/cobra@v1.0.0",
      "bom-ref": "pkg:golang/github.com/spf13/cobra@v1.0.0",
    },
    {
      group: "",
      name: "github.com/spf13/viper",
      version: "v1.0.2",
      purl: "pkg:golang/github.com/spf13/viper@v1.0.2",
      "bom-ref": "pkg:golang/github.com/spf13/viper@v1.0.2",
    },
    {
      group: "",
      name: "github.com/spf13/viper",
      version: "v1.3.0",
      _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
      purl: "pkg:golang/github.com/spf13/viper@v1.3.0",
      "bom-ref": "pkg:golang/github.com/spf13/viper@v1.3.0",
    },
    {
      group: "",
      name: "google.golang.org/grpc",
      version: "v1.21.0",
      _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
      purl: "pkg:golang/google.golang.org/grpc@v1.21.0",
      "bom-ref": "pkg:golang/google.golang.org/grpc@v1.21.0",
    },
    {
      group: "",
      name: "google.golang.org/grpc",
      version: "v1.32.0",
      purl: "pkg:golang/google.golang.org/grpc@v1.32.0",
      "bom-ref": "pkg:golang/google.golang.org/grpc@v1.32.0",
    },
  ]);

  retMap.pkgList.forEach((d) => {
    expect(d.license);
  });
  retMap = await parseGoModData(
    readFileSync("./test/data/go-dvwa.mod", { encoding: "utf-8" }),
    {},
  );
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:golang/github.com/sqreen/go-dvwa",
    name: "github.com/sqreen/go-dvwa",
    purl: "pkg:golang/github.com/sqreen/go-dvwa",
    type: "application",
  });
  expect(retMap.pkgList.length).toEqual(19);
  expect(retMap.rootList.length).toEqual(4);
  retMap = await parseGoModData(
    readFileSync("./test/data/go-syft.mod", { encoding: "utf-8" }),
    {},
  );
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:golang/github.com/anchore/syft",
    name: "github.com/anchore/syft",
    purl: "pkg:golang/github.com/anchore/syft",
    type: "application",
  });
  expect(retMap.pkgList.length).toEqual(239);
  expect(retMap.rootList.length).toEqual(84);
}, 120000);

test("parseGoSumData", async () => {
  let dep_list = await parseGosumData(null);
  expect(dep_list).toEqual([]);
  dep_list = await parseGosumData(
    readFileSync("./test/gomod/go.sum", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "google.golang.org/grpc",
    license: undefined,
    version: "v1.21.0",
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
    "bom-ref": "pkg:golang/google.golang.org/grpc@v1.21.0",
    purl: "pkg:golang/google.golang.org/grpc@v1.21.0",
  });
  expect(dep_list[1]).toEqual({
    group: "",
    name: "github.com/spf13/cobra",
    license: undefined,
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
    "bom-ref": "pkg:golang/github.com/spf13/cobra@v1.0.0",
    purl: "pkg:golang/github.com/spf13/cobra@v1.0.0",
  });
  expect(dep_list[2]).toEqual({
    group: "",
    name: "github.com/spf13/viper",
    license: undefined,
    version: "v1.0.2",
    _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
    "bom-ref": "pkg:golang/github.com/spf13/viper@v1.0.2",
    purl: "pkg:golang/github.com/spf13/viper@v1.0.2",
  });
  expect(dep_list[3]).toEqual({
    group: "",
    name: "github.com/stretchr/testify",
    license: undefined,
    version: "v1.6.1",
    _integrity: "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
    "bom-ref": "pkg:golang/github.com/stretchr/testify@v1.6.1",
    purl: "pkg:golang/github.com/stretchr/testify@v1.6.1",
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
}, 120000);

describe("go data with vcs", () => {
  beforeAll(() => {
    process.env.GO_FETCH_VCS = "true";
  });
  afterAll(() => {
    delete process.env.GO_FETCH_VCS;
  });
  test("parseGoSumData with vcs", async () => {
    let dep_list = await parseGosumData(null);
    expect(dep_list).toEqual([]);
    dep_list = await parseGosumData(
      readFileSync("./test/gomod/go.sum", { encoding: "utf-8" }),
    );
    expect(dep_list.length).toEqual(4);
    expect(dep_list[0]).toEqual({
      group: "",
      name: "google.golang.org/grpc",
      license: undefined,
      version: "v1.21.0",
      _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
      "bom-ref": "pkg:golang/google.golang.org/grpc@v1.21.0",
      purl: "pkg:golang/google.golang.org/grpc@v1.21.0",
      externalReferences: [
        {
          type: "vcs",
          url: "https://github.com/grpc/grpc-go",
        },
      ],
    });
    expect(dep_list[1]).toEqual({
      group: "",
      name: "github.com/spf13/cobra",
      license: undefined,
      version: "v1.0.0",
      _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
      "bom-ref": "pkg:golang/github.com/spf13/cobra@v1.0.0",
      purl: "pkg:golang/github.com/spf13/cobra@v1.0.0",
      externalReferences: [
        {
          type: "vcs",
          url: "https://github.com/spf13/cobra",
        },
      ],
    });
    expect(dep_list[2]).toEqual({
      group: "",
      name: "github.com/spf13/viper",
      license: undefined,
      version: "v1.0.2",
      _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
      "bom-ref": "pkg:golang/github.com/spf13/viper@v1.0.2",
      purl: "pkg:golang/github.com/spf13/viper@v1.0.2",
      externalReferences: [
        {
          type: "vcs",
          url: "https://github.com/spf13/viper",
        },
      ],
    });
    expect(dep_list[3]).toEqual({
      group: "",
      name: "github.com/stretchr/testify",
      license: undefined,
      version: "v1.6.1",
      _integrity: "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
      "bom-ref": "pkg:golang/github.com/stretchr/testify@v1.6.1",
      purl: "pkg:golang/github.com/stretchr/testify@v1.6.1",
      externalReferences: [
        {
          type: "vcs",
          url: "https://github.com/stretchr/testify",
        },
      ],
    });
    dep_list.forEach((d) => {
      expect(d.license);
    });
  }, 120000);

  test("parseGoModData", async () => {
    let retMap = await parseGoModData(null);
    expect(retMap).toEqual({});
    const gosumMap = {
      "google.golang.org/grpc@v1.21.0":
        "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
      "github.com/aws/aws-sdk-go@v1.38.47": "sha256-fake-sha-for-aws-go-sdk=",
      "github.com/spf13/cobra@v1.0.0":
        "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
      "github.com/spf13/viper@v1.3.0":
        "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
      "github.com/stretchr/testify@v1.6.1":
        "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
    };
    retMap = await parseGoModData(
      readFileSync("./test/gomod/go.mod", { encoding: "utf-8" }),
      gosumMap,
    );
    expect(retMap.pkgList.length).toEqual(6);
    expect(retMap.pkgList).toEqual([
      {
        group: "",
        name: "github.com/aws/aws-sdk-go",
        version: "v1.38.47",
        _integrity: "sha256-fake-sha-for-aws-go-sdk=",
        purl: "pkg:golang/github.com/aws/aws-sdk-go@v1.38.47",
        "bom-ref": "pkg:golang/github.com/aws/aws-sdk-go@v1.38.47",
        externalReferences: [
          {
            type: "vcs",
            url: "https://github.com/aws/aws-sdk-go",
          },
        ],
      },
      {
        group: "",
        name: "github.com/spf13/cobra",
        version: "v1.0.0",
        _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
        purl: "pkg:golang/github.com/spf13/cobra@v1.0.0",
        "bom-ref": "pkg:golang/github.com/spf13/cobra@v1.0.0",
        externalReferences: [
          {
            type: "vcs",
            url: "https://github.com/spf13/cobra",
          },
        ],
      },
      {
        group: "",
        name: "github.com/spf13/viper",
        version: "v1.0.2",
        purl: "pkg:golang/github.com/spf13/viper@v1.0.2",
        "bom-ref": "pkg:golang/github.com/spf13/viper@v1.0.2",
        externalReferences: [
          {
            type: "vcs",
            url: "https://github.com/spf13/viper",
          },
        ],
      },
      {
        group: "",
        name: "github.com/spf13/viper",
        version: "v1.3.0",
        _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
        purl: "pkg:golang/github.com/spf13/viper@v1.3.0",
        "bom-ref": "pkg:golang/github.com/spf13/viper@v1.3.0",
        externalReferences: [
          {
            type: "vcs",
            url: "https://github.com/spf13/viper",
          },
        ],
      },
      {
        group: "",
        name: "google.golang.org/grpc",
        version: "v1.21.0",
        _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
        purl: "pkg:golang/google.golang.org/grpc@v1.21.0",
        "bom-ref": "pkg:golang/google.golang.org/grpc@v1.21.0",
        externalReferences: [
          {
            type: "vcs",
            url: "https://github.com/grpc/grpc-go",
          },
        ],
      },
      {
        group: "",
        name: "google.golang.org/grpc",
        version: "v1.32.0",
        purl: "pkg:golang/google.golang.org/grpc@v1.32.0",
        "bom-ref": "pkg:golang/google.golang.org/grpc@v1.32.0",
        externalReferences: [
          {
            type: "vcs",
            url: "https://github.com/grpc/grpc-go",
          },
        ],
      },
    ]);

    retMap.pkgList.forEach((d) => {
      expect(d.license);
    });
    retMap = await parseGoModData(
      readFileSync("./test/data/go-dvwa.mod", { encoding: "utf-8" }),
      {},
    );
    expect(retMap.parentComponent).toEqual({
      "bom-ref": "pkg:golang/github.com/sqreen/go-dvwa",
      name: "github.com/sqreen/go-dvwa",
      purl: "pkg:golang/github.com/sqreen/go-dvwa",
      type: "application",
    });
    expect(retMap.pkgList.length).toEqual(19);
    expect(retMap.rootList.length).toEqual(4);
    retMap = await parseGoModData(
      readFileSync("./test/data/go-syft.mod", { encoding: "utf-8" }),
      {},
    );
    expect(retMap.parentComponent).toEqual({
      "bom-ref": "pkg:golang/github.com/anchore/syft",
      name: "github.com/anchore/syft",
      purl: "pkg:golang/github.com/anchore/syft",
      type: "application",
    });
    expect(retMap.pkgList.length).toEqual(239);
    expect(retMap.rootList.length).toEqual(84);
  }, 120000);
});

describe("go data with licenses", () => {
  beforeAll(() => {
    process.env.FETCH_LICENSE = "true";
  });
  afterAll(() => {
    delete process.env.FETCH_LICENSE;
  });
  test("parseGoSumData with licenses", async () => {
    let dep_list = await parseGosumData(null);
    expect(dep_list).toEqual([]);
    dep_list = await parseGosumData(
      readFileSync("./test/gomod/go.sum", { encoding: "utf-8" }),
    );
    expect(dep_list.length).toEqual(4);
    expect(dep_list[0]).toEqual({
      group: "",
      name: "google.golang.org/grpc",
      version: "v1.21.0",
      _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
      "bom-ref": "pkg:golang/google.golang.org/grpc@v1.21.0",
      purl: "pkg:golang/google.golang.org/grpc@v1.21.0",
      license: [
        {
          id: "Apache-2.0",
          url: "https://pkg.go.dev/google.golang.org/grpc?tab=licenses",
        },
      ],
    });
    expect(dep_list[1]).toEqual({
      group: "",
      name: "github.com/spf13/cobra",
      version: "v1.0.0",
      _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
      "bom-ref": "pkg:golang/github.com/spf13/cobra@v1.0.0",
      purl: "pkg:golang/github.com/spf13/cobra@v1.0.0",
      license: [
        {
          id: "Apache-2.0",
          url: "https://pkg.go.dev/github.com/spf13/cobra?tab=licenses",
        },
      ],
    });
    expect(dep_list[2]).toEqual({
      group: "",
      name: "github.com/spf13/viper",
      version: "v1.0.2",
      _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
      "bom-ref": "pkg:golang/github.com/spf13/viper@v1.0.2",
      purl: "pkg:golang/github.com/spf13/viper@v1.0.2",
      license: [
        {
          id: "MIT",
          url: "https://pkg.go.dev/github.com/spf13/viper?tab=licenses",
        },
      ],
    });
    expect(dep_list[3]).toEqual({
      group: "",
      name: "github.com/stretchr/testify",
      version: "v1.6.1",
      _integrity: "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
      "bom-ref": "pkg:golang/github.com/stretchr/testify@v1.6.1",
      purl: "pkg:golang/github.com/stretchr/testify@v1.6.1",
      license: [
        {
          id: "MIT",
          url: "https://pkg.go.dev/github.com/stretchr/testify?tab=licenses",
        },
      ],
    });
    dep_list.forEach((d) => {
      expect(d.license);
    });
  }, 120000);

  test("parseGoModData with licenses", async () => {
    let retMap = await parseGoModData(null);
    expect(retMap).toEqual({});
    const gosumMap = {
      "google.golang.org/grpc@v1.21.0":
        "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
      "github.com/aws/aws-sdk-go@v1.38.47": "sha256-fake-sha-for-aws-go-sdk=",
      "github.com/spf13/cobra@v1.0.0":
        "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
      "github.com/spf13/viper@v1.3.0":
        "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
      "github.com/stretchr/testify@v1.6.1":
        "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
    };
    retMap = await parseGoModData(
      readFileSync("./test/gomod/go.mod", { encoding: "utf-8" }),
      gosumMap,
    );
    expect(retMap.pkgList.length).toEqual(6);
    expect(retMap.pkgList).toEqual([
      {
        group: "",
        name: "github.com/aws/aws-sdk-go",
        version: "v1.38.47",
        _integrity: "sha256-fake-sha-for-aws-go-sdk=",
        purl: "pkg:golang/github.com/aws/aws-sdk-go@v1.38.47",
        "bom-ref": "pkg:golang/github.com/aws/aws-sdk-go@v1.38.47",
        license: [
          {
            id: "Apache-2.0",
            url: "https://pkg.go.dev/github.com/aws/aws-sdk-go?tab=licenses",
          },
        ],
      },
      {
        group: "",
        name: "github.com/spf13/cobra",
        version: "v1.0.0",
        _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
        purl: "pkg:golang/github.com/spf13/cobra@v1.0.0",
        "bom-ref": "pkg:golang/github.com/spf13/cobra@v1.0.0",
        license: [
          {
            id: "Apache-2.0",
            url: "https://pkg.go.dev/github.com/spf13/cobra?tab=licenses",
          },
        ],
      },
      {
        group: "",
        name: "github.com/spf13/viper",
        version: "v1.0.2",
        purl: "pkg:golang/github.com/spf13/viper@v1.0.2",
        "bom-ref": "pkg:golang/github.com/spf13/viper@v1.0.2",
        license: [
          {
            id: "MIT",
            url: "https://pkg.go.dev/github.com/spf13/viper?tab=licenses",
          },
        ],
      },
      {
        group: "",
        name: "github.com/spf13/viper",
        version: "v1.3.0",
        _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
        purl: "pkg:golang/github.com/spf13/viper@v1.3.0",
        "bom-ref": "pkg:golang/github.com/spf13/viper@v1.3.0",
        license: [
          {
            id: "MIT",
            url: "https://pkg.go.dev/github.com/spf13/viper?tab=licenses",
          },
        ],
      },
      {
        group: "",
        name: "google.golang.org/grpc",
        version: "v1.21.0",
        _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
        purl: "pkg:golang/google.golang.org/grpc@v1.21.0",
        "bom-ref": "pkg:golang/google.golang.org/grpc@v1.21.0",
        license: [
          {
            id: "Apache-2.0",
            url: "https://pkg.go.dev/google.golang.org/grpc?tab=licenses",
          },
        ],
      },
      {
        group: "",
        name: "google.golang.org/grpc",
        version: "v1.32.0",
        purl: "pkg:golang/google.golang.org/grpc@v1.32.0",
        "bom-ref": "pkg:golang/google.golang.org/grpc@v1.32.0",
        license: [
          {
            id: "Apache-2.0",
            url: "https://pkg.go.dev/google.golang.org/grpc?tab=licenses",
          },
        ],
      },
    ]);

    retMap.pkgList.forEach((d) => {
      expect(d.license);
    });
    retMap = await parseGoModData(
      readFileSync("./test/data/go-dvwa.mod", { encoding: "utf-8" }),
      {},
    );
    expect(retMap.parentComponent).toEqual({
      "bom-ref": "pkg:golang/github.com/sqreen/go-dvwa",
      name: "github.com/sqreen/go-dvwa",
      purl: "pkg:golang/github.com/sqreen/go-dvwa",
      type: "application",
    });
    expect(retMap.pkgList.length).toEqual(19);
    expect(retMap.rootList.length).toEqual(4);
    retMap = await parseGoModData(
      readFileSync("./test/data/go-syft.mod", { encoding: "utf-8" }),
      {},
    );
    expect(retMap.parentComponent).toEqual({
      "bom-ref": "pkg:golang/github.com/anchore/syft",
      name: "github.com/anchore/syft",
      purl: "pkg:golang/github.com/anchore/syft",
      type: "application",
    });
    expect(retMap.pkgList.length).toEqual(239);
    expect(retMap.rootList.length).toEqual(84);
  }, 120000);
});

test("parse go list dependencies", async () => {
  const retMap = await parseGoListDep(
    readFileSync("./test/data/golist-dep.txt", { encoding: "utf-8" }),
    {},
  );
  expect(retMap.pkgList.length).toEqual(4);
  expect(retMap.pkgList[0]).toEqual({
    group: "",
    name: "github.com/gorilla/mux",
    "bom-ref": "pkg:golang/github.com/gorilla/mux@v1.7.4",
    purl: "pkg:golang/github.com/gorilla/mux@v1.7.4",
    version: "v1.7.4",
    _integrity: undefined,
    license: undefined,
    scope: "required",
    properties: [
      {
        name: "SrcGoMod",
        value:
          "/home/almalinux/go/pkg/mod/cache/download/github.com/gorilla/mux/@v/v1.7.4.mod",
      },
      { name: "ModuleGoVersion", value: "1.12" },
      {
        name: "cdx:go:indirect",
        value: "false",
      },
    ],
  });
});

test("parse go mod graph", async () => {
  let retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-graph.txt", { encoding: "utf-8" }),
    undefined,
    {},
    [],
    {},
  );
  expect(retMap.pkgList.length).toEqual(536);
  expect(retMap.pkgList[0]).toEqual({
    _integrity: undefined,
    "bom-ref": "pkg:golang/cloud.google.com/go@v0.26.0",
    group: "",
    license: undefined,
    name: "cloud.google.com/go",
    purl: "pkg:golang/cloud.google.com/go@v0.26.0",
    version: "v0.26.0",
  });
  retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-dvwa-graph.txt", { encoding: "utf-8" }),
    "./test/data/go-dvwa.mod",
    {},
    [],
    {},
  );
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:golang/github.com/sqreen/go-dvwa",
    name: "github.com/sqreen/go-dvwa",
    purl: "pkg:golang/github.com/sqreen/go-dvwa",
    type: "application",
  });
  expect(retMap.pkgList.length).toEqual(19);
  expect(retMap.rootList.length).toEqual(4);
  retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-syft-graph.txt", { encoding: "utf-8" }),
    "./test/data/go-syft.mod",
    {},
    [],
    {},
  );
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:golang/github.com/anchore/syft",
    name: "github.com/anchore/syft",
    purl: "pkg:golang/github.com/anchore/syft",
    type: "application",
  });
  expect(retMap.pkgList.length).toEqual(235);
  expect(retMap.rootList.length).toEqual(84);
});

test("parse go mod why dependencies", () => {
  let pkg_name = parseGoModWhy(
    readFileSync("./test/data/gomodwhy.txt", { encoding: "utf-8" }),
  );
  expect(pkg_name).toEqual("github.com/mailgun/mailgun-go/v4");
  pkg_name = parseGoModWhy(
    readFileSync("./test/data/gomodwhynot.txt", { encoding: "utf-8" }),
  );
  expect(pkg_name).toBeUndefined();
});

test("parseGopkgData", async () => {
  let dep_list = await parseGopkgData(null);
  expect(dep_list).toEqual([]);
  dep_list = await parseGopkgData(
    readFileSync("./test/gopkg/Gopkg.lock", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(36);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "cloud.google.com/go",
    version: "v0.39.0",
    _integrity: "sha256-LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78=",
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
}, 120000);

test("parse go version data", async () => {
  let dep_list = await parseGoVersionData(
    readFileSync("./test/data/goversion.txt", { encoding: "utf-8" }),
    {},
  );
  expect(dep_list.length).toEqual(125);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "github.com/ShiftLeftSecurity/atlassian-connect-go",
    "bom-ref":
      "pkg:golang/github.com/ShiftLeftSecurity/atlassian-connect-go@v0.0.2",
    purl: "pkg:golang/github.com/ShiftLeftSecurity/atlassian-connect-go@v0.0.2",
    version: "v0.0.2",
    _integrity: "",
    license: undefined,
  });
  dep_list = await parseGoVersionData(
    readFileSync("./test/data/goversion2.txt", { encoding: "utf-8" }),
    {},
  );
  expect(dep_list.length).toEqual(149);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "cloud.google.com/go",
    "bom-ref": "pkg:golang/cloud.google.com/go@v0.79.0",
    purl: "pkg:golang/cloud.google.com/go@v0.79.0",
    version: "v0.79.0",
    _integrity: "sha256-oqqswrt4x6b9OGBnNqdssxBl1xf0rSUNjU2BR4BZar0=",
    license: undefined,
  });
});

test("parse cargo lock", async () => {
  expect(await parseCargoData(null)).toEqual([]);

  let dep_list = await parseCargoData("./test/Cargo.lock");
  expect(dep_list.length).toEqual(225);
  expect(dep_list[0]).toEqual({
    type: "library",
    group: "",
    "bom-ref": "pkg:cargo/abscissa_core@0.5.2",
    purl: "pkg:cargo/abscissa_core@0.5.2",
    name: "abscissa_core",
    version: "0.5.2",
    hashes: [
      {
        alg: "SHA-384",
        content:
          "6a07677093120a02583717b6dd1ef81d8de1e8d01bd226c83f0f9bdf3e56bb3a",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 0.6,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 0.6,
            value: "./test/Cargo.lock",
          },
        ],
      },
    },
    properties: [
      {
        name: "SrcFile",
        value: "./test/Cargo.lock",
      },
    ],
  });

  dep_list = await parseCargoData("./test/data/Cargom.lock");
  expect(dep_list.length).toEqual(243);
  expect(dep_list[0]).toEqual({
    type: "library",
    group: "",
    "bom-ref": "pkg:cargo/actix-codec@0.3.0",
    purl: "pkg:cargo/actix-codec@0.3.0",
    name: "actix-codec",
    version: "0.3.0",
    hashes: [
      {
        alg: "SHA-384",
        content:
          "78d1833b3838dbe990df0f1f87baf640cf6146e898166afe401839d1b001e570",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 0.6,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 0.6,
            value: "./test/data/Cargom.lock",
          },
        ],
      },
    },
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/Cargom.lock",
      },
    ],
  });

  // The base64 package does not have an associated checksum. Make sure the
  // function does not accidentally insert an undefined hashsum value.
  const base64Package = dep_list.find((pkg) => pkg.name === "base64");
  expect(base64Package).not.toContain("hashes");
});

test("parse cargo lock simple component representation", async () => {
  // If asking for a simple representation, we should skip any extended attributes.
  const componentList = await parseCargoData("./test/Cargo.lock");
  const firstPackage = componentList[0];
  expect(firstPackage).not.toContain("evidence");
});

test("parse cargo lock lists last package", async () => {
  // The implementation procedurally fills an object with the package
  // information line-by-line, considering a package's information "complete"
  // when the next package is found. This risks missing the last package in
  // the file, so this test case makes sure it is still found.
  const componentList = await parseCargoData("./test/data/Cargom.lock");
  expect(componentList.find((pkg) => pkg.name === "yaml-rust")).toBeTruthy();
});

test("parse cargo lock dependencies tests", async () => {
  const dependencyData = await parseCargoDependencyData(
    readFileSync("./test/Cargo.lock", { encoding: "utf-8" }),
  );
  const purlIsPackage = (purl, packageName) =>
    new RegExp(`^pkg:cargo/${packageName}@.+`).test(purl);

  expect(dependencyData.length).toBeGreaterThan(0);

  // Make sure some samples makes sense.
  // aho-corasick has a single dependency
  const ahoCorasick = dependencyData.find((dependency) =>
    purlIsPackage(dependency.ref, "aho-corasick"),
  );
  expect(ahoCorasick.dependsOn.length).toEqual(1);
  expect(purlIsPackage(ahoCorasick.dependsOn[0], "memchr")).toBeTruthy();

  // First edge case is component with a dependency of a specific version.
  // winapi-util has a dependency on "winapi 0.3.8"
  const winapiUtil = dependencyData.find((dependency) =>
    purlIsPackage(dependency.ref, "winapi-util"),
  );
  expect(purlIsPackage(winapiUtil.dependsOn[0], "winapi")).toBeTruthy();
  expect(winapiUtil.dependsOn[0]).toContain("0.3.8");

  // Second edge case is a component with a dependency of a specific version and a registry url.
  const base64 = dependencyData.find((dependency) =>
    purlIsPackage(dependency.ref, "base64"),
  );
  expect(purlIsPackage(base64.dependsOn[0], "byteorder")).toBeTruthy();
  expect(base64.dependsOn[0]).toContain("1.3.1");

  // Make sure we respect packages specifying different versions of the same package.
  // kernel32-sys is dependent on a different version of winapi than winapi-util.
  const kernel32Sys = dependencyData.find((dependency) =>
    purlIsPackage(dependency.ref, "kernel32-sys"),
  );
  expect(purlIsPackage(kernel32Sys.dependsOn[0], "winapi")).toBeTruthy();
  expect(kernel32Sys.dependsOn[0]).toContain("0.2.8");
});

test("parse dependency tree from cargo lock files without metadata footer", async () => {
  // CI tests revealed the function failed when applied to the Rust repo. It
  // fails because at least one Cargo.lock file did not have a metadata
  // section in the footer, making the regex trip up. This test is the
  // shortest form representing that case.
  const cargoFileContent = `# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 3

[[package]]
name = "package1"
version = "1.21.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8a30b2e23b9e17a9f90641c7ab1549cd9b44f296d3ccbf309d2863cfe398a0cb"
`;
  const dependencyData = await parseCargoDependencyData(cargoFileContent);
  expect(dependencyData).toBeTruthy();
  expect(dependencyData.length).toEqual(1);
});

test("parse cargo lock dependencies tests for files on Windows", async () => {
  const fileContent = await readFileSync("./test/Cargo.lock", {
    encoding: "utf-8",
  });

  // Simulate Windows files by forcing CRLF line endings to the data we
  // attempt to parse.
  const crlfFileContent = fileContent.replace(/(\r\n|\n)/g, "\r\n");

  // The function's logic is tested by other test functions. This test will
  // serve as a smoke test for files on Windows, to make sure the function
  // handles both types of input.
  const dependencyData = parseCargoDependencyData(crlfFileContent);
  expect(dependencyData).toBeTruthy();
  expect(dependencyData.length).toBeGreaterThan(1);
});

test("parse cargo lock dependencies tests with undefined dependency", async () => {
  // In case a package is listed as a dependency but is not defined as a
  // package in a file, the Cargo.lock-file is deemed broken. It has been
  // decided that such an occurence shouldn't fail the process, but continue
  // with a warning message.

  const cargoFileContent = `# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 3

[[package]]
name = "package1"
version = "1.21.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "8a30b2e23b9e17a9f90641c7ab1549cd9b44f296d3ccbf309d2863cfe398a0cb"
dependencies = ["does-not-exist"]
`;
  const dependencyData = await parseCargoDependencyData(cargoFileContent);
  expect(dependencyData).toBeTruthy();
  expect(dependencyData.length).toEqual(1);

  // The package for this test should have been skipped.
  expect(dependencyData.dependsOn).toBeFalsy();
});

test("parse cargo toml", async () => {
  expect(await parseCargoTomlData(null)).toEqual([]);
  let dep_list = await parseCargoTomlData("./test/data/Cargo1.toml");
  expect(dep_list.length).toEqual(4);
  expect(dep_list).toEqual([
    {
      author: "The Rust Project Developers",
      group: "",
      name: "unwind",
      version: "0.0.0",
      properties: [{ name: "SrcFile", value: "./test/data/Cargo1.toml" }],
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.5,
              value: "./test/data/Cargo1.toml",
            },
          ],
        },
      },
      purl: "pkg:cargo/unwind@0.0.0",
      "bom-ref": "pkg:cargo/unwind@0.0.0",
      type: "library",
    },
    {
      name: "libc",
      version: "0.2.79",
      properties: [{ name: "SrcFile", value: "./test/data/Cargo1.toml" }],
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.5,
              value: "./test/data/Cargo1.toml",
            },
          ],
        },
      },
      purl: "pkg:cargo/libc@0.2.79",
      "bom-ref": "pkg:cargo/libc@0.2.79",
      type: "library",
    },
    {
      name: "compiler_builtins",
      version: "0.1.0",
      properties: [{ name: "SrcFile", value: "./test/data/Cargo1.toml" }],
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.5,
              value: "./test/data/Cargo1.toml",
            },
          ],
        },
      },
      purl: "pkg:cargo/compiler_builtins@0.1.0",
      "bom-ref": "pkg:cargo/compiler_builtins@0.1.0",
      type: "library",
    },
    {
      name: "cfg-if",
      version: "0.1.8",
      properties: [{ name: "SrcFile", value: "./test/data/Cargo1.toml" }],
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.5,
              value: "./test/data/Cargo1.toml",
            },
          ],
        },
      },
      purl: "pkg:cargo/cfg-if@0.1.8",
      "bom-ref": "pkg:cargo/cfg-if@0.1.8",
      type: "library",
    },
  ]);
  dep_list = await parseCargoTomlData("./test/data/Cargo2.toml");
  expect(dep_list.length).toEqual(3);
  expect(dep_list).toEqual([
    {
      group: "",
      name: "quiche-fuzz",
      version: "0.1.0",
      author: "Alessandro Ghedini <alessandro@ghedini.me>",
      properties: [{ name: "SrcFile", value: "./test/data/Cargo2.toml" }],
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.5,
              value: "./test/data/Cargo2.toml",
            },
          ],
        },
      },
      purl: "pkg:cargo/quiche-fuzz@0.1.0",
      "bom-ref": "pkg:cargo/quiche-fuzz@0.1.0",
      type: "library",
    },
    {
      name: "lazy_static",
      version: "1",
      properties: [{ name: "SrcFile", value: "./test/data/Cargo2.toml" }],
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.5,
              value: "./test/data/Cargo2.toml",
            },
          ],
        },
      },
      purl: "pkg:cargo/lazy_static@1",
      "bom-ref": "pkg:cargo/lazy_static@1",
      type: "library",
    },
    {
      name: "libfuzzer-sys",
      version: "git+https://github.com/rust-fuzz/libfuzzer-sys.git",
      properties: [{ name: "SrcFile", value: "./test/data/Cargo2.toml" }],
      evidence: {
        identity: {
          field: "purl",
          confidence: 0.5,
          methods: [
            {
              technique: "manifest-analysis",
              confidence: 0.5,
              value: "./test/data/Cargo2.toml",
            },
          ],
        },
      },
      purl: "pkg:cargo/libfuzzer-sys@git%2Bhttps:%2F%2Fgithub.com%2Frust-fuzz%2Flibfuzzer-sys.git",
      "bom-ref":
        "pkg:cargo/libfuzzer-sys@git+https://github.com/rust-fuzz/libfuzzer-sys.git",
      type: "library",
    },
  ]);
  dep_list = await parseCargoTomlData("./test/data/Cargo3.toml", true);
  expect(dep_list.length).toEqual(10);
});

test("parse cargo auditable data", async () => {
  expect(await parseCargoAuditableData(null)).toEqual([]);
  const dep_list = await parseCargoAuditableData(
    readFileSync("./test/data/cargo-auditable.txt", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(32);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "adler",
    version: "1.0.2",
  });
});

test("get crates metadata", async () => {
  const dep_list = await getCratesMetadata([
    {
      group: "",
      name: "abscissa_core",
      version: "0.5.2",
      _integrity:
        "sha256-6a07677093120a02583717b6dd1ef81d8de1e8d01bd226c83f0f9bdf3e56bb3a",
    },
  ]);
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "abscissa_core",
    version: "0.5.2",
    _integrity:
      "sha256-6a07677093120a02583717b6dd1ef81d8de1e8d01bd226c83f0f9bdf3e56bb3a",
    description:
      "Application microframework with support for command-line option parsing,\nconfiguration, error handling, logging, and terminal interactions.\nThis crate contains the framework's core functionality.\n",
    distribution: {
      url: "https://crates.io/api/v1/crates/abscissa_core/0.5.2/download",
    },
    license: "Apache-2.0",
    repository: {
      url: "https://github.com/iqlusioninc/abscissa/tree/main/core/",
    },
    homepage: { url: "https://github.com/iqlusioninc/abscissa/" },
    properties: [
      { name: "cdx:cargo:crate_id", value: "207912" },
      { name: "cdx:cargo:latest_version", value: "0.8.2" },
      {
        name: "cdx:cargo:features",
        value:
          '{"application":["config","generational-arena","trace","options","semver/serde","terminal"],"config":["secrets","serde","terminal","toml"],"default":["application","signals","secrets","testing","time"],"gimli-backtrace":["backtrace/gimli-symbolize","color-backtrace/gimli-symbolize"],"options":["gumdrop"],"secrets":["secrecy"],"signals":["libc","signal-hook"],"terminal":["color-backtrace","termcolor"],"testing":["regex","wait-timeout"],"time":["chrono"],"trace":["tracing","tracing-log","tracing-subscriber"]}',
      },
    ],
  });
}, 20000);

test("parse pub lock", async () => {
  expect(await parsePubLockData(null)).toEqual([]);
  const ret_val = await parsePubLockData(
    readFileSync("./test/data/pubspec.lock", { encoding: "utf-8" }),
  );
  const root_list = ret_val.rootList;
  let dep_list = ret_val.pkgList;
  expect(dep_list.length).toEqual(28);
  expect(dep_list[0]).toEqual({
    name: "async",
    version: "2.11.0",
    _integrity:
      "sha256-947bfcf187f74dbc5e146c9eb9c0f10c9f8b30743e341481c1e2ed3ecc18c20c",
    "bom-ref": "pkg:pub/async@2.11.0",
    scope: "required",
    properties: [],
  });
  expect(root_list.length).toEqual(3);
  expect(root_list[0]).toEqual({
    name: "flare_flutter",
    version: "3.0.2",
    _integrity:
      "sha256-99d63c60f00fac81249ce6410ee015d7b125c63d8278a30da81edf3317a1f6a0",
    "bom-ref": "pkg:pub/flare_flutter@3.0.2",
    scope: "required",
    properties: [],
  });
  dep_list = parsePubYamlData(
    readFileSync("./test/data/pubspec.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    name: "awesome_dialog",
    version: "2.2.1",
    description:
      "Flutter package to show beautiful dialogs(INFO,QUESTION,WARNING,SUCCESS,ERROR) with animations as simply as possible.",
    homepage: {
      url: "https://github.com/marcos930807/awesomeDialogs",
    },
    "bom-ref": "pkg:pub/awesome_dialog@2.2.1",
    purl: "pkg:pub/awesome_dialog@2.2.1",
  });
});

// This test is flaky
test("get dart metadata", async () => {
  const dep_list = await getDartMetadata([
    {
      group: "",
      name: "async",
      version: "2.11.0",
    },
  ]);
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "async",
    version: "2.11.0",
    description:
      "Utility functions and classes related to the 'dart:async' library.",
    repository: {
      url: "https://github.com/dart-lang/async",
    },
  });
}, 120000);

test("parse cabal freeze", () => {
  expect(parseCabalData(null)).toEqual([]);
  let dep_list = parseCabalData(
    readFileSync("./test/data/cabal.project.freeze", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(24);
  expect(dep_list[0]).toEqual({
    name: "ansi-terminal",
    version: "0.11.3",
  });
  dep_list = parseCabalData(
    readFileSync("./test/data/cabal-2.project.freeze", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(366);
  expect(dep_list[0]).toEqual({
    name: "Cabal",
    version: "3.2.1.0",
  });
});

test("parse conan data", () => {
  expect(parseConanLockData(null)).toEqual([]);
  let dep_list = parseConanLockData(
    readFileSync("./test/data/conan.lock", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    name: "zstd",
    version: "1.4.4",
    "bom-ref": "pkg:conan/zstd@1.4.4",
    purl: "pkg:conan/zstd@1.4.4",
  });
  dep_list = parseConanData(
    readFileSync("./test/data/conanfile.txt", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    name: "zstd",
    version: "1.4.4",
    "bom-ref": "pkg:conan/zstd@1.4.4",
    purl: "pkg:conan/zstd@1.4.4",
    scope: "required",
  });
  dep_list = parseConanData(
    readFileSync("./test/data/cmakes/conanfile.txt", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    name: "qr-code-generator",
    version: "1.8.0",
    "bom-ref": "pkg:conan/qr-code-generator@1.8.0",
    purl: "pkg:conan/qr-code-generator@1.8.0",
    scope: "required",
  });
  dep_list = parseConanData(
    readFileSync("./test/data/cmakes/conanfile1.txt", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(43);
  expect(dep_list[0]).toEqual({
    "bom-ref":
      "pkg:conan/7-Zip@19.00?channel=stable&rrev=bb67aa9bc0da3feddc68ca9f334f4c8b&user=iw",
    name: "7-Zip",
    purl: "pkg:conan/7-Zip@19.00?channel=stable&rrev=bb67aa9bc0da3feddc68ca9f334f4c8b&user=iw",
    scope: "required",
    version: "19.00",
  });
});

test("conan package reference mapper to pURL", () => {
  const checkParseResult = (inputPkgRef, expectedPurl) => {
    const [purl, name, version] =
      mapConanPkgRefToPurlStringAndNameAndVersion(inputPkgRef);
    expect(purl).toEqual(expectedPurl);

    const expectedPurlPrefix = `pkg:conan/${name}@${version}`;
    expect(purl.substring(0, expectedPurlPrefix.length)).toEqual(
      expectedPurlPrefix,
    );
  };

  checkParseResult("testpkg", "pkg:conan/testpkg@latest");

  checkParseResult("testpkg/1.2.3", "pkg:conan/testpkg@1.2.3");

  checkParseResult(
    "testpkg/1.2.3#recipe_revision",
    "pkg:conan/testpkg@1.2.3?rrev=recipe_revision",
  );

  checkParseResult(
    "testpkg/1.2.3@someuser/somechannel",
    "pkg:conan/testpkg@1.2.3?channel=somechannel&user=someuser",
  );

  checkParseResult(
    "testpkg/1.2.3@someuser/somechannel#recipe_revision",
    "pkg:conan/testpkg@1.2.3?channel=somechannel&rrev=recipe_revision&user=someuser",
  );

  checkParseResult(
    "testpkg/1.2.3@someuser/somechannel#recipe_revision:package_id#package_revision",
    "pkg:conan/testpkg@1.2.3" +
      "?channel=somechannel" +
      "&prev=package_revision" +
      "&rrev=recipe_revision" +
      "&user=someuser",
  );

  const expectParseError = (pkgRef) => {
    const result = mapConanPkgRefToPurlStringAndNameAndVersion(pkgRef);
    expect(result[0]).toBe(null);
    expect(result[1]).toBe(null);
    expect(result[2]).toBe(null);
  };

  expectParseError("testpkg/"); // empty version
  expectParseError("testpkg/1.2.3@"); // empty user
  expectParseError("testpkg/1.2.3@someuser"); // pkg ref is not allowed to stop here
  expectParseError("testpkg/1.2.3@someuser/"); // empty channel
  expectParseError("testpkg/1.2.3@someuser/somechannel#"); // empty recipe revision
  expectParseError("testpkg/1.2.3@someuser/somechannel#recipe_revision:"); // empty package id
  expectParseError(
    "testpkg/1.2.3@someuser/somechannel#recipe_revision:package_id",
  ); // pkg ref is not allowed to stop here
  expectParseError(
    "testpkg/1.2.3@someuser/somechannel#recipe_revision:package_id#",
  ); // empty package revision
  expectParseError("testpkg/1.2.3/unexpected"); // unexpected pkg ref segment separator
  expectParseError("testpkg/1.2.3@someuser/somechannel/unexpected"); // unexpected pkg ref segment separator
  expectParseError(
    "testpkg/1.2.3@someuser/somechannel#recipe_revision/unexpected",
  ); // unexpected pkg ref segment separator
  expectParseError(
    "testpkg/1.2.3@someuser/somechannel#recipe_revision:package_id/unexpected",
  ); // unexpected pkg ref segment separator
  expectParseError(
    "testpkg/1.2.3@someuser/somechannel#recipe_revision:package_id#package_revision/unexpected",
  ); // unexpected pkg ref segment separator
});

test("parse conan data where packages use custom user/channel", () => {
  let dep_list = parseConanLockData(
    readFileSync("./test/data/conan.with_custom_pkg_user_channel.lock", {
      encoding: "utf-8",
    }),
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    name: "libcurl",
    version: "8.1.2",
    "bom-ref":
      "pkg:conan/libcurl@8.1.2?channel=stable&rrev=25215c550633ef0224152bc2c0556698&user=internal",
    purl: "pkg:conan/libcurl@8.1.2?channel=stable&rrev=25215c550633ef0224152bc2c0556698&user=internal",
  });
  expect(dep_list[1]).toEqual({
    name: "openssl",
    version: "3.1.0",
    "bom-ref":
      "pkg:conan/openssl@3.1.0?channel=stable&rrev=c9c6ab43aa40bafacf8b37c5948cdb1f&user=internal",
    purl: "pkg:conan/openssl@3.1.0?channel=stable&rrev=c9c6ab43aa40bafacf8b37c5948cdb1f&user=internal",
  });
  expect(dep_list[2]).toEqual({
    name: "zlib",
    version: "1.2.13",
    "bom-ref":
      "pkg:conan/zlib@1.2.13?channel=stable&rrev=aee6a56ff7927dc7261c55eb2db4fc5b&user=internal",
    purl: "pkg:conan/zlib@1.2.13?channel=stable&rrev=aee6a56ff7927dc7261c55eb2db4fc5b&user=internal",
  });
  expect(dep_list[3]).toEqual({
    name: "fmt",
    version: "10.0.0",
    purl: "pkg:conan/fmt@10.0.0?channel=stable&rrev=79e7cc169695bc058fb606f20df6bb10&user=internal",
    "bom-ref":
      "pkg:conan/fmt@10.0.0?channel=stable&rrev=79e7cc169695bc058fb606f20df6bb10&user=internal",
  });

  dep_list = parseConanData(
    readFileSync("./test/data/conanfile.with_custom_pkg_user_channel.txt", {
      encoding: "utf-8",
    }),
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    name: "libcurl",
    version: "8.1.2",
    "bom-ref": "pkg:conan/libcurl@8.1.2?channel=stable&user=internal",
    purl: "pkg:conan/libcurl@8.1.2?channel=stable&user=internal",
    scope: "required",
  });
  expect(dep_list[1]).toEqual({
    name: "fmt",
    version: "10.0.0",
    purl: "pkg:conan/fmt@10.0.0?channel=stable&user=internal",
    "bom-ref": "pkg:conan/fmt@10.0.0?channel=stable&user=internal",
    scope: "optional",
  });
});

test("parse clojure data", () => {
  expect(parseLeiningenData(null)).toEqual([]);
  let dep_list = parseLeiningenData(
    readFileSync("./test/data/project.clj", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(14);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "leiningen-core",
    version: "2.9.9-SNAPSHOT",
  });
  dep_list = parseLeiningenData(
    readFileSync("./test/data/project.clj.1", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(17);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.9.0",
  });
  dep_list = parseLeiningenData(
    readFileSync("./test/data/project.clj.2", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(49);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "bidi",
    version: "2.1.6",
  });
  dep_list = parseEdnData(
    readFileSync("./test/data/deps.edn", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(20);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.10.3",
  });
  dep_list = parseEdnData(
    readFileSync("./test/data/deps.edn.1", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(11);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.11.0-beta1",
  });
  dep_list = parseEdnData(
    readFileSync("./test/data/deps.edn.2", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(5);
  expect(dep_list[0]).toEqual({
    group: "clj-commons",
    name: "pomegranate",
    version: "1.2.1",
  });
  dep_list = parseCljDep(
    readFileSync("./test/data/clj-tree.txt", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(253);
  expect(dep_list[0]).toEqual({
    group: "org.bouncycastle",
    name: "bcprov-jdk15on",
    version: "1.70",
  });

  dep_list = parseLeinDep(
    readFileSync("./test/data/lein-tree.txt", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(47);
  expect(dep_list[0]).toEqual({
    group: "javax.xml.bind",
    name: "jaxb-api",
    version: "2.4.0-b180830.0359",
  });
});

test("parse mix lock data", () => {
  expect(parseMixLockData(null)).toEqual([]);
  let dep_list = parseMixLockData(
    readFileSync("./test/data/mix.lock", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(16);
  expect(dep_list[0]).toEqual({
    name: "absinthe",
    version: "1.7.0",
  });
  dep_list = parseMixLockData(
    readFileSync("./test/data/mix.lock.1", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(23);
  expect(dep_list[0]).toEqual({
    name: "bunt",
    version: "0.2.0",
  });
});

test("parse github actions workflow data", () => {
  expect(parseGitHubWorkflowData(null)).toEqual([]);
  let dep_list = parseGitHubWorkflowData(
    readFileSync("./.github/workflows/nodejs.yml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    group: "actions",
    name: "checkout",
    version: "v4",
  });
  dep_list = parseGitHubWorkflowData(
    readFileSync("./.github/workflows/repotests.yml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(13);
  expect(dep_list[0]).toEqual({
    group: "actions",
    name: "checkout",
    version: "v4",
  });
  dep_list = parseGitHubWorkflowData(
    readFileSync("./.github/workflows/app-release.yml", {
      encoding: "utf-8",
    }),
  );
  expect(dep_list.length).toEqual(3);
});

test("parse cs pkg data", () => {
  expect(parseCsPkgData(null)).toEqual([]);
  const dep_list = parseCsPkgData(
    readFileSync("./test/data/packages.config", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(21);
  expect(dep_list[0]).toEqual({
    "bom-ref": "pkg:nuget/Antlr@3.5.0.2",
    group: "",
    name: "Antlr",
    version: "3.5.0.2",
    purl: "pkg:nuget/Antlr@3.5.0.2",
  });
});

test("parse cs pkg data 2", () => {
  expect(parseCsPkgData(null)).toEqual([]);
  const dep_list = parseCsPkgData(
    readFileSync("./test/data/packages2.config", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    "bom-ref": "pkg:nuget/EntityFramework@6.2.0",
    group: "",
    name: "EntityFramework",
    version: "6.2.0",
    purl: "pkg:nuget/EntityFramework@6.2.0",
  });
});

test("parse cs proj", () => {
  expect(parseCsProjData(null)).toEqual([]);
  let retMap = parseCsProjData(
    readFileSync("./test/sample.csproj", { encoding: "utf-8" }),
  );
  expect(retMap?.parentComponent["bom-ref"]).toBeUndefined();
  expect(retMap.pkgList.length).toEqual(5);
  expect(retMap.pkgList[0]).toEqual({
    "bom-ref": "pkg:nuget/Microsoft.AspNetCore.Mvc.NewtonsoftJson@3.1.1",
    group: "",
    name: "Microsoft.AspNetCore.Mvc.NewtonsoftJson",
    version: "3.1.1",
    purl: "pkg:nuget/Microsoft.AspNetCore.Mvc.NewtonsoftJson@3.1.1",
  });
  expect(retMap?.parentComponent.properties).toEqual([
    { name: "cdx:dotnet:target_framework", value: "netcoreapp3.1" },
  ]);
  retMap = parseCsProjData(
    readFileSync("./test/data/WindowsFormsApplication1.csproj", {
      encoding: "utf-8",
    }),
  );
  expect(retMap.parentComponent).toEqual({
    type: "application",
    properties: [
      {
        name: "cdx:dotnet:project_guid",
        value: "{3336A23A-6F2C-46D4-89FA-93C726CEB23D}",
      },
      {
        name: "Namespaces",
        value: "WindowsFormsApplication1",
      },
      { name: "cdx:dotnet:target_framework", value: "v4.8" },
    ],
    name: "WindowsFormsApplication1",
    version: "8.0.30703",
    purl: "pkg:nuget/WindowsFormsApplication1@8.0.30703?output_type=WinExe",
    "bom-ref":
      "pkg:nuget/WindowsFormsApplication1@8.0.30703?output_type=WinExe",
  });
  expect(retMap.pkgList.length).toEqual(53);
  expect(retMap.pkgList[0]).toEqual({
    group: "",
    name: "activeup.net.common",
    purl: "pkg:nuget/activeup.net.common",
    "bom-ref": "pkg:nuget/activeup.net.common",
    properties: [
      {
        name: "cdx:dotnet:hint_path",
        value: "..\\activeup.net.common.dll",
      },
      {
        name: "PackageFiles",
        value: "activeup.net.common.dll",
      },
    ],
  });
  expect(retMap.dependencies).toEqual([
    {
      ref: "pkg:nuget/WindowsFormsApplication1@8.0.30703?output_type=WinExe",
      dependsOn: [
        "pkg:nuget/BespokeFusion@1.0.1.10",
        "pkg:nuget/BouncyCastle.Crypto@1.7.4137.9688",
        "pkg:nuget/Bunifu_UI_v1.5.3",
        "pkg:nuget/Google.Apis.Auth.PlatformServices@1.10.0.25333",
        "pkg:nuget/Google.Apis.Auth@1.10.0.25333",
        "pkg:nuget/Google.Apis.Calendar.v3",
        "pkg:nuget/Google.Apis.Core@1.10.0.25331",
        "pkg:nuget/Google.Apis.Oauth2.v2",
        "pkg:nuget/Google.Apis.PlatformServices@1.10.0.25332",
        "pkg:nuget/Google.Apis.Sheets.v4@1.35.2.1356",
        "pkg:nuget/Google.Apis.Tasks.v1",
        "pkg:nuget/Google.Apis@1.10.0.25332",
        "pkg:nuget/Google.GData.Apps",
        "pkg:nuget/Google.GData.Client",
        "pkg:nuget/Google.GData.Contacts",
        "pkg:nuget/Google.GData.Extensions",
        "pkg:nuget/Google.GData.Spreadsheets",
        "pkg:nuget/HtmlAgilityPack@1.4.6.0",
        "pkg:nuget/MailKit",
        "pkg:nuget/Microsoft.CSharp",
        "pkg:nuget/Microsoft.Threading.Tasks.Extensions.Desktop@1.0.168.0",
        "pkg:nuget/Microsoft.Threading.Tasks.Extensions@1.0.12.0",
        "pkg:nuget/Microsoft.Threading.Tasks@1.0.12.0",
        "pkg:nuget/Microsoft.VisualBasic",
        "pkg:nuget/MimeKit",
        "pkg:nuget/Newtonsoft.Json@7.0.0.0",
        "pkg:nuget/Proxy@3.0.16061.1530",
        "pkg:nuget/S22.Imap",
        "pkg:nuget/SKGL",
        "pkg:nuget/System",
        "pkg:nuget/System.Core",
        "pkg:nuget/System.Data",
        "pkg:nuget/System.Data.DataSetExtensions",
        "pkg:nuget/System.Deployment",
        "pkg:nuget/System.Drawing",
        "pkg:nuget/System.IO@2.6.10.0",
        "pkg:nuget/System.Management",
        "pkg:nuget/System.Net",
        "pkg:nuget/System.Net.Http.Extensions@2.2.29.0",
        "pkg:nuget/System.Net.Http.Primitives@2.2.29.0",
        "pkg:nuget/System.Net.Http.WebRequest@2.2.29.0",
        "pkg:nuget/System.Net.Http@2.2.29.0",
        "pkg:nuget/System.Runtime@2.6.10.0",
        "pkg:nuget/System.Threading.Tasks@2.6.10.0",
        "pkg:nuget/System.Windows.Forms",
        "pkg:nuget/System.Xml",
        "pkg:nuget/System.Xml.Linq",
        "pkg:nuget/WebDriver@3.13.1.0",
        "pkg:nuget/Zlib.Portable@1.11.0.0",
        "pkg:nuget/activeup.net.common",
        "pkg:nuget/activeup.net.imap4",
        "pkg:nuget/log4net@1.2.13.0",
        "pkg:nuget/nunit.framework@3.10.1.0",
      ],
    },
  ]);
  expect(retMap?.parentComponent.properties).toEqual([
    {
      name: "cdx:dotnet:project_guid",
      value: "{3336A23A-6F2C-46D4-89FA-93C726CEB23D}",
    },
    {
      name: "Namespaces",
      value: "WindowsFormsApplication1",
    },
    {
      name: "cdx:dotnet:target_framework",
      value: "v4.8",
    },
  ]);
  retMap = parseCsProjData(
    readFileSync("./test/data/Server.csproj", {
      encoding: "utf-8",
    }),
  );
  expect(retMap.parentComponent).toEqual({
    type: "library",
    properties: [
      {
        name: "cdx:dotnet:project_guid",
        value: "{6BA9F9E1-E43C-489D-A3B4-8916CA2D4C5F}",
      },
      { name: "Namespaces", value: "OutputMgr.Server" },
      { name: "cdx:dotnet:target_framework", value: "v4.8" },
    ],
    name: "Server",
    version: "9.0.21022",
    purl: "pkg:nuget/Server@9.0.21022",
    "bom-ref": "pkg:nuget/Server@9.0.21022",
  });
  expect(retMap.pkgList.length).toEqual(34);
  expect(retMap?.parentComponent.properties).toEqual([
    {
      name: "cdx:dotnet:project_guid",
      value: "{6BA9F9E1-E43C-489D-A3B4-8916CA2D4C5F}",
    },
    {
      name: "Namespaces",
      value: "OutputMgr.Server",
    },
    {
      name: "cdx:dotnet:target_framework",
      value: "v4.8",
    },
  ]);
  retMap = parseCsProjData(
    readFileSync("./test/data/Logging.csproj", {
      encoding: "utf-8",
    }),
  );
  expect(retMap?.parentComponent["bom-ref"]).toBeUndefined();
  expect(retMap?.parentComponent.properties).toEqual([
    { name: "Namespaces", value: "Sample.OData" },
    { name: "cdx:dotnet:target_framework", value: "$(TargetFrameworks);" },
  ]);
});

test("parse project.assets.json", () => {
  expect(parseCsProjAssetsData(null)).toEqual({
    dependenciesList: [],
    pkgList: [],
  });
  let dep_list = parseCsProjAssetsData(
    readFileSync("./test/data/project.assets.json", { encoding: "utf-8" }),
    "./test/data/project.assets.json",
  );
  expect(dep_list["pkgList"].length).toEqual(302);
  expect(dep_list["pkgList"][0]).toEqual({
    "bom-ref": "pkg:nuget/Castle.Core.Tests@0.0.0",
    purl: "pkg:nuget/Castle.Core.Tests@0.0.0",
    group: "",
    name: "Castle.Core.Tests",
    type: "application",
    version: "0.0.0",
  });
  expect(dep_list["dependenciesList"].length).toEqual(302);
  expect(dep_list["dependenciesList"][0]).toEqual({
    dependsOn: [
      "pkg:nuget/Castle.Core-NLog@0.0.0",
      "pkg:nuget/Castle.Core-Serilog@0.0.0",
      "pkg:nuget/Castle.Core-log4net@0.0.0",
      "pkg:nuget/Castle.Core@0.0.0",
      "pkg:nuget/Microsoft.NET.Test.Sdk@17.1.0",
      "pkg:nuget/Microsoft.NETCore.App@2.1.0",
      "pkg:nuget/Microsoft.NETFramework.ReferenceAssemblies@1.0.0",
      "pkg:nuget/NLog@4.5.0",
      "pkg:nuget/NUnit.Console@3.11.1",
      "pkg:nuget/NUnit3TestAdapter@3.16.1",
      "pkg:nuget/NUnitLite@3.13.3",
      "pkg:nuget/PublicApiGenerator@10.1.2",
      "pkg:nuget/Serilog.Sinks.TextWriter@2.0.0",
      "pkg:nuget/Serilog@2.0.0",
      "pkg:nuget/System.Net.NameResolution@4.3.0",
      "pkg:nuget/System.Net.Primitives@4.3.0",
      "pkg:nuget/System.Security.Permissions@4.7.0",
      "pkg:nuget/System.Security.Permissions@6.0.0",
      "pkg:nuget/log4net@2.0.13",
    ],
    ref: "pkg:nuget/Castle.Core.Tests@0.0.0",
  });
  dep_list = parseCsProjAssetsData(
    readFileSync("./test/data/project.assets1.json", { encoding: "utf-8" }),
    "./test/data/project.assets1.json",
  );
  expect(dep_list["pkgList"].length).toEqual(43);
  expect(dep_list["pkgList"][0]).toEqual({
    "bom-ref": "pkg:nuget/Podcast.Server@1.0.0",
    purl: "pkg:nuget/Podcast.Server@1.0.0",
    group: "",
    name: "Podcast.Server",
    type: "application",
    version: "1.0.0",
  });
  /*
  const pkgList = addEvidenceForDotnet(
    dep_list.pkgList,
    "./test/data/dosai-methods.json"
  );
  expect(pkgList.length).toEqual(43);
  */
});

test("parse packages.lock.json", () => {
  expect(parseCsPkgLockData(null)).toEqual({
    dependenciesList: [],
    pkgList: [],
    rootList: [],
  });
  let dep_list = parseCsPkgLockData(
    readFileSync("./test/data/packages.lock.json", { encoding: "utf-8" }),
    "./test/data/packages.lock.json",
  );
  expect(dep_list["pkgList"].length).toEqual(14);
  expect(dep_list["pkgList"][0]).toEqual({
    group: "",
    name: "Antlr",
    version: "3.5.0.2",
    purl: "pkg:nuget/Antlr@3.5.0.2",
    "bom-ref": "pkg:nuget/Antlr@3.5.0.2",
    _integrity:
      "sha512-CSfrVuDVMx3OrQhT84zed+tOdM1clljyRLWWlQM22fJsmG836RVDGQlE6tzysXh8X8p9UjkHbLr6OqEIVhtdEA==",
    properties: [{ name: "SrcFile", value: "./test/data/packages.lock.json" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/packages.lock.json",
          },
        ],
      },
    },
  });
  dep_list = parseCsPkgLockData(
    readFileSync("./test/data/packages2.lock.json", { encoding: "utf-8" }),
    "./test/data/packages2.lock.json",
  );
  expect(dep_list["pkgList"].length).toEqual(34);
  expect(dep_list["dependenciesList"].length).toEqual(34);
  expect(dep_list["pkgList"][0]).toEqual({
    group: "",
    name: "McMaster.Extensions.Hosting.CommandLine",
    version: "4.0.1",
    purl: "pkg:nuget/McMaster.Extensions.Hosting.CommandLine@4.0.1",
    "bom-ref": "pkg:nuget/McMaster.Extensions.Hosting.CommandLine@4.0.1",
    _integrity:
      "sha512-pZJF/zeXT3OC+3GUNO9ZicpCO9I7wYLmj0E2qPR8CRA6iUs0kGu6SCkmraB1sITx4elcVjMLiZDGMsBVMqaPhg==",
    properties: [{ name: "SrcFile", value: "./test/data/packages2.lock.json" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/packages2.lock.json",
          },
        ],
      },
    },
  });
  expect(dep_list["dependenciesList"][0]).toEqual({
    ref: "pkg:nuget/McMaster.Extensions.Hosting.CommandLine@4.0.1",
    dependsOn: [
      "pkg:nuget/McMaster.Extensions.CommandLineUtils@4.0.1",
      "pkg:nuget/Microsoft.Extensions.Hosting.Abstractions@6.0.0",
      "pkg:nuget/Microsoft.Extensions.Logging.Abstractions@6.0.0",
    ],
  });
  dep_list = parseCsPkgLockData(
    readFileSync("./test/data/packages3.lock.json", { encoding: "utf-8" }),
    "./test/data/packages3.lock.json",
  );
  expect(dep_list["pkgList"].length).toEqual(15);
  expect(dep_list["pkgList"][1]).toEqual({
    group: "",
    name: "FSharp.Core",
    version: "4.5.2",
    purl: "pkg:nuget/FSharp.Core@4.5.2",
    "bom-ref": "pkg:nuget/FSharp.Core@4.5.2",
    _integrity:
      "sha512-apbdQOjzsjQ637kTWQuW29jqwY18jsHMyNC5A+TPJZKFEIE2cIfQWf3V7+mXrxlbX69BueYkv293/g70wuXuRw==",
    properties: [{ name: "SrcFile", value: "./test/data/packages3.lock.json" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/packages3.lock.json",
          },
        ],
      },
    },
  });
  expect(dep_list["dependenciesList"].length).toEqual(15);
});

test("parse paket.lock", () => {
  expect(parsePaketLockData(null)).toEqual({
    pkgList: [],
    dependenciesList: [],
  });
  const dep_list = parsePaketLockData(
    readFileSync("./test/data/paket.lock", { encoding: "utf-8" }),
    "./test/data/paket.lock",
  );
  expect(dep_list.pkgList.length).toEqual(13);
  expect(dep_list.pkgList[0]).toEqual({
    group: "",
    name: "0x53A.ReferenceAssemblies.Paket",
    version: "0.2",
    purl: "pkg:nuget/0x53A.ReferenceAssemblies.Paket@0.2",
    "bom-ref": "pkg:nuget/0x53A.ReferenceAssemblies.Paket@0.2",
    properties: [{ name: "SrcFile", value: "./test/data/paket.lock" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/paket.lock",
          },
        ],
      },
    },
  });
  expect(dep_list.dependenciesList.length).toEqual(13);
  expect(dep_list.dependenciesList[2]).toEqual({
    ref: "pkg:nuget/FSharp.Compiler.Service@17.0.1",
    dependsOn: [
      "pkg:nuget/System.Collections.Immutable@1.4",
      "pkg:nuget/System.Reflection.Metadata@1.5",
    ],
  });
});

test("parse .net cs proj", () => {
  expect(parseCsProjData(null)).toEqual([]);
  const retMap = parseCsProjData(
    readFileSync("./test/data/sample-dotnet.csproj", { encoding: "utf-8" }),
  );
  expect(retMap.parentComponent).toEqual({
    type: "library",
    properties: [
      { name: "Namespaces", value: "Calculator" },
      { name: "cdx:dotnet:target_framework", value: "v4.6.2" },
    ],
    name: "Calculator",
    purl: "pkg:nuget/Calculator@latest",
    "bom-ref": "pkg:nuget/Calculator@latest",
  });
  expect(retMap.pkgList.length).toEqual(19);
  expect(retMap.pkgList[0]).toEqual({
    group: "",
    name: "Antlr3.Runtime",
    version: "3.5.0.2",
    purl: "pkg:nuget/Antlr3.Runtime@3.5.0.2",
    "bom-ref": "pkg:nuget/Antlr3.Runtime@3.5.0.2",
    properties: [
      {
        name: "cdx:dotnet:hint_path",
        value: "..\\packages\\Antlr.3.5.0.2\\lib\\Antlr3.Runtime.dll",
      },
      {
        name: "PackageFiles",
        value: "Antlr3.Runtime.dll",
      },
    ],
  });
  for (const apkg of retMap.pkgList) {
    if (
      (apkg.name.startsWith("System.") ||
        apkg.name.startsWith("Mono.") ||
        apkg.name.startsWith("Microsoft.")) &&
      !apkg.version
    ) {
      expect(apkg.properties.length).toBeGreaterThanOrEqual(1);
      expect(apkg.properties[0].name).toEqual("cdx:dotnet:target_framework");
    }
  }
  expect(retMap.dependencies).toEqual([
    {
      ref: "pkg:nuget/Calculator@latest",
      dependsOn: [
        "pkg:nuget/Antlr3.Runtime@3.5.0.2",
        "pkg:nuget/Microsoft.AI.Agent.Intercept@2.4.0.0",
        "pkg:nuget/Microsoft.AI.DependencyCollector@2.5.1.0",
        "pkg:nuget/Microsoft.AI.PerfCounterCollector@2.5.1.0",
        "pkg:nuget/Microsoft.AI.ServerTelemetryChannel@2.5.1.0",
        "pkg:nuget/Microsoft.AI.Web@2.5.1.0",
        "pkg:nuget/Microsoft.AI.WindowsServer@2.5.1.0",
        "pkg:nuget/Microsoft.ApplicationInsights@2.5.1.0",
        "pkg:nuget/Microsoft.AspNet.SessionState.SessionStateModule@1.1.0.0",
        "pkg:nuget/Microsoft.AspNet.TelemetryCorrelation@1.0.0.0",
        "pkg:nuget/Microsoft.CSharp",
        "pkg:nuget/Microsoft.CodeDom.Providers.DotNetCompilerPlatform@1.0.8.0",
        "pkg:nuget/Microsoft.Web.Infrastructure@1.0.0.0",
        "pkg:nuget/Microsoft.Web.RedisSessionStateProvider@4.0.1.0",
        "pkg:nuget/Microsoft.WindowsAzure.Diagnostics@2.8.0.0",
        "pkg:nuget/Newtonsoft.Json@11.0.0.0",
        "pkg:nuget/Pipelines.Sockets.Unofficial@1.0.0.0",
        "pkg:nuget/StackExchange.Redis@2.0.0.0",
        "pkg:nuget/WebGrease@1.6.5135.21930",
      ],
    },
  ]);
});

test("get nget metadata", async () => {
  const dep_list = [
    {
      dependsOn: [
        "pkg:nuget/Microsoft.NET.Test.Sdk@17.1.0",
        "pkg:nuget/Microsoft.NETCore.App@2.1.0",
        "pkg:nuget/Microsoft.NETFramework.ReferenceAssemblies@1.0.0",
        "pkg:nuget/NLog@4.5.0",
        "pkg:nuget/NUnit.Console@3.11.1",
        "pkg:nuget/NUnit3TestAdapter@3.16.1",
        "pkg:nuget/NUnitLite@3.13.3",
        "pkg:nuget/PublicApiGenerator@10.1.2",
        "pkg:nuget/Serilog.Sinks.TextWriter@2.0.0",
        "pkg:nuget/Serilog@3.0.1",
        "pkg:nuget/System.Net.NameResolution@4.3.0",
        "pkg:nuget/System.Net.Primitives@4.3.0",
        "pkg:nuget/System.Security.Permissions@4.7.0",
        "pkg:nuget/System.Security.Permissions@6.0.0",
        "pkg:nuget/log4net@2.0.13",
      ],
      ref: "pkg:nuget/Castle.Core@4.4.0",
    },
    {
      dependsOn: [
        "pkg:nuget/Microsoft.CSharp@4.0.1",
        "pkg:nuget/System.Collections@4.0.11",
        "pkg:nuget/System.Dynamic.Runtime@4.0.11",
        "pkg:nuget/System.Globalization@4.0.11",
        "pkg:nuget/System.Linq@4.1.0",
        "pkg:nuget/System.Reflection.Extensions@4.0.1",
        "pkg:nuget/System.Reflection@4.1.0",
        "pkg:nuget/System.Runtime.Extensions@4.1.0",
        "pkg:nuget/System.Runtime@4.1.0",
        "pkg:nuget/System.Text.RegularExpressions@4.1.0",
        "pkg:nuget/System.Threading@4.0.11",
      ],
      ref: "pkg:nuget/Serilog@3.0.1",
    },
  ];
  const pkg_list = [
    {
      group: "",
      name: "Castle.Core",
      version: "4.4.0",
      "bom-ref": "pkg:nuget/Castle.Core@4.4.0",
    },
    {
      group: "",
      name: "Serilog",
      version: "3.0.1",
      "bom-ref": "pkg:nuget/Serilog@3.0.1",
    },
  ];
  const { pkgList, dependencies } = await getNugetMetadata(pkg_list, dep_list);
  // This data will need to be updated periodically as it tests that missing versions are set to the latest rc
  expect(pkgList).toEqual([
    {
      author: "Castle Project Contributors",
      "bom-ref": "pkg:nuget/Castle.Core@4.4.0",
      description:
        "Castle Core, including DynamicProxy, Logging Abstractions and DictionaryAdapter",
      group: "",
      homepage: {
        url: "https://www.nuget.org/packages/Castle.Core/4.4.0/",
      },
      license: "Apache-2.0",
      name: "Castle.Core",
      repository: {
        url: "http://www.castleproject.org/",
      },
      tags: [
        "castle",
        "dynamicproxy",
        "dynamic",
        "proxy",
        "dynamicproxy2",
        "dictionaryadapter",
        "emailsender",
      ],
      version: "4.4.0",
    },
    {
      author: "Serilog Contributors",
      "bom-ref": "pkg:nuget/Serilog@3.0.1",
      description: "Simple .NET logging with fully-structured events",
      group: "",
      homepage: {
        url: "https://www.nuget.org/packages/Serilog/3.0.1/",
      },
      license: "Apache-2.0",
      name: "Serilog",
      repository: {
        url: "https://serilog.net/",
      },
      tags: ["serilog", "logging", "semantic", "structured"],
      version: "3.0.1",
    },
  ]);
  expect(pkgList.length).toEqual(2);
  expect(dependencies).toEqual([
    {
      dependsOn: [
        "pkg:nuget/Microsoft.NET.Test.Sdk@17.1.0",
        "pkg:nuget/Microsoft.NETCore.App@2.1.0",
        "pkg:nuget/Microsoft.NETFramework.ReferenceAssemblies@1.0.0",
        "pkg:nuget/NLog@4.5.0",
        "pkg:nuget/NUnit.Console@3.11.1",
        "pkg:nuget/NUnit3TestAdapter@3.16.1",
        "pkg:nuget/NUnitLite@3.13.3",
        "pkg:nuget/PublicApiGenerator@10.1.2",
        "pkg:nuget/Serilog.Sinks.TextWriter@2.0.0",
        "pkg:nuget/Serilog@3.0.1",
        "pkg:nuget/System.Net.NameResolution@4.3.0",
        "pkg:nuget/System.Net.Primitives@4.3.0",
        "pkg:nuget/System.Security.Permissions@4.7.0",
        "pkg:nuget/System.Security.Permissions@6.0.0",
        "pkg:nuget/log4net@2.0.13",
      ],
      ref: "pkg:nuget/Castle.Core@4.4.0",
    },
    {
      dependsOn: [
        "pkg:nuget/Microsoft.CSharp@4.0.1",
        "pkg:nuget/System.Collections@4.0.11",
        "pkg:nuget/System.Dynamic.Runtime@4.0.11",
        "pkg:nuget/System.Globalization@4.0.11",
        "pkg:nuget/System.Linq@4.1.0",
        "pkg:nuget/System.Reflection.Extensions@4.0.1",
        "pkg:nuget/System.Reflection@4.1.0",
        "pkg:nuget/System.Runtime.Extensions@4.1.0",
        "pkg:nuget/System.Runtime@4.1.0",
        "pkg:nuget/System.Text.RegularExpressions@4.1.0",
        "pkg:nuget/System.Threading@4.0.11",
      ],
      ref: "pkg:nuget/Serilog@3.0.1",
    },
  ]);
}, 240000);

test("parsePomFile", () => {
  let data = parsePom("./test/data/pom-quarkus.xml");
  expect(data.dependencies.length).toEqual(46);
  expect(data.modules).toBeUndefined();
  expect(data.properties).toBeDefined();
  expect(data.isQuarkus).toBeTruthy();
  data = parsePom("./test/data/pom-quarkus-modules.xml");
  expect(data.dependencies.length).toEqual(0);
  expect(data.modules.length).toEqual(105);
  expect(data.properties).toBeDefined();
  expect(data.isQuarkus).toBeFalsy();
  data = parsePom("./test/pom.xml");
  expect(data.dependencies.length).toEqual(13);
  expect(data.isQuarkus).toBeFalsy();
});

test("parsePomMetadata", async () => {
  const deps = parsePom("./test/pom.xml");
  const data = await getMvnMetadata(deps.dependencies);
  expect(data.length).toEqual(deps.dependencies.length);
});

// These tests are disabled because they are returning undefined
/*
test("get repo license", async () => {
  let license = await getRepoLicense(
    "https://github.com/ShiftLeftSecurity/sast-scan",
    {
      group: "ShiftLeftSecurity",
      name: "sast-scan",
    },
  );
  expect(license).toEqual({
    id: "Apache-2.0",
    url: "https://github.com/ShiftLeftSecurity/sast-scan/blob/master/LICENSE",
  });

  license = await getRepoLicense("https://github.com/cyclonedx/cdxgen", {
    group: "cyclonedx",
    name: "cdxgen",
  });
  expect(license).toEqual({
    id: "Apache-2.0",
    url: "https://github.com/CycloneDX/cdxgen/blob/master/LICENSE",
  });

  license = await getRepoLicense("https://cloud.google.com/go", {
    group: "cloud.google.com",
    name: "go"
  });
  expect(license).toEqual("Apache-2.0");

  license = await getRepoLicense(undefined, {
    group: "github.com/ugorji",
    name: "go"
  });
  expect(license).toEqual({
    id: "MIT",
    url: "https://github.com/ugorji/go/blob/master/LICENSE"
  });
});

test("get go pkg license", async () => {
  let license = await getGoPkgLicense({
    group: "github.com/Azure/azure-amqp-common-go",
    name: "v2",
  });
  expect(license).toEqual([
    {
      id: "MIT",
      url: "https://pkg.go.dev/github.com/Azure/azure-amqp-common-go/v2?tab=licenses",
    },
  ]);

  license = await getGoPkgLicense({
    group: "go.opencensus.io",
    name: "go.opencensus.io",
  });
  expect(license).toEqual([
    {
      id: "Apache-2.0",
      url: "https://pkg.go.dev/go.opencensus.io?tab=licenses",
    },
  ]);

  license = await getGoPkgLicense({
    group: "github.com/DataDog",
    name: "zstd",
  });
  expect(license).toEqual([
    {
      id: "BSD-3-Clause",
      url: "https://pkg.go.dev/github.com/DataDog/zstd?tab=licenses",
    },
  ]);
});
*/

test("get licenses", () => {
  let licenses = getLicenses({ license: "MIT" });
  expect(licenses).toEqual([
    {
      license: {
        id: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
  ]);

  licenses = getLicenses({ license: ["MIT", "GPL-3.0-or-later"] });
  expect(licenses).toEqual([
    {
      license: {
        id: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    {
      license: {
        id: "GPL-3.0-or-later",
        url: "https://opensource.org/licenses/GPL-3.0-or-later",
      },
    },
  ]);

  licenses = getLicenses({
    license: {
      id: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  });
  expect(licenses).toEqual([
    {
      license: {
        id: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
  ]);

  licenses = getLicenses({
    license: "GPL-2.0+",
  });
  expect(licenses).toEqual([
    {
      license: {
        id: "GPL-2.0+",
        url: "https://opensource.org/licenses/GPL-2.0+",
      },
    },
  ]);

  licenses = getLicenses({
    license: "(MIT or Apache-2.0)",
  });
  expect(licenses).toEqual([
    {
      expression: "(MIT or Apache-2.0)",
    },
  ]);

  // In case this is not a known license in the current build but it is a valid SPDX license expression
  licenses = getLicenses({
    license: "NOT-GPL-2.1+",
  });
  expect(licenses).toEqual([
    {
      expression: "NOT-GPL-2.1+",
    },
  ]);

  licenses = getLicenses({
    license: "GPL-3.0-only WITH Classpath-exception-2.0",
  });
  expect(licenses).toEqual([
    {
      expression: "GPL-3.0-only WITH Classpath-exception-2.0",
    },
  ]);

  licenses = getLicenses({
    license: undefined,
  });
  expect(licenses).toEqual(undefined);
});

test("parsePkgJson", async () => {
  const pkgList = await parsePkgJson("./package.json", true);
  expect(pkgList.length).toEqual(1);
});

test("parsePkgLock v1", async () => {
  const parsedList = await parsePkgLock(
    "./test/data/package-json/v1/package-lock.json",
  );
  const deps = parsedList.pkgList;
  expect(deps.length).toEqual(910);
  expect(deps[1]._integrity).toEqual(
    "sha512-ZmIomM7EE1DvPEnSFAHZn9Vs9zJl5A9H7el0EGTE6ZbW9FKe/14IYAlPbC8iH25YarEQxZL+E8VW7Mi7kfQrDQ==",
  );
  expect(parsedList.dependenciesList.length).toEqual(910);
});

test("parsePkgLock v2", async () => {
  const parsedList = await parsePkgLock(
    "./test/data/package-json/v2/package-lock.json",
  );
  const deps = parsedList.pkgList;
  expect(deps.length).toEqual(134);
  expect(deps[1]._integrity).toEqual(
    "sha512-x9yaMvEh5BEaZKeVQC4vp3l+QoFj3BXcd4aYfuKSzIIyihjdVARAadYy3SMNIz0WCCdS2vB9JL/U6GQk5PaxQw==",
  );
  expect(deps[1].license).toEqual("Apache-2.0");
  expect(deps[0]).toEqual({
    "bom-ref": "pkg:npm/shopify-theme-tailwindcss@2.2.1",
    purl: "pkg:npm/shopify-theme-tailwindcss@2.2.1",
    author: "Wessel van Ree <hello@wesselvanree.com>",
    group: "",
    name: "shopify-theme-tailwindcss",
    license: "MIT",
    type: "application",
    version: "2.2.1",
  });
  expect(deps[deps.length - 1].name).toEqual("rollup");
  const pkgFilePath = path.resolve(
    path.join("test", "data", "package-json", "v2", "package-lock.json"),
  );
  expect(deps[deps.length - 1].evidence).toEqual({
    identity: {
      field: "purl",
      confidence: 1,
      methods: [
        {
          technique: "manifest-analysis",
          confidence: 1,
          value: pkgFilePath,
        },
      ],
    },
  });
  expect(parsedList.dependenciesList.length).toEqual(134);
});

test("parsePkgLock v2 workspace", async () => {
  const parsedList = await parsePkgLock(
    "./test/data/package-json/v2-workspace/package-lock.json",
  );
  const pkgs = parsedList.pkgList;
  const deps = parsedList.dependenciesList;
  expect(pkgs.length).toEqual(1034);
  expect(pkgs[0].license).toEqual("MIT");
  const hasAppWorkspacePkg = pkgs.some(
    (obj) => obj["bom-ref"] === "pkg:npm/app@0.0.0",
  );
  const hasAppWorkspaceDeps = deps.some(
    (obj) => obj.ref === "pkg:npm/app@0.0.0",
  );
  expect(hasAppWorkspacePkg).toEqual(true);
  expect(hasAppWorkspaceDeps).toEqual(true);
  const hasRootPkg = pkgs.some(
    (obj) => obj["bom-ref"] === "pkg:npm/root@0.0.0",
  );
  const hasRootDeps = deps.some((obj) => obj.ref === "pkg:npm/root@0.0.0");
  expect(hasRootPkg).toEqual(true);
  expect(hasRootDeps).toEqual(true);
  const hasScriptsWorkspacePkg = pkgs.some(
    (obj) => obj["bom-ref"] === "pkg:npm/scripts@0.0.0",
  );
  const hasScriptsWorkspaceDeps = deps.some(
    (obj) => obj.ref === "pkg:npm/scripts@0.0.0",
  );
  expect(hasScriptsWorkspacePkg).toEqual(true);
  expect(hasScriptsWorkspaceDeps).toEqual(true);
});

test("parsePkgLock v3", async () => {
  const parsedList = await parsePkgLock(
    "./test/data/package-json/v3/package-lock.json",
    {
      projectVersion: "latest",
      projectName: "cdxgen",
    },
  );
  const deps = parsedList.pkgList;
  expect(deps.length).toEqual(161);
  expect(deps[1]._integrity).toEqual(
    "sha512-s93jiP6GkRApn5duComx6RLwtP23YrulPxShz+8peX7svd6Q+MS8nKLhKCCazbP92C13eTVaIOxgeLt0ezIiCg==",
  );
  expect(deps[0]).toEqual({
    "bom-ref": "pkg:npm/clase-21---jwt@latest",
    purl: "pkg:npm/clase-21---jwt@latest",
    group: "",
    author: "",
    license: "ISC",
    name: "clase-21---jwt",
    type: "application",
    version: "latest",
  });
  expect(deps[deps.length - 1].name).toEqual("uid2");
  expect(parsedList.dependenciesList.length).toEqual(161);
});

test("parsePkgLock theia", async () => {
  const parsedList = await parsePkgLock(
    "./test/data/package-json/theia/package-lock.json",
    {},
  );
  expect(parsedList.pkgList.length).toEqual(2410);
  expect(parsedList.dependenciesList.length).toEqual(2410);
  expect(
    validateRefs({
      components: parsedList.pkgList,
      dependencies: parsedList.dependenciesList,
    }),
  ).toBeTruthy();
});

test("parseBowerJson", async () => {
  const deps = await parseBowerJson("./test/data/bower.json");
  expect(deps.length).toEqual(1);
  expect(deps[0].name).toEqual("jquery");
});

test("parseNodeShrinkwrap", async () => {
  const deps = await parseNodeShrinkwrap("./test/shrinkwrap-deps.json");
  expect(deps.length).toEqual(496);
  expect(deps[0]._integrity).toEqual(
    "sha512-a9gxpmdXtZEInkCSHUJDLHZVBgb1QS0jhss4cPP93EW7s+uC5bikET2twEF3KV+7rDblJcmNvTR7VJejqd2C2g==",
  );
});

test("parseSetupPyFile", async () => {
  let deps = await parseSetupPyFile(`install_requires=[
    'colorama>=0.4.3',
    'libsast>=1.0.3',
],`);
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await parseSetupPyFile(
    `install_requires=['colorama>=0.4.3','libsast>=1.0.3',],`,
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await parseSetupPyFile(
    `install_requires=['colorama>=0.4.3','libsast>=1.0.3']`,
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await parseSetupPyFile(
    `install_requires=['colorama>=0.4.3', 'libsast>=1.0.3']`,
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await parseSetupPyFile(`install_requires=[
'colorama>=0.4.3',
'libsast>=1.0.3',
]`);
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await parseSetupPyFile(
    readFileSync("./test/data/setup-impacket.py", "utf-8"),
  );
  expect(deps.length).toEqual(7);
  expect(deps).toEqual([
    {
      name: "pyasn1",
      version: "0.2.3",
      properties: [{ name: "cdx:pypi:versionSpecifiers", value: ">=0.2.3" }],
    },
    {
      name: "pycryptodomex",
      version: null,
      properties: [{ name: "cdx:pypi:versionSpecifiers", value: undefined }],
    },
    {
      name: "pyOpenSSL",
      version: "0.13.1",
      properties: [{ name: "cdx:pypi:versionSpecifiers", value: ">=0.13.1" }],
    },
    {
      name: "six",
      version: null,
      properties: [{ name: "cdx:pypi:versionSpecifiers", value: undefined }],
    },
    { name: "ldap3", version: "2.5.1", scope: undefined },
    {
      name: "ldapdomaindump",
      version: "0.9.0",
      scope: undefined,
      properties: [{ name: "cdx:pypi:versionSpecifiers", value: ">=0.9.0" }],
    },
    {
      name: "flask",
      version: "1.0",
      properties: [{ name: "cdx:pypi:versionSpecifiers", value: ">=1.0" }],
    },
  ]);
});

test("parsePnpmWorkspace", async () => {
  const wobj = parsePnpmWorkspace("./test/data/pnpm_locks/pnpm-workspace.yaml");
  expect(wobj.packages.length).toEqual(31);
  expect(Object.keys(wobj.catalogs).length).toEqual(217);
});

test("parsePnpmLock", async () => {
  let parsedList = await parsePnpmLock("./test/pnpm-lock.yaml");
  expect(parsedList.pkgList.length).toEqual(1706);
  expect(parsedList.dependenciesList.length).toEqual(1706);
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-IGhtTmpjGbYzcEDOw7DcQtbQSXcG9ftmAXtWTu9V936vDye4xjjekktFAtgZsWpzTj/X01jocB46mTywm/4SZw==",
    group: "@babel",
    name: "code-frame",
    "bom-ref": "pkg:npm/@babel/code-frame@7.10.1",
    purl: "pkg:npm/%40babel/code-frame@7.10.1",
    scope: undefined,
    type: "library",
    version: "7.10.1",
    properties: [
      {
        name: "SrcFile",
        value: "./test/pnpm-lock.yaml",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/pnpm-lock.yaml",
          },
        ],
      },
    },
  });
  parsedList = await parsePnpmLock("./test/data/pnpm-lock.yaml");
  expect(parsedList.pkgList.length).toEqual(318);
  expect(parsedList.dependenciesList.length).toEqual(318);
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-iAXqUn8IIeBTNd72xsFlgaXHkMBMt6y4HJp1tIaK465CWLT/fG1aqB7ykr95gHHmlBdGbFeWWfyB4NJJ0nmeIg==",
    group: "@babel",
    name: "code-frame",
    "bom-ref": "pkg:npm/@babel/code-frame@7.16.7",
    purl: "pkg:npm/%40babel/code-frame@7.16.7",
    scope: "optional",
    type: "library",
    version: "7.16.7",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/pnpm-lock.yaml",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/pnpm-lock.yaml",
          },
        ],
      },
    },
  });
  parsedList = await parsePnpmLock("./test/data/pnpm-lock2.yaml");
  expect(parsedList.pkgList.length).toEqual(7);
  expect(parsedList.dependenciesList.length).toEqual(7);
  expect(parsedList.pkgList[0]).toEqual({
    group: "",
    name: "ansi-regex",
    version: "2.1.1",
    "bom-ref": "pkg:npm/ansi-regex@2.1.1",
    purl: "pkg:npm/ansi-regex@2.1.1",
    scope: undefined,
    type: "library",
    _integrity: "sha1-w7M6te42DYbg5ijwRorn7yfWVN8=",
    properties: [{ name: "SrcFile", value: "./test/data/pnpm-lock2.yaml" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/pnpm-lock2.yaml",
          },
        ],
      },
    },
  });
  expect(parsedList.dependenciesList[2]).toEqual({
    ref: "pkg:npm/chalk@1.1.3",
    dependsOn: [
      "pkg:npm/ansi-styles@2.2.1",
      "pkg:npm/escape-string-regexp@1.0.5",
      "pkg:npm/has-ansi@2.0.0",
      "pkg:npm/strip-ansi@3.0.1",
      "pkg:npm/supports-color@2.0.0",
    ],
  });
  parsedList = await parsePnpmLock("./test/data/pnpm-lock3.yaml");
  expect(parsedList.pkgList.length).toEqual(449);
  expect(parsedList.dependenciesList.length).toEqual(449);
  expect(parsedList.pkgList[0]).toEqual({
    group: "@nodelib",
    name: "fs.scandir",
    version: "2.1.5",
    "bom-ref": "pkg:npm/@nodelib/fs.scandir@2.1.5",
    purl: "pkg:npm/%40nodelib/fs.scandir@2.1.5",
    scope: undefined,
    type: "library",
    _integrity:
      "sha512-vq24Bq3ym5HEQm2NKCr3yXDwjc7vTsEThRDnkp2DK9p1uqLR+DHurm/NOTo0KG7HYHU7eppKZj3MyqYuMBf62g==",
    properties: [{ name: "SrcFile", value: "./test/data/pnpm-lock3.yaml" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/pnpm-lock3.yaml",
          },
        ],
      },
    },
  });
  expect(parsedList.dependenciesList[2]).toEqual({
    ref: "pkg:npm/@nodelib/fs.walk@1.2.8",
    dependsOn: ["pkg:npm/@nodelib/fs.scandir@2.1.5", "pkg:npm/fastq@1.13.0"],
  });

  parsedList = await parsePnpmLock("./test/data/pnpm-lock4.yaml");
  expect(parsedList.pkgList.length).toEqual(1);

  parsedList = await parsePnpmLock("./test/data/pnpm-lock6.yaml");
  expect(parsedList.pkgList.length).toEqual(200);
  expect(parsedList.dependenciesList.length).toEqual(200);
  expect(parsedList.pkgList[0]).toEqual({
    group: "@babel",
    name: "code-frame",
    version: "7.18.6",
    "bom-ref": "pkg:npm/@babel/code-frame@7.18.6",
    purl: "pkg:npm/%40babel/code-frame@7.18.6",
    scope: "optional",
    type: "library",
    _integrity:
      "sha512-TDCmlK5eOvH+eH7cdAFlNXeVJqWIQ7gW9tY1GJIpUtFb6CmjVyq2VM3u71bOyR8CRihcCgMUYoDNyLXao3+70Q==",
    properties: [{ name: "SrcFile", value: "./test/data/pnpm-lock6.yaml" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/pnpm-lock6.yaml",
          },
        ],
      },
    },
  });
  expect(parsedList.pkgList[parsedList.pkgList.length - 1]).toEqual({
    group: "",
    name: "yargs",
    version: "17.7.1",
    "bom-ref": "pkg:npm/yargs@17.7.1",
    purl: "pkg:npm/yargs@17.7.1",
    scope: "optional",
    type: "library",
    _integrity:
      "sha512-cwiTb08Xuv5fqF4AovYacTFNxk62th7LKJ6BL9IGUpTJrWoU7/7WdQGTP2SjKf1dUNBGzDd28p/Yfs/GI6JrLw==",
    properties: [{ name: "SrcFile", value: "./test/data/pnpm-lock6.yaml" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/pnpm-lock6.yaml",
          },
        ],
      },
    },
  });
  parsedList = await parsePnpmLock("./test/data/pnpm-lock6a.yaml");
  expect(parsedList.pkgList.length).toEqual(234);
  expect(parsedList.dependenciesList.length).toEqual(234);
  expect(parsedList.pkgList[0]).toEqual({
    group: "@babel",
    name: "code-frame",
    version: "7.18.6",
    "bom-ref": "pkg:npm/@babel/code-frame@7.18.6",
    purl: "pkg:npm/%40babel/code-frame@7.18.6",
    scope: "optional",
    type: "library",
    _integrity:
      "sha512-TDCmlK5eOvH+eH7cdAFlNXeVJqWIQ7gW9tY1GJIpUtFb6CmjVyq2VM3u71bOyR8CRihcCgMUYoDNyLXao3+70Q==",
    properties: [{ name: "SrcFile", value: "./test/data/pnpm-lock6a.yaml" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/pnpm-lock6a.yaml",
          },
        ],
      },
    },
  });
  // Test case to see if parsePnpmLock is finding all root deps
  const dummpyParent = {
    name: "rush",
    group: "",
    purl: "pkg:npm/rush",
    type: "application",
    "bom-ref": "pkg:npm/rush",
  };
  parsedList = await parsePnpmLock(
    "./test/data/pnpm-lock6b.yaml",
    dummpyParent,
  );
  expect(parsedList.pkgList.length).toEqual(17);
  // this is due to additions projects defined in importers section of pnpm-lock.yaml
  expect(parsedList.dependenciesList.length).toEqual(21);
  const mainRootDependency = parsedList.dependenciesList.find(
    (obj) => obj["ref"] === "pkg:npm/rush",
  );
  const myAppRootDependency = parsedList.dependenciesList.find(
    (obj) => obj["ref"] === "pkg:npm/rush/my-app@latest#apps/my-app",
  );
  const myControlsRootDependency = parsedList.dependenciesList.find(
    (obj) =>
      obj["ref"] === "pkg:npm/rush/my-controls@latest#libraries/my-controls",
  );
  const myToolChainRootDependency = parsedList.dependenciesList.find(
    (obj) =>
      obj["ref"] === "pkg:npm/rush/my-toolchain@latest#tools/my-toolchain",
  );
  expect(mainRootDependency["dependsOn"].length).toEqual(0);
  expect(myAppRootDependency["dependsOn"].length).toEqual(4);
  expect(myControlsRootDependency["dependsOn"].length).toEqual(2);
  expect(myToolChainRootDependency["dependsOn"].length).toEqual(4);

  parsedList = await parsePnpmLock("./test/data/pnpm-lock9a.yaml", {
    name: "pnpm9",
    purl: "pkg:npm/pnpm9@1.0.0",
  });
  expect(parsedList.pkgList).toHaveLength(1007);
  expect(parsedList.dependenciesList).toHaveLength(1006);
  expect(parsedList.pkgList.filter((pkg) => !pkg.scope)).toHaveLength(0);
  parsedList = await parsePnpmLock("./test/data/pnpm-lock9b.yaml", {
    name: "pnpm9",
    purl: "pkg:npm/pnpm9@1.0.0",
  });
  expect(parsedList.pkgList).toHaveLength(1366);
  expect(parsedList.dependenciesList).toHaveLength(1353);
  expect(parsedList.pkgList.filter((pkg) => !pkg.scope)).toHaveLength(12);
  parsedList = await parsePnpmLock("./test/data/pnpm-lock9c.yaml", {
    name: "pnpm9",
    purl: "pkg:npm/pnpm9@1.0.0",
  });
  expect(parsedList.pkgList).toHaveLength(461);
  expect(parsedList.dependenciesList).toHaveLength(462);
  expect(parsedList.pkgList.filter((pkg) => !pkg.scope)).toHaveLength(3);
  parsedList = await parsePnpmLock("./pnpm-lock.yaml");
  expect(parsedList.pkgList.length).toEqual(623);
  expect(parsedList.dependenciesList.length).toEqual(623);
  expect(parsedList.pkgList[0]).toEqual({
    group: "@ampproject",
    name: "remapping",
    version: "2.3.0",
    purl: "pkg:npm/%40ampproject/remapping@2.3.0",
    "bom-ref": "pkg:npm/@ampproject/remapping@2.3.0",
    type: "library",
    _integrity:
      "sha512-30iZtAPgz+LTIYoeivqYo853f02jBYSd5uGnGpkFV0M3xOt9aN73erkgYAmZU43x4VfqcnLxW9Kpg3R5LC4YYw==",
    properties: [{ name: "SrcFile", value: "./pnpm-lock.yaml" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./pnpm-lock.yaml",
          },
        ],
      },
    },
  });
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:npm/@ampproject/remapping@2.3.0",
    dependsOn: [
      "pkg:npm/@jridgewell/gen-mapping@0.3.8",
      "pkg:npm/@jridgewell/trace-mapping@0.3.25",
    ],
  });
  parsedList = await parsePnpmLock(
    "./test/data/pnpm_locks/bytemd-pnpm-lock.yaml",
  );
  expect(parsedList.pkgList.length).toEqual(1189);
  expect(parsedList.dependenciesList.length).toEqual(1189);
});

test("parseYarnLock", async () => {
  let identMap = yarnLockToIdentMap(readFileSync("./test/yarn.lock", "utf8"));
  expect(Object.keys(identMap).length).toEqual(62);
  let parsedList = await parseYarnLock("./test/yarn.lock");
  expect(parsedList.pkgList.length).toEqual(56);
  expect(parsedList.pkgList[0]).toEqual({
    group: "",
    name: "asap",
    version: "2.0.5",
    _integrity: "sha256-522765b50c3510490e52d7dcfe085ef9ba96958f",
    "bom-ref": "pkg:npm/asap@2.0.5",
    purl: "pkg:npm/asap@2.0.5",
    properties: [
      {
        name: "SrcFile",
        value: "./test/yarn.lock",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/yarn.lock",
          },
        ],
      },
    },
  });
  expect(parsedList.dependenciesList.length).toEqual(56);
  expect(isPartialTree(parsedList.dependenciesList)).toBeFalsy();
  identMap = yarnLockToIdentMap(
    readFileSync("./test/data/yarn_locks/yarn.lock", "utf8"),
  );
  expect(Object.keys(identMap).length).toEqual(2566);
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn.lock");
  expect(parsedList.pkgList.length).toEqual(2029);
  expect(parsedList.dependenciesList.length).toEqual(2029);
  expect(parsedList.pkgList[0]).toEqual({
    group: "@babel",
    name: "cli",
    version: "7.10.1",
    "bom-ref": "pkg:npm/@babel/cli@7.10.1",
    purl: "pkg:npm/%40babel/cli@7.10.1",
    _integrity:
      "sha512-cVB+dXeGhMOqViIaZs3A9OUAe4pKw4SBNdMw6yHJMYR7s4TB+Cei7ThquV/84O19PdIFWuwe03vxxES0BHUm5g==",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarn.lock",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn.lock",
          },
        ],
      },
    },
  });
  parsedList.pkgList.forEach((d) => {
    expect(d.name).toBeDefined();
    expect(d.version).toBeDefined();
  });

  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn-multi.lock");
  expect(parsedList.pkgList.length).toEqual(1909);
  expect(parsedList.dependenciesList.length).toEqual(1909);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-zpruxnFMz6K94gs2pqc3sidzFDbQpKT5D6P/J/I9s8ekHZ5eczgnRp6pqXC86Bh7+44j/btpmOT0kwiboyqTnA==",
    group: "@apollo",
    name: "client",
    version: "3.2.5",
    "bom-ref": "pkg:npm/@apollo/client@3.2.5",
    purl: "pkg:npm/%40apollo/client@3.2.5",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarn-multi.lock",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn-multi.lock",
          },
        ],
      },
    },
  });

  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn-light.lock");
  expect(parsedList.pkgList.length).toEqual(315);
  expect(parsedList.dependenciesList.length).toEqual(315);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-rZ1k9kQvJX21Vwgx1L6kSQ6yeXo9cCMyqURSnjG+MRoJn+Mr3LblxmVdzScHXRzv0N9yzy49oG7Bqxp9Knyv/g==",
    group: "@actions",
    name: "artifact",
    version: "0.6.1",
    "bom-ref": "pkg:npm/@actions/artifact@0.6.1",
    purl: "pkg:npm/%40actions/artifact@0.6.1",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarn-light.lock",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn-light.lock",
          },
        ],
      },
    },
  });

  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn3.lock");
  expect(parsedList.pkgList.length).toEqual(5);
  expect(parsedList.dependenciesList.length).toEqual(5);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  expect(parsedList.pkgList[1]).toEqual({
    _integrity:
      "sha512-+X9Jn4mPI+RYV0ITiiLyJSYlT9um111BocJSaztsxXR+9ZxWErpzdfQqyk+EYZUOklugjJkerQZRtJGLfJeClw==",
    group: "",
    name: "lru-cache",
    "bom-ref": "pkg:npm/lru-cache@6.0.0",
    purl: "pkg:npm/lru-cache@6.0.0",
    version: "6.0.0",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarn3.lock",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn3.lock",
          },
        ],
      },
    },
  });

  parsedList = await parseYarnLock("./test/data/yarn_locks/yarnv2.lock");
  expect(parsedList.pkgList.length).toEqual(1088);
  expect(parsedList.dependenciesList.length).toEqual(1088);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-G0U5NjBUYIs39l1J1ckgpVfVX2IxpzRAIT4/2An86O2Mcri3k5xNu7/RRkfObo12wN9s7BmnREAMhH7252oZiA==",
    group: "@arcanis",
    name: "slice-ansi",
    version: "1.0.2",
    "bom-ref": "pkg:npm/@arcanis/slice-ansi@1.0.2",
    purl: "pkg:npm/%40arcanis/slice-ansi@1.0.2",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarnv2.lock",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarnv2.lock",
          },
        ],
      },
    },
  });
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarnv3.lock");
  expect(parsedList.pkgList.length).toEqual(363);
  expect(parsedList.dependenciesList.length).toEqual(363);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-vtU+q0TmdIDmezU7lKub73vObN6nmd3lkcKWz7R9hyNI8gz5o7grDb+FML9nykOLW+09gGIup2xyJ86j5vBKpg==",
    group: "@babel",
    name: "code-frame",
    version: "7.16.7",
    "bom-ref": "pkg:npm/@babel/code-frame@7.16.7",
    purl: "pkg:npm/%40babel/code-frame@7.16.7",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarnv3.lock",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarnv3.lock",
          },
        ],
      },
    },
  });
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn4.lock");
  expect(parsedList.pkgList.length).toEqual(1);
  expect(parsedList.dependenciesList.length).toEqual(1);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn-at.lock");
  expect(parsedList.pkgList.length).toEqual(4);
  expect(parsedList.dependenciesList.length).toEqual(4);
  expect(parsedList.pkgList[0]).toEqual({
    group: "@ac-synth",
    name: "yjs",
    version: "13.5.39-alpha1",
    "bom-ref": "pkg:npm/@ac-synth/yjs@13.5.39-alpha1",
    purl: "pkg:npm/%40ac-synth/yjs@13.5.39-alpha1",
    _integrity:
      "sha512-JE93VWVyVa07xkK1wJ5ogjSZ30Nn4ptUuUXdPnu8MsKme1xFHLFFD3UtnHxnxnNDSnGx+WLlhuyHdIFfSCYqYg==",
    properties: [
      { name: "SrcFile", value: "./test/data/yarn_locks/yarn-at.lock" },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn-at.lock",
          },
        ],
      },
    },
  });
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn5.lock");
  expect(parsedList.pkgList.length).toEqual(1962);
  expect(parsedList.dependenciesList.length).toEqual(1962);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  expect(parsedList.pkgList[0].purl).toEqual(
    "pkg:npm/%40ampproject/remapping@2.2.0",
  );
  expect(parsedList.pkgList[0]["bom-ref"]).toEqual(
    "pkg:npm/@ampproject/remapping@2.2.0",
  );
  expect(parsedList.dependenciesList[1]).toEqual({
    ref: "pkg:npm/@babel/code-frame@7.12.11",
    dependsOn: ["pkg:npm/@babel/highlight@7.18.6"],
  });
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn6.lock");
  expect(parsedList.pkgList.length).toEqual(1472);
  expect(parsedList.dependenciesList.length).toEqual(1472);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  expect(parsedList.pkgList[0].purl).toEqual(
    "pkg:npm/%40aashutoshrathi/word-wrap@1.2.6",
  );
  expect(parsedList.pkgList[0]["bom-ref"]).toEqual(
    "pkg:npm/@aashutoshrathi/word-wrap@1.2.6",
  );
  expect(parsedList.dependenciesList[1]).toEqual({
    ref: "pkg:npm/@ampproject/remapping@2.2.1",
    dependsOn: [
      "pkg:npm/@jridgewell/gen-mapping@0.3.3",
      "pkg:npm/@jridgewell/trace-mapping@0.3.19",
    ],
  });
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn7.lock");
  expect(parsedList.pkgList.length).toEqual(1350);
  expect(parsedList.dependenciesList.length).toEqual(1347);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  expect(parsedList.pkgList[0].purl).toEqual(
    "pkg:npm/%40aashutoshrathi/word-wrap@1.2.6",
  );
  expect(parsedList.pkgList[0]["bom-ref"]).toEqual(
    "pkg:npm/@aashutoshrathi/word-wrap@1.2.6",
  );
  expect(parsedList.dependenciesList[1]).toEqual({
    ref: "pkg:npm/@ampproject/remapping@2.2.1",
    dependsOn: [
      "pkg:npm/@jridgewell/gen-mapping@0.3.3",
      "pkg:npm/@jridgewell/trace-mapping@0.3.19",
    ],
  });
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarnv4.lock");
  expect(parsedList.pkgList.length).toEqual(1851);
  expect(parsedList.dependenciesList.length).toEqual(1851);
  expect(parsedList.pkgList[0].purl).toEqual(
    "pkg:npm/%40aashutoshrathi/word-wrap@1.2.6",
  );
  expect(parsedList.pkgList[0]["bom-ref"]).toEqual(
    "pkg:npm/@aashutoshrathi/word-wrap@1.2.6",
  );
  expect(parsedList.dependenciesList[1]).toEqual({
    ref: "pkg:npm/@actions/core@1.2.6",
    dependsOn: [],
  });
  expect(isPartialTree(parsedList.dependenciesList)).toBeFalsy();
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarnv4.1.lock");
  expect(parsedList.pkgList.length).toEqual(861);
  expect(parsedList.dependenciesList.length).toEqual(858);
  expect(parsedList.pkgList[0].purl).toEqual(
    "pkg:npm/%40aashutoshrathi/word-wrap@1.2.6",
  );
  expect(parsedList.pkgList[0]["bom-ref"]).toEqual(
    "pkg:npm/@aashutoshrathi/word-wrap@1.2.6",
  );
  expect(parsedList.pkgList[0]._integrity).toEqual(
    "sha512-U8KyMaYaRnkrOaDUO8T093a7RUKqV+4EkwZ2gC5VASgsL8iqwU5M0fESD/i1Jha2/1q1Oa0wqiJ31yZES3Fhnw==",
  );
  expect(isPartialTree(parsedList.dependenciesList)).toBeFalsy();
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarnv1-fs.lock");
  expect(parsedList.pkgList.length).toEqual(882);
  expect(parsedList.dependenciesList.length).toEqual(882);
  expect(parsedList.pkgList[0].purl).toEqual("pkg:npm/abbrev@1.0.9");
  expect(parsedList.dependenciesList[1]).toEqual({
    ref: "pkg:npm/accepts@1.3.3",
    dependsOn: ["pkg:npm/mime-types@2.1.12", "pkg:npm/negotiator@0.6.1"],
  });
  expect(isPartialTree(parsedList.dependenciesList)).toBeFalsy();
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarnv1-empty.lock");
  expect(parsedList.pkgList.length).toEqual(770);
  expect(parsedList.dependenciesList.length).toEqual(770);
  expect(
    isPartialTree(parsedList.dependenciesList, parsedList.pkgList.length),
  ).toBeFalsy();
  expect(parsedList.pkgList[0].purl).toEqual(
    "pkg:npm/%40ampproject/remapping@2.2.0",
  );
  expect(parsedList.dependenciesList[1]).toEqual({
    ref: "pkg:npm/@aws-sdk/shared-ini-file-loader@3.188.0",
    dependsOn: ["pkg:npm/@aws-sdk/types@3.188.0", "pkg:npm/tslib@2.4.0"],
  });
});

test("parseComposerLock", () => {
  let retMap = parseComposerLock("./test/data/composer.lock");
  expect(retMap.pkgList.length).toEqual(1);
  expect(retMap.dependenciesList.length).toEqual(1);
  expect(retMap.pkgList[0]).toEqual({
    group: "quickbooks",
    name: "v3-php-sdk",
    scope: "required",
    tags: ["api", "http", "quickbooks", "rest", "smallbusiness"],
    version: "v4.0.6.1",
    authors: [
      {
        email: "Hao_Lu@intuit.com",
        name: "hlu2",
      },
    ],
    distribution: {
      url: "https://api.github.com/repos/intuit/QuickBooks-V3-PHP-SDK/zipball/fe42e409bcdc431614f1cfc80cfc4191b926f3ed",
    },
    purl: "pkg:composer/quickbooks/v3-php-sdk@v4.0.6.1",
    "bom-ref": "pkg:composer/quickbooks/v3-php-sdk@v4.0.6.1",
    repository: {
      type: "git",
      url: "https://github.com/intuit/QuickBooks-V3-PHP-SDK.git",
      reference: "fe42e409bcdc431614f1cfc80cfc4191b926f3ed",
    },
    license: ["Apache-2.0"],
    description: "The Official PHP SDK for QuickBooks Online Accounting API",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/composer.lock",
      },
      {
        name: "Namespaces",
        value: "QuickBooksOnline\\API\\",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/composer.lock",
          },
        ],
      },
    },
  });

  retMap = parseComposerLock("./test/data/composer-2.lock");
  expect(retMap.pkgList.length).toEqual(73);
  expect(retMap.dependenciesList.length).toEqual(73);
  expect(retMap.pkgList[0]).toEqual({
    group: "amphp",
    name: "amp",
    scope: "required",
    version: "v2.4.4",
    purl: "pkg:composer/amphp/amp@v2.4.4",
    "bom-ref": "pkg:composer/amphp/amp@v2.4.4",
    authors: [
      {
        email: "rdlowrey@php.net",
        name: "Daniel Lowrey",
      },
      {
        email: "aaron@trowski.com",
        name: "Aaron Piotrowski",
      },
      {
        email: "bobwei9@hotmail.com",
        name: "Bob Weinand",
      },
      {
        email: "me@kelunik.com",
        name: "Niklas Keller",
      },
    ],
    repository: {
      type: "git",
      url: "https://github.com/amphp/amp.git",
      reference: "1e58d53e4af390efc7813e36cd215bd82cba4b06",
    },
    distribution: {
      url: "https://api.github.com/repos/amphp/amp/zipball/1e58d53e4af390efc7813e36cd215bd82cba4b06",
    },
    license: ["MIT"],
    description: "A non-blocking concurrency framework for PHP applications.",
    tags: [
      "async",
      "asynchronous",
      "awaitable",
      "concurrency",
      "event",
      "event-loop",
      "future",
      "non-blocking",
      "promise",
    ],
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/composer-2.lock",
      },
      {
        name: "Namespaces",
        value: "Amp\\",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/composer-2.lock",
          },
        ],
      },
    },
  });

  retMap = parseComposerLock("./test/data/composer-3.lock");
  expect(retMap.pkgList.length).toEqual(62);
  expect(retMap.dependenciesList.length).toEqual(62);
  expect(retMap.pkgList[0]).toEqual({
    group: "amphp",
    name: "amp",
    version: "v2.6.2",
    purl: "pkg:composer/amphp/amp@v2.6.2",
    "bom-ref": "pkg:composer/amphp/amp@v2.6.2",
    authors: [
      {
        email: "rdlowrey@php.net",
        name: "Daniel Lowrey",
      },
      {
        email: "aaron@trowski.com",
        name: "Aaron Piotrowski",
      },
      {
        email: "bobwei9@hotmail.com",
        name: "Bob Weinand",
      },
      {
        email: "me@kelunik.com",
        name: "Niklas Keller",
      },
    ],
    repository: {
      type: "git",
      url: "https://github.com/amphp/amp.git",
      reference: "9d5100cebffa729aaffecd3ad25dc5aeea4f13bb",
    },
    license: ["MIT"],
    description: "A non-blocking concurrency framework for PHP applications.",
    distribution: {
      url: "https://api.github.com/repos/amphp/amp/zipball/9d5100cebffa729aaffecd3ad25dc5aeea4f13bb",
    },
    tags: [
      "async",
      "asynchronous",
      "awaitable",
      "concurrency",
      "event",
      "event-loop",
      "future",
      "non-blocking",
      "promise",
    ],
    scope: "required",
    properties: [
      { name: "SrcFile", value: "./test/data/composer-3.lock" },
      {
        name: "Namespaces",
        value: "Amp\\",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/composer-3.lock",
          },
        ],
      },
    },
  });
  retMap = parseComposerLock("./test/data/composer-4.lock");
  expect(retMap.pkgList.length).toEqual(50);
  expect(retMap.dependenciesList.length).toEqual(50);
  expect(retMap.pkgList[0]).toEqual({
    group: "apache",
    name: "log4php",
    purl: "pkg:composer/apache/log4php@2.3.0",
    "bom-ref": "pkg:composer/apache/log4php@2.3.0",
    version: "2.3.0",
    repository: {
      type: "git",
      url: "https://git-wip-us.apache.org/repos/asf/logging-log4php.git",
      reference: "8c6df2481cd68d0d211d38f700406c5f0a9de0c2",
    },
    license: ["Apache-2.0"],
    description: "A versatile logging framework for PHP",
    scope: "required",
    tags: ["log", "logging", "php"],
    properties: [{ name: "SrcFile", value: "./test/data/composer-4.lock" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            confidence: 1,
            technique: "manifest-analysis",
            value: "./test/data/composer-4.lock",
          },
        ],
      },
    },
  });
  expect(retMap.dependenciesList[1]).toEqual({
    ref: "pkg:composer/doctrine/annotations@v1.2.1",
    dependsOn: ["pkg:composer/doctrine/lexer@v1.0"],
  });
});

test("parseGemfileLockData", async () => {
  let retMap = await parseGemfileLockData(
    readFileSync("./test/data/Gemfile.lock", { encoding: "utf-8" }),
    "./test/data/Gemfile.lock",
  );
  expect(retMap.pkgList.length).toEqual(140);
  expect(retMap.rootList.length).toEqual(42);
  expect(retMap.dependenciesList.length).toEqual(140);
  expect(retMap.pkgList[0]).toEqual({
    name: "actioncable",
    version: "6.0.0",
    purl: "pkg:gem/actioncable@6.0.0",
    "bom-ref": "pkg:gem/actioncable@6.0.0",
    properties: [
      { name: "SrcFile", value: "./test/data/Gemfile.lock" },
      {
        name: "cdx:gem:remote",
        value: "https://rubygems.org/",
      },
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 0.8,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 0.8,
            value: "./test/data/Gemfile.lock",
          },
        ],
      },
    },
  });
  retMap = await parseGemfileLockData(
    readFileSync("./test/data/Gemfile1.lock", { encoding: "utf-8" }),
    "./test/data/Gemfile1.lock",
  );
  expect(retMap.pkgList.length).toEqual(36);
  expect(retMap.rootList.length).toEqual(2);
  expect(retMap.dependenciesList.length).toEqual(36);
  retMap = await parseGemfileLockData(
    readFileSync("./test/data/Gemfile2.lock", { encoding: "utf-8" }),
    "./test/data/Gemfile2.lock",
  );
  expect(retMap.pkgList.length).toEqual(89);
  expect(retMap.rootList.length).toEqual(2);
  expect(retMap.dependenciesList.length).toEqual(89);
  retMap = await parseGemfileLockData(
    readFileSync("./test/data/Gemfile4.lock", { encoding: "utf-8" }),
    "./test/data/Gemfile4.lock",
  );
  expect(retMap.pkgList.length).toEqual(182);
  expect(retMap.rootList.length).toEqual(78);
  expect(retMap.dependenciesList.length).toEqual(182);
  retMap = await parseGemfileLockData(
    readFileSync("./test/data/Gemfile5.lock", { encoding: "utf-8" }),
    "./test/data/Gemfile5.lock",
  );
  expect(retMap.pkgList.length).toEqual(43);
  expect(retMap.rootList.length).toEqual(11);
  expect(retMap.dependenciesList.length).toEqual(43);
  retMap = await parseGemfileLockData(
    readFileSync("./test/data/Gemfile6.lock", { encoding: "utf-8" }),
    "./test/data/Gemfile6.lock",
  );
  expect(retMap.pkgList.length).toEqual(139);
  expect(retMap.rootList.length).toEqual(22);
  expect(retMap.dependenciesList.length).toEqual(139);
});

test("toGemModuleName", () => {
  expect(toGemModuleNames("ruby_parser")).toEqual(["RubyParser"]);
  expect(toGemModuleNames("public_suffix")).toEqual(["PublicSuffix"]);
  expect(toGemModuleNames("unicode-display_width")).toEqual([
    "Unicode",
    "Unicode::DisplayWidth",
  ]);
  expect(toGemModuleNames("net-http-persistent")).toEqual([
    "Net",
    "Net::Http",
    "Net::Http::Persistent",
  ]);
  expect(toGemModuleNames("ruby-prof")).toEqual(["RubyProf"]);
  expect(toGemModuleNames("thread_safe")).toEqual(["ThreadSafe"]);
  expect(toGemModuleNames("pluck_to_hash")).toEqual(["PluckToHash"]);
  expect(toGemModuleNames("sinatra")).toEqual(["Sinatra"]);
  expect(toGemModuleNames("passenger")).toEqual(["Passenger"]);
  expect(toGemModuleNames("simplecov-html")).toEqual([
    "Simplecov",
    "Simplecov::Html",
  ]);
});

test("parseGemspecData", async () => {
  let deps = await parseGemspecData(
    readFileSync("./test/data/xmlrpc.gemspec", { encoding: "utf-8" }),
    "./test/data/xmlrpc.gemspec",
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    authors: [
      {
        name: "SHIBATA Hiroshi",
      },
    ],
    "bom-ref": "pkg:gem/xmlrpc@0.3.0",
    licenses: [
      {
        license: {
          name: "Ruby",
        },
      },
    ],
    description:
      "XMLRPC is a lightweight protocol that enables remote procedure calls over HTTP.",
    evidence: {
      identity: {
        confidence: 0.5,
        field: "purl",
        methods: [
          {
            confidence: 0.5,
            technique: "manifest-analysis",
            value: "./test/data/xmlrpc.gemspec",
          },
        ],
      },
    },
    homepage: "https://github.com/ruby/xmlrpc",
    name: "xmlrpc",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/xmlrpc.gemspec",
      },
    ],
    purl: "pkg:gem/xmlrpc@0.3.0",
    version: "0.3.0",
  });
  deps = await parseGemspecData(
    readFileSync("./test/data/loofah-2.3.1.gemspec", { encoding: "utf-8" }),
    "./test/data/loofah-2.3.1.gemspec",
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    authors: [
      {
        name: "Mike Dalessio",
      },
      {
        name: "Bryan Helmkamp",
      },
    ],
    "bom-ref": "pkg:gem/loofah@2.3.1",
    licenses: [
      {
        license: {
          name: "MIT",
        },
      },
    ],
    description:
      "Loofah is a general library for manipulating and transforming HTML/XML documents and fragments, built on top of Nokogiri.\\n\\nLoofah excels at HTML sanitization (XSS prevention). It includes some nice HTML sanitizers, which are based on HTML5lib's safelist, so it most likely won't make your codes less secure. (These statements have not been evaluated by Netexperts.)\\n\\nActiveRecord extensions for sanitization are available in the [`loofah-activerecord` gem](https://github.com/flavorjones/loofah-activerecord).",
    evidence: {
      identity: {
        confidence: 0.5,
        field: "purl",
        methods: [
          {
            confidence: 0.5,
            technique: "manifest-analysis",
            value: "./test/data/loofah-2.3.1.gemspec",
          },
        ],
      },
    },
    homepage: "https://github.com/flavorjones/loofah",
    name: "loofah",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/loofah-2.3.1.gemspec",
      },
    ],
    purl: "pkg:gem/loofah@2.3.1",
    version: "2.3.1",
  });
  deps = await parseGemspecData(
    readFileSync("./test/data/nokogiri-1.10.10.gemspec", { encoding: "utf-8" }),
    "./test/data/nokogiri-1.10.10.gemspec",
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    authors: [
      {
        name: "Aaron Patterson",
      },
      {
        name: "Mike Dalessio",
      },
      {
        name: "Yoko Harada",
      },
      {
        name: "Tim Elliott",
      },
      {
        name: "Akinori MUSHA",
      },
      {
        name: "John Shahid",
      },
      {
        name: "Lars Kanis",
      },
    ],
    "bom-ref": "pkg:gem/nokogiri@1.10.10",
    licenses: [
      {
        license: {
          name: "MIT",
        },
      },
    ],
    description:
      "Nokogiri (\\u92F8) is an HTML, XML, SAX, and Reader parser. Among\\nNokogiri's many features is the ability to search documents via XPath\\nor CSS3 selectors.",
    evidence: {
      identity: {
        confidence: 0.5,
        field: "purl",
        methods: [
          {
            confidence: 0.5,
            technique: "manifest-analysis",
            value: "./test/data/nokogiri-1.10.10.gemspec",
          },
        ],
      },
    },
    homepage: "https://nokogiri.org",
    name: "nokogiri",
    properties: [
      {
        name: "cdx:gem:executables",
        value: "nokogiri",
      },
      {
        name: "SrcFile",
        value: "./test/data/nokogiri-1.10.10.gemspec",
      },
    ],
    purl: "pkg:gem/nokogiri@1.10.10",
    version: "1.10.10",
  });
  deps = await parseGemspecData(
    readFileSync("./test/data/activerecord-import.gemspec", {
      encoding: "utf-8",
    }),
    "./test/data/activerecord-import.gemspec",
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    authors: [
      {
        name: "Zach Dennis",
      },
    ],
    "bom-ref": "pkg:gem/activerecord-import",
    version: undefined,
    description: "A library for bulk inserting data using ActiveRecord.",
    evidence: {
      identity: {
        confidence: 0.2,
        field: "purl",
        methods: [
          {
            confidence: 0.2,
            technique: "manifest-analysis",
            value: "./test/data/activerecord-import.gemspec",
          },
        ],
      },
    },
    homepage: "https://github.com/zdennis/activerecord-import",
    name: "activerecord-import",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/activerecord-import.gemspec",
      },
    ],
    purl: "pkg:gem/activerecord-import",
  });
});

test("parse requirements.txt", async () => {
  let deps = await parseReqFile(
    readFileSync("./test/data/requirements.comments.txt", {
      encoding: "utf-8",
    }),
    false,
  );
  expect(deps.length).toEqual(31);
  deps = await parseReqFile(
    readFileSync("./test/data/requirements.freeze.txt", {
      encoding: "utf-8",
    }),
    false,
  );
  expect(deps.length).toEqual(113);
  expect(deps[0]).toEqual({
    name: "elasticsearch",
    version: "8.6.2",
    scope: "required",
  });
  deps = await parseReqFile(
    readFileSync("./test/data/chen-science-requirements.txt", {
      encoding: "utf-8",
    }),
    false,
  );
  expect(deps.length).toEqual(87);
  expect(deps[0]).toEqual({
    name: "aiofiles",
    version: "23.2.1",
    scope: undefined,
    properties: [
      {
        name: "cdx:pip:markers",
        value:
          'python_full_version >= "3.8.1" and python_version < "3.12" --hash=sha256:19297512c647d4b27a2cf7c34caa7e405c0d60b5560618a29a9fe027b18b0107 --hash=sha256:84ec2218d8419404abcb9f0c02df3f34c6e0a68ed41072acfb1cef5cbc29051a',
      },
    ],
  });
  deps = await parseReqFile(
    readFileSync("./test/data/requirements-lock.linux_py3.txt", {
      encoding: "utf-8",
    }),
    false,
  );
  expect(deps.length).toEqual(375);
  expect(deps[0]).toEqual({
    name: "adal",
    scope: undefined,
    version: "1.2.2",
  });
  expect(deps[deps.length - 1]).toEqual({
    name: "zipp",
    scope: undefined,
    version: "0.6.0",
  });
});

test("parse pyproject.toml", () => {
  let retMap = parsePyProjectTomlFile("./test/data/pyproject.toml");
  expect(retMap.parentComponent).toEqual({
    author: "Team AppThreat <cloud@appthreat.com>",
    "bom-ref": "pkg:pypi/cpggen@1.9.0",
    description:
      "Generate CPG for multiple languages for code and threat analysis",
    evidence: {
      identity: {
        confidence: 1,
        field: "purl",
        methods: [
          {
            confidence: 1,
            technique: "manifest-analysis",
            value: "./test/data/pyproject.toml",
          },
        ],
      },
    },
    homepage: {
      url: "https://github.com/AppThreat/cpggen",
    },
    license: "Apache-2.0",
    name: "cpggen",
    purl: "pkg:pypi/cpggen@1.9.0",
    repository: {
      url: "https://github.com/AppThreat/cpggen",
    },
    tags: [
      "atom",
      "code analysis",
      "code property graph",
      "cpg",
      "joern",
      "static analysis",
      "threat analysis",
    ],
    type: "application",
    version: "1.9.0",
  });
  expect(retMap.poetryMode).toBeTruthy();
  retMap = parsePyProjectTomlFile("./test/data/pyproject-author-comma.toml");
  expect(retMap.parentComponent).toEqual({
    author: "Rasa Technologies GmbH <hi@rasa.com>",
    "bom-ref": "pkg:pypi/rasa@3.7.0a1",
    purl: "pkg:pypi/rasa@3.7.0a1",
    evidence: {
      identity: {
        confidence: 1,
        field: "purl",
        methods: [
          {
            confidence: 1,
            technique: "manifest-analysis",
            value: "./test/data/pyproject-author-comma.toml",
          },
        ],
      },
    },
    description:
      "Open source machine learning framework to automate text- and voice-based conversations: NLU, dialogue management, connect to Slack, Facebook, and more - Create chatbots and voice assistants",
    homepage: {
      url: "https://rasa.com",
    },
    license: "Apache-2.0",
    name: "rasa",
    repository: {
      url: "https://github.com/rasahq/rasa",
    },
    tags: [
      "bot",
      "bot-framework",
      "botkit",
      "bots",
      "chatbot",
      "chatbot-framework",
      "conversational-ai",
      "machine-learning",
      "machine-learning-library",
      "nlp",
      "rasa conversational-agents",
    ],
    type: "application",
    version: "3.7.0a1",
  });
  expect(Object.keys(retMap.directDepsKeys).length).toEqual(86);
  expect(Object.keys(retMap.groupDepsKeys).length).toEqual(36);
  retMap = parsePyProjectTomlFile("./test/data/pyproject_uv.toml");
  expect(retMap.parentComponent).toEqual({
    authors: [
      {
        email: "redowan.nafi@gmail.com",
        name: "Redowan Delowar",
      },
    ],
    "bom-ref": "pkg:pypi/fastapi-nano@0.1.0",
    purl: "pkg:pypi/fastapi-nano@0.1.0",
    description: "A minimal FastAPI project template.",
    evidence: {
      identity: {
        confidence: 1,
        field: "purl",
        methods: [
          {
            confidence: 1,
            technique: "manifest-analysis",
            value: "./test/data/pyproject_uv.toml",
          },
        ],
      },
    },
    name: "fastapi-nano",
    tags: ["cookiecutter", "docker", "fastapi", "minimal", "template"],
    version: "0.1.0",
    type: "application",
    properties: [
      {
        name: "cdx:pypi:requiresPython",
        value: ">=3.11",
      },
    ],
  });
  retMap = parsePyProjectTomlFile("./test/data/pyproject_uv2.toml");
  expect(retMap.parentComponent).toEqual({
    name: "una-root",
    evidence: {
      identity: {
        confidence: 1,
        field: "purl",
        methods: [
          {
            confidence: 1,
            technique: "manifest-analysis",
            value: "./test/data/pyproject_uv2.toml",
          },
        ],
      },
    },
    "bom-ref": "pkg:pypi/una-root@0",
    purl: "pkg:pypi/una-root@0",
    properties: [
      {
        name: "cdx:pypi:requiresPython",
        value: ">=3.11",
      },
    ],
    version: "0",
    type: "application",
  });
  expect(retMap.uvMode).toBeTruthy();
  expect(retMap.directDepsKeys).toEqual({
    "hatch-una": true,
    una: true,
  });
});

test("parse pyproject.toml with custom poetry source", () => {
  const retMap = parsePyProjectTomlFile(
    "./test/data/pyproject_with_custom_poetry_source.toml",
  );
  expect(retMap.parentComponent).toEqual({
    author: "Team AppThreat <cloud@appthreat.com>",
    "bom-ref": "pkg:pypi/cpggen@1.9.0",
    purl: "pkg:pypi/cpggen@1.9.0",
    description:
      "Generate CPG for multiple languages for code and threat analysis",
    evidence: {
      identity: {
        confidence: 1,
        field: "purl",
        methods: [
          {
            confidence: 1,
            technique: "manifest-analysis",
            value: "./test/data/pyproject_with_custom_poetry_source.toml",
          },
        ],
      },
    },
    homepage: {
      url: "https://github.com/AppThreat/cpggen",
    },
    license: "Apache-2.0",
    name: "cpggen",
    repository: {
      url: "https://github.com/AppThreat/cpggen",
    },
    tags: [
      "atom",
      "code analysis",
      "code property graph",
      "cpg",
      "joern",
      "static analysis",
      "threat analysis",
    ],
    version: "1.9.0",
    type: "application",
  });
  expect(retMap.poetryMode).toBeTruthy();
  expect(Object.keys(retMap.directDepsKeys).length).toEqual(6);
});

test("parse python lock files", async () => {
  let retMap = await parsePyLockData(
    readFileSync("./test/data/poetry.lock", { encoding: "utf-8" }),
    "./test/data/poetry.lock",
  );
  expect(retMap.pkgList.length).toEqual(32);
  expect(retMap.pkgList[2].scope).toEqual("optional");
  expect(retMap.dependenciesList.length).toEqual(32);
  retMap = await parsePyLockData(
    readFileSync("./test/data/poetry1.lock", { encoding: "utf-8" }),
    "./test/data/poetry1.lock",
  );
  expect(retMap.pkgList.length).toEqual(68);
  expect(retMap.dependenciesList.length).toEqual(68);
  retMap = await parsePyLockData(
    readFileSync("./test/data/poetry-cpggen.lock", { encoding: "utf-8" }),
    "./test/data/poetry-cpggen.lock",
  );
  expect(retMap.pkgList.length).toEqual(69);
  expect(retMap.dependenciesList.length).toEqual(69);
  retMap = await parsePyLockData(
    readFileSync("./test/data/pdm.lock", { encoding: "utf-8" }),
    "./test/data/pdm.lock",
  );
  expect(retMap.pkgList.length).toEqual(39);
  expect(retMap.dependenciesList.length).toEqual(37);
  retMap = await parsePyLockData(
    readFileSync("./test/data/uv.lock", { encoding: "utf-8" }),
    "./test/data/uv.lock",
  );
  expect(retMap.pkgList.length).toEqual(63);
  expect(retMap.dependenciesList.length).toEqual(63);
  retMap = await parsePyLockData(
    readFileSync("./test/data/uv-workspace.lock", { encoding: "utf-8" }),
    "./test/data/uv-workspace.lock",
    "./test/data/pyproject_uv-workspace.toml",
  );
  expect(retMap.pkgList.length).toEqual(9);
  expect(retMap.rootList.length).toEqual(9);
  expect(retMap.dependenciesList.length).toEqual(9);
}, 120000);

test("parse wheel metadata", () => {
  let deps = parseBdistMetadata(
    readFileSync("./test/data/METADATA", { encoding: "utf-8" }),
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    version: "1.26.1",
    name: "yamllint",
    publisher: "Adrien Vergé",
    description: "A linter for YAML files.",
    homepage: { url: "https://github.com/adrienverge/yamllint" },
    repository: { url: "https://github.com/adrienverge/yamllint" },
  });
  deps = parseBdistMetadata(
    readFileSync("./test/data/mercurial-5.5.2-py3.8.egg-info", {
      encoding: "utf-8",
    }),
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    version: "5.5.2",
    name: "mercurial",
    publisher: "Matt Mackall and many others",
    description:
      "Fast scalable distributed SCM (revision control, version control) system",
    homepage: { url: "https://mercurial-scm.org/" },
  });
});

test("parse wheel", async () => {
  const metadata = await readZipEntry(
    "./test/data/appthreat_depscan-2.0.2-py3-none-any.whl",
    "METADATA",
  );
  expect(metadata);
  const parsed = parseBdistMetadata(metadata);
  expect(parsed[0]).toEqual({
    version: "2.0.2",
    name: "appthreat-depscan",
    description:
      "Fully open-source security audit for project dependencies based on known vulnerabilities and advisories.",
    homepage: { url: "https://github.com/appthreat/dep-scan" },
    publisher: "Team AppThreat",
  });
});

test("parse pipfile.lock with hashes", async () => {
  const deps = await parsePiplockData(
    JSON.parse(readFileSync("./test/data/Pipfile.lock", { encoding: "utf-8" })),
  );
  expect(deps.length).toEqual(46);
}, 120000);

test("parse scala sbt list", () => {
  let deps = parseKVDep(
    readFileSync("./test/data/sbt-dl.list", { encoding: "utf-8" }),
  );
  expect(deps.length).toEqual(57);
  deps = parseKVDep(
    readFileSync("./test/data/atom-sbt-list.txt", { encoding: "utf-8" }),
  );
  expect(deps.length).toEqual(153);
});

test("parse scala sbt tree", () => {
  const retMap = parseSbtTree("./test/data/atom-sbt-tree.txt");
  expect(retMap.pkgList.length).toEqual(153);
  expect(retMap.dependenciesList.length).toEqual(153);
});

test("parse scala sbt lock", () => {
  const deps = parseSbtLock("./test/data/build.sbt.lock");
  expect(deps.length).toEqual(117);
});

test("parse nupkg file", async () => {
  let retMap = await parseNupkg(
    "./test/data/Microsoft.Web.Infrastructure.1.0.0.0.nupkg",
  );
  expect(retMap.pkgList.length).toEqual(1);
  expect(retMap.pkgList[0].name).toEqual("Microsoft.Web.Infrastructure");
  expect(retMap.dependenciesMap).toEqual({});
  retMap = parseNuspecData(
    "./test/data/Microsoft.Web.Infrastructure.1.0.0.0.nuspec",
    readFileSync(
      "./test/data/Microsoft.Web.Infrastructure.1.0.0.0.nuspec",
      "ascii",
    ),
  );
  expect(retMap.pkgList.length).toEqual(1);
  expect(retMap.pkgList[0].name).toEqual("Microsoft.Web.Infrastructure");
  expect(retMap.dependenciesMap).toEqual({});
  retMap = await parseNupkg("./test/data/jquery.3.6.0.nupkg");
  expect(retMap.pkgList.length).toEqual(1);
  expect(retMap.pkgList[0].name).toEqual("jQuery");
  expect(retMap.dependenciesMap).toEqual({});
  retMap = parseNuspecData(
    "./test/data/xunit.nuspec",
    readFileSync("./test/data/xunit.nuspec", "utf-8"),
  );
  expect(retMap.pkgList.length).toEqual(1);
  expect(retMap.dependenciesMap).toEqual({
    "pkg:nuget/xunit@2.2.0": ["xunit.core", "xunit.assert"],
  });
  retMap = parseNuspecData(
    "./test/data/xunit.nuspec",
    readFileSync("./test/data/xunit.runner.utility.nuspec", "utf-8"),
  );
  expect(retMap.pkgList.length).toEqual(8);
  expect(retMap.pkgList[1].properties).toEqual([
    { name: "SrcFile", value: "./test/data/xunit.nuspec" },
    { name: "cdx:dotnet:target_framework", value: ".NETFramework3.5" },
  ]);
  expect(retMap.dependenciesMap).toEqual({
    "pkg:nuget/xunit.runner.utility@2.2.0": [
      "xunit.abstractions",
      "NETStandard.Library",
      "xunit.extensibility.core",
      "System.Reflection.TypeExtensions",
    ],
  });
});

test("parse bazel skyframe", () => {
  const deps = parseBazelSkyframe(
    readFileSync("./test/data/bazel/bazel-state.txt", { encoding: "utf-8" }),
  );
  expect(deps.length).toEqual(16);
  expect(deps[0].name).toEqual("guava");
});

test("parse bazel action graph", () => {
  const deps = parseBazelActionGraph(
    readFileSync("./test/data/bazel/bazel-action-graph.txt", {
      encoding: "utf-8",
    }),
  );
  expect(deps.length).toEqual(10);
  expect(deps[0].group).toEqual("org.scala-lang");
  expect(deps[0].name).toEqual("scala-library");
  expect(deps[0].version).toEqual("2.13.11");
  expect(deps[1].group).toEqual("org.jline");
  expect(deps[1].name).toEqual("jline");
  expect(deps[1].version).toEqual("3.21.0");
});

test("parse bazel build", () => {
  const projs = parseBazelBuild(
    readFileSync("./test/data/bazel/BUILD", { encoding: "utf-8" }),
  );
  expect(projs.length).toEqual(2);
  expect(projs[0]).toEqual("java-maven-lib");
});

test("parse helm charts", () => {
  let dep_list = parseHelmYamlData(
    readFileSync("./test/data/Chart.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    name: "prometheus",
    version: "16.0.0",
    description: "Prometheus is a monitoring system and time series database.",
    homepage: {
      url: "https://prometheus.io/",
    },
  });
  dep_list = parseHelmYamlData(
    readFileSync("./test/data/prometheus-community-index.yaml", {
      encoding: "utf-8",
    }),
  );
  expect(dep_list.length).toEqual(1836);
  expect(dep_list[0]).toEqual({
    name: "alertmanager",
    version: "0.22.0",
    description:
      "The Alertmanager handles alerts sent by client applications such as the Prometheus server.",
    homepage: { url: "https://prometheus.io/" },
    _integrity:
      "sha256-c8ece226669d90fa56a3424fa789b80a10de2cd458cd93141b8e445e26c6054d",
    repository: { url: "https://github.com/prometheus/alertmanager" },
  });
});

test("parse container spec like files", () => {
  let dep_list = parseContainerSpecData(
    readFileSync("./test/data/docker-compose.yml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(4);
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/docker-compose-ng.yml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(8);
  expect(dep_list[0]).toEqual({
    service: "frontend",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/docker-compose-cr.yml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(14);
  expect(dep_list[0]).toEqual({
    service: "crapi-identity",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/tekton-task.yml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image:
      "docker.io/amazon/aws-cli:2.0.52@sha256:1506cec98a7101c935176d440a14302ea528b8f92fcaf4a6f1ea2d7ecef7edc4",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/postgrescluster.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(6);
  expect(dep_list[0]).toEqual({
    image:
      "registry.developers.crunchydata.com/crunchydata/crunchy-postgres:ubi8-14.5-1",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/deployment.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "node-typescript-example",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/skaffold.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(6);
  expect(dep_list[0]).toEqual({
    image: "leeroy-web",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/skaffold-ms.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(22);
  expect(dep_list[0]).toEqual({
    image: "emailservice",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/emailservice.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "emailservice",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/redis.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "redis:alpine",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/adservice.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "gcr.io/google-samples/microservices-demo/adservice:v0.4.1",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/kustomization.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(22);
  expect(dep_list[0]).toEqual({
    image: "gcr.io/google-samples/microservices-demo/adservice",
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/service.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(0);
});

test("parse containerfiles / dockerfiles", () => {
  const dep_list = parseContainerFile(
    readFileSync("./test/data/Dockerfile", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(7);
  expect(dep_list[0]).toEqual({
    image: "hello-world",
  });
  expect(dep_list[1]).toEqual({
    image: "hello-world:latest",
  });
  expect(dep_list[2]).toEqual({
    image: "hello-world@sha256:1234567890abcdef",
  });
  expect(dep_list[3]).toEqual({
    image: "hello-world:latest@sha256:1234567890abcdef",
  });
  expect(dep_list[4]).toEqual({
    image: "docker.io/hello-world@sha256:1234567890abcdef",
  });
  expect(dep_list[5]).toEqual({
    image: "docker.io/hello-world:latest@sha256:1234567890abcdef",
  });
  expect(dep_list[6]).toEqual({
    image: "docker.io/hello-world:latest",
  });
});

test("parse bitbucket-pipelines", () => {
  const dep_list = parseBitbucketPipelinesFile(
    readFileSync("./test/data/bitbucket-pipelines.yml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(5);
  expect(dep_list[0]).toEqual({
    image: "node:16",
  });
  expect(dep_list[1]).toEqual({
    image: "node:18",
  });
  expect(dep_list[2]).toEqual({
    image: "some.private.org/docker/library/node:20",
  });
  expect(dep_list[3]).toEqual({
    image: "atlassian/aws/s3-deploy:0.2.2",
  });
  expect(dep_list[4]).toEqual({
    image: "some.private.org/docker/library/some-pipe:1.0.0",
  });
});

test("parse cloudbuild data", () => {
  expect(parseCloudBuildData(null)).toEqual([]);
  const dep_list = parseCloudBuildData(
    readFileSync("./test/data/cloudbuild.yaml", { encoding: "utf-8" }),
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "gcr.io/k8s-skaffold",
    name: "skaffold",
    version: "v2.0.1",
  });
});

test("parse privado files", () => {
  const servList = parsePrivadoFile("./test/data/privado.json");
  expect(servList.length).toEqual(1);
  expect(servList[0].data.length).toEqual(11);
  expect(servList[0].endpoints.length).toEqual(17);
  expect(servList[0].properties.length).toEqual(5);
});

test("parse openapi spec files", () => {
  let aservice = parseOpenapiSpecData(
    readFileSync("./test/data/openapi/openapi-spec.json", {
      encoding: "utf-8",
    }),
  );
  expect(aservice.length).toEqual(1);
  expect(aservice[0]).toEqual({
    "bom-ref": "urn:service:OWASP-crAPI-API:1-oas3",
    name: "OWASP-crAPI-API",
    description: "",
    version: "1-oas3",
    endpoints: [
      "http://localhost:8888/identity/api/auth/signup",
      "http://localhost:8888/identity/api/auth/login",
      "http://localhost:8888/identity/api/auth/forget-password",
      "http://localhost:8888/identity/api/auth/v3/check-otp",
      "http://localhost:8888/identity/api/auth/v2/check-otp",
      "http://localhost:8888/identity/api/auth/v4.0/user/login-with-token",
      "http://localhost:8888/identity/api/auth/v2.7/user/login-with-token",
      "http://localhost:8888/identity/api/v2/user/reset-password",
      "http://localhost:8888/identity/api/v2/user/change-email",
      "http://localhost:8888/identity/api/v2/user/verify-email-token",
      "http://localhost:8888/identity/api/v2/user/dashboard",
      "http://localhost:8888/identity/api/v2/user/pictures",
      "http://localhost:8888/identity/api/v2/user/videos",
      "http://localhost:8888/identity/api/v2/user/videos/{video_id}",
      "http://localhost:8888/identity/api/v2/user/videos/convert_video",
      "http://localhost:8888/identity/api/v2/admin/videos/{video_id}",
      "http://localhost:8888/identity/api/v2/vehicle/vehicles",
      "http://localhost:8888/identity/api/v2/vehicle/add_vehicle",
      "http://localhost:8888/identity/api/v2/vehicle/{vehicleId}/location",
      "http://localhost:8888/identity/api/v2/vehicle/resend_email",
      "http://localhost:8888/community/api/v2/community/posts/{postId}",
      "http://localhost:8888/community/api/v2/community/posts",
      "http://localhost:8888/community/api/v2/community/posts/{postId}/comment",
      "http://localhost:8888/community/api/v2/community/posts/recent",
      "http://localhost:8888/community/api/v2/coupon/new-coupon",
      "http://localhost:8888/community/api/v2/coupon/validate-coupon",
      "http://localhost:8888/workshop/api/shop/products",
      "http://localhost:8888/workshop/api/shop/orders",
      "http://localhost:8888/workshop/api/shop/orders/{order_id}",
      "http://localhost:8888/workshop/api/shop/orders/all",
      "http://localhost:8888/workshop/api/shop/orders/return_order",
      "http://localhost:8888/workshop/api/shop/apply_coupon",
      "http://localhost:8888/workshop/api/shop/return_qr_code",
      "http://localhost:8888/workshop/api/mechanic/",
      "http://localhost:8888/workshop/api/merchant/contact_mechanic",
      "http://localhost:8888/workshop/api/mechanic/receive_report",
      "http://localhost:8888/workshop/api/mechanic/mechanic_report",
      "http://localhost:8888/workshop/api/mechanic/service_requests",
      "http://localhost:8888/workshop/api/mechanic/signup",
    ],
    authenticated: true,
  });
  aservice = parseOpenapiSpecData(
    readFileSync("./test/data/openapi/openapi-oai.yaml", {
      encoding: "utf-8",
    }),
  );
  expect(aservice.length).toEqual(1);
  expect(aservice[0]).toEqual({
    "bom-ref": "urn:service:OpenAI-API:1.1.0",
    name: "OpenAI-API",
    description: "",
    version: "1.1.0",
    endpoints: [
      "https://api.openai.com/v1/engines",
      "https://api.openai.com/v1/engines/{engine_id}",
      "https://api.openai.com/v1/completions",
      "https://api.openai.com/v1/edits",
      "https://api.openai.com/v1/images/generations",
      "https://api.openai.com/v1/images/edits",
      "https://api.openai.com/v1/images/variations",
      "https://api.openai.com/v1/embeddings",
      "https://api.openai.com/v1/engines/{engine_id}/search",
      "https://api.openai.com/v1/files",
      "https://api.openai.com/v1/files/{file_id}",
      "https://api.openai.com/v1/files/{file_id}/content",
      "https://api.openai.com/v1/answers",
      "https://api.openai.com/v1/classifications",
      "https://api.openai.com/v1/fine-tunes",
      "https://api.openai.com/v1/fine-tunes/{fine_tune_id}",
      "https://api.openai.com/v1/fine-tunes/{fine_tune_id}/cancel",
      "https://api.openai.com/v1/fine-tunes/{fine_tune_id}/events",
      "https://api.openai.com/v1/models",
      "https://api.openai.com/v1/models/{model}",
      "https://api.openai.com/v1/moderations",
    ],
    authenticated: false,
  });
});

test("parse swift deps files", () => {
  expect(parseSwiftJsonTree(null, "./test/data/swift-deps.json")).toEqual({});
  let retData = parseSwiftJsonTree(
    readFileSync("./test/data/swift-deps.json", { encoding: "utf-8" }),
    "./test/data/swift-deps.json",
  );
  expect(retData.rootList.length).toEqual(1);
  expect(retData.pkgList.length).toEqual(5);
  expect(retData.rootList[0]).toEqual({
    name: "swift-markdown",
    group: "",
    purl: "pkg:swift/swift-markdown@unspecified",
    type: "application",
    version: "unspecified",
    properties: [
      { name: "SrcPath", value: "/Volumes/Work/sandbox/swift-markdown" },
      { name: "SrcFile", value: "./test/data/swift-deps.json" },
    ],
    "bom-ref": "pkg:swift/swift-markdown@unspecified",
  });
  expect(retData.pkgList[1]).toEqual({
    "bom-ref": "pkg:swift/github.com/apple/swift-cmark@unspecified",
    group: "github.com/apple",
    name: "swift-cmark",
    properties: [
      {
        name: "cdx:swift:packageName",
        value: "cmark-gfm",
      },
    ],
    purl: "pkg:swift/github.com/apple/swift-cmark@unspecified",
    repository: {
      url: "https://github.com/apple/swift-cmark.git",
    },
    version: "unspecified",
  });
  expect(retData.dependenciesList.length).toEqual(5);
  expect(retData.dependenciesList[0]).toEqual({
    ref: "pkg:swift/github.com/apple/swift-cmark@unspecified",
    dependsOn: [],
  });
  expect(retData.dependenciesList[retData.dependenciesList.length - 1]).toEqual(
    {
      ref: "pkg:swift/swift-markdown@unspecified",
      dependsOn: [
        "pkg:swift/github.com/apple/swift-argument-parser@1.0.3",
        "pkg:swift/github.com/apple/swift-cmark@unspecified",
        "pkg:swift/github.com/apple/swift-docc-plugin@1.1.0",
      ],
    },
  );
  retData = parseSwiftJsonTree(
    readFileSync("./test/data/swift-deps1.json", { encoding: "utf-8" }),
    "./test/data/swift-deps.json",
  );
  expect(retData.rootList.length).toEqual(1);
  expect(retData.pkgList.length).toEqual(5);
  expect(retData.rootList[0]).toEqual({
    name: "swift-certificates",
    group: "",
    purl: "pkg:swift/swift-certificates@unspecified",
    version: "unspecified",
    type: "application",
    properties: [
      {
        name: "SrcPath",
        value: "/Volumes/Work/sandbox/swift-certificates",
      },
      { name: "SrcFile", value: "./test/data/swift-deps.json" },
    ],
    "bom-ref": "pkg:swift/swift-certificates@unspecified",
  });
  expect(retData.pkgList[1]).toEqual({
    "bom-ref": "pkg:swift/github.com/apple/swift-crypto@2.4.0",
    group: "github.com/apple",
    name: "swift-crypto",
    purl: "pkg:swift/github.com/apple/swift-crypto@2.4.0",
    repository: {
      url: "https://github.com/apple/swift-crypto.git",
    },
    version: "2.4.0",
  });
  expect(retData.dependenciesList).toEqual([
    {
      ref: "pkg:swift/github.com/apple/swift-docc-symbolkit@1.0.0",
      dependsOn: [],
    },
    {
      ref: "pkg:swift/github.com/apple/swift-docc-plugin@1.1.0",
      dependsOn: ["pkg:swift/github.com/apple/swift-docc-symbolkit@1.0.0"],
    },
    {
      ref: "pkg:swift/github.com/apple/swift-asn1@0.7.0",
      dependsOn: ["pkg:swift/github.com/apple/swift-docc-plugin@1.1.0"],
    },
    {
      ref: "pkg:swift/github.com/apple/swift-crypto@2.4.0",
      dependsOn: ["pkg:swift/github.com/apple/swift-asn1@0.7.0"],
    },
    {
      ref: "pkg:swift/swift-certificates@unspecified",
      dependsOn: ["pkg:swift/github.com/apple/swift-crypto@2.4.0"],
    },
  ]);
  let pkgList = parseSwiftResolved("./test/data/Package.resolved");
  expect(pkgList.length).toEqual(6);
  expect(pkgList[0]).toEqual({
    name: "swift-argument-parser",
    group: "github.com/apple",
    version: "1.0.3",
    purl: "pkg:swift/github.com/apple/swift-argument-parser@1.0.3",
    properties: [{ name: "SrcFile", value: "./test/data/Package.resolved" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/Package.resolved",
          },
        ],
      },
    },
    "bom-ref": "pkg:swift/github.com/apple/swift-argument-parser@1.0.3",
    repository: { url: "https://github.com/apple/swift-argument-parser" },
  });
  pkgList = parseSwiftResolved("./test/data/Package2.resolved");
  expect(pkgList.length).toEqual(7);
  expect(pkgList[0]).toEqual({
    name: "swift-argument-parser",
    group: "github.com/apple",
    version: "1.2.2",
    purl: "pkg:swift/github.com/apple/swift-argument-parser@1.2.2",
    properties: [{ name: "SrcFile", value: "./test/data/Package2.resolved" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/Package2.resolved",
          },
        ],
      },
    },
    "bom-ref": "pkg:swift/github.com/apple/swift-argument-parser@1.2.2",
    repository: { url: "https://github.com/apple/swift-argument-parser.git" },
  });
  expect(pkgList[4]).toEqual({
    name: "swift-http-server",
    group: "github.com/swift",
    version: "0.7.4",
    purl: "pkg:swift/github.com/swift/swift-http-server@0.7.4",
    properties: [{ name: "SrcFile", value: "./test/data/Package2.resolved" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/Package2.resolved",
          },
        ],
      },
    },
    "bom-ref": "pkg:swift/github.com/swift/swift-http-server@0.7.4",
    repository: {
      url: "git@github.com:swift/swift-http-server.git",
    },
  });
  expect(pkgList[5]).toEqual({
    name: "swift-http-server",
    group: "bitbucket.org/swift",
    version: "0.7.4",
    purl: "pkg:swift/bitbucket.org/swift/swift-http-server@0.7.4",
    properties: [{ name: "SrcFile", value: "./test/data/Package2.resolved" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/Package2.resolved",
          },
        ],
      },
    },
    "bom-ref": "pkg:swift/bitbucket.org/swift/swift-http-server@0.7.4",
    repository: {
      url: "ssh://git@bitbucket.org:7999/swift/swift-http-server.git",
    },
  });
});

test("pypi version solver tests", () => {
  const versionsList = [
    "1.0.0",
    "1.0.1",
    "1.1.0",
    "1.2.0.dev1+hg.5.b11e5e6f0b0b",
    "2.0.3",
    "2.0b1",
    "3.0.12-alpha.13",
    "3.0.12-alpha.12",
    "3.0.12-alpha.14",
    "4.0.0",
  ];
  expect(guessPypiMatchingVersion(versionsList, "<4")).toEqual(
    "3.0.12-alpha.14",
  );
  expect(guessPypiMatchingVersion(versionsList, ">1.0.0 <3.0.0")).toEqual(
    "2.0.3",
  );
  expect(guessPypiMatchingVersion(versionsList, "== 1.0.1")).toEqual("1.0.1");
  expect(guessPypiMatchingVersion(versionsList, "~= 1.0.1")).toEqual("1.0.1");
  expect(guessPypiMatchingVersion(versionsList, ">= 2.0.1, == 2.8.*")).toEqual(
    null,
  );
  expect(
    guessPypiMatchingVersion(
      ["2.0.0", "2.0.1", "2.4.0", "2.8.4", "2.9.0", "3.0.1"],
      ">= 2.0.1, == 2.8.*",
    ),
  ).toEqual("2.8.4");
  expect(
    guessPypiMatchingVersion(versionsList, "== 1.1.0; python_version < '3.8'"),
  ).toEqual("1.1.0");
  expect(
    guessPypiMatchingVersion(versionsList, "<3.6,>1.9,!=1.9.6,<4.0a0"),
  ).toEqual("3.0.12-alpha.14");
  expect(
    guessPypiMatchingVersion(versionsList, ">=1.4.2,<2.2,!=1.5.*,!=1.6.*"),
  ).toEqual("2.0.3");
  expect(guessPypiMatchingVersion(versionsList, ">=1.21.1,<3")).toEqual(
    "2.0.3",
  );
});

test("purl encode tests", () => {
  expect(encodeForPurl("org.apache.commons")).toEqual("org.apache.commons");
  expect(encodeForPurl("@angular")).toEqual("%40angular");
  expect(encodeForPurl("%40angular")).toEqual("%40angular");
});

test("parsePackageJsonName tests", () => {
  expect(parsePackageJsonName("foo")).toEqual({
    fullName: "foo",
    moduleName: "foo",
    projectName: null,
    scope: null,
  });
  expect(parsePackageJsonName("@babel/code-frame")).toEqual({
    fullName: "code-frame",
    moduleName: "code-frame",
    projectName: null,
    scope: "@babel",
  });
});

test("parseDot tests", () => {
  const retMap = parseCmakeDotFile("./test/data/tslite.dot", "conan");
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:conan/tensorflow-lite",
    group: "",
    name: "tensorflow-lite",
    purl: "pkg:conan/tensorflow-lite",
    type: "application",
    version: "",
  });
  expect(retMap.pkgList.length).toEqual(283);
  expect(retMap.dependenciesList.length).toEqual(247);
});

test("parseCmakeLikeFile tests", () => {
  let retMap = parseCmakeLikeFile("./test/data/CMakeLists.txt", "conan");
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:conan/tensorflow-lite",
    group: "",
    name: "tensorflow-lite",
    purl: "pkg:conan/tensorflow-lite",
    type: "application",
    version: "",
  });
  retMap = parseCmakeLikeFile("./test/data/cmakes/CMakeLists.txt", "conan");
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:conan/mongo-c-driver",
    group: "",
    name: "mongo-c-driver",
    purl: "pkg:conan/mongo-c-driver",
    type: "application",
    version: "",
  });
  retMap = parseCmakeLikeFile(
    "./test/data/cmakes/CMakeLists-version.txt",
    "generic",
  );
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:generic/MyProject@2.1.3",
    group: "",
    name: "MyProject",
    purl: "pkg:generic/MyProject@2.1.3",
    type: "application",
    version: "2.1.3",
  });
  retMap = parseCmakeLikeFile(
    "./test/data/cmakes/CMakeLists-tpl.txt",
    "generic",
  );
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:generic/aurora-examples",
    group: "",
    name: "aurora-examples",
    purl: "pkg:generic/aurora-examples",
    type: "application",
    version: "",
  });
  retMap = parseCmakeLikeFile(
    "./test/data/cmakes/mongoc-config.cmake",
    "conan",
  );
  expect(retMap.pkgList.length).toEqual(2);
  retMap = parseCmakeLikeFile("./test/data/meson.build", "conan");
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:conan/mtxclient@0.9.2",
    group: "",
    name: "mtxclient",
    purl: "pkg:conan/mtxclient@0.9.2",
    type: "application",
    version: "0.9.2",
  });
  expect(retMap.pkgList.length).toEqual(7);
  retMap = parseCmakeLikeFile("./test/data/meson-1.build", "conan");
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:conan/abseil-cpp@20230125.1",
    group: "",
    name: "abseil-cpp",
    purl: "pkg:conan/abseil-cpp@20230125.1",
    type: "application",
    version: "20230125.1",
  });
  expect(retMap.pkgList.length).toEqual(2);
});

test("parseMakeDFile tests", () => {
  const pkgFilesMap = parseMakeDFile("test/data/zstd_sys-dc50c4de2e4e7df8.d");
  expect(pkgFilesMap).toEqual({
    zstd_sys: [
      ".cargo/registry/src/index.crates.io-hash/zstd-sys-2.0.10+zstd.1.5.6/src/lib.rs",
      ".cargo/registry/src/index.crates.io-hash/zstd-sys-2.0.10+zstd.1.5.6/src/bindings_zstd.rs",
      ".cargo/registry/src/index.crates.io-hash/zstd-sys-2.0.10+zstd.1.5.6/src/bindings_zdict.rs",
    ],
  });
});

test.each([
  ["", false],
  ["git@gitlab.com:behat-chrome/chrome-mink-driver.git", false],
  ["     git@gitlab.com:behat-chrome/chrome-mink-driver.git      ", false],
  ["${repository.url}", false],
  // bomLink - https://cyclonedx.org/capabilities/bomlink/]
  ["urn:cdx:f08a6ccd-4dce-4759-bd84-c626675d60a7/1#componentA", true],
  // http uri - https://www.ietf.org/rfc/rfc7230.txt]
  ["https://gitlab.com/behat-chrome/chrome-mink-driver.git", true],
  ["     https://gitlab.com/behat-chrome/chrome-mink-driver.git     ", false],
  ["http://gitlab.com/behat-chrome/chrome-mink-driver.git", true],
  ["git+https://github.com/Alex-D/check-disk-space.git", true],
  ["UNKNOWN", false],
  ["http://", false],
  ["http", false],
  ["https", false],
  ["https://", false],
  ["http://www", true],
  ["http://www.", true],
  ["https://github.com/apache/maven-resolver/tree/${project.scm.tag}", false],
  ["git@github.com:prometheus/client_java.git", false],
])("isValidIriReference tests: %s", (url, isValid) => {
  expect(isValidIriReference(url)).toBe(isValid);
});

test("hasAnyProjectType tests", () => {
  expect(
    hasAnyProjectType(["docker"], {
      projectType: [],
      excludeType: ["oci"],
    }),
  ).toBeFalsy();
  expect(hasAnyProjectType([], {})).toBeTruthy();
  expect(hasAnyProjectType(["java"], { projectType: ["java"] })).toBeTruthy();
  expect(
    hasAnyProjectType(["java"], { projectType: ["java"], excludeType: [] }),
  ).toBeTruthy();
  expect(hasAnyProjectType(["java"], { projectType: ["csharp"] })).toBeFalsy();
  expect(
    hasAnyProjectType(["java"], { projectType: ["csharp", "rust"] }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(["rust"], { projectType: ["csharp", "rust"] }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["rust"], {
      projectType: ["csharp", "rust"],
      excludeType: [],
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["rust"], {
      projectType: ["csharp", "rust"],
      excludeType: ["rust"],
    }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(["oci"], {
      projectType: ["java", "docker"],
      excludeType: ["dotnet"],
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["oci"], {
      projectType: ["docker"],
      excludeType: undefined,
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["docker"], {
      projectType: ["oci"],
      excludeType: undefined,
    }),
  ).toBeTruthy();

  expect(
    hasAnyProjectType(["js"], {
      projectType: [],
      excludeType: ["rust"],
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["js"], {
      projectType: undefined,
      excludeType: ["csharp"],
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["js", "docker"], {
      projectType: ["universal"],
      excludeType: ["csharp"],
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["rust"], {
      projectType: ["universal"],
      excludeType: ["docker"],
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["js", "docker"], {
      projectType: ["universal"],
      excludeType: ["csharp", "javascript"],
    }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(["js", "docker"], {
      projectType: ["js", "docker"],
      excludeType: ["js", "docker"],
    }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(["js"], {
      projectType: ["js"],
      excludeType: ["js"],
    }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(
      ["oci"],
      {
        projectType: [],
        excludeType: [],
      },
      false,
    ),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(
      ["oci", "docker"],
      {
        projectType: undefined,
        excludeType: undefined,
      },
      false,
    ),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(["js", "docker"], {
      projectType: ["universal"],
      excludeType: [],
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["js"], {
      projectType: ["universal"],
      excludeType: ["js"],
    }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(["universal"], {
      projectType: undefined,
      excludeType: ["github"],
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["oci"], {
      projectType: undefined,
      excludeType: ["github"],
    }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(["os"], {
      projectType: undefined,
      excludeType: ["jar"],
    }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(["docker"], {
      projectType: undefined,
      excludeType: ["jar"],
    }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(["oci", "java"], {
      projectType: undefined,
      excludeType: ["jar"],
    }),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["oci", "ear"], {
      projectType: undefined,
      excludeType: ["jar"],
    }),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(
      ["docker", "oci", "container", "os"],
      {
        projectType: undefined,
        excludeType: ["github"],
      },
      false,
    ),
  ).toBeFalsy();
  expect(
    hasAnyProjectType(
      ["ruby"],
      {
        projectType: ["ruby2.5.4"],
        excludeType: undefined,
      },
      false,
    ),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(
      ["ruby"],
      {
        projectType: ["rb"],
        excludeType: undefined,
      },
      false,
    ),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(
      ["ruby"],
      {
        projectType: ["ruby3.4.1", "ruby2.5.4"],
        excludeType: undefined,
      },
      false,
    ),
  ).toBeTruthy();
  expect(
    hasAnyProjectType(["oci", "js"], {
      projectType: ["javascript"],
      excludeType: undefined,
    }),
  ).toBeTruthy();
});

test("isPackageManagerAllowed tests", () => {
  expect(
    isPackageManagerAllowed("uv", ["pip", "poetry", "hatch", "pdm"], {
      projectType: undefined,
    }),
  ).toBeTruthy();
  expect(
    isPackageManagerAllowed("uv", ["pip", "poetry", "hatch", "pdm"], {
      projectType: ["python"],
    }),
  ).toBeTruthy();
  expect(
    isPackageManagerAllowed("uv", ["pip", "poetry", "hatch", "pdm"], {
      projectType: ["pip"],
    }),
  ).toBeFalsy();
});

test("parsePodfileLock tests", async () => {
  expect(
    (
      await parsePodfileLock(
        loadYaml(readFileSync("./test/Podfile.lock", "utf-8")),
      )
    ).size,
  ).toEqual(6);

  process.env.COCOA_MERGE_SUBSPECS = false;
  expect(
    (
      await parsePodfileLock(
        loadYaml(readFileSync("./test/Podfile.lock", "utf-8")),
      )
    ).size,
  ).toEqual(16);
  process.env.COCOA_MERGE_SUBSPECS = true;
});

test("parsePodfileTargets tests", () => {
  const targetDependencies = new Map();
  parsePodfileTargets(
    JSON.parse(readFileSync("./test/Podfile.json", "utf-8"))[
      "target_definitions"
    ][0],
    targetDependencies,
  );
  expect(targetDependencies.size).toEqual(5);
  expect(targetDependencies.has("Pods")).toBeTruthy();
});

test("parseCocoaDependency tests", () => {
  let dependency = parseCocoaDependency("Alamofire (3.0.0)");
  expect(dependency.name).toEqual("Alamofire");
  expect(dependency.version).toEqual("3.0.0");

  dependency = parseCocoaDependency("boost/graph-includes (= 1.59.0)", false);
  expect(dependency.name).toEqual("boost/graph-includes");
  expect(dependency.version).toBeUndefined();
});

test("buildObjectForCocoaPod tests", async () => {
  expect(
    await buildObjectForCocoaPod(parseCocoaDependency("Alamofire (3.0.0)")),
  ).toEqual({
    name: "Alamofire",
    version: "3.0.0",
    type: "library",
    purl: "pkg:cocoapods/Alamofire@3.0.0",
    "bom-ref": "pkg:cocoapods/Alamofire@3.0.0",
  });

  expect(
    await buildObjectForCocoaPod(
      parseCocoaDependency("boost/graph-includes (= 1.59.0)"),
    ),
  ).toEqual({
    name: "boost/graph-includes",
    version: "= 1.59.0",
    type: "library",
    properties: [
      {
        name: "cdx:pods:Subspec",
        value: "graph-includes",
      },
    ],
    purl: "pkg:cocoapods/boost@%3D%201.59.0#graph-includes",
    "bom-ref": "pkg:cocoapods/boost@= 1.59.0#graph-includes",
  });
});
