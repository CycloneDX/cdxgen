const dockerLib = require("./docker");

test("docker connection", async () => {
  const dockerConn = await dockerLib.getConnection();
  expect(dockerConn);
});

test("parseImageName tests", () => {
  expect(dockerLib.parseImageName("debian")).toEqual({
    registry: "",
    repo: "debian",
    tag: "",
    digest: "",
    platform: ""
  });
  expect(dockerLib.parseImageName("debian:latest")).toEqual({
    registry: "",
    repo: "debian",
    tag: "latest",
    digest: "",
    platform: ""
  });
  expect(dockerLib.parseImageName("shiftleft/scan:v1.15.6")).toEqual({
    registry: "",
    repo: "shiftleft/scan",
    tag: "v1.15.6",
    digest: "",
    platform: ""
  });
  expect(
    dockerLib.parseImageName("localhost:5000/shiftleft/scan:v1.15.6")
  ).toEqual({
    registry: "localhost:5000",
    repo: "shiftleft/scan",
    tag: "v1.15.6",
    digest: "",
    platform: ""
  });
  expect(dockerLib.parseImageName("localhost:5000/shiftleft/scan")).toEqual({
    registry: "localhost:5000",
    repo: "shiftleft/scan",
    tag: "",
    digest: "",
    platform: ""
  });
  expect(
    dockerLib.parseImageName(
      "quay.io/shiftleft/scan-java@sha256:5d008306a7c5d09ba0161a3408fa3839dc2c9dd991ffb68adecc1040399fe9e1"
    )
  ).toEqual({
    registry: "quay.io",
    repo: "shiftleft/scan-java",
    tag: "",
    digest: "5d008306a7c5d09ba0161a3408fa3839dc2c9dd991ffb68adecc1040399fe9e1",
    platform: ""
  });
});

test("docker getImage", async () => {
  jest.setTimeout(120000);
  const imageData = await dockerLib.getImage("hello-world:latest");
  if (imageData) {
    const removeData = await dockerLib.removeImage("hello-world:latest");
    expect(removeData);
  }
});

test("docker getImage", async () => {
  jest.setTimeout(120000);
  const imageData = await dockerLib.exportImage("hello-world:latest");
  expect(imageData);
});
