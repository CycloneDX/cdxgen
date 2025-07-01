import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  test,
} from "@jest/globals";

import {
  isAllowedHost,
  isAllowedPath,
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
