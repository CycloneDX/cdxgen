import process from "node:process";
import { beforeEach, describe, expect, test } from "@jest/globals";
import {
  addSkippedSrcFiles,
  exportImage,
  getConnection,
  getImage,
  isWin,
  parseImageName,
  removeImage,
} from "./docker.js";

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
    platform: "",
    group: "",
    name: "debian",
  });
  expect(parseImageName("debian:latest")).toEqual({
    registry: "",
    repo: "debian",
    tag: "latest",
    digest: "",
    platform: "",
    group: "",
    name: "debian",
  });
  expect(parseImageName("library/debian:latest")).toEqual({
    registry: "",
    repo: "library/debian",
    tag: "latest",
    digest: "",
    platform: "",
    group: "library",
    name: "debian",
  });
  expect(parseImageName("shiftleft/scan:v1.15.6")).toEqual({
    registry: "",
    repo: "shiftleft/scan",
    tag: "v1.15.6",
    digest: "",
    platform: "",
    group: "shiftleft",
    name: "scan",
  });
  expect(parseImageName("localhost:5000/shiftleft/scan:v1.15.6")).toEqual({
    registry: "localhost:5000",
    repo: "shiftleft/scan",
    tag: "v1.15.6",
    digest: "",
    platform: "",
    group: "shiftleft",
    name: "scan",
  });
  expect(parseImageName("localhost:5000/shiftleft/scan")).toEqual({
    registry: "localhost:5000",
    repo: "shiftleft/scan",
    tag: "",
    digest: "",
    platform: "",
    group: "shiftleft",
    name: "scan",
  });
  expect(
    parseImageName("foocorp.jfrog.io/docker/library/eclipse-temurin:latest"),
  ).toEqual({
    registry: "foocorp.jfrog.io",
    repo: "docker/library/eclipse-temurin",
    tag: "latest",
    digest: "",
    platform: "",
    group: "docker/library",
    name: "eclipse-temurin",
  });
  expect(
    parseImageName(
      "--platform=linux/amd64 foocorp.jfrog.io/docker/library/eclipse-temurin:latest",
    ),
  ).toEqual({
    registry: "foocorp.jfrog.io",
    repo: "docker/library/eclipse-temurin",
    tag: "latest",
    digest: "",
    platform: "linux/amd64",
    group: "docker/library",
    name: "eclipse-temurin",
  });
  expect(
    parseImageName(
      "quay.io/shiftleft/scan-java@sha256:5d008306a7c5d09ba0161a3408fa3839dc2c9dd991ffb68adecc1040399fe9e1",
    ),
  ).toEqual({
    registry: "quay.io",
    repo: "shiftleft/scan-java",
    tag: "",
    digest: "5d008306a7c5d09ba0161a3408fa3839dc2c9dd991ffb68adecc1040399fe9e1",
    platform: "",
    group: "shiftleft",
    name: "scan-java",
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

describe("addSkippedSrcFiles tests", () => {
  let testComponents;

  beforeEach(() => {
    testComponents = [
      {
        name: "node",
        version: "20",
        component: "node:20",
        purl: "pkg:oci/node@20?tag=20",
        type: "container",
        "bom-ref": "pkg:oci/node@20?tag=20",
        properties: [
          {
            name: "SrcFile",
            value: "/some/project/Dockerfile",
          },
          {
            name: "oci:SrcImage",
            value: "node:20",
          },
        ],
      },
    ];
  });

  test("no matching additional src files", () => {
    addSkippedSrcFiles(
      [
        {
          image: "node:18",
          src: "/some/project/bitbucket-pipeline.yml",
        },
      ],
      testComponents,
    );

    expect(testComponents[0].properties).toHaveLength(2);
  });

  test("adds additional src files", () => {
    addSkippedSrcFiles(
      [
        {
          image: "node:20",
          src: "/some/project/bitbucket-pipeline.yml",
        },
      ],
      testComponents,
    );

    expect(testComponents[0].properties).toHaveLength(3);
  });

  test("skips if same src file", () => {
    addSkippedSrcFiles(
      [
        {
          image: "node:20",
          src: "/some/project/Dockerfile",
        },
      ],
      testComponents,
    );

    expect(testComponents[0].properties).toHaveLength(2);
  });
}, 120000);
