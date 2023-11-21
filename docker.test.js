import {
  getConnection,
  parseImageName,
  getImage,
  removeImage,
  exportImage,
  isWin
} from "./docker.js";
import { expect, test } from "@jest/globals";

test("docker connection", async () => {
  if (!(isWin && process.env.CI === "true")) {
    const dockerConn = await getConnection();
    expect(dockerConn);
  }
}, 120000);

test("parseImageName tests", () => {
  if (isWin && process.env.CI === "true") {
    return;
  }
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
    parseImageName("foocorp.jfrog.io/docker/library/eclipse-temurin:latest")
  ).toEqual({
    registry: "foocorp.jfrog.io",
    repo: "docker/library/eclipse-temurin",
    tag: "latest",
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
}, 120000);

test("docker getImage", async () => {
  if (isWin && process.env.CI === "true") {
    return;
  }
  const imageData = await getImage("hello-world:latest");
  if (imageData) {
    const removeData = await removeImage("hello-world:latest");
    expect(removeData);
  }
}, 120000);

test("docker getImage", async () => {
  if (isWin && process.env.CI === "true") {
    return;
  }
  const imageData = await exportImage("hello-world:latest");
  expect(imageData);
}, 120000);
