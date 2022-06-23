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
    version: "1.4.0",
  });
  expect(utils.parsePyRequiresDist("wrapt (&lt;1.13,&gt;=1.11)")).toEqual({
    name: "wrapt",
    version: "1.13",
  });
  expect(
    utils.parsePyRequiresDist(
      'typed-ast (&lt;1.5,&gt;=1.4.0) ; implementation_name == "cpython" and python_version &lt; "3.8"'
    )
  ).toEqual({ name: "typed-ast", version: "1.5" });
  expect(utils.parsePyRequiresDist("asgiref (&lt;4,&gt;=3.2.10)")).toEqual({
    name: "asgiref",
    version: "4",
  });
  expect(utils.parsePyRequiresDist("pytz")).toEqual({
    name: "pytz",
    version: "",
  });
  expect(utils.parsePyRequiresDist("sqlparse (&gt;=0.2.2)")).toEqual({
    name: "sqlparse",
    version: "0.2.2",
  });
  expect(
    utils.parsePyRequiresDist("argon2-cffi (&gt;=16.1.0) ; extra == 'argon2'")
  ).toEqual({ name: "argon2-cffi", version: "16.1.0" });
  expect(utils.parsePyRequiresDist("bcrypt ; extra == 'bcrypt'")).toEqual({
    name: "bcrypt",
    version: "",
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
  expect(utils.parseGradleDep(null)).toEqual([]);
  let dep_list = utils.parseGradleDep(
    fs.readFileSync("./test/gradle-dep.out", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(33);
  expect(dep_list[0]).toEqual({
    group: "org.ethereum",
    name: "solcJ-all",
    qualifiers: {
      type: "jar",
    },
    version: "0.4.25",
  });

  dep_list = utils.parseGradleDep(
    fs.readFileSync("./test/data/gradle-android-dep.out", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(103);
  expect(dep_list[0]).toEqual({
    group: "com.android.support.test",
    name: "runner",
    qualifiers: {
      type: "jar",
    },
    version: "1.0.2",
  });
  dep_list = utils.parseGradleDep(
    fs.readFileSync("./test/data/gradle-out1.dep", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(89);
  expect(dep_list[0]).toEqual({
    group: "org.springframework.boot",
    name: "spring-boot-starter",
    version: "2.2.0.RELEASE",
    qualifiers: { type: "jar" },
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
  let dep_list = utils.parseMavenTree(
    fs.readFileSync("./test/data/sample-mvn-tree.txt", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(61);
  expect(dep_list[0]).toEqual({
    group: "com.pogeyan.cmis",
    name: "copper-server",
    version: "1.15.2",
    qualifiers: { type: "jar" },
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
  jest.setTimeout(120000);
  const data = await utils.getPyMetadata([
    {
      group: "",
      name: "Flask",
      version: "1.1.0",
    },
    false,
  ]);
  expect(data).toEqual([
    {
      _integrity:
        "sha256-a31adc27de06034c657a8dc091cc5fcb0227f2474798409bff0e9674de31a026",
      description: "A simple framework for building complex web applications.",
      group: "",
      homepage: {
        url: "https://palletsprojects.com/p/flask",
      },
      license: "BSD-3-Clause",
      name: "Flask",
      version: "1.1.0",
    },
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
      "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
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
    _integrity: "sha256-fake-sha-for-aws-go-sdk=",
  });
  expect(dep_list[1]).toEqual({
    group: "github.com/spf13",
    name: "cobra",
    license: undefined,
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
  });
  expect(dep_list[2]).toEqual({
    group: "google.golang.org",
    name: "grpc",
    license: undefined,
    version: "v1.21.0",
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
  });
  expect(dep_list[3]).toEqual({
    group: "github.com/spf13",
    name: "viper",
    license: undefined,
    version: "v1.0.2",
    _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
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
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
  });
  expect(dep_list[1]).toEqual({
    group: "github.com/spf13",
    name: "cobra",
    license: undefined,
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
  });
  expect(dep_list[2]).toEqual({
    group: "github.com/spf13",
    name: "viper",
    license: undefined,
    version: "v1.0.2",
    _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
  });
  expect(dep_list[3]).toEqual({
    group: "github.com/stretchr",
    name: "testify",
    license: undefined,
    version: "v1.6.1",
    _integrity: "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
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
    version: "v0.0.0-20181210160741-9661bd69e9ad",
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
    _integrity: "sha256-LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78=",
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
    license: undefined,
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
    license: undefined,
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
      "sha384-6a07677093120a02583717b6dd1ef81d8de1e8d01bd226c83f0f9bdf3e56bb3a",
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
      "sha384-78d1833b3838dbe990df0f1f87baf640cf6146e898166afe401839d1b001e570",
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
    { name: "cfg-if", version: "0.1.8" },
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
      version: "git+https://github.com/rust-fuzz/libfuzzer-sys.git",
    },
  ]);
});

test("get crates metadata", async () => {
  const dep_list = await utils.getCratesMetadata([
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
    license: ["Apache-2.0"],
    repository: {
      url: "https://github.com/iqlusioninc/abscissa/tree/main/core/",
    },
    homepage: { url: "https://github.com/iqlusioninc/abscissa/" },
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
    version: "2.8.2",
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
      url: "https://github.com/marcos930807/awesomeDialogs",
    },
  });
});

test("get dart metadata", async () => {
  const dep_list = await utils.getDartMetadata([
    {
      group: "",
      name: "async",
      version: "2.8.2",
    },
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
      url: "https://github.com/dart-lang/async",
    },
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
    version: "0.11.3",
  });
  dep_list = await utils.parseCabalData(
    fs.readFileSync("./test/data/cabal-2.project.freeze", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(366);
  expect(dep_list[0]).toEqual({
    name: "Cabal",
    version: "3.2.1.0",
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
    version: "1.4.4",
  });

  dep_list = await utils.parseConanData(
    fs.readFileSync("./test/data/conanfile.txt", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    name: "zstd",
    version: "1.4.4",
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
    version: "2.9.9-SNAPSHOT",
  });
  dep_list = utils.parseLeiningenData(
    fs.readFileSync("./test/data/project.clj.1", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(17);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.9.0",
  });
  dep_list = utils.parseLeiningenData(
    fs.readFileSync("./test/data/project.clj.2", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(49);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "bidi",
    version: "2.1.6",
  });
  dep_list = utils.parseEdnData(
    fs.readFileSync("./test/data/deps.edn", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(20);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.10.3",
  });
  dep_list = utils.parseEdnData(
    fs.readFileSync("./test/data/deps.edn.1", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(11);
  expect(dep_list[0]).toEqual({
    group: "org.clojure",
    name: "clojure",
    version: "1.11.0-beta1",
  });
  dep_list = utils.parseEdnData(
    fs.readFileSync("./test/data/deps.edn.2", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(5);
  expect(dep_list[0]).toEqual({
    group: "clj-commons",
    name: "pomegranate",
    version: "1.2.1",
  });
  dep_list = utils.parseCljDep(
    fs.readFileSync("./test/data/clj-tree.txt", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(253);
  expect(dep_list[0]).toEqual({
    group: "org.bouncycastle",
    name: "bcprov-jdk15on",
    version: "1.70",
  });

  dep_list = utils.parseLeinDep(
    fs.readFileSync("./test/data/lein-tree.txt", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(47);
  expect(dep_list[0]).toEqual({
    group: "javax.xml.bind",
    name: "jaxb-api",
    version: "2.4.0-b180830.0359",
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
    version: "1.7.0",
  });
  dep_list = await utils.parseMixLockData(
    fs.readFileSync("./test/data/mix.lock.1", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(23);
  expect(dep_list[0]).toEqual({
    name: "bunt",
    version: "0.2.0",
  });
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
    version: "3.5.0.2",
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
    version: "6.2.0",
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
    version: "3.1.1",
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
      "sha512-zanbjWC0Y05gbx4eGXkzVycOQqVOFVeCjVsDSyuao9P4mtN1w3WxxTo193NGC7j3o2u3AJRswaoC6hEbnGACnQ==",
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
    version: "3.5.0.2",
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
    version: "3.5.0.2",
  });
});

test("get nget metadata", async () => {
  const dep_list = await utils.getNugetMetadata([
    {
      group: "",
      name: "Castle.Core",
      version: "4.4.0",
    },
  ]);
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "",
    name: "Castle.Core",
    version: "4.4.0",
    description:
      "Castle Core, including DynamicProxy, Logging Abstractions and DictionaryAdapter",
    homepage: {
      url: "https://www.nuget.org/packages/Castle.Core/4.4.0/",
    },
    license: "http://www.apache.org/licenses/LICENSE-2.0.html",
    repository: {
      url: "http://www.castleproject.org/",
    },
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

test("get repo license", async () => {
  let license = await utils.getRepoLicense(
    "https://github.com/ShiftLeftSecurity/sast-scan"
  );
  expect(license).toEqual({
    id: "GPL-3.0-or-later",
    url: "https://github.com/ShiftLeftSecurity/sast-scan/blob/master/LICENSE",
  });

  license = await utils.getRepoLicense("https://github.com/AppThreat/cdxgen", {
    group: "",
    name: "cdxgen",
  });
  expect(license).toEqual({
    id: "Apache-2.0",
    url: "https://github.com/AppThreat/cdxgen/blob/master/LICENSE",
  });

  license = await utils.getRepoLicense("https://cloud.google.com/go", {
    group: "cloud.google.com",
    name: "go",
  });
  expect(license).toEqual("Apache-2.0");

  license = await utils.getRepoLicense(undefined, {
    group: "github.com/ugorji",
    name: "go",
  });
  expect(license).toEqual({
    id: "MIT",
    url: "https://github.com/ugorji/go/blob/master/LICENSE",
  });
});

test("get go pkg license", async () => {
  let license = await utils.getGoPkgLicense({
    group: "github.com/Azure/azure-amqp-common-go",
    name: "v2",
  });
  expect(license).toEqual([
    {
      id: "MIT",
      url: "https://pkg.go.dev/github.com/Azure/azure-amqp-common-go/v2?tab=licenses",
    },
  ]);

  license = await utils.getGoPkgLicense({
    group: "go.opencensus.io",
    name: "go.opencensus.io",
  });
  expect(license).toEqual([
    {
      id: "Apache-2.0",
      url: "https://pkg.go.dev/go.opencensus.io?tab=licenses",
    },
  ]);

  license = await utils.getGoPkgLicense({
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

test("get licenses", () => {
  let licenses = utils.getLicenses({ license: "MIT" });
  expect(licenses).toEqual([
    {
      license: {
        id: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
  ]);

  licenses = utils.getLicenses({ license: ["MIT", "GPL-3.0-or-later"] });
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

  licenses = utils.getLicenses({
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
});

test("parsePkgLock", async () => {
  const deps = await utils.parsePkgLock("./test/package-lock.json");
  expect(deps.length).toEqual(759);
  expect(deps[0]._integrity).toEqual(
    "sha512-nne9/IiQ/hzIhY6pdDnbBtz7DjPTKrY00P/zvPSm5pOFkl6xuGrGnXn/VtTNNfNtAfZ9/1RtehkszU9qcTii0Q=="
  );
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
  expect(deps[0].description).toEqual("Cross-platform colored terminal text.");

  deps = await utils.parseSetupPyFile(
    `install_requires=['colorama>=0.4.3','libsast>=1.0.3',],`
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");
  expect(deps[0].description).toEqual("Cross-platform colored terminal text.");

  deps = await utils.parseSetupPyFile(
    `install_requires=['colorama>=0.4.3','libsast>=1.0.3']`
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");
  expect(deps[0].description).toEqual("Cross-platform colored terminal text.");

  deps = await utils.parseSetupPyFile(
    `install_requires=['colorama>=0.4.3', 'libsast>=1.0.3']`
  );
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");
  expect(deps[0].description).toEqual("Cross-platform colored terminal text.");

  deps = await utils.parseSetupPyFile(`install_requires=[
'colorama>=0.4.3',
'libsast>=1.0.3',
]`);
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");
  expect(deps[0].description).toEqual("Cross-platform colored terminal text.");
});

test("parsePnpmLock", async () => {
  let deps = await utils.parsePnpmLock("./test/pnpm-lock.yaml");
  expect(deps.length).toEqual(1610);
  expect(deps[0]).toEqual({
    _integrity:
      "sha512-IGhtTmpjGbYzcEDOw7DcQtbQSXcG9ftmAXtWTu9V936vDye4xjjekktFAtgZsWpzTj/X01jocB46mTywm/4SZw==",
    group: "@babel",
    name: "code-frame",
    scope: undefined,
    version: "7.10.1",
  });
  deps = await utils.parsePnpmLock("./test/data/pnpm-lock.yaml");
  expect(deps.length).toEqual(308);
  expect(deps[0]).toEqual({
    _integrity:
      "sha512-iAXqUn8IIeBTNd72xsFlgaXHkMBMt6y4HJp1tIaK465CWLT/fG1aqB7ykr95gHHmlBdGbFeWWfyB4NJJ0nmeIg==",
    group: "@babel",
    name: "code-frame",
    scope: "optional",
    version: "7.16.7",
  });
});

test("parseYarnLock", async () => {
  let deps = await utils.parseYarnLock("./test/yarn.lock");
  expect(deps.length).toEqual(56);
  expect(deps[0]).toEqual({
    group: "",
    name: "asap",
    version: "2.0.5",
    _integrity: "sha256-522765b50c3510490e52d7dcfe085ef9ba96958f",
  });

  deps = await utils.parseYarnLock("./test/data/yarn_locks/yarn.lock");
  expect(deps.length).toEqual(2029);
  expect(deps[0]).toEqual({
    group: "babel",
    name: "cli",
    version: "7.10.1",
    _integrity: "sha256-b6e5cd43a17b8f639442ab027976408ebe6d79a0",
  });
  deps.forEach((d) => {
    expect(d.name).toBeDefined();
    expect(d.version).toBeDefined();
  });

  deps = await utils.parseYarnLock("./test/data/yarn_locks/yarn-multi.lock");
  expect(deps.length).toEqual(1909);
  expect(deps[0]).toEqual({
    _integrity: "sha256-24e0a6faa1d231ab44807af237c6227410c75c4d",
    group: "apollo",
    name: "client",
    version: "3.2.5",
  });

  deps = await utils.parseYarnLock("./test/data/yarn_locks/yarn-light.lock");
  expect(deps.length).toEqual(315);
  expect(deps[0]).toEqual({
    _integrity: "sha256-7c24bbbff0714b45b593680b8b76b2af93114a29",
    group: "actions",
    name: "artifact",
    version: "0.6.1",
  });

  deps = await utils.parseYarnLock("./test/data/yarn_locks/yarn3.lock");
  expect(deps.length).toEqual(4);
  expect(deps[0]).toEqual({
    _integrity:
      "sha512-+X9Jn4mPI+RYV0ITiiLyJSYlT9um111BocJSaztsxXR+9ZxWErpzdfQqyk+EYZUOklugjJkerQZRtJGLfJeClw==",
    group: "",
    name: "lru-cache",
    version: "6.0.0",
  });
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
      reference: "fe42e409bcdc431614f1cfc80cfc4191b926f3ed",
    },
    license: ["Apache-2.0"],
    description: "The Official PHP SDK for QuickBooks Online Accounting API",
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
      reference: "1e58d53e4af390efc7813e36cd215bd82cba4b06",
    },
    license: ["MIT"],
    description: "A non-blocking concurrency framework for PHP applications.",
  });
});

test("parseGemfileLockData", async () => {
  let deps = await utils.parseGemfileLockData(
    fs.readFileSync("./test/data/Gemfile.lock", (encoding = "utf-8"))
  );
  expect(deps.length).toEqual(140);
  expect(deps[0]).toEqual({
    name: "actioncable",
    version: "6.0.0",
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
      "XMLRPC is a lightweight protocol that enables remote procedure calls over HTTP.",
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

test("parse wheel metadata", () => {
  let deps = utils.parseBdistMetadata(
    fs.readFileSync("./test/data/METADATA", (encoding = "utf-8"))
  );
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    version: "1.26.1",
    name: "yamllint",
    description: "A linter for YAML files.",
    homepage: { url: "https://github.com/adrienverge/yamllint" },
    license: "GPLv3",
    repository: { url: "https://github.com/adrienverge/yamllint" },
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
    license: "UNKNOWN",
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
  expect(deps.length).toEqual(8);
  expect(deps[0].name).toEqual("guava");
});

test("parse bazel build", () => {
  let projs = utils.parseBazelBuild(
    fs.readFileSync("./test/data/bazel/BUILD", (encoding = "utf-8"))
  );
  expect(projs.length).toEqual(2);
  expect(projs[0]).toEqual("java-maven-lib");
});
