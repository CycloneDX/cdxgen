import { expect, test } from "@jest/globals";

import {
  constructServiceName,
  detectServicesFromUsages,
  extractEndpoints,
  parseSemanticSlices,
} from "./evinser.js";

import { readFileSync } from "node:fs";

test("Service detection test", () => {
  const usageSlice = JSON.parse(
    readFileSync("./test/data/usages.json", { encoding: "utf-8" }),
  );
  const objectSlices = usageSlice.objectSlices;
  const servicesMap = {};
  for (const slice of objectSlices) {
    detectServicesFromUsages("java", slice, servicesMap);
    expect(servicesMap).toBeDefined();
    const serviceName = constructServiceName("java", slice);
    expect(serviceName).toBeDefined();
  }
});

test("extract endpoints test", () => {
  expect(
    extractEndpoints("java", '@GetMapping(value = { "/", "/home" })'),
  ).toEqual(["/", "/home"]);
  expect(
    extractEndpoints(
      "java",
      '@PostMapping(value = "/issue", consumes = MediaType.APPLICATION_XML_VALUE)',
    ),
  ).toEqual(["/issue"]);
  expect(extractEndpoints("java", '@GetMapping("/token")')).toEqual(["/token"]);
  expect(
    extractEndpoints(
      "javascript",
      'router.use("/api/v2/users",userRoutes.routes(),userRoutes.allowedMethods())',
    ),
  ).toEqual(["/api/v2/users"]);
  expect(
    extractEndpoints(
      "javascript",
      "app.use('/encryptionkeys', serveIndexMiddleware, serveIndex('encryptionkeys', { icons: true, view: 'details' }))",
    ),
  ).toEqual(["/encryptionkeys"]);
  expect(
    extractEndpoints(
      "javascript",
      "app.use(express.static(path.resolve('frontend/dist/frontend')))",
    ),
  ).toEqual(["frontend/dist/frontend"]);
  expect(
    extractEndpoints(
      "javascript",
      "app.use('/ftp(?!/quarantine)/:file', fileServer())",
    ),
  ).toEqual(["/ftp(?!/quarantine)/:file"]);
  expect(
    extractEndpoints(
      "javascript",
      "app.use('/rest/basket/:id', security.isAuthorized())",
    ),
  ).toEqual(["/rest/basket/:id"]);
  expect(
    extractEndpoints(
      "javascript",
      "app.get(['/.well-known/security.txt', '/security.txt'], verify.accessControlChallenges())",
    ),
  ).toEqual(["/.well-known/security.txt", "/security.txt"]);
  expect(
    extractEndpoints(
      "javascript",
      'router.post("/convert",async(ctx:Context):Promise<void>=>{constparameters=ctx.request.body;constbatchClient=newBatchClient({region:"us-west-1"});constcommand=newSubmitJobCommand({jobName:parameters?.jobName,jobQueue:"FOO-ARN",jobDefinition:"BAR-ARN",parameters,});try{constobjectsOutput=awaitbatchClient.send(command);ctx.response.body=objectsOutput;}catch(err){//Poorexceptionhandlingctx.response.body=err;}})',
    ),
  ).toEqual(["/convert"]);
  expect(
    extractEndpoints(
      "java",
      '@RequestMapping(path = "/{name}", method = RequestMethod.GET)',
    ),
  ).toEqual(["/{name}"]);
  expect(
    extractEndpoints("java", "@RequestMapping(method = RequestMethod.POST)"),
  ).toEqual([]);
  expect(
    extractEndpoints(
      "java",
      '@RequestMapping(value = "/{accountName}", method = RequestMethod.GET)',
    ),
  ).toEqual(["/{accountName}"]);
});

test("parseSemanticSlices", () => {
  const semanticsSlice = JSON.parse(
    readFileSync("./test/data/swiftsem/semantics.slices.json", {
      encoding: "utf-8",
    }),
  );
  const bomJson = JSON.parse(
    readFileSync("./test/data/swiftsem/bom-hakit.json", {
      encoding: "utf-8",
    }),
  );
  const retMap = parseSemanticSlices(bomJson.components, semanticsSlice);
  expect(retMap).toBeDefined();
});
