import { assert, describe, it } from "poku";

import {
  convertOSQueryResults,
  createOccurrenceEvidence,
  formatOccurrenceEvidence,
  parseOccurrenceEvidenceLocation,
} from "./evidenceUtils.js";

describe("evidence utils", () => {
  it("creates occurrence evidence with structured line details", () => {
    assert.deepStrictEqual(
      createOccurrenceEvidence("src/index.js", {
        line: 14,
        offset: 3,
        symbol: "node:crypto.createHash",
      }),
      {
        location: "src/index.js",
        line: 14,
        offset: 3,
        symbol: "node:crypto.createHash",
      },
    );
  });

  it("parses hash-style line locations", () => {
    assert.deepStrictEqual(parseOccurrenceEvidenceLocation("src/index.js#27"), {
      location: "src/index.js",
      line: 27,
    });
  });

  it("parses colon-style line and offset locations", () => {
    assert.deepStrictEqual(
      parseOccurrenceEvidenceLocation("src/index.js:29:7"),
      {
        location: "src/index.js",
        line: 29,
        offset: 7,
      },
    );
  });

  it("formats structured occurrence evidence for display", () => {
    assert.strictEqual(
      formatOccurrenceEvidence({
        location: "src/index.js",
        line: 12,
        offset: 1,
      }),
      "src/index.js:12:1",
    );
  });
});

// Restored from the retired lib/helpers/core-misc-b.poku.js, which was
// deleted along with its module during the v13 layer reorganisation even though
// the functions under test only moved.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  addEvidenceForDotnet,
  attachIdentityTools,
  extractToolRefs,
} from "./evidenceUtils.js";

it("addEvidenceForDotnet() initializes evidence before adding occurrences", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "cdxgen-dotnet-evidence-"));
  const slicesFile = path.join(tempDir, "dosai.json");
  try {
    writeFileSync(
      slicesFile,
      JSON.stringify({
        Dependencies: [
          {
            Module: "Example.dll",
            Path: "src/Program.cs",
            LineNumber: 42,
          },
        ],
      }),
    );
    const pkgList = addEvidenceForDotnet(
      [
        {
          name: "Example",
          purl: "pkg:nuget/Example@1.0.0",
          properties: [{ name: "internal:PackageFiles", value: "Example.dll" }],
        },
      ],
      slicesFile,
    );
    assert.deepStrictEqual(pkgList[0].evidence?.occurrences, [
      {
        location: "src/Program.cs",
        line: 42,
      },
    ]);
    assert.strictEqual(pkgList[0].scope, "required");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("addEvidenceForDotnet() ignores unreadable dosai JSON", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "cdxgen-dotnet-bad-json-"));
  const slicesFile = path.join(tempDir, "dosai.json");
  try {
    writeFileSync(slicesFile, "");
    const inputPkgList = [
      {
        name: "Example",
        purl: "pkg:nuget/Example@1.0.0",
        properties: [{ name: "internal:PackageFiles", value: "Example.dll" }],
      },
    ];
    const pkgList = addEvidenceForDotnet(inputPkgList, slicesFile);

    assert.strictEqual(pkgList, inputPkgList);
    assert.strictEqual(pkgList[0].evidence, undefined);
    assert.strictEqual(pkgList[0].scope, undefined);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("addEvidenceForDotnet() consumes dosai v3 PackageReachability", () => {
  const tempDir = mkdtempSync(
    path.join(tmpdir(), "cdxgen-dotnet-reachability-"),
  );
  const slicesFile = path.join(tempDir, "dosai.json");
  try {
    writeFileSync(
      slicesFile,
      JSON.stringify({
        CallGraph: {
          Edges: [
            {
              Id: "e1",
              FileName: "Controllers/EpisodesController.cs",
              LineNumber: 17,
              CalledMethodName: "System.Text.Json.JsonSerializer.Deserialize",
            },
          ],
          Nodes: [
            {
              Id: "n1",
              FileName: "System.Text.Json.dll",
              LineNumber: 0,
              ClassName: "JsonSerializer",
              Name: "Deserialize",
            },
          ],
        },
        PackageReachability: [
          {
            Purl: "pkg:nuget/System.Text.Json",
            EdgeIds: ["e1"],
            NodeIds: ["n1"],
            SourceLocations: [
              {
                Path: "Controllers/Parser.cs",
                FileName: "Parser.cs",
                LineNumber: 42,
                ColumnNumber: 13,
                Kind: "CallGraphEdge",
              },
              {
                Path: "System.Text.Json.dll",
                FileName: "System.Text.Json.dll",
                LineNumber: 1,
                Kind: "CallGraphNode",
              },
            ],
          },
        ],
      }),
    );
    const pkgList = addEvidenceForDotnet(
      [
        {
          name: "System.Text.Json",
          purl: "pkg:nuget/System.Text.Json@10.0.0",
          properties: [],
        },
      ],
      slicesFile,
    );

    assert.deepStrictEqual(pkgList[0].evidence?.occurrences, [
      {
        location: "Controllers/Parser.cs",
        line: 42,
      },
    ]);
    assert.ok(
      pkgList[0].evidence.identity.methods.some(
        (method) =>
          method.technique === "source-code-analysis" &&
          method.value === "Controllers/Parser.cs#42",
      ),
    );
    assert.ok(
      pkgList[0].properties.some(
        (property) =>
          property.name === "internal:CalledMethods" &&
          property.value.includes(
            "System.Text.Json.JsonSerializer.Deserialize",
          ),
      ),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("addEvidenceForDotnet() propagates PackageReachability confidence to component properties", () => {
  const tempDir = mkdtempSync(
    path.join(tmpdir(), "cdxgen-dotnet-reachability-confidence-"),
  );
  const slicesFile = path.join(tempDir, "dosai.json");
  try {
    writeFileSync(
      slicesFile,
      JSON.stringify({
        PackageReachability: [
          {
            Purl: "pkg:nuget/Newtonsoft.Json@12.0.3",
            ReachabilityKind: "ExternalCallGraphNode",
            Confidence: "Low",
            EvidenceKinds: ["SourceUnresolved"],
            ConfidenceReasons: [
              "Reachability is inferred from heuristic or unresolved evidence.",
              "Package assemblies were not available for semantic binding; reachability inferred from unresolved call sites. Restoring or building the tree raises this confidence.",
            ],
          },
        ],
      }),
    );
    const pkgList = addEvidenceForDotnet(
      [
        {
          name: "Newtonsoft.Json",
          purl: "pkg:nuget/Newtonsoft.Json@12.0.3",
          properties: [],
        },
      ],
      slicesFile,
    );

    const properties = Object.fromEntries(
      pkgList[0].properties.map((p) => [p.name, p.value]),
    );
    assert.strictEqual(
      properties["cdx:dosai:reachability:kind"],
      "ExternalCallGraphNode",
    );
    assert.strictEqual(properties["cdx:dosai:reachability:confidence"], "Low");
    assert.strictEqual(
      properties["cdx:dosai:reachability:evidence"],
      "SourceUnresolved",
    );
    assert.ok(
      properties["cdx:dosai:reachability:reasons"].includes(
        "Package assemblies were not available for semantic binding",
      ),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("addEvidenceForDotnet() keeps PackageReachability fallback evidence source-only", () => {
  const tempDir = mkdtempSync(
    path.join(tmpdir(), "cdxgen-dotnet-source-fallback-"),
  );
  const slicesFile = path.join(tempDir, "dosai.json");
  try {
    writeFileSync(
      slicesFile,
      JSON.stringify({
        CallGraph: {
          Edges: [
            {
              Id: "e1",
              FileName: "System.Text.Json.dll",
              LineNumber: 12,
              CalledMethodName: "System.Text.Json.JsonSerializer.Deserialize",
              CallLocation: {
                FileName: "Program.fs",
                LineNumber: 8,
              },
            },
            {
              Id: "e2",
              FileName: "Controllers/EpisodesController.cs",
              LineNumber: 17,
              CalledMethodName: "System.Text.Json.JsonSerializer.Serialize",
            },
          ],
        },
        PackageReachability: [
          {
            Purl: "pkg:nuget/System.Text.Json",
            EdgeIds: ["e1", "e2"],
          },
        ],
      }),
    );
    const pkgList = addEvidenceForDotnet(
      [
        {
          name: "System.Text.Json",
          purl: "pkg:nuget/System.Text.Json@10.0.0",
          properties: [],
        },
      ],
      slicesFile,
    );

    assert.deepStrictEqual(pkgList[0].evidence?.occurrences, [
      {
        location: "Controllers/EpisodesController.cs",
        line: 17,
      },
      {
        location: "Program.fs",
        line: 8,
      },
    ]);
    assert.ok(!JSON.stringify(pkgList[0].evidence).includes(".dll"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("addEvidenceForDotnet() preserves additional identity entries", () => {
  const tempDir = mkdtempSync(
    path.join(tmpdir(), "cdxgen-dotnet-identity-array-"),
  );
  const slicesFile = path.join(tempDir, "dosai.json");
  try {
    writeFileSync(
      slicesFile,
      JSON.stringify({
        Dependencies: [
          {
            Path: "Program.cs",
            FileName: "Program.cs",
            Name: "System.Text.Json",
            Purl: "pkg:nuget/System.Text.Json",
            LineNumber: 12,
          },
        ],
      }),
    );
    const pkgList = addEvidenceForDotnet(
      [
        {
          name: "System.Text.Json",
          purl: "pkg:nuget/System.Text.Json@10.0.0",
          evidence: {
            identity: [
              {
                field: "name",
                confidence: 0.8,
                methods: [
                  { technique: "filename", value: "packages.lock.json" },
                ],
              },
              {
                field: "purl",
                confidence: 1,
                methods: [
                  {
                    technique: "manifest-analysis",
                    value: "packages.lock.json",
                  },
                ],
              },
            ],
          },
          properties: [],
        },
      ],
      slicesFile,
    );

    assert.strictEqual(pkgList[0].evidence.identity.length, 2);
    assert.strictEqual(pkgList[0].evidence.identity[0].field, "name");
    assert.ok(
      pkgList[0].evidence.identity[1].methods.some(
        (method) =>
          method.technique === "source-code-analysis" &&
          method.value === "Program.cs#12",
      ),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("addEvidenceForDotnet() consumes dosai Dependencies with purls", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "cdxgen-dotnet-vb-deps-"));
  const slicesFile = path.join(tempDir, "dosai.json");
  try {
    writeFileSync(
      slicesFile,
      JSON.stringify({
        Dependencies: [
          {
            Path: "Program.vb",
            FileName: "Program.vb",
            Name: "Newtonsoft.Json",
            Purl: "pkg:nuget/Newtonsoft.Json@13.0.3",
            LineNumber: 4,
            ColumnNumber: 9,
          },
        ],
      }),
    );
    const pkgList = addEvidenceForDotnet(
      [
        {
          name: "Newtonsoft.Json",
          purl: "pkg:nuget/Newtonsoft.Json@13.0.3",
          properties: [],
        },
      ],
      slicesFile,
    );

    assert.deepStrictEqual(pkgList[0].evidence?.occurrences, [
      {
        location: "Program.vb",
        line: 4,
      },
    ]);
    assert.ok(
      pkgList[0].properties.some(
        (property) =>
          property.name === "internal:ImportedModules" &&
          property.value.includes("Newtonsoft.Json"),
      ),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("extractToolRefs collects unique bom-refs from metadata.tools", () => {
  assert.deepStrictEqual(
    extractToolRefs(
      {
        components: [
          { name: "trivy", "bom-ref": "pkg:generic/trivy@0.1.0" },
          { name: "trivy", "bom-ref": "pkg:generic/trivy@0.1.0" },
          { name: "cdxgen" },
        ],
        services: [{ name: "blint", "bom-ref": "urn:tool:blint" }],
      },
      (tool) => tool.name !== "cdxgen",
    ),
    ["pkg:generic/trivy@0.1.0", "urn:tool:blint"],
  );
});

it("extractToolRefs derives and persists bom-refs for external tools", () => {
  const tools = {
    components: [
      {
        group: "aquasecurity",
        name: "trivy",
        version: "dev",
      },
    ],
  };
  assert.deepStrictEqual(extractToolRefs(tools), [
    "pkg:generic/aquasecurity/trivy@dev",
  ]);
  assert.strictEqual(
    tools.components[0]["bom-ref"],
    "pkg:generic/aquasecurity/trivy@dev",
  );
});

it("attachIdentityTools adds tool references to object and array identities", () => {
  const subjects = [
    {
      evidence: {
        identity: {
          field: "purl",
          tools: ["pkg:generic/existing-tool@1.0.0"],
        },
      },
    },
    {
      evidence: {
        identity: [
          { field: "purl" },
          { field: "hash", tools: ["urn:tool:hash"] },
        ],
      },
    },
  ];
  attachIdentityTools(subjects, [
    "pkg:generic/existing-tool@1.0.0",
    "pkg:generic/trivy@0.1.0",
  ]);
  assert.deepStrictEqual(subjects[0].evidence.identity.tools, [
    "pkg:generic/existing-tool@1.0.0",
    "pkg:generic/trivy@0.1.0",
  ]);
  assert.deepStrictEqual(subjects[1].evidence.identity[0].tools, [
    "pkg:generic/existing-tool@1.0.0",
    "pkg:generic/trivy@0.1.0",
  ]);
  assert.deepStrictEqual(subjects[1].evidence.identity[1].tools, [
    "urn:tool:hash",
    "pkg:generic/existing-tool@1.0.0",
    "pkg:generic/trivy@0.1.0",
  ]);
});

describe("osquery result enhancement", () => {
  const queryObj = { purlType: "deb", name: "dev packages" };
  const results = [{ name: "libssl-dev", version: "3.0.2" }];

  it("calls the injected package lister and records what it provides", () => {
    let calledWith;
    const pkgList = convertOSQueryResults(
      "os_packages",
      queryObj,
      results,
      true,
      {
        deb: (name) => {
          calledWith = name;
          return ["/usr/lib/libssl.so"];
        },
      },
    );
    // Asserting the lister ran, not merely that the call did not throw: the
    // previous shape skipped it silently whenever it was not forwarded, which
    // produced components with no PkgProvides and no error.
    assert.strictEqual(calledWith, "libssl-dev");
    assert.ok(
      pkgList[0].properties.some(
        (p) =>
          p.name === "internal:PkgProvides" && p.value === "/usr/lib/libssl.so",
      ),
    );
  });

  it("throws when enhancement is requested without any listers", () => {
    assert.throws(
      () => convertOSQueryResults("os_packages", queryObj, results, true),
      /no osPackageListers were injected/,
    );
  });

  it("needs no listers when enhancement is not requested", () => {
    const pkgList = convertOSQueryResults(
      "os_packages",
      queryObj,
      results,
      false,
    );
    assert.ok(
      !pkgList[0].properties.some((p) => p.name === "internal:PkgProvides"),
    );
  });
});

it("addEvidenceForDotnet() gives the same evidence from a report too large to parse whole", async () => {
  // Issue 1033: dotnet/efcore produces a 1.9 GB dosai slice. The mocked limit
  // sends this small one down the same streamed path.
  const { default: esmock } = await import("esmock");
  const { default: sinon } = await import("sinon");
  const largeJson = await import("../parsers/largeJson.js");
  const indexJsonObject = sinon.spy(largeJson.indexJsonObject);
  const { addEvidenceForDotnet: addEvidenceForLargeDotnet } = await esmock(
    "./evidenceUtils.js",
    {},
    { "../parsers/largeJson.js": { MAX_JSON_TEXT_BYTES: 0, indexJsonObject } },
  );
  const tempDir = mkdtempSync(path.join(tmpdir(), "cdxgen-dotnet-large-"));
  const slicesFile = path.join(tempDir, "dosai.json");
  const packages = () => [
    {
      name: "Serilog",
      purl: "pkg:nuget/Serilog@3.1.1",
      properties: [{ name: "internal:PackageFiles", value: "Serilog.dll" }],
    },
    { name: "Polly", purl: "pkg:nuget/Polly", properties: [] },
  ];
  try {
    writeFileSync(
      slicesFile,
      JSON.stringify({
        Metadata: { Tool: "Dosai", SchemaVersion: "5.1.0" },
        Dependencies: [
          {
            Purl: "pkg:nuget/Serilog@3.1.1",
            Name: "Log",
            Path: "src/Program.cs",
            FileName: "Program.cs",
            LineNumber: 2,
          },
        ],
        Methods: Array.from({ length: 40 }, (_, i) => ({ Name: `M${i}` })),
        MethodCalls: [
          {
            Module: "Serilog.dll",
            Path: "src/Logging.cs",
            LineNumber: 9,
            ClassName: "Log",
            CalledMethod: "Information",
          },
          {
            Module: "Dosai.SourceAnalysis.CSharp.dll",
            Path: "src/Internal.cs",
            LineNumber: 4,
            ClassName: "Internal",
            CalledMethod: "Run",
          },
        ],
        AssemblyInformation: [{ Name: "Polly", Version: "8.4.0" }],
        CallGraph: {
          Edges: [
            {
              Id: "e1",
              Path: "src/Retry.cs",
              FileName: "Retry.cs",
              LineNumber: 17,
              CalledMethodName: "Polly.Policy.Handle",
            },
            { Id: "e2", Path: "src/Other.cs", FileName: "Other.cs" },
          ],
          Nodes: [
            { Id: "n1", ClassName: "Policy", Name: "Handle" },
            { Id: "n2", ClassName: "Unrelated", Name: "Other" },
          ],
        },
        PackageReachability: [
          {
            Purl: "pkg:nuget/Polly",
            ReachabilityKind: "Reachable",
            Confidence: "Medium",
            EdgeIds: ["e1"],
            NodeIds: ["n1"],
          },
        ],
      }),
    );
    const whole = addEvidenceForDotnet(packages(), slicesFile);
    const streamed = addEvidenceForLargeDotnet(packages(), slicesFile);
    sinon.assert.calledOnceWithExactly(
      indexJsonObject,
      slicesFile,
      sinon.match.object,
    );
    assert.deepStrictEqual(streamed, whole);
    assert.deepStrictEqual(
      streamed[0].evidence.occurrences.map((o) => `${o.location}#${o.line}`),
      ["src/Logging.cs#9", "src/Program.cs#2"],
    );
    // An assembly's version is not its package's version, so the assembly
    // information does not fill in the versionless Polly component.
    assert.strictEqual(streamed[1].version, undefined);
    assert.strictEqual(streamed[1].purl, "pkg:nuget/Polly");
    assert.deepStrictEqual(streamed[1].evidence.occurrences, [
      { location: "src/Retry.cs", line: 17 },
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("addEvidenceForDotnet() gives a DLL two versions ship to the version of the caller's project", () => {
  // Two projects restore two versions of Moq; both ship Moq.dll.
  const tempDir = mkdtempSync(path.join(tmpdir(), "cdxgen-dotnet-dll-"));
  const slicesFile = path.join(tempDir, "dosai.json");
  try {
    for (const project of ["A", "B"]) {
      mkdirSync(path.join(tempDir, "src", project, "obj"), { recursive: true });
      writeFileSync(
        path.join(tempDir, "src", project, "obj", "project.assets.json"),
        "{}",
      );
    }
    const packages = () => [
      {
        name: "Moq",
        version: "4.18.4",
        purl: "pkg:nuget/Moq@4.18.4",
        properties: [
          { name: "internal:PackageFiles", value: "Moq.dll" },
          {
            name: "internal:SrcFile",
            value: path.join(tempDir, "src", "A", "obj", "project.assets.json"),
          },
        ],
      },
      {
        name: "Moq",
        version: "4.20.69",
        purl: "pkg:nuget/Moq@4.20.69",
        properties: [
          { name: "internal:PackageFiles", value: "Moq.dll" },
          {
            name: "internal:SrcFile",
            value: path.join(tempDir, "src", "B", "obj", "project.assets.json"),
          },
        ],
      },
    ];
    writeFileSync(
      slicesFile,
      JSON.stringify({
        MethodCalls: [
          {
            Module: "Moq.dll",
            Path: "src/A/Tests.cs",
            LineNumber: 3,
            ClassName: "Mock",
            CalledMethod: "Setup",
          },
          {
            Module: "Moq.dll",
            Path: "src/B/Tests.cs",
            LineNumber: 7,
            ClassName: "Mock",
            CalledMethod: "Verify",
          },
          // In no project: neither version can claim it
          {
            Module: "Moq.dll",
            Path: "Shared.cs",
            LineNumber: 1,
            ClassName: "Mock",
            CalledMethod: "Of",
          },
        ],
        // dosai's purl for the B project's restore wins over the DLL name
        Dependencies: [
          {
            Purl: "pkg:nuget/Moq@4.20.69",
            Module: "Moq.dll",
            Path: "src/A/Shim.cs",
            LineNumber: 11,
            Name: "It",
          },
        ],
        CallGraph: {
          Edges: [],
          Nodes: [
            {
              Id: "lib",
              FileName: "Moq.dll",
              ClassName: "MockRepository",
              Name: "Create",
            },
          ],
        },
        PackageReachability: [
          {
            Purl: "pkg:nuget/Moq",
            ReachabilityKind: "ImportedOnly",
            SourceLocations: [{ Path: "src/A/Tests.cs", LineNumber: 3 }],
            // A frame inside the package follows the fact's own version
            NodeIds: ["lib"],
          },
          {
            Purl: "pkg:nuget/Moq@4.18.4",
            ReachabilityKind: "Reachable",
          },
        ],
      }),
    );
    const [a, b] = addEvidenceForDotnet(packages(), slicesFile, {
      srcPath: tempDir,
    });
    const locations = (pkg) =>
      pkg.evidence.occurrences.map((o) => `${o.location}#${o.line}`).sort();
    assert.deepStrictEqual(locations(a), ["src/A/Tests.cs#3"]);
    assert.deepStrictEqual(locations(b), [
      "src/A/Shim.cs#11",
      "src/B/Tests.cs#7",
    ]);
    const kindOf = (pkg) =>
      pkg.properties.find((p) => p.name === "cdx:dosai:reachability:kind")
        ?.value;
    // The fact naming the exact purl wins over the versionless one
    assert.strictEqual(kindOf(a), "Reachable");
    assert.strictEqual(kindOf(b), undefined);
    const modulesOf = (pkg) =>
      pkg.properties.find((p) => p.name === "internal:ImportedModules")?.value;
    assert.ok(modulesOf(a).includes("MockRepository"));
    assert.ok(!modulesOf(b).includes("MockRepository"));
    // Without the scanned directory the relative call sites settle nothing
    const unresolved = addEvidenceForDotnet(packages(), slicesFile);
    assert.deepStrictEqual(locations(unresolved[1]), ["src/A/Shim.cs#11"]);
    assert.strictEqual(unresolved[0].evidence?.occurrences, undefined);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("addEvidenceForDotnet() gives a framework purl's calls to the package that ships the DLL", () => {
  // dosai names a System.* assembly it cannot map to a package with the
  // framework purl pkg:nuget/System.Runtime, as it does when the tree has a
  // lock file but no restore output. The purl names no component, so the DLL
  // the package lists in internal:PackageFiles still says whose call it is.
  // Issue 4441 is fixed by leaving build-time DLLs out of that list, not by
  // dropping this fallback.
  const tempDir = mkdtempSync(
    path.join(tmpdir(), "cdxgen-dotnet-framework-purl-"),
  );
  const slicesFile = path.join(tempDir, "dosai.json");
  try {
    writeFileSync(
      slicesFile,
      JSON.stringify({
        Dependencies: [
          {
            Purl: "pkg:nuget/System.Runtime",
            Module: "System.Data.SQLite.dll",
            Namespace: "System.Data.SQLite",
            Name: "SQLiteConnection",
            Path: "App/Db.cs",
            FileName: "Db.cs",
            LineNumber: 1,
          },
        ],
        MethodCalls: [
          {
            Purl: "pkg:nuget/System.Runtime",
            Module: "System.Data.SQLite.dll",
            Path: "App/Db.cs",
            LineNumber: 7,
            ClassName: "SQLiteConnection",
            CalledMethod: "Open",
          },
          {
            // A framework call into a DLL no component lists
            Purl: "pkg:nuget/System.Runtime",
            Module: "System.Formats.Asn1.dll",
            Path: "App/Db.cs",
            LineNumber: 9,
            ClassName: "AsnWriter",
            CalledMethod: "WriteInteger",
          },
        ],
      }),
    );
    const pkgList = addEvidenceForDotnet(
      [
        {
          name: "System.Data.SQLite.Core",
          purl: "pkg:nuget/System.Data.SQLite.Core@1.0.118",
          properties: [
            {
              name: "internal:PackageFiles",
              value: "System.Data.SQLite.dll",
            },
          ],
        },
      ],
      slicesFile,
    );
    const locations = pkgList[0].evidence.occurrences.map(
      (occurrence) => `${occurrence.location}#${occurrence.line}`,
    );
    assert.deepStrictEqual(locations.sort(), ["App/Db.cs#1", "App/Db.cs#7"]);
    const methods = pkgList[0].properties.find(
      (property) => property.name === "internal:CalledMethods",
    );
    assert.ok(methods?.value.includes("Open"));
    assert.ok(!methods?.value.includes("WriteInteger"));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

it("addEvidenceForDotnet() lists a call site dosai 4 or 5 found in source and in IL once", () => {
  // dosai issue 79: a build of the scanned project gives each call a second
  // MethodCalls row from its IL. dosai 5 names the file relative to the scan
  // root like the source row, and leaves Path out when the file has no place
  // in the tree; dosai 4 keeps the PDB's path: absolute for a local build,
  // /_/ for a deterministic one, and on Linux a Windows build's whole path as
  // the file name. A call no sequence point covers names the assembly at an
  // IL offset in both.
  const tempDir = mkdtempSync(path.join(tmpdir(), "cdxgen-dotnet-il-calls-"));
  const slicesFile = path.join(tempDir, "dosai.json");
  const call = (fields) => ({
    Purl: "pkg:nuget/Newtonsoft.Json@13.0.3",
    Module: "Newtonsoft.Json.dll",
    ClassName: "JsonConvert",
    CalledMethod: "SerializeObject",
    ...fields,
  });
  const program = path.join("src", "App", "Program.cs");
  const sourceRow = call({
    Path: program,
    FileName: "Program.cs",
    LineNumber: 3,
    EvidenceKind: "SourceRoslynDirect",
  });
  const ilRow = (Path, FileName, LineNumber) =>
    call({ Path, FileName, LineNumber, EvidenceKind: "AssemblyIlDirect" });
  const assemblyRow = (Path) =>
    call({
      Path,
      FileName: "Repro.dll",
      LineNumber: 57,
      EvidenceKind: "AssemblyIlDirect",
      CalledMethod: "DeserializeObject",
    });
  const reports = {
    dosai5: [
      sourceRow,
      ilRow(program, "Program.cs", 3),
      ilRow(undefined, "JsonHelpers.cs", 12),
      ilRow(undefined, "Startup.cs", 7),
      assemblyRow(path.join("out", "Repro.dll")),
    ],
    dosai4: [
      sourceRow,
      ilRow(path.join(tempDir, program), "Program.cs", 3),
      ilRow("/_/src/Vendor/JsonHelpers.cs", "JsonHelpers.cs", 12),
      ilRow(
        String.raw`D:\a\repo\src\Startup.cs`,
        String.raw`D:\a\repo\src\Startup.cs`,
        7,
      ),
      assemblyRow(path.join(tempDir, "out", "Repro.dll")),
    ],
  };
  try {
    for (const [version, MethodCalls] of Object.entries(reports)) {
      writeFileSync(slicesFile, JSON.stringify({ MethodCalls }));
      const [pkg] = addEvidenceForDotnet(
        [
          {
            name: "Newtonsoft.Json",
            version: "13.0.3",
            purl: "pkg:nuget/Newtonsoft.Json@13.0.3",
            properties: [],
          },
        ],
        slicesFile,
        { srcPath: tempDir },
      );
      assert.deepStrictEqual(
        pkg.evidence.occurrences,
        [
          { location: "JsonHelpers.cs", line: 12 },
          { location: "Startup.cs", line: 7 },
          { location: program, line: 3 },
        ],
        version,
      );
      // The call without a source location still counts as a use
      const methods = pkg.properties.find(
        (property) => property.name === "internal:CalledMethods",
      );
      assert.ok(methods?.value.includes("DeserializeObject"), version);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("convertOSQueryResults() for OS package rows", () => {
  // The distro is what getDistroInfo() reads from the host's os-release; the
  // tests give it a fixed value so they hold on any operating system.
  const UBUNTU_2404 = {
    purlType: "deb",
    namespace: "ubuntu",
    distroId: "ubuntu-24.04",
    distroName: "noble",
  };
  const ALMALINUX_98 = {
    purlType: "rpm",
    namespace: "almalinux",
    distroId: "almalinux-9.8",
    distroName: "",
  };
  const DEB_PHP_ROW = {
    name: "php8.3-cli",
    version: "8.3.6-0ubuntu0.24.04.13",
    source: "php8.3",
    size: "5752",
    arch: "amd64",
    revision: "0ubuntu0.24.04.13",
    status: "install ok installed",
    maintainer: "Ubuntu Developers <ubuntu-devel-discuss@lists.ubuntu.com>",
    section: "php",
    priority: "optional",
    admindir: "/var/lib/dpkg",
  };
  const DEB_EPOCH_ROW = {
    ...DEB_PHP_ROW,
    name: "bsdutils",
    version: "1:2.39.3-9ubuntu6.6",
    source: "util-linux (2.39.3-9ubuntu6.6)",
    revision: "9ubuntu6.6",
    section: "utils",
    priority: "required",
  };
  const RPM_EPOCH_ROW = {
    name: "openssl-libs",
    version: "3.5.8",
    release: "1.el9_8",
    source: "openssl-3.5.8-1.el9_8.src.rpm",
    size: "7490835",
    sha1: "b3b4764c426023090093576f42ca02ea4489b381",
    arch: "x86_64",
    epoch: "1",
    install_time: "1790931855",
    vendor: "AlmaLinux",
    package_group: "Unspecified",
  };
  const RPM_PLAIN_ROW = {
    ...RPM_EPOCH_ROW,
    name: "php-cli",
    version: "8.0.30",
    release: "8.el9_8.alma.1",
    source: "php-8.0.30-8.el9_8.alma.1.src.rpm",
    epoch: "",
  };
  const BREW_QUERY = {
    purlType: "brew",
    componentType: "application",
    query: "SELECT * FROM homebrew_packages;",
  };
  const BREW_FORMULA_ROW = {
    name: "php",
    path: "/opt/homebrew/Cellar/php",
    version: "8.5.11_1",
    type: "formula",
    auto_updates: "",
    app_name: "",
  };
  const BREW_CASK_ROW = {
    name: "android-commandlinetools",
    path: "/opt/homebrew/Caskroom/android-commandlinetools",
    version: "15859902",
    type: "cask",
    auto_updates: "0",
    app_name: "",
  };

  const loadConvert = async (distro) => {
    const { default: esmock } = await import("esmock");
    const { convertOSQueryResults: convert } = await esmock(
      "./evidenceUtils.js",
      {},
      { "./osinfo.js": { getDistroInfo: () => distro } },
    );
    return convert;
  };
  const propertyNames = (component) =>
    component.properties.map((property) => property.name);
  const propertyValue = (component, name) =>
    component.properties.find((property) => property.name === name)?.value;

  it("gives deb rows the purl the container scan gives them, with no subpath", async () => {
    const convert = await loadConvert(UBUNTU_2404);
    const [php, bsdutils] = convert(
      "deb_packages",
      { purlType: "deb", query: "select * from deb_packages;" },
      [DEB_PHP_ROW, DEB_EPOCH_ROW],
    );
    assert.strictEqual(
      php.purl,
      "pkg:deb/ubuntu/php8.3-cli@8.3.6-0ubuntu0.24.04.13?arch=amd64&distro=ubuntu-24.04&distro_name=noble",
    );
    assert.strictEqual(php["bom-ref"], decodeURIComponent(php.purl));
    assert.strictEqual(php.version, "8.3.6-0ubuntu0.24.04.13");
    assert.strictEqual(
      bsdutils.purl,
      "pkg:deb/ubuntu/bsdutils@1:2.39.3-9ubuntu6.6?arch=amd64&distro=ubuntu-24.04&distro_name=noble&epoch=1",
    );
    assert.strictEqual(bsdutils.version, "1:2.39.3-9ubuntu6.6");
    for (const component of [php, bsdutils]) {
      assert.ok(!component.purl.includes("#"), component.purl);
      assert.ok(!component["bom-ref"].includes("var/lib/dpkg"));
    }
  });

  it("keeps the source package of a deb as a property and drops the dpkg directory", async () => {
    const convert = await loadConvert(UBUNTU_2404);
    const [php, bsdutils] = convert(
      "deb_packages",
      { purlType: "deb", query: "select * from deb_packages;" },
      [DEB_PHP_ROW, DEB_EPOCH_ROW],
    );
    assert.strictEqual(propertyValue(php, "cdx:deb:source"), "php8.3");
    assert.strictEqual(
      propertyValue(bsdutils, "cdx:deb:source"),
      "util-linux (2.39.3-9ubuntu6.6)",
    );
    assert.strictEqual(
      propertyValue(php, "cdx:osquery:category"),
      "deb_packages",
    );
    for (const component of [php, bsdutils]) {
      const names = propertyNames(component);
      assert.ok(!names.includes("admindir"), names.join());
      assert.ok(!names.includes("source"), names.join());
      assert.ok(names.includes("arch"));
      assert.ok(names.includes("maintainer"));
    }
    assert.strictEqual(php.publisher, DEB_PHP_ROW.maintainer);
    assert.strictEqual(php.description, "php");
    assert.strictEqual(php.scope, "optional");
  });

  it("gives rpm rows the release in the version and a non-zero epoch in version and qualifier", async () => {
    const convert = await loadConvert(ALMALINUX_98);
    const [openssl, php] = convert(
      "rpm_packages",
      { purlType: "rpm", query: "select * from rpm_packages;" },
      [RPM_EPOCH_ROW, RPM_PLAIN_ROW],
    );
    assert.strictEqual(
      openssl.purl,
      "pkg:rpm/almalinux/openssl-libs@1:3.5.8-1.el9_8?arch=x86_64&distro=almalinux-9.8&epoch=1",
    );
    assert.strictEqual(openssl.version, "1:3.5.8-1.el9_8");
    assert.strictEqual(openssl["bom-ref"], decodeURIComponent(openssl.purl));
    assert.strictEqual(
      php.purl,
      "pkg:rpm/almalinux/php-cli@8.0.30-8.el9_8.alma.1?arch=x86_64&distro=almalinux-9.8",
    );
    assert.strictEqual(php.version, "8.0.30-8.el9_8.alma.1");
    for (const component of [openssl, php]) {
      assert.ok(!component.purl.includes("#"), component.purl);
      assert.ok(!component.purl.includes("src.rpm"), component.purl);
      assert.ok(!component.purl.includes("distro_name"), component.purl);
    }
  });

  it("emits no source rpm for a key record, whose rpm database says (none)", async () => {
    const convert = await loadConvert(ALMALINUX_98);
    const [key] = convert(
      "rpm_packages",
      { purlType: "rpm", query: "select * from rpm_packages;" },
      [
        {
          name: "gpg-pubkey",
          version: "b86b3716",
          release: "61e69f29",
          source: "(none)",
          epoch: "",
          package_group: "Public Keys",
        },
      ],
    );
    assert.strictEqual(
      key.purl,
      "pkg:rpm/almalinux/gpg-pubkey@b86b3716-61e69f29?distro=almalinux-9.8",
    );
    assert.ok(!propertyNames(key).includes("cdx:rpm:sourceRpm"));
    assert.ok(!propertyNames(key).includes("source"));
  });

  it("keeps the source rpm of an rpm as a property", async () => {
    const convert = await loadConvert(ALMALINUX_98);
    const [openssl] = convert(
      "rpm_packages",
      { purlType: "rpm", query: "select * from rpm_packages;" },
      [RPM_EPOCH_ROW],
    );
    assert.strictEqual(
      propertyValue(openssl, "cdx:rpm:sourceRpm"),
      "openssl-3.5.8-1.el9_8.src.rpm",
    );
    assert.ok(!propertyNames(openssl).includes("source"));
    assert.strictEqual(propertyValue(openssl, "release"), "1.el9_8");
    assert.strictEqual(propertyValue(openssl, "epoch"), "1");
    assert.strictEqual(propertyValue(openssl, "vendor"), "AlmaLinux");
  });

  it("gives Homebrew formulae and casks the brew type, told apart by a property", async () => {
    const convert = await loadConvert(UBUNTU_2404);
    const [formula, cask] = convert("homebrew_packages", BREW_QUERY, [
      BREW_FORMULA_ROW,
      BREW_CASK_ROW,
    ]);
    assert.strictEqual(formula.purl, "pkg:brew/php@8.5.11_1");
    assert.strictEqual(formula["bom-ref"], "pkg:brew/php@8.5.11_1");
    assert.strictEqual(cask.purl, "pkg:brew/android-commandlinetools@15859902");
    assert.strictEqual(formula.type, "application");
    assert.strictEqual(propertyValue(formula, "cdx:homebrew:type"), "formula");
    assert.strictEqual(propertyValue(cask, "cdx:homebrew:type"), "cask");
    for (const component of [formula, cask]) {
      assert.ok(!component.purl.startsWith("pkg:swid"), component.purl);
      assert.ok(!component.purl.includes("#"), component.purl);
      assert.ok(!component.purl.includes("?"), component.purl);
      assert.ok(!propertyNames(component).includes("type"));
      assert.strictEqual(
        propertyValue(component, "cdx:osquery:category"),
        "homebrew_packages",
      );
    }
    assert.strictEqual(
      propertyValue(formula, "path"),
      "/opt/homebrew/Cellar/php",
    );
  });

  it("encodes a versioned formula name in the purl and the bom-ref alike", async () => {
    const convert = await loadConvert(UBUNTU_2404);
    const [formula] = convert("homebrew_packages", BREW_QUERY, [
      { ...BREW_FORMULA_ROW, name: "php@8.4", version: "8.4.26_1" },
    ]);
    assert.strictEqual(formula.purl, "pkg:brew/php%408.4@8.4.26_1");
    assert.strictEqual(formula["bom-ref"], "pkg:brew/php@8.4@8.4.26_1");
    assert.strictEqual(formula.name, "php@8.4");
  });

  it("omits the purl instead of emitting a null one when the host names no vendor", async () => {
    const convert = await loadConvert({
      purlType: "rpm",
      namespace: "",
      distroId: "",
      distroName: "",
    });
    const [php] = convert(
      "deb_packages",
      { purlType: "deb", query: "select * from deb_packages;" },
      [DEB_PHP_ROW],
    );
    assert.ok(!("purl" in php));
    assert.ok(php["bom-ref"].startsWith("osquery:deb_packages:"));
    assert.strictEqual(php.version, "8.3.6-0ubuntu0.24.04.13");
  });

  it("still runs the package lister of an enhanced OS package row", async () => {
    const convert = await loadConvert(UBUNTU_2404);
    let asked;
    const [php] = convert(
      "deb_packages",
      { purlType: "deb", query: "select * from deb_packages;" },
      [DEB_PHP_ROW],
      true,
      {
        deb: (name) => {
          asked = name;
          return ["/usr/bin/php8.3"];
        },
      },
    );
    assert.strictEqual(asked, "php8.3-cli");
    assert.strictEqual(
      propertyValue(php, "internal:PkgProvides"),
      "/usr/bin/php8.3",
    );
  });

  it("leaves the categories that are not OS packages as they were", async () => {
    const convert = await loadConvert(UBUNTU_2404);
    // An app keeps the path of its row as the subpath of its purl.
    const [app] = convert(
      "apps",
      { purlType: "swid", componentType: "application" },
      [
        {
          name: "Safari",
          version: "17.1",
          path: "/Applications/Safari.app",
          bundle_version: "19617",
        },
      ],
    );
    assert.strictEqual(
      app.purl,
      "pkg:swid/Safari@17.1?tag_id=Safari#Applications/Safari.app",
    );
    // A bare `source` column of a pypi row is still a property of that name.
    const [pypi] = convert("python_packages", { purlType: "pypi" }, [
      {
        name: "requests",
        version: "2.31.0",
        path: "/usr/lib/python3/dist-packages/requests",
        source: "pip",
      },
    ]);
    assert.strictEqual(propertyValue(pypi, "source"), "pip");
    assert.strictEqual(
      propertyValue(pypi, "cdx:osquery:category"),
      "python_packages",
    );
  });

  it("names an npm or pypi package by what it is, and records where it is as an occurrence", async () => {
    const convert = await loadConvert(UBUNTU_2404);
    const npmPath =
      "/Users/alice/.nvm/versions/node/v20.20.2/lib/node_modules/npm/node_modules/abbrev/package.json";
    const [npm] = convert("npm_packages", { purlType: "npm" }, [
      {
        name: "abbrev",
        version: "2.0.0",
        path: npmPath,
        directory: "/Users/alice/.nvm/versions/node/v20.20.2/lib/",
      },
    ]);
    assert.strictEqual(npm.purl, "pkg:npm/abbrev@2.0.0");
    assert.strictEqual(npm["bom-ref"], "pkg:npm/abbrev@2.0.0");
    assert.deepStrictEqual(npm.evidence, {
      occurrences: [{ location: npmPath }],
    });
    // The path stays a property: trust enrichment reads it.
    assert.strictEqual(propertyValue(npm, "path"), npmPath);
    const pypiPath = "/usr/lib/python3/dist-packages/requests-2.31.0.dist-info";
    const [pypi] = convert("python_packages", { purlType: "pypi" }, [
      {
        name: "requests",
        version: "2.31.0",
        path: pypiPath,
        directory: "/usr/lib/python3/dist-packages",
      },
    ]);
    assert.strictEqual(pypi.purl, "pkg:pypi/requests@2.31.0");
    assert.strictEqual(pypi["bom-ref"], "pkg:pypi/requests@2.31.0");
    assert.deepStrictEqual(pypi.evidence, {
      occurrences: [{ location: pypiPath }],
    });
  });

  it("gives a scoped npm package its scope as the namespace", async () => {
    const convert = await loadConvert(UBUNTU_2404);
    const [sdk] = convert("npm_packages", { purlType: "npm" }, [
      {
        name: "@anthropic-ai/sdk",
        version: "0.91.1",
        path: "/opt/homebrew/lib/node_modules/@anthropic-ai/sdk/package.json",
      },
    ]);
    assert.strictEqual(sdk.group, "@anthropic-ai");
    assert.strictEqual(sdk.name, "sdk");
    assert.strictEqual(sdk.purl, "pkg:npm/%40anthropic-ai/sdk@0.91.1");
    assert.strictEqual(sdk["bom-ref"], "pkg:npm/@anthropic-ai/sdk@0.91.1");
  });

  it("lists a package found at several paths once, with each path as an occurrence", async () => {
    const convert = await loadConvert(UBUNTU_2404);
    const under = (prefix) =>
      `${prefix}/lib/node_modules/npm/node_modules/abbrev/package.json`;
    const components = convert("npm_packages", { purlType: "npm" }, [
      {
        name: "abbrev",
        version: "2.0.0",
        path: under("/home/alice/.nvm/versions/node/v24.22.1"),
      },
      { name: "abbrev", version: "1.1.1", path: under("/usr") },
      {
        name: "abbrev",
        version: "2.0.0",
        path: under("/home/alice/.nvm/versions/node/v20.20.2"),
      },
    ]);
    assert.deepStrictEqual(
      components.map((component) => component["bom-ref"]),
      ["pkg:npm/abbrev@2.0.0", "pkg:npm/abbrev@1.1.1"],
    );
    assert.deepStrictEqual(components[0].evidence.occurrences, [
      { location: under("/home/alice/.nvm/versions/node/v20.20.2") },
      { location: under("/home/alice/.nvm/versions/node/v24.22.1") },
    ]);
    assert.deepStrictEqual(
      components[0].properties
        .filter((property) => property.name === "path")
        .map((property) => property.value)
        .sort(),
      [
        under("/home/alice/.nvm/versions/node/v20.20.2"),
        under("/home/alice/.nvm/versions/node/v24.22.1"),
      ],
    );
    assert.strictEqual(
      components[0].properties.filter(
        (property) => property.name === "cdx:osquery:category",
      ).length,
      1,
    );
  });
});

describe("convertApkPackages()", () => {
  const ALPINE_324 = {
    purlType: "apk",
    namespace: "alpine",
    distroId: "alpine-3.24.3",
    distroName: "alpine-3.24",
  };
  const WOLFI = {
    purlType: "apk",
    namespace: "wolfi",
    distroId: "wolfi-20230201",
    distroName: "",
  };
  const PHP84 = {
    name: "php84",
    version: "8.4.27-r0",
    arch: "x86_64",
    origin: "php84",
    maintainer: "A Maintainer <maintainer@example.org>",
    license: "PHP-3.01 BSD-3-Clause LGPL-2.0-or-later MIT Zend-2.0",
    url: "https://www.php.net/",
    description: "The PHP84 language runtime engine",
    fileCount: 1,
    files: [],
  };
  const loadConvertApk = async (distro) => {
    const { default: esmock } = await import("esmock");
    const { convertApkPackages } = await esmock(
      "./evidenceUtils.js",
      {},
      { "./osinfo.js": { getDistroInfo: () => distro } },
    );
    return convertApkPackages;
  };
  const propertyValue = (component, name) =>
    component.properties.find((property) => property.name === name)?.value;

  it("gives a package the purl the container scan gives an Alpine package", async () => {
    const convert = await loadConvertApk(ALPINE_324);
    const [php] = convert([PHP84]);
    assert.strictEqual(
      php.purl,
      "pkg:apk/alpine/php84@8.4.27-r0?arch=x86_64&distro=alpine-3.24.3&distro_name=alpine-3.24",
    );
    assert.strictEqual(php["bom-ref"], decodeURIComponent(php.purl));
    assert.strictEqual(php.name, "php84");
    assert.strictEqual(php.version, "8.4.27-r0");
    assert.ok(!php.purl.includes("#"), php.purl);
  });

  it("gives a Wolfi package the vendor of the host", async () => {
    const convert = await loadConvertApk(WOLFI);
    const [pkg] = convert([
      { ...PHP84, name: "wolfi-baselayout", version: "20230201-r30" },
    ]);
    assert.strictEqual(
      pkg.purl,
      "pkg:apk/wolfi/wolfi-baselayout@20230201-r30?arch=x86_64&distro=wolfi-20230201",
    );
  });

  it("tags the components with the apk_packages category and keeps what the row says", async () => {
    const convert = await loadConvertApk(ALPINE_324);
    const [php] = convert([PHP84]);
    assert.strictEqual(
      propertyValue(php, "cdx:osquery:category"),
      "apk_packages",
    );
    assert.strictEqual(propertyValue(php, "cdx:apk:origin"), "php84");
    assert.strictEqual(propertyValue(php, "arch"), "x86_64");
    assert.strictEqual(php.description, "The PHP84 language runtime engine");
    assert.strictEqual(php.publisher, "A Maintainer <maintainer@example.org>");
    const names = php.properties.map((property) => property.name);
    // The licence and the URL are CycloneDX fields, not properties.
    assert.ok(!names.includes("license"), names.join());
    assert.ok(!names.includes("url"), names.join());
    assert.ok(!names.includes("origin"), names.join());
    assert.ok(!names.includes("files"), names.join());
    assert.ok(!names.includes("fileCount"), names.join());
  });

  it("turns the licence list of a package into licenses, by SPDX id where it has one", async () => {
    const convert = await loadConvertApk(ALPINE_324);
    const [php] = convert([PHP84]);
    assert.deepStrictEqual(php.licenses, [
      { license: { id: "PHP-3.01" } },
      { license: { id: "BSD-3-Clause" } },
      { license: { id: "LGPL-2.0-or-later" } },
      { license: { id: "MIT" } },
      { license: { id: "Zend-2.0" } },
    ]);
    const [single] = convert([{ ...PHP84, license: "MIT" }]);
    assert.deepStrictEqual(single.licenses, [{ license: { id: "MIT" } }]);
    const [mixed] = convert([{ ...PHP84, license: "mit custom:Acme-EULA" }]);
    assert.deepStrictEqual(mixed.licenses, [
      { license: { id: "MIT" } },
      { license: { name: "custom:Acme-EULA" } },
    ]);
  });

  it("keeps an SPDX expression as one expression", async () => {
    const convert = await loadConvertApk(ALPINE_324);
    const [pkg] = convert([{ ...PHP84, license: "GPL-2.0-only AND MIT" }]);
    assert.deepStrictEqual(pkg.licenses, [
      { expression: "GPL-2.0-only AND MIT" },
    ]);
  });

  it("names a licence it cannot map instead of dropping it", async () => {
    const convert = await loadConvertApk(ALPINE_324);
    const [pkg] = convert([{ ...PHP84, license: "custom:Acme-EULA" }]);
    assert.deepStrictEqual(pkg.licenses, [
      { license: { name: "custom:Acme-EULA" } },
    ]);
  });

  it("emits no licenses for a package that declares none", async () => {
    const convert = await loadConvertApk(WOLFI);
    const { license: _license, ...withoutLicense } = PHP84;
    const [pkg] = convert([withoutLicense]);
    assert.ok(!("licenses" in pkg));
  });

  it("references the home page of a package without credentials, query or fragment", async () => {
    const convert = await loadConvertApk(ALPINE_324);
    const [php] = convert([PHP84]);
    assert.deepStrictEqual(php.externalReferences, [
      { type: "website", url: "https://www.php.net/" },
    ]);
    const [dirty] = convert([
      {
        ...PHP84,
        url: "https://user:secret@example.org/p?token=abc&x=1#frag",
      },
    ]);
    assert.deepStrictEqual(dirty.externalReferences, [
      { type: "website", url: "https://example.org/p" },
    ]);
    assert.ok(!JSON.stringify(dirty).includes("secret"));
    assert.ok(!JSON.stringify(dirty).includes("token=abc"));
  });

  it("references nothing that is not an http(s) URL", async () => {
    const convert = await loadConvertApk(ALPINE_324);
    for (const url of [
      "",
      undefined,
      "ftp://example.org/x",
      "javascript:alert(1)",
      "git@github.com:foo/bar.git",
      "not a url",
    ]) {
      const [pkg] = convert([{ ...PHP84, url }]);
      assert.ok(!("externalReferences" in pkg), `${url}`);
    }
  });

  it("matches a package against GTFOBins by its name only, as deb and rpm rows are", async () => {
    // GTFOBins looks at the description of a row too, and an apk description is
    // free text: "Alpine base dir structure" is no use of the alpine mail client.
    const { default: esmock } = await import("esmock");
    const { convertApkPackages } = await esmock(
      "./evidenceUtils.js",
      { "node:os": { platform: () => "linux" } },
      { "./osinfo.js": { getDistroInfo: () => ALPINE_324 } },
    );
    const [baselayout, php] = convertApkPackages([
      {
        ...PHP84,
        name: "alpine-baselayout",
        description: "Alpine base dir structure and init scripts",
      },
      PHP84,
    ]);
    const names = (component) =>
      component.properties.map((property) => property.name);
    assert.ok(
      !names(baselayout).some((name) => name.startsWith("cdx:gtfobins:")),
      names(baselayout).join(),
    );
    // The description is still the component's.
    assert.strictEqual(
      baselayout.description,
      "Alpine base dir structure and init scripts",
    );
    // A package whose name is a GTFOBins binary still matches by that name.
    const gtfobinsFields = php.properties.find(
      (property) => property.name === "cdx:gtfobins:matchFields",
    )?.value;
    assert.ok(
      gtfobinsFields === undefined || gtfobinsFields === "name",
      gtfobinsFields,
    );
  });

  it("converts every package and leaves out none", async () => {
    const convert = await loadConvertApk(ALPINE_324);
    const components = convert([
      PHP84,
      { ...PHP84, name: "php84-common", description: undefined },
    ]);
    assert.deepStrictEqual(
      components.map((component) => component.name),
      ["php84", "php84-common"],
    );
    assert.deepStrictEqual(convert([]), []);
  });

  it("builds a component without an architecture qualifier when the record has no architecture", async () => {
    const convert = await loadConvertApk(ALPINE_324);
    const [pkg] = convert([{ ...PHP84, arch: undefined }]);
    assert.strictEqual(
      pkg.purl,
      "pkg:apk/alpine/php84@8.4.27-r0?distro=alpine-3.24.3&distro_name=alpine-3.24",
    );
  });
});
