import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  test,
} from "@jest/globals";

import { isWin } from "../helpers/utils.js";
import {
  getQueryParams,
  isAllowedHost,
  isAllowedPath,
  isAllowedWinPath,
  parseQueryString,
  parseValue,
} from "./server.js";

test("parseValue tests", () => {
  expect(parseValue("foo")).toEqual("foo");
  expect(parseValue("foo\n")).toEqual("foo");
  expect(parseValue("foo\r\n")).toEqual("foo");
  expect(parseValue(1)).toEqual(1);
  expect(parseValue("true")).toEqual(true);
  expect(parseValue("false")).toEqual(false);
  expect(parseValue(["foo", "bar", 42])).toEqual(["foo", "bar", 42]);
  expect(() => parseValue({ foo: "bar" })).toThrow(TypeError);
  expect(() => parseValue([42, "foo", { foo: "bar" }])).toThrow(TypeError);
  expect(() => parseValue([42, "foo", new Error()])).toThrow(TypeError);
  expect(() => parseValue(["foo", "bar", new String(42)])).toThrow(TypeError);
  expect(parseValue(true)).toEqual(true);
  expect(parseValue(false)).toEqual(false);
  expect(parseValue(null)).toEqual(null);
  expect(parseValue(undefined)).toEqual(undefined);
  expect(parseValue([null, undefined, null])).toEqual([null, undefined, null]);
  expect(parseValue("")).toEqual("");
  expect(parseValue("   \n")).toEqual("   ");
  expect(parseValue("42")).toEqual("42");
  expect(parseValue("0")).toEqual("0");
  expect(parseValue("-1")).toEqual("-1");
  expect(parseValue("True")).toEqual("True");
  expect(parseValue("False")).toEqual("False");
  expect(parseValue(" TRUE ")).toEqual(" TRUE ");
  expect(parseValue(["true", "false", 0, "0", null, undefined])).toEqual([
    true,
    false,
    0,
    "0",
    null,
    undefined,
  ]);
  expect(() => parseValue([["nested"]])).toThrow(TypeError);
  expect(() => parseValue(Symbol("test"))).toThrow(TypeError);
  expect(() => parseValue(BigInt(42))).toThrow(TypeError);
  // biome-ignore-start lint/suspicious/noEmptyBlockStatements: test
  expect(() => parseValue(() => {})).toThrow(TypeError);
  // biome-ignore-end lint/suspicious/noEmptyBlockStatements: test
  expect(parseValue(Number.NaN)).toBeNaN();
  expect(parseValue(Number.POSITIVE_INFINITY)).toEqual(
    Number.POSITIVE_INFINITY,
  );
  const obj = { toString: () => "foo" };
  expect(() => parseValue(obj)).toThrow(TypeError);
  expect(parseValue("hello\r\n")).toEqual("hello");
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
    expect(result.foo).toBeUndefined();
    expect(result.excludeType).toEqual(["2"]);
    expect(result.technique).toEqual(["manifest-analysis"]);
  });

  it("splits type into projectType and removes type", () => {
    const options = { type: "a,b,c" };
    const result = parseQueryString({}, {}, options);
    expect(result.projectType).toEqual(["a", "b", "c"]);
    expect(result.type).toBeUndefined();
  });

  it("sets installDeps to false for pre-build lifecycle", () => {
    const options = { lifecycle: "pre-build" };
    const result = parseQueryString({}, {}, options);
    expect(result.installDeps).toBe(false);
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
    expect(isAllowedHost("anything")).toBe(true);
  });

  it("returns true for a hostname that is in the list", () => {
    process.env.CDXGEN_SERVER_ALLOWED_HOSTS = "foo.com,bar.com";
    expect(isAllowedHost("foo.com")).toBe(true);
    expect(isAllowedHost("bar.com")).toBe(true);
  });

  it("returns false for a hostname not in the list", () => {
    process.env.CDXGEN_SERVER_ALLOWED_HOSTS = "foo.com,bar.com";
    expect(isAllowedHost("baz.com")).toBe(false);
  });

  it("treats an empty-string env var as unset (returns true)", () => {
    process.env.CDXGEN_SERVER_ALLOWED_HOSTS = "";
    expect(isAllowedHost("whatever")).toBe(true);
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
    expect(isAllowedPath("/any/path")).toBe(true);
  });

  it("returns true for paths that start with an allowed prefix", () => {
    process.env.CDXGEN_SERVER_ALLOWED_PATHS = "/api,/public";
    expect(isAllowedPath("/api/resource")).toBe(true);
    expect(isAllowedPath("/public/index.html")).toBe(true);
  });

  it("returns false for paths that do not match any prefix", () => {
    process.env.CDXGEN_SERVER_ALLOWED_PATHS = "/api,/public";
    expect(isAllowedPath("/private/data")).toBe(false);
  });

  it("treats an empty-string env var as unset (returns true)", () => {
    process.env.CDXGEN_SERVER_ALLOWED_PATHS = "";
    expect(isAllowedPath("/anything")).toBe(true);
  });
});

describe("isAllowedWinPath windows tests()", () => {
  it("returns false for windows device name paths", () => {
    if (isWin) {
      expect(isAllowedWinPath("CON:../foo")).toBe(false);
      expect(isAllowedWinPath("X:\\foo\\..\\bar")).toBe(true);
      expect(isAllowedWinPath("C:\\Users")).toBe(true);
      expect(isAllowedWinPath("C:\\🚀")).toBe(true);
      expect(isAllowedWinPath("C:")).toBe(true);
      expect(isAllowedWinPath("c:")).toBe(true);
      expect(isAllowedWinPath("CON:")).toBe(false);
      expect(isAllowedWinPath("COM¹:")).toBe(false);
      expect(isAllowedWinPath("COM¹:../foo")).toBe(false);
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
        expect(isAllowedWinPath(d)).toBe(false);
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

  test("should parse simple query parameters", () => {
    const req = createMockRequest(
      "/sbom?url=https://example.com&multiProject=true&type=js",
    );
    const result = getQueryParams(req);

    expect(result).toEqual({
      url: "https://example.com",
      multiProject: "true",
      type: "js",
    });
  });

  test("should handle query parameters with special characters", () => {
    const req = createMockRequest(
      "/search?q=hello%20world&filter=category%3Dtech",
    );
    const result = getQueryParams(req);

    expect(result).toEqual({
      q: "hello world",
      filter: "category=tech",
    });
  });

  test("should handle multiple values for the same parameter", () => {
    const req = createMockRequest("/api?tags=javascript&tags=react&tags=node");
    const result = getQueryParams(req);

    // URLSearchParams.entries() returns the first value when there are duplicates
    expect(result).toEqual({
      tags: ["javascript", "react", "node"],
    });
  });

  test("should handle empty query string", () => {
    const req = createMockRequest("/sbom");
    const result = getQueryParams(req);

    expect(result).toEqual({});
  });

  test("should handle query string with only question mark", () => {
    const req = createMockRequest("/sbom?");
    const result = getQueryParams(req);

    expect(result).toEqual({});
  });

  test("should handle parameters without values", () => {
    const req = createMockRequest("/api?flag1&flag2&param=value");
    const result = getQueryParams(req);

    expect(result).toEqual({
      flag1: "",
      flag2: "",
      param: "value",
    });
  });

  test("should handle custom host", () => {
    const req = createMockRequest(
      "/endpoint?param1=value1",
      "api.example.com:3000",
    );
    const result = getQueryParams(req);

    expect(result).toEqual({
      param1: "value1",
    });
  });

  test("should handle HTTPS protocol", () => {
    const req = createMockRequest(
      "/secure?token=abc123",
      "secure.example.com",
      "https",
    );
    const result = getQueryParams(req);

    expect(result).toEqual({
      token: "abc123",
    });
  });

  test("should handle complex URL with path segments", () => {
    const req = createMockRequest(
      "/api/v1/users/search?name=john&age=25&active=true",
    );
    const result = getQueryParams(req);

    expect(result).toEqual({
      name: "john",
      age: "25",
      active: "true",
    });
  });

  test("should handle encoded parameters", () => {
    const req = createMockRequest(
      "/search?q=hello%20world%21&category=web%20development",
    );
    const result = getQueryParams(req);

    expect(result).toEqual({
      q: "hello world!",
      category: "web development",
    });
  });

  test("should return empty object when url is undefined", () => {
    const req = createMockRequest(undefined);
    const result = getQueryParams(req);

    expect(result).toEqual({});
  });

  test("should handle numeric values as strings", () => {
    const req = createMockRequest("/calculate?x=10&y=20&operation=add");
    const result = getQueryParams(req);

    expect(result).toEqual({
      x: "10",
      y: "20",
      operation: "add",
    });
  });

  test("should handle boolean-like values as strings", () => {
    const req = createMockRequest("/config?debug=true&verbose=false&enabled=1");
    const result = getQueryParams(req);

    expect(result).toEqual({
      debug: "true",
      verbose: "false",
      enabled: "1",
    });
  });

  // Error handling tests
  test("should handle malformed URL gracefully", () => {
    const req = createMockRequest("not-a-valid-url");
    const result = getQueryParams(req);

    expect(result).toEqual({});
  });

  test("should handle empty host gracefully", () => {
    const req = {
      url: "/test?param=value",
      headers: { host: "" },
      protocol: "http",
    };
    const result = getQueryParams(req);

    expect(result).toEqual({
      param: "value",
    });
  });

  test("should handle missing headers gracefully", () => {
    const req = {
      url: "/test?param=value",
      headers: {},
      protocol: "http",
    };
    const result = getQueryParams(req);

    expect(result).toEqual({
      param: "value",
    });
  });
});
