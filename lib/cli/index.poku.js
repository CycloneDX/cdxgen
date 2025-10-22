import quibble from "quibble";
import sinon from "sinon";
import { assert, beforeEach, afterEach, describe, it } from "poku";

describe("CLI tests", () => {
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
    ({ submitBom } = await import("./index.js"));
  });

  afterEach(() => {
    quibble.reset(); // Restore real modules
  });

  it("should report the SBOM with given project tag", async () => {
    const serverUrl = "https://api.example.com/upload";
    const projectId = "1111";
    const projectName = "test";
    const projectVersion = "1.0.0";
    const bomPayload = { bom: "test" };

    await submitBom(
      { serverUrl, projectId, projectName, projectVersion },
      bomPayload,
    );

    // Verify got was called exactly once
    sinon.assert.calledOnce(gotStub);

    // Grab call arguments
    const [calledUrl, options] = gotStub.firstCall.args;

    assert.equal(calledUrl, serverUrl);
    assert.equal(options.method, "PUT");
    assert.equal(options.https.rejectUnauthorized, true);
    assert.equal(options.headers["X-Api-Key"], "MY_API_KEY");
    assert.match(options.headers["user-agent"], /@CycloneDX\/cdxgen/);
    assert.deepEqual(options.json, bomPayload);
  });
});
