import {
  parsePyRequiresDist,
  findLicenseId,
  parseGradleDep,
  parseGradleProjects,
  parseGradleProperties,
  parseMavenTree,
  getPyMetadata,
  parseGoModData,
  parseGosumData,
  parseGoListDep,
  parseGoModGraph,
  parseGoModWhy,
  parseGopkgData,
  parseGoVersionData,
  parseCargoData,
  parseCargoTomlData,
  parseCargoAuditableData,
  getCratesMetadata,
  parsePubLockData,
  parsePubYamlData,
  getDartMetadata,
  parseCabalData,
  parseConanLockData,
  parseConanData,
  parseLeiningenData,
  parseEdnData,
  parseCljDep,
  parseLeinDep,
  parseMixLockData,
  parseGitHubWorkflowData,
  parseCsPkgData,
  parseCsProjData,
  parseCsProjAssetsData,
  parseCsPkgLockData,
  parsePaketLockData,
  getNugetMetadata,
  parsePom,
  getMvnMetadata,
  getLicenses,
  parsePkgLock,
  parseBowerJson,
  parseNodeShrinkwrap,
  parseSetupPyFile,
  parsePnpmLock,
  yarnLockToIdentMap,
  parseYarnLock,
  parseComposerLock,
  parseGemfileLockData,
  parseGemspecData,
  parseReqFile,
  parsePoetrylockData,
  parseBdistMetadata,
  readZipEntry,
  parsePiplockData,
  parseKVDep,
  parseSbtLock,
  parseNupkg,
  parseNuspecData,
  parseBazelSkyframe,
  parseBazelActionGraph,
  parseBazelBuild,
  parseHelmYamlData,
  parseContainerSpecData,
  parseCloudBuildData,
  parsePrivadoFile,
  parseOpenapiSpecData,
  parseSwiftJsonTree,
  parseSwiftResolved,
  guessPypiMatchingVersion,
  encodeForPurl,
  parsePackageJsonName,
  parsePyProjectToml,
  parseSbtTree,
  parseCmakeDotFile,
  parseCmakeLikeFile
} from "./utils.js";
import { readFileSync } from "node:fs";
import { parse } from "ssri";
import { expect, test } from "@jest/globals";
import path from "path";

test("SSRI test", () => {
  // gopkg.lock hash
  let ss = parse(
    "2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf"
  );
  expect(ss).toEqual(null);
  ss = parse(
    "sha256-2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf"
  );
  expect(ss.sha256[0].digest).toStrictEqual(
    "2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf"
  );
  ss = parse(
    "sha256-" +
      Buffer.from(
        "2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf",
        "hex"
      ).toString("base64")
  );
  expect(ss.sha256[0].digest).toStrictEqual(
    "LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78="
  );
  ss = parse(
    "sha512-Vn0lE2mprXEFPcRoI89xjw1fk1VJiyVbwfaPnVnvCXxEieByioO8Mj6sMwa6ON9PRuqbAjIxaQpkzccu41sYlw=="
  );
  expect(ss.sha512[0].digest).toStrictEqual(
    "Vn0lE2mprXEFPcRoI89xjw1fk1VJiyVbwfaPnVnvCXxEieByioO8Mj6sMwa6ON9PRuqbAjIxaQpkzccu41sYlw=="
  );
});

test("Parse requires dist string", () => {
  expect(parsePyRequiresDist("lazy-object-proxy (&gt;=1.4.0)")).toEqual({
    name: "lazy-object-proxy",
    version: "1.4.0"
  });
  expect(parsePyRequiresDist("wrapt (&lt;1.13,&gt;=1.11)")).toEqual({
    name: "wrapt",
    version: "1.13"
  });
  expect(
    parsePyRequiresDist(
      'typed-ast (&lt;1.5,&gt;=1.4.0) ; implementation_name == "cpython" and python_version &lt; "3.8"'
    )
  ).toEqual({ name: "typed-ast", version: "1.5" });
  expect(parsePyRequiresDist("asgiref (&lt;4,&gt;=3.2.10)")).toEqual({
    name: "asgiref",
    version: "4"
  });
  expect(parsePyRequiresDist("pytz")).toEqual({
    name: "pytz",
    version: ""
  });
  expect(parsePyRequiresDist("sqlparse (&gt;=0.2.2)")).toEqual({
    name: "sqlparse",
    version: "0.2.2"
  });
  expect(
    parsePyRequiresDist("argon2-cffi (&gt;=16.1.0) ; extra == 'argon2'")
  ).toEqual({ name: "argon2-cffi", version: "16.1.0" });
  expect(parsePyRequiresDist("bcrypt ; extra == 'bcrypt'")).toEqual({
    name: "bcrypt",
    version: ""
  });
});

test("finds license id from name", () => {
  expect(findLicenseId("Apache License Version 2.0")).toEqual("Apache-2.0");
  expect(findLicenseId("GNU General Public License (GPL) version 2.0")).toEqual(
    "GPL-2.0-only"
  );
});

test("parse gradle dependencies", () => {
  expect(parseGradleDep(null)).toEqual({});
  let parsedList = parseGradleDep(
    readFileSync("./test/gradle-dep.out", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(33);
  expect(parsedList.dependenciesList.length).toEqual(34);
  expect(parsedList.pkgList[0]).toEqual({
    group: "org.ethereum",
    name: "solcJ-all",
    qualifiers: {
      type: "jar"
    },
    version: "0.4.25",
    "bom-ref": "pkg:maven/org.ethereum/solcJ-all@0.4.25?type=jar",
    purl: "pkg:maven/org.ethereum/solcJ-all@0.4.25?type=jar"
  });

  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-android-dep.out", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(104);
  expect(parsedList.dependenciesList.length).toEqual(105);
  expect(parsedList.pkgList[0]).toEqual({
    group: "com.android.support.test",
    name: "runner",
    qualifiers: {
      type: "jar"
    },
    scope: "optional",
    version: "1.0.2",
    properties: [
      {
        name: "GradleProfileName",
        value: "androidTestImplementation"
      }
    ],
    "bom-ref": "pkg:maven/com.android.support.test/runner@1.0.2?type=jar",
    purl: "pkg:maven/com.android.support.test/runner@1.0.2?type=jar"
  });
  expect(parsedList.pkgList[103]).toEqual({
    group: "androidx.core",
    name: "core",
    qualifiers: {
      type: "jar"
    },
    version: "1.7.0",
    scope: "optional",
    properties: [
      {
        name: "GradleProfileName",
        value: "releaseUnitTestRuntimeClasspath"
      }
    ],
    "bom-ref": "pkg:maven/androidx.core/core@1.7.0?type=jar",
    purl: "pkg:maven/androidx.core/core@1.7.0?type=jar"
  });
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-out1.dep", { encoding: "utf-8" })
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
        value: "compileClasspath"
      }
    ],
    "bom-ref":
      "pkg:maven/org.springframework.boot/spring-boot-starter-web@2.2.0.RELEASE?type=jar",
    purl: "pkg:maven/org.springframework.boot/spring-boot-starter-web@2.2.0.RELEASE?type=jar"
  });

  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-rich1.dep", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(4);
  expect(parsedList.pkgList[parsedList.pkgList.length - 1]).toEqual({
    group: "ch.qos.logback",
    name: "logback-core",
    qualifiers: { type: "jar" },
    version: "1.4.5",
    "bom-ref": "pkg:maven/ch.qos.logback/logback-core@1.4.5?type=jar",
    purl: "pkg:maven/ch.qos.logback/logback-core@1.4.5?type=jar"
  });
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-rich2.dep", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(2);
  expect(parsedList.pkgList).toEqual([
    {
      group: "io.appium",
      name: "java-client",
      qualifiers: { type: "jar" },
      version: "8.1.1",
      "bom-ref": "pkg:maven/io.appium/java-client@8.1.1?type=jar",
      purl: "pkg:maven/io.appium/java-client@8.1.1?type=jar"
    },
    {
      group: "org.seleniumhq.selenium",
      name: "selenium-support",
      qualifiers: { type: "jar" },
      version: "4.5.0",
      "bom-ref":
        "pkg:maven/org.seleniumhq.selenium/selenium-support@4.5.0?type=jar",
      purl: "pkg:maven/org.seleniumhq.selenium/selenium-support@4.5.0?type=jar"
    }
  ]);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-rich3.dep", { encoding: "utf-8" })
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
      purl: "pkg:maven/org.seleniumhq.selenium/selenium-remote-driver@4.5.0?type=jar"
    }
  ]);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-rich4.dep", { encoding: "utf-8" })
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
      purl: "pkg:maven/org.seleniumhq.selenium/selenium-api@4.5.0?type=jar"
    }
  ]);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-rich5.dep", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(67);
  expect(parsedList.dependenciesList.length).toEqual(68);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-out-249.dep", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(21);
  expect(parsedList.dependenciesList.length).toEqual(22);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-service.out", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(35);
  expect(parsedList.dependenciesList.length).toEqual(36);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-s.out", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(28);
  expect(parsedList.dependenciesList.length).toEqual(29);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-core.out", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(18);
  expect(parsedList.dependenciesList.length).toEqual(19);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-single.out", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(152);
  expect(parsedList.dependenciesList.length).toEqual(153);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-android-app.dep", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(102);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-android-jetify.dep", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(1);
  expect(parsedList.pkgList).toEqual([
    {
      group: "androidx.appcompat",
      name: "appcompat",
      version: "1.2.0",
      qualifiers: { type: "jar" },
      "bom-ref": "pkg:maven/androidx.appcompat/appcompat@1.2.0?type=jar",
      purl: "pkg:maven/androidx.appcompat/appcompat@1.2.0?type=jar"
    }
  ]);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-sm.dep", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(6);
  expect(parsedList.dependenciesList.length).toEqual(7);
  parsedList = parseGradleDep(
    readFileSync("./test/data/gradle-dependencies-559.txt", {
      encoding: "utf-8"
    })
  );
  expect(parsedList.pkgList.length).toEqual(372);
});

test("parse gradle projects", () => {
  expect(parseGradleProjects(null)).toEqual({
    projects: [],
    rootProject: "root"
  });
  let retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-projects.out", { encoding: "utf-8" })
  );
  expect(retMap.rootProject).toEqual("elasticsearch");
  expect(retMap.projects.length).toEqual(368);
  retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-projects1.out", { encoding: "utf-8" })
  );
  expect(retMap.rootProject).toEqual("elasticsearch");
  expect(retMap.projects.length).toEqual(409);
  retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-projects2.out", { encoding: "utf-8" })
  );
  expect(retMap.rootProject).toEqual("fineract");
  expect(retMap.projects.length).toEqual(22);
  retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-android-app.dep", { encoding: "utf-8" })
  );
  expect(retMap.rootProject).toEqual("root");
  expect(retMap.projects).toEqual([":app"]);
  retMap = parseGradleProjects(
    readFileSync("./test/data/gradle-properties-sm.txt", {
      encoding: "utf-8"
    })
  );
  expect(retMap.rootProject).toEqual("root");
  expect(retMap.projects).toEqual([
    ":module:dummy:core",
    ":module:dummy:service",
    ":module:dummy:starter",
    ":custom:foo:service"
  ]);
});

test("parse gradle properties", () => {
  expect(parseGradleProperties(null)).toEqual({
    projects: [],
    rootProject: "root",
    metadata: {
      group: "",
      version: "latest",
      properties: []
    }
  });
  let retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties.txt", { encoding: "utf-8" })
  );
  expect(retMap).toEqual({
    rootProject: "dependency-diff-check",
    projects: [
      ":dependency-diff-check-client-starter",
      ":dependency-diff-check-common-core",
      ":dependency-diff-check-service"
    ],
    metadata: {
      group: "com.ajmalab",
      version: "0.0.1-SNAPSHOT",
      properties: [
        {
          name: "buildFile",
          value:
            "/home/almalinux/work/sandbox/dependency-diff-check/build.gradle"
        },
        {
          name: "projectDir",
          value: "/home/almalinux/work/sandbox/dependency-diff-check"
        },
        {
          name: "rootDir",
          value: "/home/almalinux/work/sandbox/dependency-diff-check"
        }
      ]
    }
  });
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-single.txt", {
      encoding: "utf-8"
    })
  );
  expect(retMap).toEqual({
    rootProject: "java-test",
    projects: [":app"],
    metadata: {
      group: "com.ajmalab.demo",
      version: "latest",
      properties: [
        {
          name: "buildFile",
          value: "/home/almalinux/work/sandbox/java-test/build.gradle"
        },
        {
          name: "projectDir",
          value: "/home/almalinux/work/sandbox/java-test"
        },
        { name: "rootDir", value: "/home/almalinux/work/sandbox/java-test" }
      ]
    }
  });
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-single2.txt", {
      encoding: "utf-8"
    })
  );
  expect(retMap).toEqual({
    rootProject: "java-test",
    projects: [],
    metadata: {
      group: "com.ajmalab.demo",
      version: "latest",
      properties: [
        {
          name: "buildFile",
          value: "/home/almalinux/work/sandbox/java-test/build.gradle"
        },
        { name: "projectDir", value: "/home/almalinux/work/sandbox/java-test" },
        { name: "rootDir", value: "/home/almalinux/work/sandbox/java-test" }
      ]
    }
  });
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-elastic.txt", {
      encoding: "utf-8"
    })
  );
  expect(retMap.rootProject).toEqual("elasticsearch");
  expect(retMap.projects.length).toEqual(409);
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-android.txt", {
      encoding: "utf-8"
    })
  );
  expect(retMap.rootProject).toEqual("CdxgenAndroidTest");
  expect(retMap.projects.length).toEqual(2);
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-sm.txt", {
      encoding: "utf-8"
    })
  );
  expect(retMap.rootProject).toEqual("root");
  expect(retMap.projects).toEqual([]);
  retMap = parseGradleProperties(
    readFileSync("./test/data/gradle-properties-559.txt", {
      encoding: "utf-8"
    })
  );
  expect(retMap.rootProject).toEqual("failing-project");
  expect(retMap.projects).toEqual([]);
});

test("parse maven tree", () => {
  expect(parseMavenTree(null)).toEqual({});
  let parsedList = parseMavenTree(
    readFileSync("./test/data/sample-mvn-tree.txt", { encoding: "utf-8" })
  );
  expect(parsedList.pkgList.length).toEqual(61);
  expect(parsedList.dependenciesList.length).toEqual(61);
  expect(parsedList.pkgList[0]).toEqual({
    group: "com.pogeyan.cmis",
    name: "copper-server",
    version: "1.15.2",
    qualifiers: { type: "war" }
  });
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/com.pogeyan.cmis/copper-server@1.15.2?type=war",
    dependsOn: [
      "pkg:maven/javax/javaee-web-api@7.0?type=jar",
      "pkg:maven/org.apache.chemistry.opencmis/chemistry-opencmis-server-support@1.0.0?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-api@1.15.2?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-impl@1.15.2?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-ldap@1.15.2?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-repo@1.15.2?type=jar",
      "pkg:maven/com.pogeyan.cmis/copper-server-mongo@1.15.2?type=jar",
      "pkg:maven/org.apache.commons/commons-lang3@3.4?type=jar",
      "pkg:maven/io.dropwizard.metrics/metrics-core@3.1.2?type=jar",
      "pkg:maven/com.github.davidb/metrics-influxdb@0.9.3?type=jar",
      "pkg:maven/commons-fileupload/commons-fileupload@1.4?type=jar",
      "pkg:maven/com.fasterxml.jackson.core/jackson-core@2.12.0?type=jar",
      "pkg:maven/com.fasterxml.jackson.core/jackson-databind@2.12.0?type=jar",
      "pkg:maven/junit/junit@4.12?type=jar",
      "pkg:maven/com.typesafe.akka/akka-actor_2.11@2.4.14?type=jar",
      "pkg:maven/com.typesafe.akka/akka-cluster_2.11@2.4.14?type=jar",
      "pkg:maven/org.codehaus.jackson/jackson-mapper-asl@1.9.13?type=jar",
      "pkg:maven/org.slf4j/slf4j-log4j12@1.7.21?type=jar",
      "pkg:maven/commons-io/commons-io@2.6?type=jar"
    ]
  });
  parsedList = parseMavenTree(
    readFileSync("./test/data/mvn-dep-tree-simple.txt", {
      encoding: "utf-8"
    })
  );
  expect(parsedList.pkgList.length).toEqual(37);
  expect(parsedList.dependenciesList.length).toEqual(37);
  expect(parsedList.pkgList[0]).toEqual({
    group: "com.gitlab.security_products.tests",
    name: "java-maven",
    version: "1.0-SNAPSHOT",
    qualifiers: { type: "jar" }
  });
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/com.gitlab.security_products.tests/java-maven@1.0-SNAPSHOT?type=jar",
    dependsOn: [
      "pkg:maven/org.powermock/powermock-api-mockito@1.7.3?type=jar",
      "pkg:maven/io.netty/netty@3.9.1.Final?type=jar",
      "pkg:maven/junit/junit@3.8.1?type=jar",
      "pkg:maven/org.apache.maven/maven-artifact@3.3.9?type=jar",
      "pkg:maven/com.fasterxml.jackson.core/jackson-databind@2.9.2?type=jar",
      "pkg:maven/org.mozilla/rhino@1.7.10?type=jar",
      "pkg:maven/org.apache.geode/geode-core@1.1.1?type=jar"
    ]
  });
  parsedList = parseMavenTree(
    readFileSync("./test/data/mvn-p2-plugin.txt", {
      encoding: "utf-8"
    })
  );
  expect(parsedList.pkgList.length).toEqual(79);
  expect(parsedList.pkgList[0]).toEqual({
    group: "example.group",
    name: "eclipse-repository",
    version: "1.0.0-SNAPSHOT",
    qualifiers: { type: "eclipse-repository" }
  });
  expect(parsedList.pkgList[4]).toEqual({
    group: "p2.eclipse.plugin",
    name: "com.ibm.icu",
    version: "67.1.0.v20200706-1749",
    qualifiers: { type: "eclipse-plugin" }
  });
  expect(parsedList.dependenciesList.length).toEqual(79);
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/example.group/eclipse-repository@1.0.0-SNAPSHOT?type=eclipse-repository",
    dependsOn: [
      "pkg:maven/example.group/example-feature@0.1.0-SNAPSHOT?type=eclipse-feature",
      "pkg:maven/example.group/example-feature-2@0.2.0-SNAPSHOT?type=eclipse-feature",
      "pkg:maven/example.group/example-bundle@0.1.0-SNAPSHOT?type=eclipse-plugin",
      "pkg:maven/example.group/org.tycho.demo.rootfiles@1.0.0?type=p2-installable-unit",
      "pkg:maven/example.group/org.tycho.demo.rootfiles.win@1.0.0-SNAPSHOT?type=p2-installable-unit"
    ]
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
        version: "1.1.0"
      }
    ],
    false
  );
  expect(data).toEqual([
    {
      group: "",
      name: "Flask",
      version: "1.1.0"
    }
  ]);
}, 240000);

test("parseGoModData", async () => {
  let dep_list = await parseGoModData(null);
  expect(dep_list).toEqual([]);
  const gosumMap = {
    "google.golang.org/grpc@v1.21.0":
      "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
    "github.com/aws/aws-sdk-go@v1.38.47": "sha256-fake-sha-for-aws-go-sdk=",
    "github.com/spf13/cobra@v1.0.0":
      "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
    "github.com/spf13/viper@v1.0.2":
      "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
    "github.com/stretchr/testify@v1.6.1":
      "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg="
  };
  dep_list = await parseGoModData(
    readFileSync("./test/gomod/go.mod", { encoding: "utf-8" }),
    gosumMap
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "github.com/aws/aws-sdk-go",
    license: undefined,
    version: "v1.38.47",
    _integrity: "sha256-fake-sha-for-aws-go-sdk=",
    "bom-ref": "pkg:golang/github.com/aws/aws-sdk-go@v1.38.47",
    purl: "pkg:golang/github.com%2Faws%2Faws-sdk-go@v1.38.47"
  });
  expect(dep_list[1]).toEqual({
    group: "",
    name: "github.com/spf13/cobra",
    "bom-ref": "pkg:golang/github.com/spf13/cobra@v1.0.0",
    purl: "pkg:golang/github.com%2Fspf13%2Fcobra@v1.0.0",
    license: undefined,
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE="
  });
  expect(dep_list[2]).toEqual({
    group: "",
    name: "google.golang.org/grpc",
    "bom-ref": "pkg:golang/google.golang.org/grpc@v1.21.0",
    purl: "pkg:golang/google.golang.org%2Fgrpc@v1.21.0",
    license: undefined,
    version: "v1.21.0",
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM="
  });
  expect(dep_list[3]).toEqual({
    group: "",
    name: "github.com/spf13/viper",
    "bom-ref": "pkg:golang/github.com/spf13/viper@v1.0.2",
    purl: "pkg:golang/github.com%2Fspf13%2Fviper@v1.0.2",
    license: undefined,
    version: "v1.0.2",
    _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM="
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
}, 120000);

test("parseGoSumData", async () => {
  let dep_list = await parseGoModData(null);
  expect(dep_list).toEqual([]);
  dep_list = await parseGosumData(
    readFileSync("./test/gomod/go.sum", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "google.golang.org/grpc",
    license: undefined,
    version: "v1.21.0",
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM="
  });
  expect(dep_list[1]).toEqual({
    group: "",
    name: "github.com/spf13/cobra",
    license: undefined,
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE="
  });
  expect(dep_list[2]).toEqual({
    group: "",
    name: "github.com/spf13/viper",
    license: undefined,
    version: "v1.0.2",
    _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM="
  });
  expect(dep_list[3]).toEqual({
    group: "",
    name: "github.com/stretchr/testify",
    license: undefined,
    version: "v1.6.1",
    _integrity: "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg="
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
}, 120000);

test("parse go list dependencies", async () => {
  const retMap = await parseGoListDep(
    readFileSync("./test/data/golist-dep.txt", { encoding: "utf-8" }),
    {}
  );
  expect(retMap.pkgList.length).toEqual(4);
  expect(retMap.pkgList[0]).toEqual({
    group: "",
    name: "github.com/gorilla/mux",
    "bom-ref": "pkg:golang/github.com/gorilla/mux@v1.7.4",
    purl: "pkg:golang/github.com%2Fgorilla%2Fmux@v1.7.4",
    version: "v1.7.4",
    _integrity: undefined,
    license: undefined,
    scope: "required",
    properties: [
      {
        name: "SrcGoMod",
        value:
          "/home/almalinux/go/pkg/mod/cache/download/github.com/gorilla/mux/@v/v1.7.4.mod"
      },
      { name: "ModuleGoVersion", value: "1.12" }
    ]
  });
});

test("parse go mod graph", async () => {
  const retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-graph.txt", { encoding: "utf-8" }),
    "./test/data/gomod-graph.txt",
    {},
    [],
    {}
  );
  expect(retMap.pkgList.length).toEqual(537);
  expect(retMap.pkgList[0]).toEqual({
    group: "",
    name: "github.com/sqreen/go-dvwa",
    version: null,
    purl: "pkg:golang/github.com%2Fsqreen%2Fgo-dvwa",
    "bom-ref": "pkg:golang/github.com/sqreen/go-dvwa",
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/gomod-graph.txt"
          }
        ]
      }
    },
    properties: [{ name: "SrcFile", value: "./test/data/gomod-graph.txt" }]
  });
});

test("parse go mod why dependencies", () => {
  let pkg_name = parseGoModWhy(
    readFileSync("./test/data/gomodwhy.txt", { encoding: "utf-8" })
  );
  expect(pkg_name).toEqual("github.com/mailgun/mailgun-go/v4");
  pkg_name = parseGoModWhy(
    readFileSync("./test/data/gomodwhynot.txt", { encoding: "utf-8" })
  );
  expect(pkg_name).toBeUndefined();
});

test("parseGopkgData", async () => {
  let dep_list = await parseGopkgData(null);
  expect(dep_list).toEqual([]);
  dep_list = await parseGopkgData(
    readFileSync("./test/gopkg/Gopkg.lock", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(36);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "cloud.google.com/go",
    version: "v0.39.0",
    _integrity: "sha256-LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78="
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
}, 120000);

test("parse go version data", async () => {
  let dep_list = await parseGoVersionData(
    readFileSync("./test/data/goversion.txt", { encoding: "utf-8" }),
    {}
  );
  expect(dep_list.length).toEqual(125);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "github.com/ShiftLeftSecurity/atlassian-connect-go",
    "bom-ref":
      "pkg:golang/github.com/ShiftLeftSecurity/atlassian-connect-go@v0.0.2",
    purl: "pkg:golang/github.com%2FShiftLeftSecurity%2Fatlassian-connect-go@v0.0.2",
    version: "v0.0.2",
    _integrity: "",
    license: undefined
  });
  dep_list = await parseGoVersionData(
    readFileSync("./test/data/goversion2.txt", { encoding: "utf-8" }),
    {}
  );
  expect(dep_list.length).toEqual(149);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "cloud.google.com/go",
    "bom-ref": "pkg:golang/cloud.google.com/go@v0.79.0",
    purl: "pkg:golang/cloud.google.com%2Fgo@v0.79.0",
    version: "v0.79.0",
    _integrity: "sha256-oqqswrt4x6b9OGBnNqdssxBl1xf0rSUNjU2BR4BZar0=",
    license: undefined
  });
});

test("parse cargo lock", async () => {
  expect(await parseCargoData(null)).toEqual([]);
  let dep_list = await parseCargoData(
    readFileSync("./test/Cargo.lock", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(224);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "abscissa_core",
    version: "0.5.2",
    _integrity:
      "sha384-6a07677093120a02583717b6dd1ef81d8de1e8d01bd226c83f0f9bdf3e56bb3a"
  });
  dep_list = await parseCargoData(
    readFileSync("./test/data/Cargom.lock", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(242);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "actix-codec",
    version: "0.3.0",
    _integrity:
      "sha384-78d1833b3838dbe990df0f1f87baf640cf6146e898166afe401839d1b001e570"
  });
});

test("parse cargo toml", async () => {
  expect(await parseCargoTomlData(null)).toEqual([]);
  let dep_list = await parseCargoTomlData(
    readFileSync("./test/data/Cargo1.toml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list).toEqual([
    { group: "", name: "unwind", version: "0.0.0" },
    { name: "libc", version: "0.2.79" },
    { name: "compiler_builtins", version: "0.1.0" },
    { name: "cfg-if", version: "0.1.8" }
  ]);
  dep_list = await parseCargoTomlData(
    readFileSync("./test/data/Cargo2.toml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list).toEqual([
    { group: "", name: "quiche-fuzz", version: "0.1.0" },
    { name: "lazy_static", version: "1" },
    {
      name: "libfuzzer-sys",
      version: "git+https://github.com/rust-fuzz/libfuzzer-sys.git"
    }
  ]);
});

test("parse cargo auditable data", async () => {
  expect(await parseCargoAuditableData(null)).toEqual([]);
  const dep_list = await parseCargoAuditableData(
    readFileSync("./test/data/cargo-auditable.txt", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(32);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "adler",
    version: "1.0.2"
  });
});

test("get crates metadata", async () => {
  const dep_list = await getCratesMetadata([
    {
      group: "",
      name: "abscissa_core",
      version: "0.5.2",
      _integrity:
        "sha256-6a07677093120a02583717b6dd1ef81d8de1e8d01bd226c83f0f9bdf3e56bb3a"
    }
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
    license: ["Apache-2.0"],
    repository: {
      url: "https://github.com/iqlusioninc/abscissa/tree/main/core/"
    },
    homepage: { url: "https://github.com/iqlusioninc/abscissa/" }
  });
}, 20000);

test("parse pub lock", async () => {
  expect(await parsePubLockData(null)).toEqual([]);
  let dep_list = await parsePubLockData(
    readFileSync("./test/data/pubspec.lock", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(26);
  expect(dep_list[0]).toEqual({
    name: "async",
    version: "2.8.2"
  });
  dep_list = parsePubYamlData(
    readFileSync("./test/data/pubspec.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    name: "awesome_dialog",
    version: "2.2.1",
    description:
      "Flutter package to show beautiful dialogs(INFO,QUESTION,WARNING,SUCCESS,ERROR) with animations as simply as possible.",
    homepage: {
      url: "https://github.com/marcos930807/awesomeDialogs"
    }
  });
});

test("get dart metadata", async () => {
  const dep_list = await getDartMetadata([
    {
      group: "",
      name: "async",
      version: "2.8.2"
    }
  ]);
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "async",
    version: "2.8.2",
    description:
      "Utility functions and classes related to the 'dart:async' library.",
    license: "https://pub.dev/packages/async/license",
    repository: {
      url: "https://github.com/dart-lang/async"
    }
  });
}, 120000);

test("parse cabal freeze", () => {
  expect(parseCabalData(null)).toEqual([]);
  let dep_list = parseCabalData(
    readFileSync("./test/data/cabal.project.freeze", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(24);
  expect(dep_list[0]).toEqual({
    name: "ansi-terminal",
    version: "0.11.3"
  });
  dep_list = parseCabalData(
    readFileSync("./test/data/cabal-2.project.freeze", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(366);
  expect(dep_list[0]).toEqual({
    name: "Cabal",
    version: "3.2.1.0"
  });
});

test("parse conan data", () => {
  expect(parseConanLockData(null)).toEqual([]);
  let dep_list = parseConanLockData(
    readFileSync("./test/data/conan.lock", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    name: "zstd",
    version: "1.4.4"
  });
  dep_list = parseConanData(
    readFileSync("./test/data/conanfile.txt", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    name: "zstd",
    version: "1.4.4"
  });
  dep_list = parseConanData(
    readFileSync("./test/data/cmakes/conanfile.txt", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    name: "qr-code-generator",
    version: "1.8.0"
  });
});

test("parse clojure data", () => {
  expect(parseLeiningenData(null)).toEqual([]);
  let dep_list = parseLeiningenData(
    readFileSync("./test/data/project.clj", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(14);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "leiningen-core",
    version: "2.9.9-SNAPSHOT"
  });
  dep_list = parseLeiningenData(
    readFileSync("./test/data/project.clj.1", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(17);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.9.0"
  });
  dep_list = parseLeiningenData(
    readFileSync("./test/data/project.clj.2", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(49);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "bidi",
    version: "2.1.6"
  });
  dep_list = parseEdnData(
    readFileSync("./test/data/deps.edn", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(20);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.10.3"
  });
  dep_list = parseEdnData(
    readFileSync("./test/data/deps.edn.1", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(11);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.11.0-beta1"
  });
  dep_list = parseEdnData(
    readFileSync("./test/data/deps.edn.2", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(5);
  expect(dep_list[0]).toEqual({
    group: "clj-commons",
    name: "pomegranate",
    version: "1.2.1"
  });
  dep_list = parseCljDep(
    readFileSync("./test/data/clj-tree.txt", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(253);
  expect(dep_list[0]).toEqual({
    group: "org.bouncycastle",
    name: "bcprov-jdk15on",
    version: "1.70"
  });

  dep_list = parseLeinDep(
    readFileSync("./test/data/lein-tree.txt", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(47);
  expect(dep_list[0]).toEqual({
    group: "javax.xml.bind",
    name: "jaxb-api",
    version: "2.4.0-b180830.0359"
  });
});

test("parse mix lock data", async () => {
  expect(parseMixLockData(null)).toEqual([]);
  let dep_list = parseMixLockData(
    readFileSync("./test/data/mix.lock", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(16);
  expect(dep_list[0]).toEqual({
    name: "absinthe",
    version: "1.7.0"
  });
  dep_list = parseMixLockData(
    readFileSync("./test/data/mix.lock.1", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(23);
  expect(dep_list[0]).toEqual({
    name: "bunt",
    version: "0.2.0"
  });
});

test("parse github actions workflow data", async () => {
  expect(parseGitHubWorkflowData(null)).toEqual([]);
  let dep_list = parseGitHubWorkflowData(
    readFileSync("./.github/workflows/nodejs.yml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    group: "actions",
    name: "checkout",
    version: "v4"
  });
  dep_list = parseGitHubWorkflowData(
    readFileSync("./.github/workflows/repotests.yml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(7);
  expect(dep_list[0]).toEqual({
    group: "actions",
    name: "checkout",
    version: "v4"
  });
  dep_list = parseGitHubWorkflowData(
    readFileSync("./.github/workflows/app-release.yml", {
      encoding: "utf-8"
    })
  );
  expect(dep_list.length).toEqual(3);
});

test("parse cs pkg data", async () => {
  expect(await parseCsPkgData(null)).toEqual([]);
  const dep_list = await parseCsPkgData(
    readFileSync("./test/data/packages.config", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(21);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Antlr",
    version: "3.5.0.2"
  });
});

test("parse cs pkg data 2", async () => {
  expect(await parseCsPkgData(null)).toEqual([]);
  const dep_list = await parseCsPkgData(
    readFileSync("./test/data/packages2.config", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "EntityFramework",
    version: "6.2.0"
  });
});

test("parse cs proj", async () => {
  expect(await parseCsProjData(null)).toEqual([]);
  const dep_list = await parseCsProjData(
    readFileSync("./test/sample.csproj", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(5);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Microsoft.AspNetCore.Mvc.NewtonsoftJson",
    version: "3.1.1"
  });
});

test("parse project.assets.json", async () => {
  expect(await parseCsProjAssetsData(null)).toEqual({
    dependenciesList: [],
    pkgList: []
  });
  const dep_list = await parseCsProjAssetsData(
    readFileSync("./test/data/project.assets.json", { encoding: "utf-8" })
  );
  expect(dep_list["pkgList"].length).toEqual(302);
  expect(dep_list["pkgList"][0]).toEqual({
    "bom-ref": "pkg:nuget/Castle.Core.Tests@0.0.0",
    purl: "pkg:nuget/Castle.Core.Tests@0.0.0",
    group: "",
    name: "Castle.Core.Tests",
    type: "application",
    version: "0.0.0"
  });
  expect(dep_list["dependenciesList"].length).toEqual(302);
  expect(dep_list["dependenciesList"][0]).toEqual({
    dependsOn: [
      "pkg:nuget/Castle.Core@0.0.0",
      "pkg:nuget/Castle.Core-NLog@0.0.0",
      "pkg:nuget/Castle.Core-Serilog@0.0.0",
      "pkg:nuget/Castle.Core-log4net@0.0.0",
      "pkg:nuget/Microsoft.NET.Test.Sdk@17.1.0",
      "pkg:nuget/Microsoft.NETCore.App@2.1.0",
      "pkg:nuget/Microsoft.NETFramework.ReferenceAssemblies@1.0.0",
      "pkg:nuget/NLog@4.5.0",
      "pkg:nuget/NUnit.Console@3.11.1",
      "pkg:nuget/NUnit3TestAdapter@3.16.1",
      "pkg:nuget/NUnitLite@3.13.3",
      "pkg:nuget/Serilog@2.0.0",
      "pkg:nuget/Serilog.Sinks.TextWriter@2.0.0",
      "pkg:nuget/System.Security.Permissions@4.7.0",
      "pkg:nuget/log4net@2.0.13",
      "pkg:nuget/System.Net.NameResolution@4.3.0",
      "pkg:nuget/System.Net.Primitives@4.3.0",
      "pkg:nuget/PublicApiGenerator@10.1.2",
      "pkg:nuget/System.Security.Permissions@6.0.0"
    ],
    ref: "pkg:nuget/Castle.Core.Tests@0.0.0"
  });
});

test("parse packages.lock.json", async () => {
  expect(await parseCsPkgLockData(null)).toEqual([]);
  const dep_list = await parseCsPkgLockData(
    readFileSync("./test/data/packages.lock.json", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(14);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Antlr",
    version: "3.5.0.2"
  });
});

test("parse paket.lock", async () => {
  expect(await parsePaketLockData(null)).toEqual({
    pkgList: [],
    dependenciesList: []
  });
  const dep_list = await parsePaketLockData(
    readFileSync("./test/data/paket.lock", { encoding: "utf-8" })
  );
  expect(dep_list.pkgList.length).toEqual(13);
  expect(dep_list.pkgList[0]).toEqual({
    group: "",
    name: "0x53A.ReferenceAssemblies.Paket",
    version: "0.2",
    purl: "pkg:nuget/0x53A.ReferenceAssemblies.Paket@0.2"
  });
  expect(dep_list.dependenciesList.length).toEqual(13);
  expect(dep_list.dependenciesList[2]).toEqual({
    ref: "pkg:nuget/FSharp.Compiler.Service@17.0.1",
    dependsOn: [
      "pkg:nuget/System.Collections.Immutable@1.4",
      "pkg:nuget/System.Reflection.Metadata@1.5"
    ]
  });
});

test("parse .net cs proj", async () => {
  expect(await parseCsProjData(null)).toEqual([]);
  const dep_list = await parseCsProjData(
    readFileSync("./test/data/sample-dotnet.csproj", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(19);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Antlr3.Runtime",
    version: "3.5.0.2"
  });
});

test("get nget metadata", async () => {
  let dep_list = [
    {
      dependsOn: [
        "pkg:nuget/Microsoft.NET.Test.Sdk@17.1.0",
        "pkg:nuget/Microsoft.NETCore.App@2.1.0",
        "pkg:nuget/Microsoft.NETFramework.ReferenceAssemblies@1.0.0",
        "pkg:nuget/NLog@4.5.0",
        "pkg:nuget/NUnit.Console@3.11.1",
        "pkg:nuget/NUnit3TestAdapter@3.16.1",
        "pkg:nuget/NUnitLite@3.13.3",
        "pkg:nuget/Serilog@3.0.1",
        "pkg:nuget/Serilog.Sinks.TextWriter@2.0.0",
        "pkg:nuget/System.Security.Permissions@4.7.0",
        "pkg:nuget/log4net@2.0.13",
        "pkg:nuget/System.Net.NameResolution@4.3.0",
        "pkg:nuget/System.Net.Primitives@4.3.0",
        "pkg:nuget/PublicApiGenerator@10.1.2",
        "pkg:nuget/System.Security.Permissions@6.0.0"
      ],
      ref: "pkg:nuget/Castle.Core@4.4.0"
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
        "pkg:nuget/System.Threading@4.0.11"
      ],
      ref: "pkg:nuget/Serilog@3.0.1"
    }
  ];
  let pkg_list = [
    {
      group: "",
      name: "Castle.Core",
      version: "4.4.0",
      "bom-ref": "pkg:nuget/Castle.Core@4.4.0"
    },
    {
      group: "",
      name: "Serilog",
      version: "3.0.1",
      "bom-ref": "pkg:nuget/Serilog@3.0.1"
    }
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
        url: "https://www.nuget.org/packages/Castle.Core/4.4.0/"
      },
      license: "Apache-2.0",
      name: "Castle.Core",
      repository: {
        url: "http://www.castleproject.org/"
      },
      version: "4.4.0"
    },
    {
      author: "Serilog Contributors",
      "bom-ref": "pkg:nuget/Serilog@3.0.1",
      description: "Simple .NET logging with fully-structured events",
      group: "",
      homepage: {
        url: "https://www.nuget.org/packages/Serilog/3.0.1/"
      },
      license: "Apache-2.0",
      name: "Serilog",
      repository: {
        url: "https://serilog.net/"
      },
      version: "3.0.1"
    }
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
        "pkg:nuget/Serilog@3.0.1",
        "pkg:nuget/Serilog.Sinks.TextWriter@2.0.0",
        "pkg:nuget/System.Security.Permissions@4.7.0",
        "pkg:nuget/log4net@2.0.13",
        "pkg:nuget/System.Net.NameResolution@4.3.0",
        "pkg:nuget/System.Net.Primitives@4.3.0",
        "pkg:nuget/PublicApiGenerator@10.1.2",
        "pkg:nuget/System.Security.Permissions@6.0.0"
      ],
      ref: "pkg:nuget/Castle.Core@4.4.0"
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
        "pkg:nuget/System.Threading@4.0.11"
      ],
      ref: "pkg:nuget/Serilog@3.0.1"
    }
  ]);
}, 240000);

test("parsePomFile", () => {
  const data = parsePom("./test/pom.xml");
  expect(data.length).toEqual(13);
});

test("parsePomMetadata", async () => {
  const deps = parsePom("./test/pom.xml");
  const data = await getMvnMetadata(deps);
  expect(data.length).toEqual(deps.length);
});
/*
test("get repo license", async () => {
  let license = await utils.getRepoLicense(
    "https://github.com/ShiftLeftSecurity/sast-scan"
  );
  expect(license).toEqual({
    id: "GPL-3.0-or-later",
    url: "https://github.com/ShiftLeftSecurity/sast-scan/blob/master/LICENSE"
  });

  license = await utils.getRepoLicense("https://github.com/cyclonedx/cdxgen", {
    group: "",
    name: "cdxgen"
  });
  expect(license).toEqual({
    id: "Apache-2.0",
    url: "https://github.com/cyclonedx/cdxgen/blob/master/LICENSE"
  });

  license = await utils.getRepoLicense("https://cloud.google.com/go", {
    group: "cloud.google.com",
    name: "go"
  });
  expect(license).toEqual("Apache-2.0");

  license = await utils.getRepoLicense(undefined, {
    group: "github.com/ugorji",
    name: "go"
  });
  expect(license).toEqual({
    id: "MIT",
    url: "https://github.com/ugorji/go/blob/master/LICENSE"
  });
});
test("get go pkg license", async () => {
  jest.setTimeout(120000);
  let license = await utils.getGoPkgLicense({
    group: "github.com/Azure/azure-amqp-common-go",
    name: "v2"
  });
  expect(license).toEqual([
    {
      id: "MIT",
      url: "https://pkg.go.dev/github.com/Azure/azure-amqp-common-go/v2?tab=licenses"
    }
  ]);

  license = await utils.getGoPkgLicense({
    group: "go.opencensus.io",
    name: "go.opencensus.io"
  });
  expect(license).toEqual([
    {
      id: "Apache-2.0",
      url: "https://pkg.go.dev/go.opencensus.io?tab=licenses"
    }
  ]);

  license = await utils.getGoPkgLicense({
    group: "github.com/DataDog",
    name: "zstd"
  });
  expect(license).toEqual([
    {
      id: "BSD-3-Clause",
      url: "https://pkg.go.dev/github.com/DataDog/zstd?tab=licenses"
    }
  ]);
});
*/

test("get licenses", () => {
  let licenses = getLicenses({ license: "MIT" });
  expect(licenses).toEqual([
    {
      license: {
        id: "MIT",
        url: "https://opensource.org/licenses/MIT"
      }
    }
  ]);

  licenses = getLicenses({ license: ["MIT", "GPL-3.0-or-later"] });
  expect(licenses).toEqual([
    {
      license: {
        id: "MIT",
        url: "https://opensource.org/licenses/MIT"
      }
    },
    {
      license: {
        id: "GPL-3.0-or-later",
        url: "https://opensource.org/licenses/GPL-3.0-or-later"
      }
    }
  ]);

  licenses = getLicenses({
    license: {
      id: "MIT",
      url: "https://opensource.org/licenses/MIT"
    }
  });
  expect(licenses).toEqual([
    {
      license: {
        id: "MIT",
        url: "https://opensource.org/licenses/MIT"
      }
    }
  ]);
});

test("parsePkgLock v1", async () => {
  let parsedList = await parsePkgLock(
    "./test/data/package-json/v1/package-lock.json"
  );
  let deps = parsedList.pkgList;
  expect(deps.length).toEqual(910);
  expect(deps[1]._integrity).toEqual(
    "sha512-ZmIomM7EE1DvPEnSFAHZn9Vs9zJl5A9H7el0EGTE6ZbW9FKe/14IYAlPbC8iH25YarEQxZL+E8VW7Mi7kfQrDQ=="
  );
  expect(parsedList.dependenciesList.length).toEqual(910);
});

test("parsePkgLock v2", async () => {
  let parsedList = await parsePkgLock(
    "./test/data/package-json/v2/package-lock.json"
  );
  let deps = parsedList.pkgList;
  expect(deps.length).toEqual(134);
  expect(deps[1]._integrity).toEqual(
    "sha512-x9yaMvEh5BEaZKeVQC4vp3l+QoFj3BXcd4aYfuKSzIIyihjdVARAadYy3SMNIz0WCCdS2vB9JL/U6GQk5PaxQw=="
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
    version: "2.2.1"
  });
  expect(deps[deps.length - 1].name).toEqual("rollup");
  const pkgFilePath = path.resolve(
    path.join("test", "data", "package-json", "v2", "package-lock.json")
  );
  expect(deps[deps.length - 1].evidence).toEqual({
    identity: {
      field: "purl",
      confidence: 1,
      methods: [
        {
          technique: "manifest-analysis",
          confidence: 1,
          value: pkgFilePath
        }
      ]
    }
  });
  expect(parsedList.dependenciesList.length).toEqual(134);
});

test("parsePkgLock v2 workspace", async () => {
  let parsedList = await parsePkgLock(
    "./test/data/package-json/v2-workspace/package-lock.json"
  );
  let pkgs = parsedList.pkgList;
  let deps = parsedList.dependenciesList;
  expect(pkgs.length).toEqual(1032);
  expect(pkgs[0].license).toEqual("MIT");
  let hasAppWorkspacePkg = pkgs.some(
    (obj) => obj["bom-ref"] === "pkg:npm/app@0.0.0"
  );
  let hasAppWorkspaceDeps = deps.some((obj) => obj.ref === "pkg:npm/app@0.0.0");
  expect(hasAppWorkspacePkg).toEqual(true);
  expect(hasAppWorkspaceDeps).toEqual(true);
  let hasRootPkg = pkgs.some((obj) => obj["bom-ref"] === "pkg:npm/root@0.0.0");
  let hasRootDeps = deps.some((obj) => obj.ref === "pkg:npm/root@0.0.0");
  expect(hasRootPkg).toEqual(true);
  expect(hasRootDeps).toEqual(true);
  let hasScriptsWorkspacePkg = pkgs.some(
    (obj) => obj["bom-ref"] === "pkg:npm/scripts@0.0.0"
  );
  let hasScriptsWorkspaceDeps = deps.some(
    (obj) => obj.ref === "pkg:npm/scripts@0.0.0"
  );
  expect(hasScriptsWorkspacePkg).toEqual(true);
  expect(hasScriptsWorkspaceDeps).toEqual(true);
});

test("parsePkgLock v3", async () => {
  let parsedList = await parsePkgLock(
    "./test/data/package-json/v3/package-lock.json",
    {
      projectVersion: "latest",
      projectName: "cdxgen"
    }
  );
  let deps = parsedList.pkgList;
  expect(deps.length).toEqual(161);
  expect(deps[1]._integrity).toEqual(
    "sha512-s93jiP6GkRApn5duComx6RLwtP23YrulPxShz+8peX7svd6Q+MS8nKLhKCCazbP92C13eTVaIOxgeLt0ezIiCg=="
  );
  expect(deps[0]).toEqual({
    "bom-ref": "pkg:npm/cdxgen@latest",
    purl: "pkg:npm/cdxgen@latest",
    group: "",
    author: "",
    license: "ISC",
    name: "cdxgen",
    type: "application",
    version: "latest"
  });
  expect(deps[deps.length - 1].name).toEqual("uid2");
  expect(parsedList.dependenciesList.length).toEqual(161);
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
    "sha512-a9gxpmdXtZEInkCSHUJDLHZVBgb1QS0jhss4cPP93EW7s+uC5bikET2twEF3KV+7rDblJcmNvTR7VJejqd2C2g=="
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
    `install_requires=['colorama>=0.4.3','libsast>=1.0.3',],`
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await parseSetupPyFile(
    `install_requires=['colorama>=0.4.3','libsast>=1.0.3']`
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await parseSetupPyFile(
    `install_requires=['colorama>=0.4.3', 'libsast>=1.0.3']`
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await parseSetupPyFile(`install_requires=[
'colorama>=0.4.3',
'libsast>=1.0.3',
]`);
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");
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
    scope: undefined,
    version: "7.10.1",
    properties: [
      {
        name: "SrcFile",
        value: "./test/pnpm-lock.yaml"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/pnpm-lock.yaml"
          }
        ]
      }
    }
  });
  parsedList = await parsePnpmLock("./test/data/pnpm-lock.yaml");
  expect(parsedList.pkgList.length).toEqual(318);
  expect(parsedList.dependenciesList.length).toEqual(318);
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-iAXqUn8IIeBTNd72xsFlgaXHkMBMt6y4HJp1tIaK465CWLT/fG1aqB7ykr95gHHmlBdGbFeWWfyB4NJJ0nmeIg==",
    group: "@babel",
    name: "code-frame",
    scope: "optional",
    version: "7.16.7",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/pnpm-lock.yaml"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/pnpm-lock.yaml"
          }
        ]
      }
    }
  });
  parsedList = await parsePnpmLock("./test/data/pnpm-lock2.yaml");
  expect(parsedList.pkgList.length).toEqual(7);
  expect(parsedList.dependenciesList.length).toEqual(7);
  expect(parsedList.pkgList[0]).toEqual({
    group: "",
    name: "ansi-regex",
    version: "2.1.1",
    scope: undefined,
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
            value: "./test/data/pnpm-lock2.yaml"
          }
        ]
      }
    }
  });
  expect(parsedList.dependenciesList[2]).toEqual({
    ref: "pkg:npm/chalk@1.1.3",
    dependsOn: [
      "pkg:npm/ansi-styles@2.2.1",
      "pkg:npm/escape-string-regexp@1.0.5",
      "pkg:npm/has-ansi@2.0.0",
      "pkg:npm/strip-ansi@3.0.1",
      "pkg:npm/supports-color@2.0.0"
    ]
  });
  parsedList = await parsePnpmLock("./test/data/pnpm-lock3.yaml");
  expect(parsedList.pkgList.length).toEqual(449);
  expect(parsedList.dependenciesList.length).toEqual(449);
  expect(parsedList.pkgList[0]).toEqual({
    group: "@nodelib",
    name: "fs.scandir",
    version: "2.1.5",
    scope: undefined,
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
            value: "./test/data/pnpm-lock3.yaml"
          }
        ]
      }
    }
  });
  expect(parsedList.dependenciesList[2]).toEqual({
    ref: "pkg:npm/@nodelib/fs.walk@1.2.8",
    dependsOn: ["pkg:npm/@nodelib/fs.scandir@2.1.5", "pkg:npm/fastq@1.13.0"]
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
    scope: "optional",
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
            value: "./test/data/pnpm-lock6.yaml"
          }
        ]
      }
    }
  });
  expect(parsedList.pkgList[parsedList.pkgList.length - 1]).toEqual({
    group: "",
    name: "yargs",
    version: "17.7.1",
    scope: "optional",
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
            value: "./test/data/pnpm-lock6.yaml"
          }
        ]
      }
    }
  });
  parsedList = await parsePnpmLock("./test/data/pnpm-lock6a.yaml");
  expect(parsedList.pkgList.length).toEqual(234);
  expect(parsedList.dependenciesList.length).toEqual(234);
  expect(parsedList.pkgList[0]).toEqual({
    group: "@babel",
    name: "code-frame",
    version: "7.18.6",
    scope: "optional",
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
            value: "./test/data/pnpm-lock6a.yaml"
          }
        ]
      }
    }
  });
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
        value: "./test/yarn.lock"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/yarn.lock"
          }
        ]
      }
    }
  });
  expect(parsedList.dependenciesList.length).toEqual(56);
  identMap = yarnLockToIdentMap(
    readFileSync("./test/data/yarn_locks/yarn.lock", "utf8")
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
        value: "./test/data/yarn_locks/yarn.lock"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn.lock"
          }
        ]
      }
    }
  });
  parsedList.pkgList.forEach((d) => {
    expect(d.name).toBeDefined();
    expect(d.version).toBeDefined();
  });

  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn-multi.lock");
  expect(parsedList.pkgList.length).toEqual(1909);
  expect(parsedList.dependenciesList.length).toEqual(1909);
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
        value: "./test/data/yarn_locks/yarn-multi.lock"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn-multi.lock"
          }
        ]
      }
    }
  });

  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn-light.lock");
  expect(parsedList.pkgList.length).toEqual(315);
  expect(parsedList.dependenciesList.length).toEqual(315);
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
        value: "./test/data/yarn_locks/yarn-light.lock"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn-light.lock"
          }
        ]
      }
    }
  });

  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn3.lock");
  expect(parsedList.pkgList.length).toEqual(5);
  expect(parsedList.dependenciesList.length).toEqual(5);
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
        value: "./test/data/yarn_locks/yarn3.lock"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn3.lock"
          }
        ]
      }
    }
  });

  parsedList = await parseYarnLock("./test/data/yarn_locks/yarnv2.lock");
  expect(parsedList.pkgList.length).toEqual(1088);
  expect(parsedList.dependenciesList.length).toEqual(1088);
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
        value: "./test/data/yarn_locks/yarnv2.lock"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarnv2.lock"
          }
        ]
      }
    }
  });
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarnv3.lock");
  expect(parsedList.pkgList.length).toEqual(363);
  expect(parsedList.dependenciesList.length).toEqual(363);
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
        value: "./test/data/yarn_locks/yarnv3.lock"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarnv3.lock"
          }
        ]
      }
    }
  });
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn4.lock");
  expect(parsedList.pkgList.length).toEqual(1);
  expect(parsedList.dependenciesList.length).toEqual(1);
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
      { name: "SrcFile", value: "./test/data/yarn_locks/yarn-at.lock" }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/yarn_locks/yarn-at.lock"
          }
        ]
      }
    }
  });
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn5.lock");
  expect(parsedList.pkgList.length).toEqual(1962);
  expect(parsedList.dependenciesList.length).toEqual(1962);
  expect(parsedList.pkgList[0].purl).toEqual(
    "pkg:npm/%40ampproject/remapping@2.2.0"
  );
  expect(parsedList.pkgList[0]["bom-ref"]).toEqual(
    "pkg:npm/@ampproject/remapping@2.2.0"
  );
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn6.lock");
  expect(parsedList.pkgList.length).toEqual(1472);
  expect(parsedList.dependenciesList.length).toEqual(1472);
  expect(parsedList.pkgList[0].purl).toEqual(
    "pkg:npm/%40aashutoshrathi/word-wrap@1.2.6"
  );
  expect(parsedList.pkgList[0]["bom-ref"]).toEqual(
    "pkg:npm/@aashutoshrathi/word-wrap@1.2.6"
  );
  parsedList = await parseYarnLock("./test/data/yarn_locks/yarn7.lock");
  expect(parsedList.pkgList.length).toEqual(1350);
  expect(parsedList.dependenciesList.length).toEqual(1347);
  expect(parsedList.pkgList[0].purl).toEqual(
    "pkg:npm/%40aashutoshrathi/word-wrap@1.2.6"
  );
  expect(parsedList.pkgList[0]["bom-ref"]).toEqual(
    "pkg:npm/@aashutoshrathi/word-wrap@1.2.6"
  );
});

test("parseComposerLock", () => {
  let deps = parseComposerLock("./test/data/composer.lock");
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    group: "quickbooks",
    name: "v3-php-sdk",
    scope: "required",
    version: "4.0.6.1",
    repository: {
      type: "git",
      url: "https://github.com/intuit/QuickBooks-V3-PHP-SDK.git",
      reference: "fe42e409bcdc431614f1cfc80cfc4191b926f3ed"
    },
    license: ["Apache-2.0"],
    description: "The Official PHP SDK for QuickBooks Online Accounting API",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/composer.lock"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/composer.lock"
          }
        ]
      }
    }
  });

  deps = parseComposerLock("./test/data/composer-2.lock");
  expect(deps.length).toEqual(73);
  expect(deps[0]).toEqual({
    group: "amphp",
    name: "amp",
    scope: "required",
    version: "2.4.4",
    repository: {
      type: "git",
      url: "https://github.com/amphp/amp.git",
      reference: "1e58d53e4af390efc7813e36cd215bd82cba4b06"
    },
    license: ["MIT"],
    description: "A non-blocking concurrency framework for PHP applications.",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/composer-2.lock"
      }
    ],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/composer-2.lock"
          }
        ]
      }
    }
  });

  deps = parseComposerLock("./test/data/composer-3.lock");
  expect(deps.length).toEqual(62);
  expect(deps[0]).toEqual({
    group: "amphp",
    name: "amp",
    version: "2.6.2",
    repository: {
      type: "git",
      url: "https://github.com/amphp/amp.git",
      reference: "9d5100cebffa729aaffecd3ad25dc5aeea4f13bb"
    },
    license: ["MIT"],
    description: "A non-blocking concurrency framework for PHP applications.",
    scope: "required",
    properties: [{ name: "SrcFile", value: "./test/data/composer-3.lock" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/composer-3.lock"
          }
        ]
      }
    }
  });
});

test("parseGemfileLockData", async () => {
  const deps = await parseGemfileLockData(
    readFileSync("./test/data/Gemfile.lock", { encoding: "utf-8" })
  );
  expect(deps.length).toEqual(140);
  expect(deps[0]).toEqual({
    name: "actioncable",
    version: "6.0.0"
  });
});

test("parseGemspecData", async () => {
  const deps = await parseGemspecData(
    readFileSync("./test/data/xmlrpc.gemspec", { encoding: "utf-8" })
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    name: "xmlrpc",
    version: "0.3.0",
    description:
      "XMLRPC is a lightweight protocol that enables remote procedure calls over HTTP."
  });
});

test("parse requirements.txt", async () => {
  let deps = await parseReqFile(
    readFileSync("./test/data/requirements.comments.txt", {
      encoding: "utf-8"
    }),
    false
  );
  expect(deps.length).toEqual(31);
  deps = await parseReqFile(
    readFileSync("./test/data/requirements.freeze.txt", {
      encoding: "utf-8"
    }),
    false
  );
  expect(deps.length).toEqual(113);
  expect(deps[0]).toEqual({
    name: "elasticsearch",
    version: "8.6.2",
    scope: "required"
  });
  deps = await parseReqFile(
    readFileSync("./test/data/chen-science-requirements.txt", {
      encoding: "utf-8"
    }),
    false
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
          'python_full_version >= "3.8.1" and python_version < "3.12" --hash=sha256:19297512c647d4b27a2cf7c34caa7e405c0d60b5560618a29a9fe027b18b0107 --hash=sha256:84ec2218d8419404abcb9f0c02df3f34c6e0a68ed41072acfb1cef5cbc29051a'
      }
    ]
  });
});

test("parse pyproject.toml", async () => {
  const pkg = parsePyProjectToml("./test/data/pyproject.toml");
  expect(pkg).toEqual({
    name: "cpggen",
    version: "1.9.0",
    description:
      "Generate CPG for multiple languages for code and threat analysis",
    author: "Team AppThreat <cloud@appthreat.com>",
    homepage: { url: "https://github.com/AppThreat/cpggen" },
    repository: { url: "https://github.com/AppThreat/cpggen" }
  });
});

test("parse poetry.lock", async () => {
  let retMap = await parsePoetrylockData(
    readFileSync("./test/data/poetry.lock", { encoding: "utf-8" }),
    "./test/data/poetry.lock"
  );
  expect(retMap.pkgList.length).toEqual(32);
  expect(retMap.dependenciesList.length).toEqual(32);
  retMap = await parsePoetrylockData(
    readFileSync("./test/data/poetry1.lock", { encoding: "utf-8" }),
    "./test/data/poetry1.lock"
  );
  expect(retMap.pkgList.length).toEqual(68);
  expect(retMap.dependenciesList.length).toEqual(68);
  retMap = await parsePoetrylockData(
    readFileSync("./test/data/poetry-cpggen.lock", { encoding: "utf-8" }),
    "./test/data/poetry-cpggen.lock"
  );
  expect(retMap.pkgList.length).toEqual(69);
  expect(retMap.dependenciesList.length).toEqual(69);
  retMap = await parsePoetrylockData(
    readFileSync("./test/data/pdm.lock", { encoding: "utf-8" }),
    "./test/data/pdm.lock"
  );
  expect(retMap.pkgList.length).toEqual(37);
  expect(retMap.dependenciesList.length).toEqual(37);
}, 120000);

test("parse wheel metadata", () => {
  let deps = parseBdistMetadata(
    readFileSync("./test/data/METADATA", { encoding: "utf-8" })
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    version: "1.26.1",
    name: "yamllint",
    publisher: "Adrien Vergé",
    description: "A linter for YAML files.",
    homepage: { url: "https://github.com/adrienverge/yamllint" },
    repository: { url: "https://github.com/adrienverge/yamllint" }
  });
  deps = parseBdistMetadata(
    readFileSync("./test/data/mercurial-5.5.2-py3.8.egg-info", {
      encoding: "utf-8"
    })
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    version: "5.5.2",
    name: "mercurial",
    publisher: "Matt Mackall and many others",
    description:
      "Fast scalable distributed SCM (revision control, version control) system",
    homepage: { url: "https://mercurial-scm.org/" }
  });
});

test("parse wheel", async () => {
  const metadata = await readZipEntry(
    "./test/data/appthreat_depscan-2.0.2-py3-none-any.whl",
    "METADATA"
  );
  expect(metadata);
  const parsed = parseBdistMetadata(metadata);
  expect(parsed[0]).toEqual({
    version: "2.0.2",
    name: "appthreat-depscan",
    description:
      "Fully open-source security audit for project dependencies based on known vulnerabilities and advisories.",
    homepage: { url: "https://github.com/appthreat/dep-scan" },
    publisher: "Team AppThreat"
  });
});

test("parse pipfile.lock with hashes", async () => {
  const deps = await parsePiplockData(
    JSON.parse(readFileSync("./test/data/Pipfile.lock", { encoding: "utf-8" }))
  );
  expect(deps.length).toEqual(46);
}, 120000);

test("parse scala sbt list", () => {
  let deps = parseKVDep(
    readFileSync("./test/data/sbt-dl.list", { encoding: "utf-8" })
  );
  expect(deps.length).toEqual(57);
  deps = parseKVDep(
    readFileSync("./test/data/atom-sbt-list.txt", { encoding: "utf-8" })
  );
  expect(deps.length).toEqual(153);
});

test("parse scala sbt tree", () => {
  let retMap = parseSbtTree("./test/data/atom-sbt-tree.txt");
  expect(retMap.pkgList.length).toEqual(153);
  expect(retMap.dependenciesList.length).toEqual(153);
});

test("parse scala sbt lock", () => {
  const deps = parseSbtLock("./test/data/build.sbt.lock");
  expect(deps.length).toEqual(117);
});

test("parse nupkg file", async () => {
  let deps = await parseNupkg(
    "./test/data/Microsoft.Web.Infrastructure.1.0.0.0.nupkg"
  );
  expect(deps.length).toEqual(1);
  expect(deps[0].name).toEqual("Microsoft.Web.Infrastructure");
  deps = await parseNuspecData(
    "./test/data/Microsoft.Web.Infrastructure.1.0.0.0.nuspec",
    readFileSync(
      "./test/data/Microsoft.Web.Infrastructure.1.0.0.0.nuspec",
      "ascii"
    )
  );
  expect(deps.length).toEqual(1);
  expect(deps[0].name).toEqual("Microsoft.Web.Infrastructure");
  deps = await parseNupkg("./test/data/jquery.3.6.0.nupkg");
  expect(deps.length).toEqual(1);
  expect(deps[0].name).toEqual("jQuery");
});

test("parse bazel skyframe", () => {
  const deps = parseBazelSkyframe(
    readFileSync("./test/data/bazel/bazel-state.txt", { encoding: "utf-8" })
  );
  expect(deps.length).toEqual(16);
  expect(deps[0].name).toEqual("guava");
});

test("parse bazel action graph", () => {
  const deps = parseBazelActionGraph(
    readFileSync("./test/data/bazel/bazel-action-graph.txt", {
      encoding: "utf-8"
    })
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
    readFileSync("./test/data/bazel/BUILD", { encoding: "utf-8" })
  );
  expect(projs.length).toEqual(2);
  expect(projs[0]).toEqual("java-maven-lib");
});

test("parse helm charts", async () => {
  let dep_list = parseHelmYamlData(
    readFileSync("./test/data/Chart.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    name: "prometheus",
    version: "16.0.0",
    description: "Prometheus is a monitoring system and time series database.",
    homepage: {
      url: "https://prometheus.io/"
    }
  });
  dep_list = parseHelmYamlData(
    readFileSync("./test/data/prometheus-community-index.yaml", {
      encoding: "utf-8"
    })
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
    repository: { url: "https://github.com/prometheus/alertmanager" }
  });
});

test("parse container spec like files", async () => {
  let dep_list = parseContainerSpecData(
    readFileSync("./test/data/docker-compose.yml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(4);
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/docker-compose-ng.yml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(8);
  expect(dep_list[0]).toEqual({
    service: "frontend"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/docker-compose-cr.yml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(14);
  expect(dep_list[0]).toEqual({
    service: "crapi-identity"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/tekton-task.yml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image:
      "docker.io/amazon/aws-cli:2.0.52@sha256:1506cec98a7101c935176d440a14302ea528b8f92fcaf4a6f1ea2d7ecef7edc4"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/postgrescluster.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(6);
  expect(dep_list[0]).toEqual({
    image:
      "registry.developers.crunchydata.com/crunchydata/crunchy-postgres:ubi8-14.5-1"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/deployment.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "node-typescript-example"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/skaffold.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(6);
  expect(dep_list[0]).toEqual({
    image: "leeroy-web"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/skaffold-ms.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(22);
  expect(dep_list[0]).toEqual({
    image: "emailservice"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/emailservice.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "emailservice"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/redis.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "redis:alpine"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/adservice.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "gcr.io/google-samples/microservices-demo/adservice:v0.4.1"
  });
  dep_list = parseContainerSpecData(
    readFileSync("./test/data/kustomization.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(22);
  expect(dep_list[0]).toEqual({
    image: "gcr.io/google-samples/microservices-demo/adservice"
  });
});

test("parse cloudbuild data", async () => {
  expect(parseCloudBuildData(null)).toEqual([]);
  const dep_list = parseCloudBuildData(
    readFileSync("./test/data/cloudbuild.yaml", { encoding: "utf-8" })
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "gcr.io/k8s-skaffold",
    name: "skaffold",
    version: "v2.0.1"
  });
});

test("parse privado files", () => {
  const servList = parsePrivadoFile("./test/data/privado.json");
  expect(servList.length).toEqual(1);
  expect(servList[0].data.length).toEqual(11);
  expect(servList[0].endpoints.length).toEqual(17);
  expect(servList[0].properties.length).toEqual(5);
});

test("parse openapi spec files", async () => {
  let aservice = parseOpenapiSpecData(
    readFileSync("./test/data/openapi/openapi-spec.json", {
      encoding: "utf-8"
    })
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
      "http://localhost:8888/workshop/api/mechanic/signup"
    ],
    authenticated: true
  });
  aservice = parseOpenapiSpecData(
    readFileSync("./test/data/openapi/openapi-oai.yaml", {
      encoding: "utf-8"
    })
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
      "https://api.openai.com/v1/moderations"
    ],
    authenticated: false
  });
});

test("parse swift deps files", () => {
  expect(parseSwiftJsonTree(null, "./test/data/swift-deps.json")).toEqual({});
  let retData = parseSwiftJsonTree(
    readFileSync("./test/data/swift-deps.json", { encoding: "utf-8" }),
    "./test/data/swift-deps.json"
  );
  expect(retData.pkgList.length).toEqual(5);
  expect(retData.pkgList[0]).toEqual({
    group: "swift-markdown",
    name: "swift-markdown",
    version: "unspecified",
    properties: [
      { name: "SrcPath", value: "/Volumes/Work/sandbox/swift-markdown" },
      { name: "SrcFile", value: "./test/data/swift-deps.json" }
    ],
    "bom-ref": "pkg:swift/swift-markdown/swift-markdown@unspecified"
  });
  expect(retData.dependenciesList.length).toEqual(5);
  expect(retData.dependenciesList[0]).toEqual({
    ref: "pkg:swift/swift-markdown/swift-markdown@unspecified",
    dependsOn: [
      "pkg:swift/swift-cmark/cmark-gfm@unspecified",
      "pkg:swift/swift-argument-parser/swift-argument-parser@1.0.3",
      "pkg:swift/swift-docc-plugin/SwiftDocCPlugin@1.1.0"
    ]
  });
  expect(retData.dependenciesList[retData.dependenciesList.length - 1]).toEqual(
    {
      ref: "pkg:swift/swift-docc-symbolkit/SymbolKit@1.0.0",
      dependsOn: []
    }
  );
  retData = parseSwiftJsonTree(
    readFileSync("./test/data/swift-deps1.json", { encoding: "utf-8" }),
    "./test/data/swift-deps.json"
  );
  expect(retData.pkgList.length).toEqual(5);
  expect(retData.pkgList[0]).toEqual({
    group: "swift-certificates",
    name: "swift-certificates",
    version: "unspecified",
    properties: [
      {
        name: "SrcPath",
        value: "/Volumes/Work/sandbox/swift-certificates"
      },
      { name: "SrcFile", value: "./test/data/swift-deps.json" }
    ],
    "bom-ref": "pkg:swift/swift-certificates/swift-certificates@unspecified"
  });
  expect(retData.dependenciesList).toEqual([
    {
      ref: "pkg:swift/swift-certificates/swift-certificates@unspecified",
      dependsOn: ["pkg:swift/swift-crypto/swift-crypto@2.4.0"]
    },
    {
      ref: "pkg:swift/swift-crypto/swift-crypto@2.4.0",
      dependsOn: ["pkg:swift/swift-asn1/swift-asn1@0.7.0"]
    },
    {
      ref: "pkg:swift/swift-asn1/swift-asn1@0.7.0",
      dependsOn: ["pkg:swift/swift-docc-plugin/SwiftDocCPlugin@1.1.0"]
    },
    {
      ref: "pkg:swift/swift-docc-plugin/SwiftDocCPlugin@1.1.0",
      dependsOn: ["pkg:swift/swift-docc-symbolkit/SymbolKit@1.0.0"]
    },
    {
      ref: "pkg:swift/swift-docc-symbolkit/SymbolKit@1.0.0",
      dependsOn: []
    }
  ]);
  let pkgList = parseSwiftResolved("./test/data/Package.resolved");
  expect(pkgList.length).toEqual(4);
  expect(pkgList[0]).toEqual({
    name: "swift-argument-parser",
    group: "",
    version: "1.0.3",
    properties: [{ name: "SrcFile", value: "./test/data/Package.resolved" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/Package.resolved"
          }
        ]
      }
    },
    repository: { url: "https://github.com/apple/swift-argument-parser" }
  });
  pkgList = parseSwiftResolved("./test/data/Package2.resolved");
  expect(pkgList.length).toEqual(4);
  expect(pkgList[0]).toEqual({
    name: "swift-argument-parser",
    group: "",
    version: "1.2.2",
    properties: [{ name: "SrcFile", value: "./test/data/Package2.resolved" }],
    evidence: {
      identity: {
        field: "purl",
        confidence: 1,
        methods: [
          {
            technique: "manifest-analysis",
            confidence: 1,
            value: "./test/data/Package2.resolved"
          }
        ]
      }
    },
    repository: { url: "https://github.com/apple/swift-argument-parser.git" }
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
    "4.0.0"
  ];
  expect(guessPypiMatchingVersion(versionsList, "<4")).toEqual(
    "3.0.12-alpha.14"
  );
  expect(guessPypiMatchingVersion(versionsList, ">1.0.0 <3.0.0")).toEqual(
    "2.0.3"
  );
  expect(guessPypiMatchingVersion(versionsList, "== 1.0.1")).toEqual("1.0.1");
  expect(guessPypiMatchingVersion(versionsList, "~= 1.0.1")).toEqual("1.0.1");
  expect(guessPypiMatchingVersion(versionsList, ">= 2.0.1, == 2.8.*")).toEqual(
    null
  );
  expect(
    guessPypiMatchingVersion(
      ["2.0.0", "2.0.1", "2.4.0", "2.8.4", "2.9.0", "3.0.1"],
      ">= 2.0.1, == 2.8.*"
    )
  ).toEqual("2.8.4");
  expect(
    guessPypiMatchingVersion(versionsList, "== 1.1.0; python_version < '3.8'")
  ).toEqual("1.1.0");
  expect(
    guessPypiMatchingVersion(versionsList, "<3.6,>1.9,!=1.9.6,<4.0a0")
  ).toEqual("3.0.12-alpha.14");
  expect(
    guessPypiMatchingVersion(versionsList, ">=1.4.2,<2.2,!=1.5.*,!=1.6.*")
  ).toEqual("2.0.3");
  expect(guessPypiMatchingVersion(versionsList, ">=1.21.1,<3")).toEqual(
    "2.0.3"
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
    scope: null
  });
  expect(parsePackageJsonName("@babel/code-frame")).toEqual({
    fullName: "code-frame",
    moduleName: "code-frame",
    projectName: null,
    scope: "@babel"
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
    version: ""
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
    version: ""
  });
  retMap = parseCmakeLikeFile("./test/data/cmakes/CMakeLists.txt", "conan");
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:conan/mongo-c-driver",
    group: "",
    name: "mongo-c-driver",
    purl: "pkg:conan/mongo-c-driver",
    type: "application",
    version: ""
  });
  retMap = parseCmakeLikeFile(
    "./test/data/cmakes/mongoc-config.cmake",
    "conan"
  );
  expect(retMap.pkgList.length).toEqual(2);
  retMap = parseCmakeLikeFile("./test/data/meson.build", "conan");
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:conan/mtxclient@0.9.2",
    group: "",
    name: "mtxclient",
    purl: "pkg:conan/mtxclient@0.9.2",
    type: "application",
    version: "0.9.2"
  });
  expect(retMap.pkgList.length).toEqual(7);
  retMap = parseCmakeLikeFile("./test/data/meson-1.build", "conan");
  expect(retMap.parentComponent).toEqual({
    "bom-ref": "pkg:conan/abseil-cpp@20230125.1",
    group: "",
    name: "abseil-cpp",
    purl: "pkg:conan/abseil-cpp@20230125.1",
    type: "application",
    version: "20230125.1"
  });
  expect(retMap.pkgList.length).toEqual(2);
});
