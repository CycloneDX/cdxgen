import { assert, describe, it } from "poku";

import {
  expandBomAuditCategories,
  validateBomAuditCategories,
} from "./auditCategories.js";

describe("auditCategories", () => {
  it("keeps host-topology as a direct category", () => {
    assert.deepStrictEqual(expandBomAuditCategories("host-topology"), [
      "host-topology",
    ]);
  });

  it("expands the host alias to the HBOM packs plus host-topology", () => {
    assert.deepStrictEqual(expandBomAuditCategories("host"), [
      "hbom-security",
      "hbom-performance",
      "hbom-compliance",
      "host-topology",
    ]);
  });

  it("expands the golem alias to all Go Evinse rule packs", () => {
    assert.deepStrictEqual(expandBomAuditCategories("golem"), [
      "golem-security",
      "golem-performance",
      "golem-compliance",
    ]);
  });

  it("expands the ai-bom alias to AI-BOM and agent inventory rule packs", () => {
    assert.deepStrictEqual(expandBomAuditCategories("ai-bom"), [
      "ai-governance",
      "ai-security",
      "ai-performance",
      "ai-agent",
      "mcp-server",
    ]);
  });

  it("accepts host-topology during validation", () => {
    const validation = validateBomAuditCategories("host-topology", [
      { category: "host-topology" },
      { category: "hbom-security" },
    ]);
    assert.deepStrictEqual(validation.categories, ["host-topology"]);
    assert.deepStrictEqual(validation.expandedCategories, ["host-topology"]);
  });

  it("accepts the ai-bom alias during validation", () => {
    const validation = validateBomAuditCategories("ai-bom", [
      { category: "ai-governance" },
      { category: "ai-security" },
      { category: "ai-performance" },
      { category: "ai-agent" },
      { category: "mcp-server" },
    ]);
    assert.deepStrictEqual(validation.categories, ["ai-bom"]);
    assert.deepStrictEqual(validation.expandedCategories, [
      "ai-governance",
      "ai-security",
      "ai-performance",
      "ai-agent",
      "mcp-server",
    ]);
  });
});

// Restored from the retired lib/helpers/core-misc-b.poku.js, which was
// deleted along with its module during the v13 layer reorganisation even though
// the functions under test only moved.

import { getDefaultBomAuditCategories } from "./auditCategories.js";

it("getDefaultBomAuditCategories tests", () => {
  assert.strictEqual(
    getDefaultBomAuditCategories({}, "/home/u/cdx-hbom-wt/bin/cdxgen.js"),
    undefined,
  );
  assert.strictEqual(
    getDefaultBomAuditCategories({}, "C:\\tools\\hbom.exe"),
    "hbom-security,hbom-performance,hbom-compliance",
  );
  assert.strictEqual(getDefaultBomAuditCategories({}, "cdxgen"), undefined);
  assert.strictEqual(
    getDefaultBomAuditCategories({ projectType: ["os"] }, "cdxgen"),
    "obom-runtime",
  );
  assert.strictEqual(
    getDefaultBomAuditCategories({ projectType: ["linux"] }, "cdxgen"),
    "obom-runtime",
  );
  assert.strictEqual(
    getDefaultBomAuditCategories({ projectType: ["os", "js"] }, "cdxgen"),
    undefined,
  );
  assert.strictEqual(
    getDefaultBomAuditCategories({ projectType: ["hbom"] }, "cdxgen"),
    "hbom-security,hbom-performance,hbom-compliance",
  );
  assert.strictEqual(
    getDefaultBomAuditCategories({ projectType: ["hardware"] }, "cdxgen"),
    "hbom-security,hbom-performance,hbom-compliance",
  );
  assert.strictEqual(
    getDefaultBomAuditCategories(
      { includeRuntime: true, projectType: ["hbom"] },
      "cdxgen",
    ),
    "hbom-security,hbom-performance,hbom-compliance,host-topology",
  );
  assert.strictEqual(
    getDefaultBomAuditCategories({ projectType: ["js"] }, "obom"),
    "obom-runtime",
  );
  assert.strictEqual(
    getDefaultBomAuditCategories({ projectType: ["js"] }, "hbom"),
    "hbom-security,hbom-performance,hbom-compliance",
  );
});
