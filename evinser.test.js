import { expect, test } from "@jest/globals";

import {
  constructServiceName,
  detectServicesFromUsages,
  extractEndpoints
} from "./evinser.js";

import { readFileSync } from "node:fs";

test("Service detection test", () => {
  const usageSlice = JSON.parse(
    readFileSync("./test/data/usages.json", { encoding: "utf-8" })
  );
  const objectSlices = usageSlice.objectSlices;
  for (const slice of objectSlices) {
    const servicesMap = detectServicesFromUsages("java", slice);
    expect(servicesMap).toBeDefined();
    const serviceName = constructServiceName("java", slice);
    expect(serviceName).toBeDefined();
  }
});

test("extract endpoints test", () => {
  expect(
    extractEndpoints("java", '@GetMapping(value = { "/", "/home" })')
  ).toEqual(["/", "/home"]);
  expect(
    extractEndpoints(
      "java",
      '@PostMapping(value = "/issue", consumes = MediaType.APPLICATION_XML_VALUE)'
    )
  ).toEqual(["/issue"]);
  expect(extractEndpoints("java", '@GetMapping("/token")')).toEqual(["/token"]);
});
