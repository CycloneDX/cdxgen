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
    }
  ]);
  expect(data).toEqual([
    {
      description:
        "General data-binding functionality for Jackson: works on core streaming API",
      group: "com.fasterxml.jackson.core",
      name: "jackson-databind",
      version: "2.8.5",
      repository: {
        url: "http://github.com/FasterXML/jackson-databind"
      }
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
