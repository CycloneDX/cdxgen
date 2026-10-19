import { assert, describe, it } from "poku";

import {
  hasInlineCredential,
  sanitizeBomPropertyValue,
  sanitizeBomUrl,
} from "./propertySanitizer.js";

describe("propertySanitizer", () => {
  it("redacts additional token formats and sensitive nested keys", () => {
    const sanitized = sanitizeBomPropertyValue("cdx:skill:metadata", {
      apiKey: "sk-proj_secret_value_here",
      nested: {
        bearerToken: "bearer super-secret-token-value",
        endpoint: "https://example.com/path?token=abc#frag",
      },
    });

    assert.strictEqual(
      sanitized,
      JSON.stringify({
        apiKey: "[redacted]",
        nested: {
          bearerToken: "[redacted]",
          endpoint: "https://example.com/path",
        },
      }),
    );
  });

  it("summarizes commands after stripping env wrappers and absolute paths", () => {
    assert.strictEqual(
      sanitizeBomPropertyValue(
        "cdx:mcp:command",
        "OPENAI_API_KEY=sk-test /usr/bin/env python /tmp/run.py",
      ),
      "python",
    );
  });

  it("sanitizes urls without keeping credentials or tokens", () => {
    assert.strictEqual(
      sanitizeBomUrl("https://example.com/path?token=abc#frag"),
      "https://example.com/path",
    );
  });

  it("detects inline credentials the sanitizer would redact", () => {
    assert.strictEqual(
      hasInlineCredential("ghp_abcdefghijklmnopqrstuvwxyz0123456789"),
      true,
    );
    // The patterns are global; a second call must not resume mid-string.
    assert.strictEqual(
      hasInlineCredential("ghp_abcdefghijklmnopqrstuvwxyz0123456789"),
      true,
    );
    assert.strictEqual(hasInlineCredential("AKIAABCDEFGHIJKLMNOP"), true);
    assert.strictEqual(hasInlineCredential("repos"), false);
    assert.strictEqual(hasInlineCredential(undefined), false);
  });
});
