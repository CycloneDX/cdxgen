// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Maven pom properties are written as ${name}
/**
 * Tests for the Maven path that reads pom files without running Maven
 * (issue #4527): `readMavenModuleStatically`, and `createJavaBom` with
 * dependency installation disabled on multi-module and Quarkus-style
 * projects. A stand-in `mvn` on the PATH records any invocation, so the tests
 * also prove Maven never starts.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import process from "node:process";

import { assert, describe, it } from "poku";
import sinon from "sinon";

import { resetRunState } from "../core/runState.js";
import { createJavaBom, readMavenModuleStatically } from "./jvmBom.js";

const isWin = process.platform === "win32";

/**
 * Write a pom file, creating its directory.
 *
 * @param {string} dir Directory of the pom
 * @param {string} body XML inside <project>
 * @returns {string} Path of the pom
 */
function writePom(dir, body) {
  mkdirSync(dir, { recursive: true });
  const pomFile = join(dir, "pom.xml");
  writeFileSync(
    pomFile,
    `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
${body}
</project>`,
  );
  return pomFile;
}

/** XML for one dependency; a missing version leaves the element out. */
function depXml(groupId, artifactId, version, extra = "") {
  return `<dependency><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>${
    version === undefined ? "" : `<version>${version}</version>`
  }${extra}</dependency>`;
}

/**
 * Put a stand-in `mvn` (and `mvn.cmd` for Windows) in `binDir` that writes
 * `marker` when it runs.
 *
 * @param {string} binDir Directory for the stand-in
 * @param {string} marker File the stand-in creates
 */
function writeStandInMaven(binDir, marker) {
  mkdirSync(binDir, { recursive: true });
  const shScript = join(binDir, "mvn");
  writeFileSync(
    shScript,
    `#!/bin/sh\nprintf 'ran\\n' > ${JSON.stringify(marker)}\nexit 1\n`,
  );
  chmodSync(shScript, 0o755);
  writeFileSync(
    join(binDir, "mvn.cmd"),
    `@echo off\r\necho ran> "${marker}"\r\nexit /b 1\r\n`,
  );
}

const MAVEN_ENV_NAMES = [
  "PATH",
  "HOME",
  "MAVEN_HOME",
  "M2_HOME",
  "MVN_CMD",
  "MAVEN_CMD",
  "MVN_ARGS",
  "MAVEN_ARGS",
  "CDXGEN_INTROSPECT",
  "CDXGEN_INTROSPECT_LEDGER",
];

/**
 * Scan `project` with createJavaBom while a stand-in Maven sits first on the
 * PATH and no Maven location is configured. Console output is captured.
 *
 * @param {string} root Scratch directory for the stand-in and the marker
 * @param {string} project Project directory to scan
 * @param {Object} options createJavaBom options
 * @returns {Promise<{bomNSData: Object, mvnRan: boolean}>}
 */
async function scanWithoutMaven(root, project, options) {
  const saved = Object.fromEntries(
    MAVEN_ENV_NAMES.map((name) => [name, process.env[name]]),
  );
  const binDir = join(root, "bin");
  const marker = join(root, "mvn-ran");
  const emptyHome = join(root, "home");
  writeStandInMaven(binDir, marker);
  mkdirSync(emptyHome, { recursive: true });
  const logStub = sinon.stub(console, "log");
  try {
    for (const name of MAVEN_ENV_NAMES) {
      delete process.env[name];
    }
    process.env.PATH = [binDir, saved.PATH].filter(Boolean).join(delimiter);
    process.env.HOME = emptyHome;
    resetRunState();
    const bomNSData = await createJavaBom(project, options);
    return { bomNSData, mvnRan: existsSync(marker) };
  } finally {
    logStub.restore();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    resetRunState();
  }
}

const NO_TOOLING_OPTIONS = Object.freeze({
  installDeps: false,
  multiProject: true,
  projectType: ["java"],
  specVersion: 1.6,
});

await describe("readMavenModuleStatically()", () => {
  it("returns the module component and its direct dependencies without edges", () => {
    const root = mkdtempSync(join(tmpdir(), "cdxgen-static-module-"));
    try {
      const pomFile = writePom(
        root,
        `<groupId>org.example</groupId>
  <artifactId>web</artifactId>
  <version>1.0.0</version>
  <packaging>war</packaging>
  <dependencies>
    ${depXml("com.acme", "lib", "1.0.0")}
    ${depXml("com.acme", "natives", "2.0.0", "<classifier>linux-x86_64</classifier>")}
    ${depXml("com.acme", "unversioned")}
  </dependencies>`,
      );
      const result = readMavenModuleStatically(pomFile, root, new Map());
      // Edges would make a pom read without Maven pass for a resolved graph
      assert.deepStrictEqual(Object.keys(result).sort(), [
        "moduleComponent",
        "pkgList",
      ]);
      const { moduleComponent, pkgList } = result;
      assert.strictEqual(moduleComponent.type, "application");
      assert.strictEqual(moduleComponent.group, "org.example");
      assert.strictEqual(moduleComponent.name, "web");
      assert.strictEqual(moduleComponent.version, "1.0.0");
      assert.strictEqual(
        moduleComponent.purl,
        "pkg:maven/org.example/web@1.0.0?type=war",
      );
      assert.strictEqual(moduleComponent["bom-ref"], moduleComponent.purl);
      assert.deepStrictEqual(moduleComponent.properties, [
        { name: "internal:SrcFile", value: pomFile },
      ]);
      assert.strictEqual(pkgList.length, 3);
      for (const pkg of pkgList) {
        assert.ok(pkg.purl, `${pkg.name} has no purl`);
        assert.strictEqual(pkg["bom-ref"], decodeURIComponent(pkg.purl));
      }
      const lib = pkgList.find((p) => p.name === "lib");
      assert.strictEqual(lib.purl, "pkg:maven/com.acme/lib@1.0.0?type=jar");
      const natives = pkgList.find((p) => p.name === "natives");
      assert.ok(natives.purl.includes("classifier=linux-x86_64"));
      const unversioned = pkgList.find((p) => p.name === "unversioned");
      assert.strictEqual(unversioned.version, undefined);
      assert.ok(!unversioned.purl.includes("@"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns no module component for a pom without an artifactId or one it cannot read", () => {
    const root = mkdtempSync(join(tmpdir(), "cdxgen-static-module-bad-"));
    try {
      const anonymous = writePom(
        root,
        `<dependencies>${depXml("com.acme", "lib", "1.0.0")}</dependencies>`,
      );
      const result = readMavenModuleStatically(anonymous, root);
      assert.strictEqual(result.moduleComponent, undefined);
      assert.strictEqual(result.pkgList.length, 1);
      assert.deepStrictEqual(
        readMavenModuleStatically(join(root, "missing", "pom.xml"), root),
        { moduleComponent: undefined, pkgList: [] },
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

await describe("createJavaBom() with dependency installation disabled", async () => {
  await it("builds the parent component and modules from local poms without running Maven", async () => {
    const root = mkdtempSync(join(tmpdir(), "cdxgen-static-maven-"));
    try {
      const project = join(root, "project");
      writePom(
        project,
        `<groupId>org.example</groupId>
  <artifactId>shop</artifactId>
  <version>\${revision}</version>
  <packaging>pom</packaging>
  <modules><module>core</module></modules>
  <properties>
    <revision>1.4.0</revision>
    <guava.version>33.0.0-jre</guava.version>
  </properties>
  <dependencyManagement><dependencies>
    ${depXml("com.google.guava", "guava", "${guava.version}")}
  </dependencies></dependencyManagement>
  <dependencies>${depXml("org.slf4j", "slf4j-api", "2.0.13")}</dependencies>`,
      );
      writePom(
        join(project, "core"),
        `<parent><groupId>org.example</groupId><artifactId>shop</artifactId><version>\${revision}</version></parent>
  <artifactId>core</artifactId>
  <dependencies>
    ${depXml("com.google.guava", "guava")}
    ${depXml("org.apache.commons", "commons-lang3", "3.14.0")}
  </dependencies>`,
      );
      const { bomNSData, mvnRan } = await scanWithoutMaven(root, project, {
        ...NO_TOOLING_OPTIONS,
      });
      assert.strictEqual(mvnRan, false, "the stand-in mvn was started");
      const parent = bomNSData.parentComponent;
      assert.strictEqual(parent.name, "shop");
      assert.strictEqual(parent.group, "org.example");
      assert.strictEqual(parent.version, "1.4.0");
      assert.strictEqual(parent.type, "application");
      assert.strictEqual(
        parent.purl,
        "pkg:maven/org.example/shop@1.4.0?type=pom",
      );
      assert.deepStrictEqual(
        (parent.components || []).map((c) => c.purl),
        ["pkg:maven/org.example/core@1.4.0?type=jar"],
      );
      const versions = Object.fromEntries(
        (bomNSData.bomJson?.components || []).map((c) => [c.name, c.version]),
      );
      assert.strictEqual(versions.guava, "33.0.0-jre");
      assert.strictEqual(versions["slf4j-api"], "2.0.13");
      assert.strictEqual(versions["commons-lang3"], "3.14.0");
      // No graph: a pom read without Maven must not pass for a resolved tree
      assert.deepStrictEqual(bomNSData.dependencies, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await it("reads every module pom of a Quarkus-style project", async () => {
    const root = mkdtempSync(join(tmpdir(), "cdxgen-static-quarkus-"));
    try {
      const project = join(root, "project");
      writePom(
        project,
        `<groupId>org.acme</groupId>
  <artifactId>quarkus-parent</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <packaging>pom</packaging>
  <modules>
    <module>svc-a</module>
    <module>svc-b</module>
  </modules>
  <properties>
    <quarkus.platform.group-id>io.quarkus.platform</quarkus.platform.group-id>
    <quarkus.platform.artifact-id>quarkus-bom</quarkus.platform.artifact-id>
    <quarkus.platform.version>3.8.0</quarkus.platform.version>
  </properties>
  <dependencyManagement><dependencies>
    ${depXml("${quarkus.platform.group-id}", "${quarkus.platform.artifact-id}", "${quarkus.platform.version}", "<type>pom</type><scope>import</scope>")}
  </dependencies></dependencyManagement>`,
      );
      for (const [module, lib, version] of [
        ["svc-a", "a-lib", "1.0.0"],
        ["svc-b", "b-lib", "2.0.0"],
      ]) {
        writePom(
          join(project, module),
          `<parent><groupId>org.acme</groupId><artifactId>quarkus-parent</artifactId><version>1.0.0-SNAPSHOT</version></parent>
  <artifactId>${module}</artifactId>
  <dependencies>
    ${depXml("io.quarkus", "quarkus-rest")}
    ${depXml("com.acme", lib, version)}
  </dependencies>`,
        );
      }
      const { bomNSData, mvnRan } = await scanWithoutMaven(root, project, {
        ...NO_TOOLING_OPTIONS,
      });
      assert.strictEqual(mvnRan, false, "the stand-in mvn was started");
      assert.strictEqual(bomNSData.parentComponent.name, "quarkus-parent");
      assert.deepStrictEqual(
        (bomNSData.parentComponent.components || []).map((c) => c.name).sort(),
        ["svc-a", "svc-b"],
      );
      const names = new Set(
        (bomNSData.bomJson?.components || []).map((c) => c.name),
      );
      assert.ok(names.has("a-lib"), "svc-a was not read");
      assert.ok(names.has("b-lib"), "svc-b was not read");
      assert.deepStrictEqual(bomNSData.dependencies, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // jvmBomToolingGate.poku.js runs the cross-platform control for mvn.cmd
  await (isWin ? it.skip : it)(
    "the stand-in mvn on the PATH does run when tooling is allowed (positive control)",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "cdxgen-static-control-"));
      try {
        const project = join(root, "project");
        writePom(
          project,
          `<groupId>org.example</groupId>
  <artifactId>control</artifactId>
  <version>1.0.0</version>
  <dependencies>${depXml("com.acme", "lib", "1.0.0")}</dependencies>`,
        );
        const { mvnRan } = await scanWithoutMaven(root, project, {
          ...NO_TOOLING_OPTIONS,
          installDeps: true,
        });
        assert.strictEqual(mvnRan, true, "the stand-in mvn was never invoked");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
