import process from "node:process";

import { assert, beforeEach, describe, it, skip } from "poku";

import {
  addSkippedSrcFiles,
  exportImage,
  getConnection,
  getImage,
  isWin,
  parseImageName,
  removeImage,
} from "./docker.js";

if (process.env.CI === "true" && (isWin || process.platform === "darwin")) {
  skip("Skipping Docker tests on Windows and Mac");
}

await it("docker connection", async () => {
  const dockerConn = await getConnection();
  if (dockerConn) {
    assert.ok(dockerConn);
  }
});

it("parseImageName tests", () => {
  if (isWin && process.env.CI === "true") {
    return;
  }
  assert.deepStrictEqual(parseImageName("debian"), {
    registry: "",
    repo: "debian",
    tag: "",
    digest: "",
    platform: "",
    group: "",
    name: "debian",
  });
  assert.deepStrictEqual(parseImageName("debian:latest"), {
    registry: "",
    repo: "debian",
    tag: "latest",
    digest: "",
    platform: "",
    group: "",
    name: "debian",
  });
  assert.deepStrictEqual(parseImageName("library/debian:latest"), {
    registry: "",
    repo: "library/debian",
    tag: "latest",
    digest: "",
    platform: "",
    group: "library",
    name: "debian",
  });
  assert.deepStrictEqual(parseImageName("shiftleft/scan:v1.15.6"), {
    registry: "",
    repo: "shiftleft/scan",
    tag: "v1.15.6",
    digest: "",
    platform: "",
    group: "shiftleft",
    name: "scan",
  });
  assert.deepStrictEqual(
    parseImageName("localhost:5000/shiftleft/scan:v1.15.6"),
    {
      registry: "localhost:5000",
      repo: "shiftleft/scan",
      tag: "v1.15.6",
      digest: "",
      platform: "",
      group: "shiftleft",
      name: "scan",
    },
  );
  assert.deepStrictEqual(parseImageName("localhost:5000/shiftleft/scan"), {
    registry: "localhost:5000",
    repo: "shiftleft/scan",
    tag: "",
    digest: "",
    platform: "",
    group: "shiftleft",
    name: "scan",
  });
  assert.deepStrictEqual(
    parseImageName("foocorp.jfrog.io/docker/library/eclipse-temurin:latest"),
    {
      registry: "foocorp.jfrog.io",
      repo: "docker/library/eclipse-temurin",
      tag: "latest",
      digest: "",
      platform: "",
      group: "docker/library",
      name: "eclipse-temurin",
    },
  );
  assert.deepStrictEqual(
    parseImageName(
      "--platform=linux/amd64 foocorp.jfrog.io/docker/library/eclipse-temurin:latest",
    ),
    {
      registry: "foocorp.jfrog.io",
      repo: "docker/library/eclipse-temurin",
      tag: "latest",
      digest: "",
      platform: "linux/amd64",
      group: "docker/library",
      name: "eclipse-temurin",
    },
  );
  assert.deepStrictEqual(
    parseImageName(
      "quay.io/shiftleft/scan-java@sha256:5d008306a7c5d09ba0161a3408fa3839dc2c9dd991ffb68adecc1040399fe9e1",
    ),
    {
      registry: "quay.io",
      repo: "shiftleft/scan-java",
      tag: "",
      digest:
        "5d008306a7c5d09ba0161a3408fa3839dc2c9dd991ffb68adecc1040399fe9e1",
      platform: "",
      group: "shiftleft",
      name: "scan-java",
    },
  );
});

await it("docker getImage", async () => {
  if (isWin && process.env.CI === "true") {
    return;
  }
  const imageData = await getImage("hello-world:latest");
  if (imageData) {
    const removeData = await removeImage("hello-world:latest");
    if (removeData) {
      assert.ok(removeData);
    }
  }
});

await it("docker getImage", async () => {
  if (isWin && process.env.CI === "true") {
    return;
  }
  const imageData = await exportImage("hello-world:latest");
  assert.ok(imageData);
});

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

  it("no matching additional src files", () => {
    addSkippedSrcFiles(
      [
        {
          image: "node:18",
          src: "/some/project/bitbucket-pipeline.yml",
        },
      ],
      testComponents,
    );

    assert.strictEqual(testComponents[0].properties.length, 2);
  });

  it("adds additional src files", () => {
    addSkippedSrcFiles(
      [
        {
          image: "node:20",
          src: "/some/project/bitbucket-pipeline.yml",
        },
      ],
      testComponents,
    );

    assert.equal(testComponents[0].properties.length, 3);
  });

  it("skips if same src file", () => {
    addSkippedSrcFiles(
      [
        {
          image: "node:20",
          src: "/some/project/Dockerfile",
        },
      ],
      testComponents,
    );

    assert.deepStrictEqual(testComponents[0].properties.length, 2);
  });
});
