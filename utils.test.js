const utils = require("./utils");
const fs = require("fs");
const ssri = require("ssri");

test("SSRI test", () => {
  // gopkg.lock hash
  ss = ssri.parse(
    "2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf"
  );
  expect(ss).toEqual(null);
  ss = ssri.parse(
    "sha256-2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf"
  );
  expect(ss.sha256[0].digest).toStrictEqual(
    "2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf"
  );
  ss = ssri.parse(
    "sha256-" +
      Buffer.from(
        "2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf",
        "hex"
      ).toString("base64")
  );
  expect(ss.sha256[0].digest).toStrictEqual(
    "LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78="
  );
});

test("Parse requires dist string", () => {
  expect(utils.parsePyRequiresDist("lazy-object-proxy (&gt;=1.4.0)")).toEqual({
    name: "lazy-object-proxy",
    version: "1.4.0"
  });
  expect(utils.parsePyRequiresDist("wrapt (&lt;1.13,&gt;=1.11)")).toEqual({
    name: "wrapt",
    version: "1.13"
  });
  expect(
    utils.parsePyRequiresDist(
      'typed-ast (&lt;1.5,&gt;=1.4.0) ; implementation_name == "cpython" and python_version &lt; "3.8"'
    )
  ).toEqual({ name: "typed-ast", version: "1.5" });
  expect(utils.parsePyRequiresDist("asgiref (&lt;4,&gt;=3.2.10)")).toEqual({
    name: "asgiref",
    version: "4"
  });
  expect(utils.parsePyRequiresDist("pytz")).toEqual({
    name: "pytz",
    version: ""
  });
  expect(utils.parsePyRequiresDist("sqlparse (&gt;=0.2.2)")).toEqual({
    name: "sqlparse",
    version: "0.2.2"
  });
  expect(
    utils.parsePyRequiresDist("argon2-cffi (&gt;=16.1.0) ; extra == 'argon2'")
  ).toEqual({ name: "argon2-cffi", version: "16.1.0" });
  expect(utils.parsePyRequiresDist("bcrypt ; extra == 'bcrypt'")).toEqual({
    name: "bcrypt",
    version: ""
  });
});

test("finds license id from name", () => {
  expect(utils.findLicenseId("Apache License Version 2.0")).toEqual(
    "Apache-2.0"
  );
  expect(
    utils.findLicenseId("GNU General Public License (GPL) version 2.0")
  ).toEqual("GPL-2.0-only");
});

test("parse gradle dependencies", () => {
  expect(utils.parseGradleDep(null)).toEqual({});
  let parsedList = utils.parseGradleDep(
    fs.readFileSync("./test/gradle-dep.out", (encoding = "utf-8"))
  );
  expect(parsedList.pkgList.length).toEqual(34);
  expect(parsedList.dependenciesList.length).toEqual(34);
  expect(parsedList.pkgList[1]).toEqual({
    group: "org.ethereum",
    name: "solcJ-all",
    qualifiers: {
      type: "jar"
    },
    version: "0.4.25"
  });

  parsedList = utils.parseGradleDep(
    fs.readFileSync("./test/data/gradle-android-dep.out", (encoding = "utf-8"))
  );
  expect(parsedList.pkgList.length).toEqual(106);
  expect(parsedList.dependenciesList.length).toEqual(106);
  expect(parsedList.pkgList[1]).toEqual({
    group: "com.android.support.test",
    name: "runner",
    qualifiers: {
      type: "jar"
    },
    version: "1.0.2"
  });
  expect(parsedList.pkgList[104]).toEqual({
    group: "androidx.print",
    name: "print",
    qualifiers: {
      type: "jar"
    },
    version: "1.0.0"
  });
  expect(parsedList.pkgList[105]).toEqual({
    group: "androidx.core",
    name: "core",
    qualifiers: {
      type: "jar"
    },
    version: "1.7.0"
  });
  parsedList = utils.parseGradleDep(
    fs.readFileSync("./test/data/gradle-out1.dep", (encoding = "utf-8"))
  );
  expect(parsedList.pkgList.length).toEqual(90);
  expect(parsedList.dependenciesList.length).toEqual(90);
  expect(parsedList.pkgList[1]).toEqual({
    group: "org.springframework.boot",
    name: "spring-boot-starter-web",
    version: "2.2.0.RELEASE",
    qualifiers: { type: "jar" }
  });
});

test("parse gradle projects", () => {
  expect(utils.parseGradleProjects(null)).toEqual([]);
  let proj_list = utils.parseGradleProjects(
    fs.readFileSync("./test/data/gradle-projects.out", (encoding = "utf-8"))
  );
  expect(proj_list.length).toEqual(9);
});

test("parse maven tree", () => {
  expect(utils.parseMavenTree(null)).toEqual([]);
  let parsedList = utils.parseMavenTree(
    fs.readFileSync("./test/data/sample-mvn-tree.txt", (encoding = "utf-8"))
  );
  expect(parsedList.pkgList.length).toEqual(59);
  expect(parsedList.dependenciesList.length).toEqual(59);
  expect(parsedList.pkgList[0]).toEqual({
    group: "com.pogeyan.cmis",
    name: "copper-server",
    version: "1.15.2",
    qualifiers: { type: "jar" }
  });
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/com.pogeyan.cmis/copper-server@1.15.2?type=jar",
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
      "pkg:maven/com.typesafe.akka/akka-actor_2.11@2.4.14?type=jar",
      "pkg:maven/com.typesafe.akka/akka-cluster_2.11@2.4.14?type=jar",
      "pkg:maven/org.codehaus.jackson/jackson-mapper-asl@1.9.13?type=jar",
      "pkg:maven/org.slf4j/slf4j-log4j12@1.7.21?type=jar",
      "pkg:maven/commons-io/commons-io@2.6?type=jar"
    ]
  });
  parsedList = utils.parseMavenTree(
    fs.readFileSync("./test/data/mvn-dep-tree-simple.txt", (encoding = "utf-8"))
  );
  expect(parsedList.pkgList.length).toEqual(27);
  expect(parsedList.dependenciesList.length).toEqual(27);
  expect(parsedList.pkgList[0]).toEqual({
    group: "com.gitlab.security_products.tests",
    name: "java-maven",
    version: "1.0-SNAPSHOT",
    qualifiers: { type: "jar" }
  });
  expect(parsedList.dependenciesList[0]).toEqual({
    ref: "pkg:maven/com.gitlab.security_products.tests/java-maven@1.0-SNAPSHOT?type=jar",
    dependsOn: [
      "pkg:maven/io.netty/netty@3.9.1.Final?type=jar",
      "pkg:maven/org.apache.maven/maven-artifact@3.3.9?type=jar",
      "pkg:maven/com.fasterxml.jackson.core/jackson-databind@2.9.2?type=jar",
      "pkg:maven/org.mozilla/rhino@1.7.10?type=jar",
      "pkg:maven/org.apache.geode/geode-core@1.1.1?type=jar"
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
  jest.setTimeout(240000);
  const data = await utils.getPyMetadata(
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
});

test("parseGoModData", async () => {
  jest.setTimeout(120000);
  let dep_list = await utils.parseGoModData(null);
  expect(dep_list).toEqual([]);
  const gosumMap = {
    "google.golang.org/grpc/v1.21.0":
      "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
    "github.com/aws/aws-sdk-go/v1.38.47": "sha256-fake-sha-for-aws-go-sdk=",
    "github.com/spf13/cobra/v1.0.0":
      "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
    "github.com/spf13/viper/v1.0.2":
      "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
    "github.com/stretchr/testify/v1.6.1":
      "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg="
  };
  dep_list = await utils.parseGoModData(
    fs.readFileSync("./test/gomod/go.mod", (encoding = "utf-8")),
    gosumMap
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    group: "github.com/aws",
    name: "aws-sdk-go",
    license: undefined,
    version: "v1.38.47",
    _integrity: "sha256-fake-sha-for-aws-go-sdk="
  });
  expect(dep_list[1]).toEqual({
    group: "github.com/spf13",
    name: "cobra",
    license: undefined,
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE="
  });
  expect(dep_list[2]).toEqual({
    group: "google.golang.org",
    name: "grpc",
    license: undefined,
    version: "v1.21.0",
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM="
  });
  expect(dep_list[3]).toEqual({
    group: "github.com/spf13",
    name: "viper",
    license: undefined,
    version: "v1.0.2",
    _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM="
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
});

test("parseGoSumData", async () => {
  jest.setTimeout(120000);
  let dep_list = await utils.parseGoModData(null);
  expect(dep_list).toEqual([]);
  dep_list = await utils.parseGosumData(
    fs.readFileSync("./test/gomod/go.sum", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    group: "google.golang.org",
    name: "grpc",
    license: undefined,
    version: "v1.21.0",
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM="
  });
  expect(dep_list[1]).toEqual({
    group: "github.com/spf13",
    name: "cobra",
    license: undefined,
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE="
  });
  expect(dep_list[2]).toEqual({
    group: "github.com/spf13",
    name: "viper",
    license: undefined,
    version: "v1.0.2",
    _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM="
  });
  expect(dep_list[3]).toEqual({
    group: "github.com/stretchr",
    name: "testify",
    license: undefined,
    version: "v1.6.1",
    _integrity: "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg="
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
});

test("parse go list dependencies", async () => {
  let dep_list = await utils.parseGoListDep(
    fs.readFileSync("./test/data/golist-dep.txt", (encoding = "utf-8")),
    {}
  );
  expect(dep_list.length).toEqual(8);
  expect(dep_list[0]).toEqual({
    group: "github.com/badoux",
    name: "checkmail",
    version: "v0.0.0-20181210160741-9661bd69e9ad"
  });
});

test("parse go mod why dependencies", () => {
  let pkg_name = utils.parseGoModWhy(
    fs.readFileSync("./test/data/gomodwhy.txt", (encoding = "utf-8"))
  );
  expect(pkg_name).toEqual("github.com/mailgun/mailgun-go/v4");
  pkg_name = utils.parseGoModWhy(
    fs.readFileSync("./test/data/gomodwhynot.txt", (encoding = "utf-8"))
  );
  expect(pkg_name).toBeUndefined();
});

test("parseGopkgData", async () => {
  jest.setTimeout(120000);
  let dep_list = await utils.parseGopkgData(null);
  expect(dep_list).toEqual([]);
  dep_list = await utils.parseGopkgData(
    fs.readFileSync("./test/gopkg/Gopkg.lock", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(36);
  expect(dep_list[0]).toEqual({
    group: "cloud.google.com",
    name: "go",
    version: "v0.39.0",
    _integrity: "sha256-LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78="
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
});

test("parse go version data", async () => {
  let dep_list = await utils.parseGoVersionData(
    fs.readFileSync("./test/data/goversion.txt", (encoding = "utf-8")),
    {}
  );
  expect(dep_list.length).toEqual(125);
  expect(dep_list[0]).toEqual({
    group: "github.com/ShiftLeftSecurity",
    name: "atlassian-connect-go",
    version: "v0.0.2",
    _integrity: "",
    license: undefined
  });
  dep_list = await utils.parseGoVersionData(
    fs.readFileSync("./test/data/goversion2.txt", (encoding = "utf-8")),
    {}
  );
  expect(dep_list.length).toEqual(149);
  expect(dep_list[0]).toEqual({
    group: "cloud.google.com",
    name: "go",
    version: "v0.79.0",
    _integrity: "sha256-oqqswrt4x6b9OGBnNqdssxBl1xf0rSUNjU2BR4BZar0=",
    license: undefined
  });
});

test("parse cargo lock", async () => {
  expect(await utils.parseCargoData(null)).toEqual([]);
  dep_list = await utils.parseCargoData(
    fs.readFileSync("./test/Cargo.lock", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(224);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "abscissa_core",
    version: "0.5.2",
    _integrity:
      "sha384-6a07677093120a02583717b6dd1ef81d8de1e8d01bd226c83f0f9bdf3e56bb3a"
  });
  dep_list = await utils.parseCargoData(
    fs.readFileSync("./test/data/Cargom.lock", (encoding = "utf-8"))
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
  expect(await utils.parseCargoTomlData(null)).toEqual([]);
  dep_list = await utils.parseCargoTomlData(
    fs.readFileSync("./test/data/Cargo1.toml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list).toEqual([
    { group: "", name: "unwind", version: "0.0.0" },
    { name: "libc", version: "0.2.79" },
    { name: "compiler_builtins", version: "0.1.0" },
    { name: "cfg-if", version: "0.1.8" }
  ]);
  dep_list = await utils.parseCargoTomlData(
    fs.readFileSync("./test/data/Cargo2.toml", (encoding = "utf-8"))
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
  expect(await utils.parseCargoAuditableData(null)).toEqual([]);
  dep_list = await utils.parseCargoAuditableData(
    fs.readFileSync("./test/data/cargo-auditable.txt", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(32);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "adler",
    version: "1.0.2"
  });
});

test("get crates metadata", async () => {
  const dep_list = await utils.getCratesMetadata([
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
});

test("parse pub lock", async () => {
  expect(await utils.parsePubLockData(null)).toEqual([]);
  dep_list = await utils.parsePubLockData(
    fs.readFileSync("./test/data/pubspec.lock", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(26);
  expect(dep_list[0]).toEqual({
    name: "async",
    version: "2.8.2"
  });
  dep_list = await utils.parsePubYamlData(
    fs.readFileSync("./test/data/pubspec.yaml", (encoding = "utf-8"))
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
  const dep_list = await utils.getDartMetadata([
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
});

test("parse cabal freeze", async () => {
  expect(await utils.parseCabalData(null)).toEqual([]);
  dep_list = await utils.parseCabalData(
    fs.readFileSync("./test/data/cabal.project.freeze", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(24);
  expect(dep_list[0]).toEqual({
    name: "ansi-terminal",
    version: "0.11.3"
  });
  dep_list = await utils.parseCabalData(
    fs.readFileSync("./test/data/cabal-2.project.freeze", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(366);
  expect(dep_list[0]).toEqual({
    name: "Cabal",
    version: "3.2.1.0"
  });
});

test("parse conan data", async () => {
  expect(await utils.parseConanLockData(null)).toEqual([]);
  dep_list = await utils.parseConanLockData(
    fs.readFileSync("./test/data/conan.lock", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    name: "zstd",
    version: "1.4.4"
  });

  dep_list = await utils.parseConanData(
    fs.readFileSync("./test/data/conanfile.txt", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    name: "zstd",
    version: "1.4.4"
  });
});

test("parse clojure data", () => {
  expect(utils.parseLeiningenData(null)).toEqual([]);
  let dep_list = utils.parseLeiningenData(
    fs.readFileSync("./test/data/project.clj", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(14);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "leiningen-core",
    version: "2.9.9-SNAPSHOT"
  });
  dep_list = utils.parseLeiningenData(
    fs.readFileSync("./test/data/project.clj.1", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(17);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.9.0"
  });
  dep_list = utils.parseLeiningenData(
    fs.readFileSync("./test/data/project.clj.2", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(49);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "bidi",
    version: "2.1.6"
  });
  dep_list = utils.parseEdnData(
    fs.readFileSync("./test/data/deps.edn", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(20);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.10.3"
  });
  dep_list = utils.parseEdnData(
    fs.readFileSync("./test/data/deps.edn.1", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(11);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.11.0-beta1"
  });
  dep_list = utils.parseEdnData(
    fs.readFileSync("./test/data/deps.edn.2", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(5);
  expect(dep_list[0]).toEqual({
    group: "clj-commons",
    name: "pomegranate",
    version: "1.2.1"
  });
  dep_list = utils.parseCljDep(
    fs.readFileSync("./test/data/clj-tree.txt", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(253);
  expect(dep_list[0]).toEqual({
    group: "org.bouncycastle",
    name: "bcprov-jdk15on",
    version: "1.70"
  });

  dep_list = utils.parseLeinDep(
    fs.readFileSync("./test/data/lein-tree.txt", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(47);
  expect(dep_list[0]).toEqual({
    group: "javax.xml.bind",
    name: "jaxb-api",
    version: "2.4.0-b180830.0359"
  });
});

test("parse mix lock data", async () => {
  expect(await utils.parseMixLockData(null)).toEqual([]);
  dep_list = await utils.parseMixLockData(
    fs.readFileSync("./test/data/mix.lock", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(16);
  expect(dep_list[0]).toEqual({
    name: "absinthe",
    version: "1.7.0"
  });
  dep_list = await utils.parseMixLockData(
    fs.readFileSync("./test/data/mix.lock.1", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(23);
  expect(dep_list[0]).toEqual({
    name: "bunt",
    version: "0.2.0"
  });
});

test("parse github actions workflow data", async () => {
  expect(await utils.parseGitHubWorkflowData(null)).toEqual([]);
  dep_list = await utils.parseGitHubWorkflowData(
    fs.readFileSync("./.github/workflows/nodejs.yml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    group: "actions",
    name: "checkout",
    version: "v3"
  });
  dep_list = await utils.parseGitHubWorkflowData(
    fs.readFileSync("./.github/workflows/repotests.yml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(4);
  expect(dep_list[0]).toEqual({
    group: "actions",
    name: "checkout",
    version: "v3"
  });
  dep_list = await utils.parseGitHubWorkflowData(
    fs.readFileSync("./.github/workflows/app-release.yml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(4);
});

test("parse cs pkg data", async () => {
  expect(await utils.parseCsPkgData(null)).toEqual([]);
  const dep_list = await utils.parseCsPkgData(
    fs.readFileSync("./test/data/packages.config", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(21);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Antlr",
    version: "3.5.0.2"
  });
});

test("parse cs pkg data 2", async () => {
  expect(await utils.parseCsPkgData(null)).toEqual([]);
  const dep_list = await utils.parseCsPkgData(
    fs.readFileSync("./test/data/packages2.config", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "EntityFramework",
    version: "6.2.0"
  });
});

test("parse cs proj", async () => {
  expect(await utils.parseCsProjData(null)).toEqual([]);
  const dep_list = await utils.parseCsProjData(
    fs.readFileSync("./test/sample.csproj", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(5);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Microsoft.AspNetCore.Mvc.NewtonsoftJson",
    version: "3.1.1"
  });
});

test("parse project.assets.json", async () => {
  expect(await utils.parseCsProjAssetsData(null)).toEqual([]);
  const dep_list = await utils.parseCsProjAssetsData(
    fs.readFileSync("./test/data/project.assets.json", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(142);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Castle.Core",
    version: "4.4.1",
    _integrity:
      "sha512-zanbjWC0Y05gbx4eGXkzVycOQqVOFVeCjVsDSyuao9P4mtN1w3WxxTo193NGC7j3o2u3AJRswaoC6hEbnGACnQ=="
  });
});

test("parse packages.lock.json", async () => {
  expect(await utils.parseCsPkgLockData(null)).toEqual([]);
  const dep_list = await utils.parseCsPkgLockData(
    fs.readFileSync("./test/data/packages.lock.json", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(14);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Antlr",
    version: "3.5.0.2"
  });
});

test("parse .net cs proj", async () => {
  expect(await utils.parseCsProjData(null)).toEqual([]);
  const dep_list = await utils.parseCsProjData(
    fs.readFileSync("./test/data/sample-dotnet.csproj", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(19);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Antlr3.Runtime",
    version: "3.5.0.2"
  });
});

test("get nget metadata", async () => {
  const dep_list = await utils.getNugetMetadata([
    {
      group: "",
      name: "Castle.Core",
      version: "4.4.0"
    }
  ]);
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Castle.Core",
    version: "4.4.0",
    description:
      "Castle Core, including DynamicProxy, Logging Abstractions and DictionaryAdapter",
    homepage: {
      url: "https://www.nuget.org/packages/Castle.Core/4.4.0/"
    },
    license: "http://www.apache.org/licenses/LICENSE-2.0.html",
    repository: {
      url: "http://www.castleproject.org/"
    }
  });
});

test("parsePomFile", () => {
  const data = utils.parsePom("./test/pom.xml");
  expect(data.length).toEqual(13);
});

test("parsePomMetadata", async () => {
  const deps = utils.parsePom("./test/pom.xml");
  const data = await utils.getMvnMetadata(deps);
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

  license = await utils.getRepoLicense("https://github.com/AppThreat/cdxgen", {
    group: "",
    name: "cdxgen"
  });
  expect(license).toEqual({
    id: "Apache-2.0",
    url: "https://github.com/AppThreat/cdxgen/blob/master/LICENSE"
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
*/
test("get go pkg license", async () => {
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

test("get licenses", () => {
  let licenses = utils.getLicenses({ license: "MIT" });
  expect(licenses).toEqual([
    {
      license: {
        id: "MIT",
        url: "https://opensource.org/licenses/MIT"
      }
    }
  ]);

  licenses = utils.getLicenses({ license: ["MIT", "GPL-3.0-or-later"] });
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

  licenses = utils.getLicenses({
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

test("parsePkgLock", async () => {
  let parsedList = await utils.parsePkgLock("./test/package-lock.json");
  let deps = parsedList.pkgList;
  expect(deps.length).toEqual(760);
  expect(deps[1]._integrity).toEqual(
    "sha512-nne9/IiQ/hzIhY6pdDnbBtz7DjPTKrY00P/zvPSm5pOFkl6xuGrGnXn/VtTNNfNtAfZ9/1RtehkszU9qcTii0Q=="
  );
  expect(parsedList.dependenciesList.length).toEqual(621);
  parsedList = await utils.parsePkgLock("./test/data/package-lock-v1.json");
  deps = parsedList.pkgList;
  expect(deps.length).toEqual(639);
  expect(deps[1]._integrity).toEqual(
    "sha512-/r5HiDwOXTjucbBYkrTMpzWQAwil9MH7zSEfKH+RWWZv27r4vDiUd2FiBJItyQoPThLPxaf82IO6gCXyJR0ZnQ=="
  );
  expect(parsedList.dependenciesList.length).toEqual(572);
});

test("parseBowerJson", async () => {
  const deps = await utils.parseBowerJson("./test/data/bower.json");
  expect(deps.length).toEqual(1);
  expect(deps[0].name).toEqual("jquery");
});

test("parseNodeShrinkwrap", async () => {
  const deps = await utils.parseNodeShrinkwrap("./test/shrinkwrap-deps.json");
  expect(deps.length).toEqual(496);
  expect(deps[0]._integrity).toEqual(
    "sha512-a9gxpmdXtZEInkCSHUJDLHZVBgb1QS0jhss4cPP93EW7s+uC5bikET2twEF3KV+7rDblJcmNvTR7VJejqd2C2g=="
  );
});

test("parseSetupPyFile", async () => {
  let deps = await utils.parseSetupPyFile(`install_requires=[
    'colorama>=0.4.3',
    'libsast>=1.0.3',
],`);
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await utils.parseSetupPyFile(
    `install_requires=['colorama>=0.4.3','libsast>=1.0.3',],`
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await utils.parseSetupPyFile(
    `install_requires=['colorama>=0.4.3','libsast>=1.0.3']`
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await utils.parseSetupPyFile(
    `install_requires=['colorama>=0.4.3', 'libsast>=1.0.3']`
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");

  deps = await utils.parseSetupPyFile(`install_requires=[
'colorama>=0.4.3',
'libsast>=1.0.3',
]`);
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");
});

test("parsePnpmLock", async () => {
  let parsedList = await utils.parsePnpmLock("./test/pnpm-lock.yaml");
  expect(parsedList.pkgList.length).toEqual(1610);
  expect(parsedList.dependenciesList.length).toEqual(1610);
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
    ]
  });
  parsedList = await utils.parsePnpmLock("./test/data/pnpm-lock.yaml");
  expect(parsedList.pkgList.length).toEqual(308);
  expect(parsedList.dependenciesList.length).toEqual(308);
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
    ]
  });
  parsedList = await utils.parsePnpmLock("./test/data/pnpm-lock2.yaml");
  expect(parsedList.pkgList.length).toEqual(7);
  expect(parsedList.dependenciesList.length).toEqual(7);
  expect(parsedList.pkgList[0]).toEqual({
    group: "",
    name: "ansi-regex",
    version: "2.1.1",
    scope: undefined,
    _integrity: "sha1-w7M6te42DYbg5ijwRorn7yfWVN8=",
    properties: [{ name: "SrcFile", value: "./test/data/pnpm-lock2.yaml" }]
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
  parsedList = await utils.parsePnpmLock("./test/data/pnpm-lock3.yaml");
  expect(parsedList.pkgList.length).toEqual(448);
  expect(parsedList.dependenciesList.length).toEqual(448);
  expect(parsedList.pkgList[0]).toEqual({
    group: "@nodelib",
    name: "fs.scandir",
    version: "2.1.5",
    scope: undefined,
    _integrity:
      "sha512-vq24Bq3ym5HEQm2NKCr3yXDwjc7vTsEThRDnkp2DK9p1uqLR+DHurm/NOTo0KG7HYHU7eppKZj3MyqYuMBf62g==",
    properties: [{ name: "SrcFile", value: "./test/data/pnpm-lock3.yaml" }]
  });
  expect(parsedList.dependenciesList[2]).toEqual({
    ref: "pkg:npm/@nodelib/fs.walk@1.2.8",
    dependsOn: ["pkg:npm/@nodelib/fs.scandir@2.1.5", "pkg:npm/fastq@1.13.0"]
  });

  parsedList = await utils.parsePnpmLock("./test/data/pnpm-lock4.yaml");
  expect(parsedList.pkgList.length).toEqual(1);
});

test("parseYarnLock", async () => {
  let identMap = utils.yarnLockToIdentMap(
    fs.readFileSync("./test/yarn.lock", "utf8")
  );
  expect(Object.keys(identMap).length).toEqual(62);
  let parsedList = await utils.parseYarnLock("./test/yarn.lock");
  expect(parsedList.pkgList.length).toEqual(56);
  expect(parsedList.pkgList[0]).toEqual({
    group: "",
    name: "asap",
    version: "2.0.5",
    _integrity: "sha256-522765b50c3510490e52d7dcfe085ef9ba96958f",
    properties: [
      {
        name: "SrcFile",
        value: "./test/yarn.lock"
      }
    ]
  });

  identMap = utils.yarnLockToIdentMap(
    fs.readFileSync("./test/data/yarn_locks/yarn.lock", "utf8")
  );
  expect(Object.keys(identMap).length).toEqual(2566);
  parsedList = await utils.parseYarnLock("./test/data/yarn_locks/yarn.lock");
  expect(parsedList.pkgList.length).toEqual(2029);
  expect(parsedList.dependenciesList.length).toEqual(2029);
  expect(parsedList.pkgList[0]).toEqual({
    group: "babel",
    name: "cli",
    version: "7.10.1",
    _integrity:
      "sha512-cVB+dXeGhMOqViIaZs3A9OUAe4pKw4SBNdMw6yHJMYR7s4TB+Cei7ThquV/84O19PdIFWuwe03vxxES0BHUm5g==",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarn.lock"
      }
    ]
  });
  parsedList.pkgList.forEach((d) => {
    expect(d.name).toBeDefined();
    expect(d.version).toBeDefined();
  });

  parsedList = await utils.parseYarnLock(
    "./test/data/yarn_locks/yarn-multi.lock"
  );
  expect(parsedList.pkgList.length).toEqual(1909);
  expect(parsedList.dependenciesList.length).toEqual(1909);
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-zpruxnFMz6K94gs2pqc3sidzFDbQpKT5D6P/J/I9s8ekHZ5eczgnRp6pqXC86Bh7+44j/btpmOT0kwiboyqTnA==",
    group: "apollo",
    name: "client",
    version: "3.2.5",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarn-multi.lock"
      }
    ]
  });

  parsedList = await utils.parseYarnLock(
    "./test/data/yarn_locks/yarn-light.lock"
  );
  expect(parsedList.pkgList.length).toEqual(315);
  expect(parsedList.dependenciesList.length).toEqual(315);
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-rZ1k9kQvJX21Vwgx1L6kSQ6yeXo9cCMyqURSnjG+MRoJn+Mr3LblxmVdzScHXRzv0N9yzy49oG7Bqxp9Knyv/g==",
    group: "actions",
    name: "artifact",
    version: "0.6.1",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarn-light.lock"
      }
    ]
  });

  parsedList = await utils.parseYarnLock("./test/data/yarn_locks/yarn3.lock");
  expect(parsedList.pkgList.length).toEqual(5);
  expect(parsedList.dependenciesList.length).toEqual(5);
  expect(parsedList.pkgList[1]).toEqual({
    _integrity:
      "sha512-+X9Jn4mPI+RYV0ITiiLyJSYlT9um111BocJSaztsxXR+9ZxWErpzdfQqyk+EYZUOklugjJkerQZRtJGLfJeClw==",
    group: "",
    name: "lru-cache",
    version: "6.0.0",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarn3.lock"
      }
    ]
  });

  parsedList = await utils.parseYarnLock("./test/data/yarn_locks/yarnv2.lock");
  expect(parsedList.pkgList.length).toEqual(1090);
  expect(parsedList.dependenciesList.length).toEqual(1088);
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-G0U5NjBUYIs39l1J1ckgpVfVX2IxpzRAIT4/2An86O2Mcri3k5xNu7/RRkfObo12wN9s7BmnREAMhH7252oZiA==",
    group: "arcanis",
    name: "slice-ansi",
    version: "1.0.2",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarnv2.lock"
      }
    ]
  });
  parsedList = await utils.parseYarnLock("./test/data/yarn_locks/yarnv3.lock");
  expect(parsedList.pkgList.length).toEqual(325);
  expect(parsedList.dependenciesList.length).toEqual(323);
  expect(parsedList.pkgList[0]).toEqual({
    _integrity:
      "sha512-vtU+q0TmdIDmezU7lKub73vObN6nmd3lkcKWz7R9hyNI8gz5o7grDb+FML9nykOLW+09gGIup2xyJ86j5vBKpg==",
    group: "babel",
    name: "code-frame",
    version: "7.16.7",
    properties: [
      {
        name: "SrcFile",
        value: "./test/data/yarn_locks/yarnv3.lock"
      }
    ]
  });
  parsedList = await utils.parseYarnLock("./test/data/yarn_locks/yarn4.lock");
  expect(parsedList.pkgList.length).toEqual(1);
});

test("parseComposerLock", () => {
  let deps = utils.parseComposerLock("./test/data/composer.lock");
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
    ]
  });

  deps = utils.parseComposerLock("./test/data/composer-2.lock");
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
    ]
  });
});

test("parseGemfileLockData", async () => {
  let deps = await utils.parseGemfileLockData(
    fs.readFileSync("./test/data/Gemfile.lock", (encoding = "utf-8"))
  );
  expect(deps.length).toEqual(140);
  expect(deps[0]).toEqual({
    name: "actioncable",
    version: "6.0.0"
  });
});

test("parseGemspecData", async () => {
  let deps = await utils.parseGemspecData(
    fs.readFileSync("./test/data/xmlrpc.gemspec", (encoding = "utf-8"))
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    name: "xmlrpc",
    version: "0.3.0",
    description:
      "XMLRPC is a lightweight protocol that enables remote procedure calls over HTTP."
  });
});

test("parse requirements.txt with comments", async () => {
  jest.setTimeout(120000);
  let deps = await utils.parseReqFile(
    fs.readFileSync(
      "./test/data/requirements.comments.txt",
      (encoding = "utf-8")
    )
  );
  expect(deps.length).toEqual(31);
});

test("parse poetry.lock", async () => {
  jest.setTimeout(120000);
  let deps = await utils.parsePoetrylockData(
    fs.readFileSync("./test/data/poetry.lock", (encoding = "utf-8"))
  );
  expect(deps.length).toEqual(31);
  deps = await utils.parsePoetrylockData(
    fs.readFileSync("./test/data/poetry1.lock", (encoding = "utf-8"))
  );
  expect(deps.length).toEqual(67);
});

test("parse wheel metadata", () => {
  let deps = utils.parseBdistMetadata(
    fs.readFileSync("./test/data/METADATA", (encoding = "utf-8"))
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
  deps = utils.parseBdistMetadata(
    fs.readFileSync(
      "./test/data/mercurial-5.5.2-py3.8.egg-info",
      (encoding = "utf-8")
    )
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
  let metadata = await utils.readZipEntry(
    "./test/data/appthreat_depscan-2.0.2-py3-none-any.whl",
    "METADATA"
  );
  expect(metadata);
  const parsed = utils.parseBdistMetadata(metadata);
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
  jest.setTimeout(120000);
  let deps = await utils.parsePiplockData(
    JSON.parse(
      fs.readFileSync("./test/data/Pipfile.lock", (encoding = "utf-8"))
    )
  );
  expect(deps.length).toEqual(46);
});

test("parse scala sbt list", async () => {
  let deps = utils.parseKVDep(
    fs.readFileSync("./test/data/sbt-dl.list", { encoding: "utf-8" })
  );
  expect(deps.length).toEqual(57);
});

test("parse scala sbt lock", async () => {
  let deps = utils.parseSbtLock("./test/data/build.sbt.lock");
  expect(deps.length).toEqual(117);
});

test("parse nupkg file", async () => {
  let deps = await utils.parseNupkg("./test/data/jquery.3.6.0.nupkg");
  expect(deps.length).toEqual(1);
  expect(deps[0].name).toEqual("jQuery");
});

test("parse bazel skyframe", () => {
  let deps = utils.parseBazelSkyframe(
    fs.readFileSync("./test/data/bazel/bazel-state.txt", (encoding = "utf-8"))
  );
  expect(deps.length).toEqual(16);
  expect(deps[0].name).toEqual("guava");
});

test("parse bazel build", () => {
  let projs = utils.parseBazelBuild(
    fs.readFileSync("./test/data/bazel/BUILD", (encoding = "utf-8"))
  );
  expect(projs.length).toEqual(2);
  expect(projs[0]).toEqual("java-maven-lib");
});

test("parse helm charts", async () => {
  let dep_list = await utils.parseHelmYamlData(
    fs.readFileSync("./test/data/Chart.yaml", (encoding = "utf-8"))
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
  dep_list = await utils.parseHelmYamlData(
    fs.readFileSync(
      "./test/data/prometheus-community-index.yaml",
      (encoding = "utf-8")
    )
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
  let dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/docker-compose.yml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(4);
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/docker-compose-ng.yml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(8);
  expect(dep_list[0]).toEqual({
    service: "frontend"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/docker-compose-cr.yml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(14);
  expect(dep_list[0]).toEqual({
    service: "crapi-identity"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/tekton-task.yml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image:
      "docker.io/amazon/aws-cli:2.0.52@sha256:1506cec98a7101c935176d440a14302ea528b8f92fcaf4a6f1ea2d7ecef7edc4"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/postgrescluster.yaml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(6);
  expect(dep_list[0]).toEqual({
    image:
      "registry.developers.crunchydata.com/crunchydata/crunchy-postgres:ubi8-14.5-1"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/deployment.yaml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "node-typescript-example"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/skaffold.yaml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(6);
  expect(dep_list[0]).toEqual({
    image: "leeroy-web"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/skaffold-ms.yaml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(22);
  expect(dep_list[0]).toEqual({
    image: "emailservice"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/emailservice.yaml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "emailservice"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/redis.yaml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "redis:alpine"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/adservice.yaml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(2);
  expect(dep_list[0]).toEqual({
    image: "gcr.io/google-samples/microservices-demo/adservice:v0.4.1"
  });
  dep_list = await utils.parseContainerSpecData(
    fs.readFileSync("./test/data/kustomization.yaml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(22);
  expect(dep_list[0]).toEqual({
    image: "gcr.io/google-samples/microservices-demo/adservice"
  });
});

test("parse cloudbuild data", async () => {
  expect(await utils.parseCloudBuildData(null)).toEqual([]);
  dep_list = await utils.parseCloudBuildData(
    fs.readFileSync("./test/data/cloudbuild.yaml", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "gcr.io/k8s-skaffold",
    name: "skaffold",
    version: "v2.0.1"
  });
});

test("parse privado files", () => {
  let servList = utils.parsePrivadoFile("./test/data/privado.json");
  expect(servList.length).toEqual(1);
  expect(servList[0].data.length).toEqual(11);
  expect(servList[0].endpoints.length).toEqual(17);
  expect(servList[0].properties.length).toEqual(5);
});

test("parse openapi spec files", async () => {
  let aservice = await utils.parseOpenapiSpecData(
    fs.readFileSync(
      "./test/data/openapi/openapi-spec.json",
      (encoding = "utf-8")
    )
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
  aservice = await utils.parseOpenapiSpecData(
    fs.readFileSync(
      "./test/data/openapi/openapi-oai.yaml",
      (encoding = "utf-8")
    )
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
