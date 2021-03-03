const utils = require("./utils");
const fs = require("fs");
const ssri = require("ssri");

test("SSRI test", () => {
  // gopkg.lock hash
  ss = ssri.parse("2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf");
  expect(ss).toEqual({});
  ss = ssri.parse("sha256-2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf");
  expect(ss.sha256[0].digest).toStrictEqual('2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf');
  ss = ssri.parse("sha256-" + Buffer.from("2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf", "hex").toString("base64"));
  expect(ss.sha256[0].digest).toStrictEqual('LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78=');
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
  ]);
  expect(data).toEqual([
    {
      _integrity:
        "sha256-a31adc27de06034c657a8dc091cc5fcb0227f2474798409bff0e9674de31a026",
      description: "A simple framework for building complex web applications.",
      group: "",
      homepage: {
        url: "https://palletsprojects.com/p/flask/",
      },
      license: "BSD-3-Clause",
      name: "Flask",
      version: "1.1.0",
    },
  ]);
});

// Slow running test
/*
test("parseGoModData", async () => {
  jest.setTimeout(120000);
  let dep_list = await utils.parseGoModData(null);
  expect(dep_list).toEqual([]);
  const gosumMap = {
    "google.golang.org/grpc/v1.21.0": "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
    "github.com/spf13/cobra/v1.0.0": "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
    "github.com/spf13/viper/v1.0.2": "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
    "github.com/stretchr/testify/v1.6.1": "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg="
  }
  dep_list = await utils.parseGoModData(
    fs.readFileSync("./test/gomod/go.mod", (encoding = "utf-8")),
    gosumMap
  );
  expect(dep_list.length).toEqual(3);
  expect(dep_list[0]).toEqual({
    group: "github.com/spf13",
    name: "cobra",
    license: [{"id": "Apache-2.0", "url": "https://pkg.go.dev/github.com/spf13/cobra?tab=licenses"}],
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
  });
  expect(dep_list[1]).toEqual({
    group: "google.golang.org",
    name: "grpc",
    license: [{"id": "Apache-2.0", "url": "https://pkg.go.dev/google.golang.org/grpc?tab=licenses"}],
    version: "v1.21.0",
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
  });
  expect(dep_list[2]).toEqual({
    group: "github.com/spf13",
    name: "viper",
    license: [{"id": "MIT", "url": "https://pkg.go.dev/github.com/spf13/viper?tab=licenses"}],
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
    license: [{"id": "Apache-2.0", "url": "https://pkg.go.dev/google.golang.org/grpc?tab=licenses"}],
    version: "v1.21.0",
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
  });
  expect(dep_list[1]).toEqual({
    group: "github.com/spf13",
    name: "cobra",
    license: [{"id": "Apache-2.0", "url": "https://pkg.go.dev/github.com/spf13/cobra?tab=licenses"}],
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
  });
  expect(dep_list[2]).toEqual({
    group: "github.com/spf13",
    name: "viper",
    license: [{"id": "MIT", "url": "https://pkg.go.dev/github.com/spf13/viper?tab=licenses"}],
    version: "v1.0.2",
    _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
  });
  expect(dep_list[3]).toEqual({
    group: "github.com/stretchr",
    name: "testify",
    license: [{"id": "MIT", "url": "https://pkg.go.dev/github.com/stretchr/testify?tab=licenses"}],
    version: "v1.6.1",
    _integrity: "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
});
*/


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
    license: [
      {
        id: "Apache-2.0",
        url: "https://pkg.go.dev/cloud.google.com/go?tab=licenses",
      },
    ],
    version: "v0.39.0",
    _integrity:
      "sha256-LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78=",
  });
  dep_list.forEach((d) => {
    expect(d.license);
  });
});

/*
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
            "sha256-6a07677093120a02583717b6dd1ef81d8de1e8d01bd226c83f0f9bdf3e56bb3a"
    });
});
*/

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

test("parse cs pkg data", async () => {
  expect(await utils.parseCsPkgData(null)).toEqual([]);
  const dep_list = await utils.parseCsPkgData(
    fs.readFileSync("./test/data/packages.config", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(21);
  expect(dep_list[0]).toEqual({
    group: '',
    name: 'Antlr',
    version: '3.5.0.2',
    description: 'ANother Tool for Language Recognition, is a language tool that provides a framework for constructing recognizers, interpreters, compilers, and translators from grammatical descriptions containing actions in a variety of target languages.',
    license: 'http://www.antlr3.org/license.html',
    repository: { url: 'https://github.com/antlr/antlrcs' },
    homepage: { url: 'https://www.nuget.org/packages/Antlr/3.5.0.2/' }
  });
});

test("parse cs pkg data 2", async () => {
  expect(await utils.parseCsPkgData(null)).toEqual([]);
  const dep_list = await utils.parseCsPkgData(
    fs.readFileSync("./test/data/packages2.config", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: '',
    name: 'EntityFramework',
    version: '6.2.0',
    description: "Entity Framework is Microsoft's recommended data access technology for new applications.",
    license: 'http://www.microsoft.com/web/webpi/eula/net_library_eula_enu.htm',
    repository: { url: 'http://www.asp.net/' },
    homepage: { url: 'https://www.nuget.org/packages/EntityFramework/6.2.0/' }
  });
});

test("parse cs proj", async () => {
  expect(await utils.parseCsProjData(null)).toEqual([]);
  const dep_list = await utils.parseCsProjData(
    fs.readFileSync("./test/sample.csproj", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(5);
  expect(dep_list[0]).toEqual({
    group: "Microsoft.AspNetCore.Mvc",
    name: "NewtonsoftJson",
    version: "3.1.1",
    license: "Apache-2.0",
    description:
      "ASP.NET Core MVC features that use Newtonsoft.Json. Includes input and output formatters for JSON and JSON PATCH.\n\nThis package was built from the source code at https://github.com/aspnet/AspNetCore/tree/e276c8174b8bfdeb70efceafa81c75f8badbc8db",
    repository: { url: "https://asp.net/" },
    homepage: {
      url:
        "https://www.nuget.org/packages/Microsoft.AspNetCore.Mvc.NewtonsoftJson/3.1.1/",
    },
  });
});

test("parse .net cs proj", async () => {
  expect(await utils.parseCsProjData(null)).toEqual([]);
  const dep_list = await utils.parseCsProjData(
    fs.readFileSync("./test/data/sample-dotnet.csproj", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(19);
  expect(dep_list[0]).toEqual({
    group: 'Antlr3',
    name: 'Runtime',
    version: '3.5.0.2',
    description: 'The runtime library for parsers generated by the C# target of ANTLR 3. This package supports projects targeting .NET 2.0 or newer, and built using Visual Studio 2008 or newer.',
    license: 'https://raw.githubusercontent.com/antlr/antlrcs/master/LICENSE.txt',
    repository: { url: 'https://github.com/antlr/antlrcs' },
    homepage: { url: 'https://www.nuget.org/packages/Antlr3.Runtime/3.5.0.2/' }
  });
});

test("get nget metadata", async () => {
  const dep_list = await utils.getNugetMetadata([
    {
      group: "Castle",
      name: "Core",
      version: "4.4.0",
    },
  ]);
  expect(dep_list.length).toEqual(1);
  expect(dep_list[0]).toEqual({
    group: "Castle",
    name: "Core",
    version: "4.4.0",
    description:
      "Castle Core, including DynamicProxy, Logging Abstractions and DictionaryAdapter",
    license: "http://www.apache.org/licenses/LICENSE-2.0.html",
    repository: { url: "http://www.castleproject.org/" },
    homepage: { url: "https://www.nuget.org/packages/Castle.Core/4.4.0/" },
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
      url:
        "https://pkg.go.dev/github.com/Azure/azure-amqp-common-go/v2?tab=licenses",
    },
  ]);

  license = await utils.getGoPkgLicense({
    group: "go.opencensus.io",
    name: "go.opencensus.io",
  });
  expect(license).toEqual([
    {
      id: "Apache-2.0",
      url:
        "https://pkg.go.dev/go.opencensus.io?tab=licenses",
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
  expect(deps[0]._integrity).toEqual("sha512-nne9/IiQ/hzIhY6pdDnbBtz7DjPTKrY00P/zvPSm5pOFkl6xuGrGnXn/VtTNNfNtAfZ9/1RtehkszU9qcTii0Q==");
});

test("parseNodeShrinkwrap", async () => {
  const deps = await utils.parseNodeShrinkwrap("./test/shrinkwrap-deps.json");
  expect(deps.length).toEqual(496);
  expect(deps[0]._integrity).toEqual("sha512-a9gxpmdXtZEInkCSHUJDLHZVBgb1QS0jhss4cPP93EW7s+uC5bikET2twEF3KV+7rDblJcmNvTR7VJejqd2C2g==");
});

test("parseSetupPyFile", async () => {
  let deps = await utils.parseSetupPyFile(`install_requires=[
    'colorama>=0.4.3',
    'libsast>=1.0.3',
],`);
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");
  expect(deps[0].description).toEqual("Cross-platform colored terminal text.");

  deps = await utils.parseSetupPyFile(`install_requires=['colorama>=0.4.3','libsast>=1.0.3',],`);
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");
  expect(deps[0].description).toEqual("Cross-platform colored terminal text.");

  deps = await utils.parseSetupPyFile(`install_requires=['colorama>=0.4.3','libsast>=1.0.3']`);
  expect(deps.length).toEqual(2);
  expect(deps[0].name).toEqual("colorama");
  expect(deps[0].description).toEqual("Cross-platform colored terminal text.");

  deps = await utils.parseSetupPyFile(`install_requires=['colorama>=0.4.3', 'libsast>=1.0.3']`);
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
  const deps = await utils.parsePnpmLock("./test/pnpm-lock.yaml");
  expect(deps.length).toEqual(1610);
  expect(deps[0]).toEqual({
    "_integrity": "sha512-IGhtTmpjGbYzcEDOw7DcQtbQSXcG9ftmAXtWTu9V936vDye4xjjekktFAtgZsWpzTj/X01jocB46mTywm/4SZw==",
    "group": "@babel",
    "name": "code-frame",
    "version": "7.10.1"
  });
});

test("parseYarnLock", async () => {
  let deps = await utils.parseYarnLock("./test/yarn.lock");
  expect(deps.length).toEqual(51);
  expect(deps[0]).toEqual({
    group: '',
    name: 'asap',
    version: '2.0.5',
    _integrity: 'sha256-522765b50c3510490e52d7dcfe085ef9ba96958f'
  });

  deps = await utils.parseYarnLock("./test/data/yarn_locks/yarn.lock");
  expect(deps.length).toEqual(1463);
  expect(deps[0]).toEqual({
    group: '',
    name: 'JSONStream',
    version: '4.2.2',
    _integrity: 'sha256-d291c6a4e97989b5c61d9acf396ae4fe133a718d'
  });
  deps.forEach(d => {
    expect(d.name).toBeDefined();
    expect(d.version).toBeDefined();
  });
});

test("parseComposerLock", () => {
  let deps = utils.parseComposerLock("./test/data/composer.lock");
  expect(deps.length).toEqual(1);
  expect(deps[0]).toEqual({
    group: 'quickbooks',
    name: 'v3-php-sdk',
    version: '4.0.6.1',
    repository: {
      type: 'git',
      url: 'https://github.com/intuit/QuickBooks-V3-PHP-SDK.git',
      reference: 'fe42e409bcdc431614f1cfc80cfc4191b926f3ed'
    },
    license: [ 'Apache-2.0' ],
    description: 'The Official PHP SDK for QuickBooks Online Accounting API'
  });

  deps = utils.parseComposerLock("./test/data/composer-2.lock");
  expect(deps.length).toEqual(28);
  expect(deps[0]).toEqual({
    group: 'amphp',
      name: 'amp',
      version: '2.4.4',
      repository: {
        type: 'git',
        url: 'https://github.com/amphp/amp.git',
        reference: '1e58d53e4af390efc7813e36cd215bd82cba4b06'
      },
      license: [ 'MIT' ],
      description: 'A non-blocking concurrency framework for PHP applications.'
  });
});

/*
test("parseGemfileLockData", async () => {
  jest.setTimeout(120000);
  let deps = await utils.parseGemfileLockData(fs.readFileSync("./test/data/Gemfile.lock", (encoding = "utf-8")));
  expect(deps.length).toEqual(140);
  expect(deps[0]).toEqual({
    name: 'actioncable',
    version: '6.0.0',
    description: 'Structure many real-time application concerns into channels over a single WebSocket connection.',
    license: [ 'MIT' ],
    repository: { url: 'https://github.com/rails/rails/tree/v6.0.3.2/actioncable' },
    homepage: { url: 'https://github.com/rails/rails/issues' },
    _integrity: 'sha256-66e6b55cac145991a0f1e7d163551f7deda27d91c18ebb3b7b1bbd28d9d8edd9'
  });
});
*/

test("parse requirements.txt with comments", async () => {
  jest.setTimeout(120000);
  let deps = await utils.parseReqFile(fs.readFileSync("./test/data/requirements.comments.txt", (encoding = "utf-8")));
  expect(deps.length).toEqual(31);
});

test("parse pipfile.lock with hashes", async () => {
  jest.setTimeout(120000);
  let deps = await utils.parsePiplockData(JSON.parse(fs.readFileSync("./test/data/Pipfile.lock", (encoding = "utf-8"))));
  expect(deps.length).toEqual(46);
});

test("parse scala sbt list", async () => {
  let deps = utils.parseKVDep(fs.readFileSync("./test/data/sbt-dl.list", { encoding: "utf-8" }));
  expect(deps.length).toEqual(57);
});

test("parse scala sbt lock", async () => {
  let deps = utils.parseSbtLock("./test/data/build.sbt.lock");
  expect(deps.length).toEqual(117);
});
