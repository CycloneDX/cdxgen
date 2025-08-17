import { afterEach, assert, beforeEach, describe, it } from "poku";

import { isWin } from "../helpers/utils.js";
import {
  getQueryParams,
  isAllowedHost,
  isAllowedPath,
  isAllowedWinPath,
  parseQueryString,
  parseValue,
} from "./server.js";

it("parseValue tests", () => {
  assert.deepStrictEqual(parseValue("foo"), "foo");
  assert.deepStrictEqual(parseValue("foo\n"), "foo");
  assert.deepStrictEqual(parseValue("foo\r\n"), "foo");
  assert.deepStrictEqual(parseValue(1), 1);
  assert.deepStrictEqual(parseValue("true"), true);
  assert.deepStrictEqual(parseValue("false"), false);
  assert.deepStrictEqual(parseValue(["foo", "bar", 42]), ["foo", "bar", 42]);
  assert.throws(() => parseValue({ foo: "bar" }), TypeError);
  assert.throws(() => parseValue([42, "foo", { foo: "bar" }]), TypeError);
  assert.throws(() => parseValue([42, "foo", new Error()]), TypeError);
  assert.throws(() => parseValue(["foo", "bar", new String(42)]), TypeError);
  assert.deepStrictEqual(parseValue(true), true);
  assert.deepStrictEqual(parseValue(false), false);
  assert.deepStrictEqual(parseValue(null), null);
  assert.deepStrictEqual(parseValue(undefined), undefined);
  assert.deepStrictEqual(parseValue([null, undefined, null]), [
    null,
    undefined,
    null,
  ]);
  assert.deepStrictEqual(parseValue(""), "");
  assert.deepStrictEqual(parseValue("   \n"), "   ");
  assert.deepStrictEqual(parseValue("42"), "42");
  assert.deepStrictEqual(parseValue("0"), "0");
  assert.deepStrictEqual(parseValue("-1"), "-1");
  assert.deepStrictEqual(parseValue("True"), "True");
  assert.deepStrictEqual(parseValue("False"), "False");
  assert.deepStrictEqual(parseValue(" TRUE "), " TRUE ");
  assert.deepStrictEqual(
    parseValue(["true", "false", 0, "0", null, undefined]),
    [true, false, 0, "0", null, undefined],
  );
  assert.throws(() => parseValue([["nested"]]), TypeError);
  assert.throws(() => parseValue(Symbol("test")), TypeError);
  assert.throws(() => parseValue(BigInt(42)), TypeError);
  // biome-ignore-start lint/suspicious/noEmptyBlockStatements: test
  assert.throws(() => parseValue(() => {}), TypeError);
  // biome-ignore-end lint/suspicious/noEmptyBlockStatements: test
  assert.deepStrictEqual(parseValue(Number.NaN), Number.NaN);
  assert.deepStrictEqual(
    parseValue(Number.POSITIVE_INFINITY),
    Number.POSITIVE_INFINITY,
  );
  const obj = { toString: () => "foo" };
  assert.throws(() => parseValue(obj), TypeError);
  assert.deepStrictEqual(parseValue("hello\r\n"), "hello");
});

describe("parseQueryString tests", () => {
  it("prioritizes q over body and calls parseValue for each allowed param", () => {
    const q = { foo: "1", excludeType: ["2"] };
    const body = {
      foo: "x",
      excludeType: ["3"],
      technique: ["manifest-analysis"],
    };
    const options = {};
    const result = parseQueryString(q, body, options);
    assert.deepStrictEqual(result.foo, undefined);
    assert.deepStrictEqual(result.excludeType, ["2"]);
    assert.deepStrictEqual(result.technique, ["manifest-analysis"]);
  });

  it("splits type into projectType and removes type", () => {
    const options = { type: "a,b,c" };
    const result = parseQueryString({}, {}, options);
    assert.deepStrictEqual(result.projectType, ["a", "b", "c"]);
    assert.deepStrictEqual(result.type, undefined);
  });

  it("sets installDeps to false for pre-build lifecycle", () => {
    const options = { lifecycle: "pre-build" };
    const result = parseQueryString({}, {}, options);
    assert.deepStrictEqual(result.installDeps, false);
  });
});

describe("isAllowedHost()", () => {
  let originalHosts;

  beforeEach(() => {
    originalHosts = process.env.CDXGEN_SERVER_ALLOWED_HOSTS;
  });

  afterEach(() => {
    process.env.CDXGEN_SERVER_ALLOWED_HOSTS = originalHosts;
  });

  it("returns true if CDXGEN_SERVER_ALLOWED_HOSTS is not set", () => {
    delete process.env.CDXGEN_SERVER_ALLOWED_HOSTS;
    assert.deepStrictEqual(isAllowedHost("anything"), true);
  });

  it("returns true for a hostname that is in the list", () => {
    process.env.CDXGEN_SERVER_ALLOWED_HOSTS = "foo.com,bar.com";
    assert.deepStrictEqual(isAllowedHost("foo.com"), true);
    assert.deepStrictEqual(isAllowedHost("bar.com"), true);
  });

  it("returns false for a hostname not in the list", () => {
    process.env.CDXGEN_SERVER_ALLOWED_HOSTS = "foo.com,bar.com";
    assert.deepStrictEqual(isAllowedHost("baz.com"), false);
  });

  it("treats an empty-string env var as unset (returns true)", () => {
    process.env.CDXGEN_SERVER_ALLOWED_HOSTS = "";
    assert.deepStrictEqual(isAllowedHost("whatever"), true);
  });
});

describe("isAllowedPath()", () => {
  let originalPaths;

  beforeEach(() => {
    originalPaths = process.env.CDXGEN_SERVER_ALLOWED_PATHS;
  });

  afterEach(() => {
    process.env.CDXGEN_SERVER_ALLOWED_PATHS = originalPaths;
  });

  it("returns true if CDXGEN_SERVER_ALLOWED_PATHS is not set", () => {
    delete process.env.CDXGEN_SERVER_ALLOWED_PATHS;
    assert.deepStrictEqual(isAllowedPath("/any/path"), true);
  });

  it("returns true for paths that start with an allowed prefix", () => {
    process.env.CDXGEN_SERVER_ALLOWED_PATHS = "/api,/public";
    assert.deepStrictEqual(isAllowedPath("/api/resource"), true);
    assert.deepStrictEqual(isAllowedPath("/public/index.html"), true);
  });

  it("returns false for paths that do not match any prefix", () => {
    process.env.CDXGEN_SERVER_ALLOWED_PATHS = "/api,/public";
    assert.deepStrictEqual(isAllowedPath("/private/data"), false);
  });

  it("treats an empty-string env var as unset (returns true)", () => {
    process.env.CDXGEN_SERVER_ALLOWED_PATHS = "";
    assert.deepStrictEqual(isAllowedPath("/anything"), true);
  });
});

describe("isAllowedWinPath windows tests()", () => {
  it("returns false for windows device name paths", () => {
    if (isWin) {
      assert.deepStrictEqual(isAllowedWinPath("CON:../foo"), false);
      assert.deepStrictEqual(isAllowedWinPath("X:\\foo\\..\\bar"), true);
      assert.deepStrictEqual(isAllowedWinPath("C:\\Users"), true);
      assert.deepStrictEqual(isAllowedWinPath("C:\\🚀"), true);
      assert.deepStrictEqual(isAllowedWinPath("C:"), true);
      assert.deepStrictEqual(isAllowedWinPath("c:"), true);
      assert.deepStrictEqual(isAllowedWinPath("CON:"), false);
      assert.deepStrictEqual(isAllowedWinPath("COM¹:"), false);
      assert.deepStrictEqual(isAllowedWinPath("COM¹:../foo"), false);
      for (const d of [
        "PRN:.\\..\\bar",
        "LpT5:/another/path",
        "PRN:.././../etc/passwd",
        "AUX:/foo\\bar/baz",
        "COM¹:/printer/foo",
        "LPT³:/C:\\Users\\cdxgen//..\\",
        "COM²:LPT³:.\\../../..\\",
        "С:\\",
        "Ϲ:\\",
        "Ⅽ:\\",
        "C\u0301:\\",
        "C\\u0308:\\",
        "C\u00A0:\\",
        "C\u2000:\\",
        "C\u2003:\\",
        "C\\u202E:\\",
        "C\\u202D:\\",
        "😀:\\",
        "$:\\",
        "CD:\\",
        "ABC:\\",
        "con:\\",
        "Con:\\",
        "cOn:\\",
        "COM1.txt:\\",
        "C\\u200B:\\",
        "C\\u200D:\\",
        "C\\\\u29F5\\",
        "🚀:\\",
        "⚡:\\",
      ]) {
        assert.deepStrictEqual(isAllowedWinPath(d), false);
      }
    }
  });
});

describe("getQueryParams", () => {
  // Mock request objects for different scenarios
  const createMockRequest = (url, host = "localhost", protocol = "http") => ({
    url,
    headers: { host },
    protocol,
  });

  it("should parse simple query parameters", () => {
    const req = createMockRequest(
      "/sbom?url=https://example.com&multiProject=true&type=js",
    );
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      url: "https://example.com",
      multiProject: "true",
      type: "js",
    });
  });

  it("should handle query parameters with special characters", () => {
    const req = createMockRequest(
      "/search?q=hello%20world&filter=category%3Dtech",
    );
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      q: "hello world",
      filter: "category=tech",
    });
  });

  it("should handle multiple values for the same parameter", () => {
    const req = createMockRequest("/api?tags=javascript&tags=react&tags=node");
    const result = getQueryParams(req);

    // URLSearchParams.entries() returns the first value when there are duplicates
    assert.deepStrictEqual(result, {
      tags: ["javascript", "react", "node"],
    });
  });

  it("should handle empty query string", () => {
    const req = createMockRequest("/sbom");
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {});
  });

  it("should handle query string with only question mark", () => {
    const req = createMockRequest("/sbom?");
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {});
  });

  it("should handle parameters without values", () => {
    const req = createMockRequest("/api?flag1&flag2&param=value");
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      flag1: "",
      flag2: "",
      param: "value",
    });
  });

  it("should handle custom host", () => {
    const req = createMockRequest(
      "/endpoint?param1=value1",
      "api.example.com:3000",
    );
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      param1: "value1",
    });
  });

  it("should handle HTTPS protocol", () => {
    const req = createMockRequest(
      "/secure?token=abc123",
      "secure.example.com",
      "https",
    );
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      token: "abc123",
    });
  });

  it("should handle complex URL with path segments", () => {
    const req = createMockRequest(
      "/api/v1/users/search?name=john&age=25&active=true",
    );
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      name: "john",
      age: "25",
      active: "true",
    });
  });

  it("should handle encoded parameters", () => {
    const req = createMockRequest(
      "/search?q=hello%20world%21&category=web%20development",
    );
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      q: "hello world!",
      category: "web development",
    });
  });

  it("should return empty object when url is undefined", () => {
    const req = createMockRequest(undefined);
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {});
  });

  it("should handle numeric values as strings", () => {
    const req = createMockRequest("/calculate?x=10&y=20&operation=add");
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      x: "10",
      y: "20",
      operation: "add",
    });
  });

  it("should handle boolean-like values as strings", () => {
    const req = createMockRequest("/config?debug=true&verbose=false&enabled=1");
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      debug: "true",
      verbose: "false",
      enabled: "1",
    });
  });

  // Error handling tests
  it("should handle malformed URL gracefully", () => {
    const req = createMockRequest("not-a-valid-url");
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {});
  });

  it("should handle empty host gracefully", () => {
    const req = {
      url: "/test?param=value",
      headers: { host: "" },
      protocol: "http",
    };
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      param: "value",
    });
  });

  it("should handle missing headers gracefully", () => {
    const req = {
      url: "/test?param=value",
      headers: {},
      protocol: "http",
    };
    const result = getQueryParams(req);

    assert.deepStrictEqual(result, {
      param: "value",
    });
  });
});
