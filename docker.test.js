import {
  getConnection,
  parseImageName,
  getImage,
  removeImage,
  exportImage
} from "./docker";
import { expect, test } from "@jest/globals";

test("docker connection", async () => {
  const dockerConn = await getConnection();
  expect(dockerConn);
});

test("parseImageName tests", () => {
  expect(parseImageName("debian")).toEqual({
    registry: "",
    repo: "debian",
    tag: "",
    digest: "",
    platform: ""
  });
  expect(parseImageName("debian:latest")).toEqual({
    registry: "",
    repo: "debian",
    tag: "latest",
    digest: "",
    platform: ""
  });
  expect(parseImageName("shiftleft/scan:v1.15.6")).toEqual({
    registry: "",
    repo: "shiftleft/scan",
    tag: "v1.15.6",
    digest: "",
    platform: ""
  });
  expect(parseImageName("localhost:5000/shiftleft/scan:v1.15.6")).toEqual({
    registry: "localhost:5000",
    repo: "shiftleft/scan",
    tag: "v1.15.6",
    digest: "",
    platform: ""
  });
  expect(parseImageName("localhost:5000/shiftleft/scan")).toEqual({
    registry: "localhost:5000",
    repo: "shiftleft/scan",
    tag: "",
    digest: "",
    platform: ""
  });
  expect(
    parseImageName(
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
  const imageData = await getImage("hello-world:latest");
  if (imageData) {
    const removeData = await removeImage("hello-world:latest");
    expect(removeData);
  }
}, 120000);

test("docker getImage", async () => {
  const imageData = await exportImage("hello-world:latest");
  expect(imageData);
}, 120000);
