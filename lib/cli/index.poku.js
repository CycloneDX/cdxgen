import { afterEach, assert, beforeEach, describe, it } from "poku";
import quibble from "quibble";
import sinon from "sinon";

describe("CLI tests", () => {
  describe("submitBom()", () => {
    let gotStub;
    let submitBom;

    beforeEach(async () => {
      // Create a sinon stub that mimics got()
      const fakeGotResponse = {
        json: sinon.stub().resolves({ success: true }),
      };

      gotStub = sinon.stub().returns(fakeGotResponse);

      // Attach extend to the function itself
      gotStub.extend = sinon.stub().returns(gotStub);

      // Replace the real 'got' module with our stub
      await quibble.esm("got", {
        default: gotStub,
      });

      // Import the module under test AFTER quibble
      ({ submitBom } = await import(`./index.js?update=${Date.now()}`));
    });

    afterEach(async () => {
      await quibble.reset();
      sinon.reset();
    });

    it("should successfully report the SBOM with given project id, name, version and a single tag", async () => {
      const serverUrl = "https://dtrack.example.com";
      const projectId = "f7cb9f02-8041-4991-9101-b01fa07a6522";
      const projectName = "cdxgen-test-project";
      const projectVersion = "1.0.0";
      const projectTag = "tag1";
      const bomContent = {
        bom: "test",
      };
      const apiKey = "TEST_API_KEY";
      const skipDtTlsCheck = false;

      const expectedRequestPayload = {
        autoCreate: "true",
        bom: "eyJib20iOiJ0ZXN0In0=", // stringified and base64 encoded bomContent
        project: projectId,
        projectName,
        projectVersion,
        projectTags: [{ name: projectTag }],
      };

      await submitBom(
        {
          serverUrl,
          projectId,
          projectName,
          projectVersion,
          apiKey,
          skipDtTlsCheck,
          projectTag,
        },
        bomContent,
      );

      // Verify got was called exactly once
      sinon.assert.calledOnce(gotStub);

      // Grab call arguments
      const [calledUrl, options] = gotStub.firstCall.args;

      // Assert call arguments against expectations
      assert.equal(calledUrl, serverUrl + "/api/v1/bom");
      assert.equal(options.method, "PUT");
      assert.equal(options.https.rejectUnauthorized, !skipDtTlsCheck);
      assert.equal(options.headers["X-Api-Key"], apiKey);
      assert.match(options.headers["user-agent"], /@CycloneDX\/cdxgen/);
      assert.deepEqual(options.json, expectedRequestPayload);
    });

    it("should successfully report the SBOM with given parent project, name, version and multiple single tags", async () => {
      const serverUrl = "https://dtrack.example.com";
      const projectName = "cdxgen-test-project";
      const projectVersion = "1.0.0";
      const projectTag = "tag1";
      const parentProjectId = "f7cb9f02-8041-4991-9101-b01fa07a6522";
      const bomContent = {
        bom: "test",
      };
      const apiKey = "TEST_API_KEY";
      const skipDtTlsCheck = false;

      const expectedRequestPayload = {
        autoCreate: "true",
        bom: "eyJib20iOiJ0ZXN0In0=", // stringified and base64 encoded bomContent
        parentUUID: parentProjectId,
        projectName,
        projectVersion,
        projectTags: [{ name: projectTag }],
      };

      await submitBom(
        {
          serverUrl,
          parentProjectId,
          projectName,
          projectVersion,
          apiKey,
          skipDtTlsCheck,
          projectTag,
        },
        bomContent,
      );

      // Verify got was called exactly once
      sinon.assert.calledOnce(gotStub);

      // Grab call arguments
      const [calledUrl, options] = gotStub.firstCall.args;

      // Assert call arguments against expectations
      assert.equal(calledUrl, serverUrl + "/api/v1/bom");
      assert.equal(options.method, "PUT");
      assert.equal(options.https.rejectUnauthorized, !skipDtTlsCheck);
      assert.equal(options.headers["X-Api-Key"], apiKey);
      assert.match(options.headers["user-agent"], /@CycloneDX\/cdxgen/);
      assert.deepEqual(options.json, expectedRequestPayload);
    });
  });
});
