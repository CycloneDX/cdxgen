import { readFileSync as actualReadFileSync } from "node:fs";

import esmock from "esmock";
import { assert, describe, it } from "poku";
import sinon from "sinon";

import { validateBom, validateRefs } from "./bomValidator.js";

const validCycloneDx20Bom = {
  specFormat: "CycloneDX",
  specVersion: "2.0",
  serialNumber: "urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79",
  version: 1,
  metadata: {
    component: {
      "bom-ref": "pkg:generic/demo@1.0.0",
      name: "demo",
      purl: "pkg:generic/demo@1.0.0",
      type: "application",
      version: "1.0.0",
    },
    tools: {
      components: [{ type: "application", name: "cdxgen", version: "12.4.0" }],
    },
  },
  components: [
    {
      "bom-ref": "pkg:npm/lodash@4.17.21",
      name: "lodash",
      purl: "pkg:npm/lodash@4.17.21",
      type: "library",
      version: "4.17.21",
    },
  ],
  dependencies: [
    {
      ref: "pkg:generic/demo@1.0.0",
      dependsOn: ["pkg:npm/lodash@4.17.21"],
    },
    { ref: "pkg:npm/lodash@4.17.21", dependsOn: [] },
  ],
};

describe("validateBom()", () => {
  it("validates CycloneDX 2.0-dev JSON against the bundled schema", async () => {
    assert.strictEqual(await validateBom(validCycloneDx20Bom), true);
  });

  it("returns a clear validation failure for unsupported spec versions", async () => {
    const readFileSyncStub = sinon.stub();
    const consoleLogStub = sinon.stub(console, "log");
    try {
      const { validateBom } = await esmock("./bomValidator.js", {
        "node:fs": {
          readFileSync: readFileSyncStub,
        },
      });

      assert.strictEqual(
        await validateBom({ bomFormat: "CycloneDX", specVersion: "2.0.1" }),
        false,
      );
      sinon.assert.notCalled(readFileSyncStub);
      sinon.assert.calledWithMatch(
        consoleLogStub,
        "Unsupported CycloneDX specVersion '2.0.1'.",
      );
    } finally {
      consoleLogStub.restore();
    }
  });

  it("caches compiled CycloneDX schema validators by spec version", async () => {
    // Pre-compiled validators are loaded via dynamic import(); the second
    // call must reuse the cached promise rather than re-importing.
    const readFileSyncStub = sinon
      .stub()
      .callsFake((...args) => actualReadFileSync(...args));
    const { validateBom } = await esmock("./bomValidator.js", {
      "node:fs": {
        readFileSync: readFileSyncStub,
      },
    });

    assert.strictEqual(await validateBom(validCycloneDx20Bom), true);
    const readCountAfterFirstValidation = readFileSyncStub.callCount;

    assert.strictEqual(await validateBom(validCycloneDx20Bom), true);
    assert.strictEqual(
      readFileSyncStub.callCount,
      readCountAfterFirstValidation,
    );
  });
});

describe("validateSpdx()", () => {
  it("lazy-loads the bundled SPDX export schema on first validation call", async () => {
    const readFileSyncStub = sinon
      .stub()
      .returns(
        '{"type":"object","properties":{"@context":{"const":"https://spdx.org/rdf/3.0.1/spdx-context.jsonld"},"@graph":{"type":"array"}}}',
      );
    const { validateSpdx } = await esmock("./bomValidator.js", {
      "node:fs": {
        readFileSync: readFileSyncStub,
      },
      "../ecosystems/utils.js": {
        DEBUG_MODE: false,
        dirNameStr: "/tmp",
        isPartialTree: sinon.stub().returns(false),
      },
      "../stages/postgen/spdxConverter.js": {
        SPDX_JSONLD_CONTEXT: "https://spdx.org/rdf/3.0.1/spdx-context.jsonld",
        SPDX_SPEC_VERSION: "3.0.1",
      },
    });

    sinon.assert.notCalled(readFileSyncStub);
    assert.strictEqual(
      validateSpdx({
        "@context": "https://spdx.org/rdf/3.0.1/spdx-context.jsonld",
        "@graph": [],
      }),
      false,
    );
    sinon.assert.calledOnce(readFileSyncStub);
  });

  it("caches the bundled SPDX export schema between validation calls", async () => {
    const readFileSyncStub = sinon
      .stub()
      .returns(
        '{"type":"object","properties":{"@context":{"const":"https://spdx.org/rdf/3.0.1/spdx-context.jsonld"},"@graph":{"type":"array"}}}',
      );
    const { validateSpdx } = await esmock("./bomValidator.js", {
      "node:fs": {
        readFileSync: readFileSyncStub,
      },
      "../ecosystems/utils.js": {
        DEBUG_MODE: false,
        dirNameStr: "/tmp",
        isPartialTree: sinon.stub().returns(false),
      },
      "../stages/postgen/spdxConverter.js": {
        SPDX_JSONLD_CONTEXT: "https://spdx.org/rdf/3.0.1/spdx-context.jsonld",
        SPDX_SPEC_VERSION: "3.0.1",
      },
    });

    validateSpdx({
      "@context": "https://spdx.org/rdf/3.0.1/spdx-context.jsonld",
      "@graph": [],
    });
    validateSpdx({
      "@context": "https://spdx.org/rdf/3.0.1/spdx-context.jsonld",
      "@graph": [],
    });

    sinon.assert.calledOnce(readFileSyncStub);
  });
});

describe("idn-email enforcement", () => {
  // ajv-formats has no idn-email and `strict: false` accepts any unknown
  // format, so contact addresses went unchecked here while `cdxrs validate`
  // rejected them. cdxgen registers the format itself.
  const bomWithSupplierEmail = (email) => ({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: "urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79",
    version: 1,
    metadata: {
      component: {
        "bom-ref": "root",
        name: "demo",
        purl: "pkg:generic/demo@1.0.0",
        type: "application",
        version: "1.0.0",
      },
      supplier: { name: "acme", contact: [{ name: "ops", email }] },
    },
    components: [],
    dependencies: [{ dependsOn: [], ref: "root" }],
  });

  it("accepts a valid contact address", async () => {
    assert.equal(
      await validateBom(bomWithSupplierEmail("ops@acme.example")),
      true,
    );
  });

  it("rejects a contact address that is not an email", async () => {
    assert.equal(
      await validateBom(bomWithSupplierEmail("plainly not an email")),
      false,
    );
  });
});

describe("uniqueItems enforcement", () => {
  const bomWith = (overrides) => ({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: "urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79",
    version: 1,
    metadata: {
      component: {
        "bom-ref": "root",
        name: "demo",
        purl: "pkg:generic/demo@1.0.0",
        type: "application",
        version: "1.0.0",
      },
    },
    components: [
      {
        "bom-ref": "pkg:npm/left-pad@1.3.0",
        name: "left-pad",
        purl: "pkg:npm/left-pad@1.3.0",
        type: "library",
        version: "1.3.0",
      },
    ],
    dependencies: [{ dependsOn: [], ref: "root" }],
    ...overrides,
  });
  const duplicated = (component) => [
    structuredClone(component),
    structuredClone(component),
  ];

  it("accepts a document whose arrays hold no repeats", async () => {
    assert.equal(await validateBom(bomWith({})), true);
  });

  it("rejects a repeated entry in components", async () => {
    const bom = bomWith({});
    assert.equal(
      await validateBom(bomWith({ components: duplicated(bom.components[0]) })),
      false,
    );
  });

  it("rejects a repeated entry in a nested components array", async () => {
    const bom = bomWith({});
    const parent = {
      "bom-ref": "pkg:npm/parent@1.0.0",
      components: duplicated(bom.components[0]),
      name: "parent",
      purl: "pkg:npm/parent@1.0.0",
      type: "library",
      version: "1.0.0",
    };
    assert.equal(await validateBom(bomWith({ components: [parent] })), false);
  });

  it("rejects a repeated reference in dependsOn", async () => {
    assert.equal(
      await validateBom(
        bomWith({
          dependencies: [
            {
              dependsOn: ["pkg:npm/left-pad@1.3.0", "pkg:npm/left-pad@1.3.0"],
              ref: "root",
            },
          ],
        }),
      ),
      false,
    );
  });

  it("distinguishes entries that differ only in a nested value", async () => {
    const bom = bomWith({});
    const first = structuredClone(bom.components[0]);
    const second = structuredClone(bom.components[0]);
    first["bom-ref"] = "pkg:npm/left-pad@1.3.0#a";
    second["bom-ref"] = "pkg:npm/left-pad@1.3.0#b";
    first.properties = [{ name: "cdx:npm:kind", value: "a" }];
    second.properties = [{ name: "cdx:npm:kind", value: "b" }];
    assert.equal(
      await validateBom(bomWith({ components: [first, second] })),
      true,
    );
  });
});

describe("validateRefs()", () => {
  it("treats a missing dependsOn as empty instead of throwing", () => {
    // Protobuf round-trips drop empty dependsOn lists, including the parent's.
    const bomJson = {
      metadata: {
        component: { "bom-ref": "pkg:npm/app@1.0.0", name: "app" },
      },
      components: [{ "bom-ref": "pkg:npm/a@1.0.0", name: "a" }],
      dependencies: [{ ref: "pkg:npm/app@1.0.0" }, { ref: "pkg:npm/a@1.0.0" }],
    };
    assert.strictEqual(validateRefs(bomJson), true);
  });
});
