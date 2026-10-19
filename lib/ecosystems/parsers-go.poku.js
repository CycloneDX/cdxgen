import { readFileSync } from "node:fs";
import process from "node:process";

import { assert, describe, it, test } from "poku";

import { isGoModWhyNotNeeded } from "./parsers-go.js";
import {
  parseGoListDep,
  parseGoModData,
  parseGoModGraph,
  parseGoModulesTxt,
  parseGoModWhy,
  parseGopkgData,
  parseGosumData,
  parseGoVersionData,
} from "./utils.js";

it("parseGoModData", async () => {
  let retMap = await parseGoModData(null);
  assert.deepStrictEqual(retMap, {});
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
  assert.deepStrictEqual(retMap.pkgList.length, 6);
  assert.ok(retMap.pkgList);

  retMap.pkgList.forEach((d) => {
    assert.deepStrictEqual(d.license);
  });
  retMap = await parseGoModData(
    readFileSync("./test/data/go-dvwa.mod", { encoding: "utf-8" }),
    {},
  );
  assert.deepStrictEqual(retMap.parentComponent, {
    "bom-ref": "pkg:golang/github.com/sqreen/go-dvwa",
    name: "github.com/sqreen/go-dvwa",
    purl: "pkg:golang/github.com/sqreen/go-dvwa",
    type: "application",
  });
  assert.deepStrictEqual(retMap.pkgList.length, 19);
  assert.deepStrictEqual(retMap.rootList.length, 4);
  retMap = await parseGoModData(
    readFileSync("./test/data/go-syft.mod", { encoding: "utf-8" }),
    {},
  );
  assert.deepStrictEqual(retMap.parentComponent, {
    "bom-ref": "pkg:golang/github.com/anchore/syft",
    name: "github.com/anchore/syft",
    purl: "pkg:golang/github.com/anchore/syft",
    type: "application",
  });
  // The 235 requires and the one module replacement `go mod edit -json` reads
  // from this file; the `retract` block names no dependency.
  assert.deepStrictEqual(retMap.pkgList.length, 236);
  assert.deepStrictEqual(retMap.rootList.length, 81);
}, 120000);

it("parseGoModData reads only require and replace as dependencies", async () => {
  // The #4512 reproducer: an inline replace followed by an exclude block.
  let retMap = await parseGoModData(
    readFileSync("./test/data/go-replace-exclude.mod", { encoding: "utf-8" }),
    {},
  );
  assert.deepStrictEqual(
    retMap.pkgList.map((c) => c["bom-ref"]),
    [
      "pkg:golang/git.example.com/platform/go/kafka-metrics-converter@v0.2.3",
      "pkg:golang/github.com/pkg/errors@v0.9.1",
    ],
  );
  assert.deepStrictEqual(retMap.rootList.length, 2);

  // Every directive in its single-line and block form, as Go reads it.
  const gosumMap = {
    "github.com/anchore/archiver/v3@v3.5.2": "sha256-fake-archiver-hash=",
    "github.com/pkg/errors@v0.9.1": "sha256-fake-errors-hash=",
  };
  retMap = await parseGoModData(
    readFileSync("./test/data/go-mod-directives.mod", { encoding: "utf-8" }),
    gosumMap,
  );
  assert.deepStrictEqual(retMap.parentComponent, {
    "bom-ref": "pkg:golang/github.com/cdxgen/gomod-directives",
    name: "github.com/cdxgen/gomod-directives",
    purl: "pkg:golang/github.com/cdxgen/gomod-directives",
    type: "application",
    properties: [{ name: "cdx:go:toolchain", value: "go1.25.1" }],
  });
  // Excluded, retracted, ignored and tool entries stay out, as do the two
  // directory replacements, which name no module version.
  assert.deepStrictEqual(
    retMap.pkgList.map((c) => c["bom-ref"]),
    [
      "pkg:golang/github.com/anchore/archiver/v3@v3.5.2",
      "pkg:golang/github.com/google/uuid@v1.6.0",
      "pkg:golang/github.com/pkg/errors@v0.9.1",
      "pkg:golang/github.com/rcrowley/go-metrics@v0.0.0-20201227073835-cf1acfcdf475",
      // A module path ending in "tool" is still a requirement.
      "pkg:golang/github.com/uber/prototool@v1.10.0",
      // So is a require whose comment carries a parenthesis.
      "pkg:golang/golang.org/x/net@v0.33.0",
      "pkg:golang/golang.org/x/text@v0.21.0",
      "pkg:golang/golang.org/x/tools@v0.28.0",
      "pkg:golang/gopkg.in/yaml.v3@v3.0.1",
    ],
  );
  // `// indirect` and `// indirect; reason` both mark an indirect require.
  assert.deepStrictEqual(
    retMap.pkgList.filter((c) => c.scope === "optional").map((c) => c.name),
    ["golang.org/x/text", "golang.org/x/tools"],
  );
  assert.deepStrictEqual(
    retMap.rootList.map((c) => c["bom-ref"]).sort(),
    retMap.pkgList
      .filter((c) => c.scope !== "optional")
      .map((c) => c["bom-ref"]),
  );
  // The replacement module, not the module it replaces, carries the go.sum hash.
  assert.deepStrictEqual(
    retMap.pkgList.find((c) => c.name === "github.com/anchore/archiver/v3")
      ._integrity,
    "sha256-fake-archiver-hash=",
  );
  assert.deepStrictEqual(
    retMap.pkgList.find((c) => c.name === "github.com/pkg/errors")._integrity,
    "sha256-fake-errors-hash=",
  );
  assert.ok(retMap.pkgList.every((c) => c.name && c.version && c.purl));
}, 120000);

it("parseGoModData reads quoted paths and skips malformed lines", async () => {
  const retMap = await parseGoModData(
    [
      'module "example.com/quoted" // the module',
      "",
      "require ( )",
      "require(",
      '\t"github.com/pkg/errors" v0.9.1 // indirect',
      ") // end of block",
      'replace "github.com/pkg/errors" => github.com/pkg/errors v0.9.0',
      "exclude github.com/pkg/errors v0.8.0",
      // Go rejects each line below; none may become a component.
      "replace example.com/broken =>",
      "replace example.com/broken v1.0.0 example.com/fork v1.0.1",
      "require `example.com/backquoted` v1.0.0",
      "require example.com/versionless",
      "",
    ].join("\r\n"),
    {},
  );
  assert.deepStrictEqual(retMap.parentComponent.name, "example.com/quoted");
  assert.deepStrictEqual(
    retMap.pkgList.map((c) => [c["bom-ref"], c.scope]),
    [
      ["pkg:golang/github.com/pkg/errors@v0.9.0", undefined],
      ["pkg:golang/github.com/pkg/errors@v0.9.1", "optional"],
    ],
  );
});

it("parseGoSumData", async () => {
  let dep_list = await parseGosumData(null);
  assert.deepStrictEqual(dep_list, []);
  dep_list = await parseGosumData(
    readFileSync("./test/gomod/go.sum", { encoding: "utf-8" }),
  );
  assert.deepStrictEqual(dep_list.length, 4);
  assert.deepStrictEqual(dep_list[0], {
    group: "",
    name: "google.golang.org/grpc",
    license: undefined,
    version: "v1.21.0",
    _integrity: "sha256-oYelfM1adQP15Ek0mdvEgi9Df8B9CZIaU1084ijfRaM=",
    "bom-ref": "pkg:golang/google.golang.org/grpc@v1.21.0",
    purl: "pkg:golang/google.golang.org/grpc@v1.21.0",
  });
  assert.deepStrictEqual(dep_list[1], {
    group: "",
    name: "github.com/spf13/cobra",
    license: undefined,
    version: "v1.0.0",
    _integrity: "sha256-/6GTrnGXV9HjY+aR4k0oJ5tcvakLuG6EuKReYlHNrgE=",
    "bom-ref": "pkg:golang/github.com/spf13/cobra@v1.0.0",
    purl: "pkg:golang/github.com/spf13/cobra@v1.0.0",
  });
  assert.deepStrictEqual(dep_list[2], {
    group: "",
    name: "github.com/spf13/viper",
    license: undefined,
    version: "v1.0.2",
    _integrity: "sha256-A8kyI5cUJhb8N+3pkfONlcEcZbueH6nhAm0Fq7SrnBM=",
    "bom-ref": "pkg:golang/github.com/spf13/viper@v1.0.2",
    purl: "pkg:golang/github.com/spf13/viper@v1.0.2",
  });
  assert.deepStrictEqual(dep_list[3], {
    group: "",
    name: "github.com/stretchr/testify",
    license: undefined,
    version: "v1.6.1",
    _integrity: "sha256-6Fq8oRcR53rry900zMqJjRRixrwX3KX962/h/Wwjteg=",
    "bom-ref": "pkg:golang/github.com/stretchr/testify@v1.6.1",
    purl: "pkg:golang/github.com/stretchr/testify@v1.6.1",
  });
  dep_list.forEach((d) => {
    assert.deepStrictEqual(d.license);
  });
  it(() => {
    delete process.env.GO_FETCH_VCS;
  });
}, 120000);

describe("go data with vcs", () => {
  it(() => {
    process.env.GO_FETCH_VCS = "true";
  });
  it("parseGoSumData with vcs", async () => {
    let dep_list = await parseGosumData(null);
    assert.deepStrictEqual(dep_list, []);
    dep_list = await parseGosumData(
      readFileSync("./test/gomod/go.sum", { encoding: "utf-8" }),
    );
    assert.deepStrictEqual(dep_list.length, 4);
    assert.ok(dep_list[0]);
  }, 120000);

  it("parseGoModData", async () => {
    process.env.GO_FETCH_VCS = "false";
    let retMap = await parseGoModData(null);
    assert.deepStrictEqual(retMap, {});
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
    assert.deepStrictEqual(retMap.pkgList.length, 6);
    // Doesn't reliably work in CI/CD due to rate limiting.
    /*
    assert.deepStrictEqual(retMap.pkgList, [
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
    */

    retMap.pkgList.forEach((d) => {
      assert.deepStrictEqual(d.license);
    });
    retMap = await parseGoModData(
      readFileSync("./test/data/go-dvwa.mod", { encoding: "utf-8" }),
      {},
    );
    assert.deepStrictEqual(retMap.parentComponent, {
      "bom-ref": "pkg:golang/github.com/sqreen/go-dvwa",
      name: "github.com/sqreen/go-dvwa",
      purl: "pkg:golang/github.com/sqreen/go-dvwa",
      type: "application",
    });
    assert.deepStrictEqual(retMap.pkgList.length, 19);
    assert.deepStrictEqual(retMap.rootList.length, 4);
    retMap = await parseGoModData(
      readFileSync("./test/data/go-syft.mod", { encoding: "utf-8" }),
      {},
    );
    assert.deepStrictEqual(retMap.parentComponent, {
      "bom-ref": "pkg:golang/github.com/anchore/syft",
      name: "github.com/anchore/syft",
      purl: "pkg:golang/github.com/anchore/syft",
      type: "application",
    });
    assert.deepStrictEqual(retMap.pkgList.length, 236);
    assert.deepStrictEqual(retMap.rootList.length, 81);
  }, 120000);
});

describe("go vendor modules tests", () => {
  it("parseGoModulesTxt", async () => {
    const gosumMap = {
      "cel.dev/expr@v0.18.0":
        "sha256-CJ6drgk+Hf96lkLikr4rFf19WrU0BOWEihyZnI2TAzo=",
      "github.com/AdaLogics/go-fuzz-headers@v0.0.0-20230811130428-ced1acdcaa24":
        "sha256-bvDV9vkmnHYOMsOr4WLk+Vo07yKIzd94sVoIqshQ4bU=",
      "github.com/Azure/go-ansiterm@v0.0.0-20230124172434-306776ec8161":
        "sha256-L/gRVlceqvL25UVaW/CKtUDjefjrs0SPonmDGUVOYP0=",
    };
    const pkgList = await parseGoModulesTxt(
      "./test/data/modules.txt",
      gosumMap,
    );
    assert.deepStrictEqual((await pkgList).length, 212);
  });
});

describe("go data with licenses", () => {
  it(() => {
    process.env.FETCH_LICENSE = "true";
  });
  test.skip("parseGoSumData with licenses", async () => {
    let dep_list = await parseGosumData(null);
    assert.deepStrictEqual(dep_list, []);
    dep_list = await parseGosumData(
      readFileSync("./test/gomod/go.sum", { encoding: "utf-8" }),
    );
    assert.deepStrictEqual(dep_list.length, 4);
    assert.deepStrictEqual(dep_list[0], {
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
    assert.deepStrictEqual(dep_list[1], {
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
    assert.deepStrictEqual(dep_list[2], {
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
    assert.deepStrictEqual(dep_list[3], {
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
      assert.deepStrictEqual(d.license);
    });
  }, 120000);

  test.skip("parseGoModData with licenses", async () => {
    let retMap = await parseGoModData(null);
    assert.deepStrictEqual(retMap, {});
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
    assert.deepStrictEqual(retMap.pkgList.length, 6);
    assert.deepStrictEqual(retMap.pkgList, [
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
      assert.deepStrictEqual(d.license);
    });
    retMap = await parseGoModData(
      readFileSync("./test/data/go-dvwa.mod", { encoding: "utf-8" }),
      {},
    );
    assert.deepStrictEqual(retMap.parentComponent, {
      "bom-ref": "pkg:golang/github.com/sqreen/go-dvwa",
      name: "github.com/sqreen/go-dvwa",
      purl: "pkg:golang/github.com/sqreen/go-dvwa",
      type: "application",
    });
    assert.deepStrictEqual(retMap.pkgList.length, 19);
    assert.deepStrictEqual(retMap.rootList.length, 4);
    retMap = await parseGoModData(
      readFileSync("./test/data/go-syft.mod", { encoding: "utf-8" }),
      {},
    );
    assert.deepStrictEqual(retMap.parentComponent, {
      "bom-ref": "pkg:golang/github.com/anchore/syft",
      name: "github.com/anchore/syft",
      purl: "pkg:golang/github.com/anchore/syft",
      type: "application",
    });
    assert.deepStrictEqual(retMap.pkgList.length, 236);
    assert.deepStrictEqual(retMap.rootList.length, 81);
  }, 120000);
  it(() => {
    delete process.env.FETCH_LICENSE;
  });
});

it("parse go list dependencies", async () => {
  let retMap = await parseGoListDep(
    readFileSync("./test/data/golist-dep.txt", { encoding: "utf-8" }),
    {},
  );
  assert.deepStrictEqual(retMap.pkgList.length, 4);
  assert.deepStrictEqual(retMap.pkgList[0], {
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
        name: "internal:SrcGoMod",
        value:
          "/home/almalinux/go/pkg/mod/cache/download/github.com/gorilla/mux/@v/v1.7.4.mod",
      },
      { name: "internal:ModuleGoVersion", value: "1.12" },
      {
        name: "cdx:go:indirect",
        value: "false",
      },
    ],
  });
  retMap = await parseGoListDep(
    readFileSync("./test/data/golist-dep3.txt", { encoding: "utf-8" }),
    {},
  );
  assert.deepStrictEqual(retMap.pkgList.length, 291);
});

it("parse go mod graph", async () => {
  let retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-graph.txt", { encoding: "utf-8" }),
    undefined,
    {},
    [],
    {},
  );
  assert.deepStrictEqual(retMap.pkgList.length, 536);
  // No go.mod here, so every version in the graph is retained. Single-segment
  // module paths like this one are valid golang purls as of cdx-purl 0.0.4 (0.0.3
  // rejected them for lacking a namespace), so the bom-ref is purl-derived and
  // must stay unique across the eight versions of this module that the graph
  // names.
  // Looked up by identity rather than by index: components are sorted by bom-ref,
  // so an index assertion silently tracks sort order instead of the parse result.
  assert.deepStrictEqual(
    retMap.pkgList.find(
      (c) => c.name === "go.opencensus.io" && c.version === "v0.21.0",
    ),
    {
      _integrity: undefined,
      "bom-ref": "pkg:golang/go.opencensus.io@v0.21.0",
      group: "",
      license: undefined,
      name: "go.opencensus.io",
      purl: "pkg:golang/go.opencensus.io@v0.21.0",
      version: "v0.21.0",
    },
  );
  const graphRefs = retMap.pkgList.map((c) => c["bom-ref"]);
  assert.deepStrictEqual(
    new Set(graphRefs).size,
    graphRefs.length,
    "bom-refs must be unique even when several versions of one module appear",
  );
  retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-dvwa-graph.txt", { encoding: "utf-8" }),
    "./test/data/go-dvwa.mod",
    {},
    [],
    {},
  );
  assert.deepStrictEqual(retMap.parentComponent, {
    "bom-ref": "pkg:golang/github.com/sqreen/go-dvwa",
    name: "github.com/sqreen/go-dvwa",
    purl: "pkg:golang/github.com/sqreen/go-dvwa",
    type: "application",
  });
  assert.deepStrictEqual(retMap.pkgList.length, 19);
  assert.deepStrictEqual(retMap.rootList.length, 4);
  retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-syft-graph.txt", { encoding: "utf-8" }),
    "./test/data/go-syft.mod",
    {},
    [],
    {},
  );
  assert.deepStrictEqual(retMap.parentComponent, {
    "bom-ref": "pkg:golang/github.com/anchore/syft",
    name: "github.com/anchore/syft",
    purl: "pkg:golang/github.com/anchore/syft",
    type: "application",
  });
  // 235, not 242: the graph names eight versions of `go.opencensus.io`, but Go
  // minimal-version-selection builds exactly one (go.mod pins v0.24.0), and the
  // parser emits one component per module. An earlier revision emitted all
  // eight sharing the bom-ref `go.opencensus.io`, which both inflated this
  // count and broke bom-ref uniqueness. The count is unchanged by the cdx-purl
  // 0.0.4 upgrade — that only restored these modules' purls, it did not change
  // how many components exist.
  assert.deepStrictEqual(retMap.pkgList.length, 235);
  const goModuleNames = retMap.pkgList.map((c) =>
    c.group ? `${c.group}/${c.name}` : c.name,
  );
  assert.deepStrictEqual(
    new Set(goModuleNames).size,
    goModuleNames.length,
    "each go module must appear exactly once",
  );
  const goRefs = retMap.pkgList.map((c) => c["bom-ref"]);
  assert.deepStrictEqual(
    new Set(goRefs).size,
    goRefs.length,
    "bom-refs must be unique, including for modules with no valid purl",
  );
  assert.deepStrictEqual(retMap.rootList.length, 81);
});

// #4497 — the production driver resolves `go list` first and passes its
// package list and parent component to parseGoModGraph, which then filters
// `go mod graph` lines against them. The graph is the requirement graph, so
// an edge routinely names a version older than the one MVS selected
// (go-colorable@v0.1.13 while v0.1.14 was selected): such an edge must be
// rewritten to the selected version, not dropped.
it("parse go mod graph rewrites drifted target versions to the selected ones", async () => {
  const listMap = await parseGoListDep(
    readFileSync("./test/data/golist-drift.txt", { encoding: "utf-8" }),
    {},
  );
  assert.deepStrictEqual(listMap.pkgList.length, 5);
  assert.deepStrictEqual(
    listMap.parentComponent?.purl,
    "pkg:golang/example.com/gotest",
  );
  const retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-drift-graph.txt", { encoding: "utf-8" }),
    "./test/data/go-drift.mod",
    {},
    listMap.pkgList,
    listMap.parentComponent,
  );
  const edges = {};
  for (const dep of retMap.dependenciesList) {
    edges[dep.ref] = dep.dependsOn;
  }
  // The main module depends on its direct requires only.
  assert.deepStrictEqual(
    (edges["pkg:golang/example.com/gotest"] || []).sort(),
    [
      "pkg:golang/github.com/fatih/color@v1.18.0",
      "pkg:golang/github.com/gorilla/mux@v1.8.1",
    ],
  );
  // The three drifted edges survive, pointing at the selected versions.
  assert.ok(
    (edges["pkg:golang/github.com/fatih/color@v1.18.0"] || []).includes(
      "pkg:golang/github.com/mattn/go-colorable@v0.1.14",
    ),
    "color -> go-colorable must be rewritten to the selected v0.1.14",
  );
  assert.ok(
    (edges["pkg:golang/github.com/fatih/color@v1.18.0"] || []).includes(
      "pkg:golang/golang.org/x/sys@v0.29.0",
    ),
    "color -> x/sys must be rewritten to the selected v0.29.0",
  );
  assert.ok(
    (edges["pkg:golang/github.com/mattn/go-isatty@v0.0.20"] || []).includes(
      "pkg:golang/golang.org/x/sys@v0.29.0",
    ),
    "go-isatty -> x/sys must be rewritten to the selected v0.29.0",
  );
  // Edges that already named the selected versions are untouched.
  assert.ok(
    (edges["pkg:golang/github.com/mattn/go-colorable@v0.1.14"] || []).includes(
      "pkg:golang/github.com/mattn/go-isatty@v0.0.20",
    ),
  );
  // The go@/toolchain@ pseudo-modules stay excluded, and every edge points
  // at a component the run actually emits.
  const knownRefs = new Set([
    ...retMap.pkgList.map((c) => c["bom-ref"]),
    "pkg:golang/example.com/gotest",
  ]);
  for (const dep of retMap.dependenciesList) {
    assert.ok(
      knownRefs.has(dep.ref),
      `dependency ref ${dep.ref} must name a known component`,
    );
    for (const target of dep.dependsOn) {
      assert.ok(
        knownRefs.has(target),
        `dependency target ${target} must name a known component`,
      );
    }
  }
  assert.ok(!knownRefs.has("pkg:golang/go@1.24"));
  assert.ok(!knownRefs.has("pkg:golang/toolchain@go1.24"));
});

// #4497, root variant — an untidy go.mod can name a direct require at an
// older version than the one MVS selected. The root edge is rewritten to the
// selected version and must still count as a direct dependency: the by-ref
// map only knows the stale bom-ref from the go.mod text.
it("parse go mod graph keeps a root edge whose direct require drifted", async () => {
  const listMap = await parseGoListDep(
    readFileSync("./test/data/golist-drift.txt", { encoding: "utf-8" }),
    {},
  );
  const retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-drift-root-graph.txt", {
      encoding: "utf-8",
    }),
    "./test/data/go-drift-untidy.mod",
    {},
    listMap.pkgList,
    listMap.parentComponent,
  );
  const rootEdges = retMap.dependenciesList.find(
    (dep) => dep.ref === "pkg:golang/example.com/gotest",
  );
  assert.ok(rootEdges, "the main module must have a dependencies entry");
  assert.deepStrictEqual([...rootEdges.dependsOn].sort(), [
    "pkg:golang/github.com/fatih/color@v1.18.0",
    "pkg:golang/github.com/gorilla/mux@v1.8.1",
  ]);
});

it("parse go mod why dependencies", () => {
  let pkg_name = parseGoModWhy(
    readFileSync("./test/data/gomodwhy.txt", { encoding: "utf-8" }),
  );
  assert.deepStrictEqual(pkg_name, "github.com/mailgun/mailgun-go/v4");
  pkg_name = parseGoModWhy(
    readFileSync("./test/data/gomodwhynot.txt", { encoding: "utf-8" }),
  );
  assert.deepStrictEqual(pkg_name, undefined);
});

it("detects go mod why output for a module the main module does not need", () => {
  assert.strictEqual(
    isGoModWhyNotNeeded(
      readFileSync("./test/data/gomodwhynot.txt", { encoding: "utf-8" }),
    ),
    true,
  );
  assert.strictEqual(
    isGoModWhyNotNeeded(
      "# github.com/x/a\r\n(main module does not need module github.com/x/a)\r\n",
    ),
    true,
  );
  assert.strictEqual(
    isGoModWhyNotNeeded(
      readFileSync("./test/data/gomodwhy.txt", { encoding: "utf-8" }),
    ),
    false,
  );
  assert.strictEqual(isGoModWhyNotNeeded(undefined), false);
});

it("parseGoModData for multiple modules with root priority", async () => {
  // Test parsing multiple go.mod files to ensure proper component hierarchy
  const rootModData = readFileSync("./test/data/multimodule-root.mod", {
    encoding: "utf-8",
  });
  const subModData = readFileSync("./test/data/multimodule-sub.mod", {
    encoding: "utf-8",
  });
  const deepModData = readFileSync("./test/data/multimodule-deep.mod", {
    encoding: "utf-8",
  });

  const rootResult = await parseGoModData(rootModData, {});
  const subResult = await parseGoModData(subModData, {});
  const deepResult = await parseGoModData(deepModData, {});

  // Root module should be identified correctly
  assert.deepStrictEqual(
    rootResult.parentComponent.name,
    "github.com/example/root-project",
  );
  assert.deepStrictEqual(rootResult.parentComponent.type, "application");

  // Sub modules should also be parsed correctly
  assert.deepStrictEqual(
    subResult.parentComponent.name,
    "github.com/example/root-project/submodule",
  );
  assert.deepStrictEqual(
    deepResult.parentComponent.name,
    "github.com/example/root-project/deep/nested",
  );

  // In the fixed logic, the root should take priority over sub-modules
  // This test verifies the parsing works correctly for each individual module
}, 10000);

it("parseGopkgData", async () => {
  let dep_list = await parseGopkgData(null);
  assert.deepStrictEqual(dep_list, []);
  dep_list = await parseGopkgData(
    readFileSync("./test/gopkg/Gopkg.lock", { encoding: "utf-8" }),
  );
  // Every [[projects]] entry, the last one included.
  assert.deepStrictEqual(dep_list.length, 37);
  assert.deepStrictEqual(dep_list[0], {
    group: "",
    name: "cloud.google.com/go",
    version: "v0.39.0",
    _integrity: "sha256-LKUyprxlVmM0QAS6ECQ20pAxAY6rI2JHZ42x2JeGJ78=",
  });
  assert.deepStrictEqual(dep_list[36], {
    group: "",
    name: "pack.ag/amqp",
    version: "v0.11.0",
    _integrity: "sha256-Imd95Nt5Ae7e/Fd7hOqMBhwvVTFVEyKgkq1+Gt7k0xw=",
  });
  dep_list.forEach((d) => {
    assert.deepStrictEqual(d.license);
  });
}, 120000);

it("parse go version data", async () => {
  let dep_list = await parseGoVersionData(
    readFileSync("./test/data/goversion.txt", { encoding: "utf-8" }),
    {},
  );
  assert.deepStrictEqual(dep_list.length, 125);
  assert.deepStrictEqual(dep_list[0], {
    group: "",
    name: "github.com/ShiftLeftSecurity/atlassian-connect-go",
    "bom-ref":
      "pkg:golang/github.com/shiftleftsecurity/atlassian-connect-go@v0.0.2",
    purl: "pkg:golang/github.com/shiftleftsecurity/atlassian-connect-go@v0.0.2",
    version: "v0.0.2",
    _integrity: "",
    license: undefined,
  });
  dep_list = await parseGoVersionData(
    readFileSync("./test/data/goversion2.txt", { encoding: "utf-8" }),
    {},
  );
  assert.deepStrictEqual(dep_list.length, 149);
  assert.deepStrictEqual(dep_list[0], {
    group: "",
    name: "cloud.google.com/go",
    "bom-ref": "pkg:golang/cloud.google.com/go@v0.79.0",
    purl: "pkg:golang/cloud.google.com/go@v0.79.0",
    version: "v0.79.0",
    _integrity: "sha256-oqqswrt4x6b9OGBnNqdssxBl1xf0rSUNjU2BR4BZar0=",
    license: undefined,
  });
});

it("the go.mod parser resolves every module in one batched round", async () => {
  const esmock = (await import("esmock")).default;
  const seen = [];
  // ecosystems.js is a dependency of parsers-go.js, not of utils.js, so the
  // mock belongs in the global slot; passing it as a direct mock silently does
  // nothing.
  const { parseGoModData: mockedParseGoModData } = await esmock(
    "./utils.js",
    {},
    {
      "./ecosystems.js": {
        prefetchGoPkgMetadata: async (modules) => {
          seen.push(modules.map((m) => m.name));
        },
      },
    },
  );
  const goMod = `module github.com/example/app

go 1.23

require (
	github.com/spf13/cobra v1.0.0
	google.golang.org/grpc v1.21.0 // indirect
)

replace github.com/spf13/viper => github.com/spf13/viper v1.3.0
`;
  const retMap = await mockedParseGoModData(goMod, {});
  // One call, before any component is built, carrying every module the loop
  // goes on to resolve — required, indirect and replacement alike.
  assert.strictEqual(seen.length, 1);
  assert.deepStrictEqual(seen[0], [
    "github.com/spf13/cobra",
    "google.golang.org/grpc",
    "github.com/spf13/viper",
  ]);
  // The two-pass split must not disturb the component list or the scopes.
  assert.strictEqual(retMap.pkgList.length, 3);
  assert.strictEqual(
    retMap.pkgList.find((p) => p.name === "google.golang.org/grpc").scope,
    "optional",
  );
  assert.deepStrictEqual(
    retMap.rootList.map((p) => p.name).sort(),
    ["github.com/spf13/cobra", "github.com/spf13/viper"].sort(),
  );
  assert.strictEqual(retMap.parentComponent.name, "github.com/example/app");
});

it("parse go mod graph keeps +incompatible edges of mixed-case module paths", async () => {
  // `go mod graph` prints versions unescaped. The components carry the
  // canonical, lower-cased golang purl, so the graph tokens must be read the
  // same way or the edge to github.com/Knetic/govaluate is silently dropped.
  const knetic =
    "pkg:golang/github.com/knetic/govaluate@v3.0.1-0.20171022003610-9aa49832a739+incompatible";
  const jwt = "pkg:golang/github.com/dgrijalva/jwt-go@v3.2.0+incompatible";
  const retMap = await parseGoModGraph(
    readFileSync("./test/data/gomod-incompatible/graph.txt", {
      encoding: "utf-8",
    }),
    "./test/data/gomod-incompatible/go.mod",
    {},
    [{ "bom-ref": knetic }, { "bom-ref": jwt }],
    { "bom-ref": "pkg:golang/example.com/goupper" },
  );
  const rootDeps = retMap.dependenciesList.find(
    (d) => d.ref === "pkg:golang/example.com/goupper",
  );
  assert.deepStrictEqual(rootDeps?.dependsOn?.sort(), [jwt, knetic].sort());
  const govaluate = retMap.pkgList.find((c) => c["bom-ref"] === knetic);
  assert.ok(govaluate, "the module must be a component");
  assert.strictEqual(
    govaluate.purl,
    "pkg:golang/github.com/knetic/govaluate@v3.0.1-0.20171022003610-9aa49832a739%2Bincompatible",
  );
  assert.strictEqual(
    govaluate.version,
    "v3.0.1-0.20171022003610-9aa49832a739+incompatible",
  );
});
