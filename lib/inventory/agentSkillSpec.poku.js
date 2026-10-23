import { assert, describe, it } from "poku";

import { isAgentSkillSpecValid } from "./agentSkillSpec.js";

describe("isAgentSkillSpecValid()", () => {
  it("accepts a lowercase name and a description of up to 1024 characters", () => {
    assert.strictEqual(
      isAgentSkillSpecValid({ name: "pdf-tools", description: "Fill forms." }),
      true,
    );
    assert.strictEqual(
      isAgentSkillSpecValid({ name: "a", description: "d".repeat(1024) }),
      true,
    );
  });

  it("rejects what the open Agent Skills constraints do not allow", () => {
    for (const metadata of [
      undefined,
      {},
      { name: "", description: "x" },
      { name: "PDF-Tools", description: "x" },
      { name: "pdf tools", description: "x" },
      { name: "p".repeat(65), description: "x" },
      { name: "pdf-tools", description: "" },
      { name: "pdf-tools", description: "d".repeat(1025) },
      { name: "pdf-tools", description: 42 },
    ]) {
      assert.strictEqual(
        isAgentSkillSpecValid(metadata),
        false,
        JSON.stringify(metadata),
      );
    }
  });
});
