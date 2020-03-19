const utils = require("./utils");
const fs = require("fs");

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
  dep_list = utils.parseGradleDep(
    fs.readFileSync("./test/gradle-dep.out", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(50);
  expect(dep_list[0]).toEqual({
    group: "org.ethereum",
    name: "solcJ-all",
    qualifiers: {
      type: "jar"
    },
    version: "0.4.25"
  });
});

test("get maven metadata", async () => {
  data = await utils.getMvnMetadata([
    {
      group: "com.squareup.okhttp3",
      name: "okhttp",
      version: "3.8.1"
    }
  ]);
  expect(data).toEqual([
    {
      description: "",
      group: "com.squareup.okhttp3",
      name: "okhttp",
      version: "3.8.1"
    }
  ]);

  data = await utils.getMvnMetadata([
    {
      group: "com.fasterxml.jackson.core",
      name: "jackson-databind",
      version: "2.8.5"
    },
    {
      group: "com.github.jnr",
      name: "jnr-posix",
      version: "3.0.47"
    }
  ]);
  expect(data).toEqual([
    {
      group: "com.fasterxml.jackson.core",
      name: "jackson-databind",
      version: "2.8.5",
      description:
        "General data-binding functionality for Jackson: works on core streaming API",
      repository: { url: "http://github.com/FasterXML/jackson-databind" }
    },
    {
      group: "com.github.jnr",
      name: "jnr-posix",
      version: "3.0.47",
      license: [
        {
          id: "EPL-2.0",
          name: "Eclipse Public License - v 2.0"
        },
        {
          id: "GPL-2.0-only",
          name: "GNU General Public License Version 2"
        },
        {
          id: "LGPL-2.1-only",
          name: "GNU Lesser General Public License Version 2.1"
        }
      ],
      description: "\n    Common cross-project/cross-platform POSIX APIs\n  ",
      repository: { url: "git@github.com:jnr/jnr-posix.git" }
    }
  ]);
});

test("get py metadata", async () => {
  data = await utils.getPyMetadata([
    {
      group: "",
      name: "Flask",
      version: "1.1.0"
    }
  ]);
  expect(data).toEqual([
    {
      _integrity:
        "sha256-a31adc27de06034c657a8dc091cc5fcb0227f2474798409bff0e9674de31a026",
      description: "A simple framework for building complex web applications.",
      group: "",
      homepage: {
        url: "https://palletsprojects.com/p/flask/"
      },
      license: "BSD-3-Clause",
      name: "Flask",
      version: "1.1.0"
    }
  ]);
});

test("parseGosumData", () => {
  expect(utils.parseGosumData(null)).toEqual([]);
  dep_list = utils.parseGosumData(
    fs.readFileSync("./test/gosum/go.sum", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(310);
  expect(dep_list[0]).toEqual({
    group: "cloud.google.com",
    name: "go",
    version: "v0.38.0",
    _integrity: "sha256-990N+gfupTy94rShfmMCWGDn0LpTmnzTp2qbd1dvSRU="
  });
});

test("parseGopkgData", () => {
  expect(utils.parseGopkgData(null)).toEqual([]);
  dep_list = utils.parseGopkgData(
    fs.readFileSync("./test/gopkg/Gopkg.lock", (encoding = "utf-8"))
  );
  expect(dep_list.length).toEqual(36);
  expect(dep_list[0]).toEqual({
    group: "cloud.google.com",
    name: "go",
    version: "v0.39.0",
    _integrity:
      "sha256-2ca532a6bc655663344004ba102436d29031018eab236247678db1d8978627bf"
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
  dep_list = await utils.getCratesMetadata([
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
    license: "Apache-2.0",
    repository: {
      url: "https://github.com/iqlusioninc/abscissa/tree/develop/"
    },
    homepage: { url: "https://github.com/iqlusioninc/abscissa/" }
  });
});

test("parse cs proj", async () => {
  expect(await utils.parseCsProjData(null)).toEqual([]);
  dep_list = await utils.parseCsProjData(
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
        "https://www.nuget.org/packages/Microsoft.AspNetCore.Mvc.NewtonsoftJson/3.1.1/"
    }
  });
});

test("get nget metadata", async () => {
  dep_list = await utils.getNugetMetadata([
    {
      group: "Castle",
      name: "Core",
      version: "4.4.0"
    }
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
    homepage: { url: "https://www.nuget.org/packages/Castle.Core/4.4.0/" }
  });
});
