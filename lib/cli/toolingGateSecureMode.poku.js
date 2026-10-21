/**
 * Secure-mode test for the project-tooling gate.
 *
 * Lives in its own file because `isSecureMode` is an import-time snapshot of
 * CDXGEN_SECURE_MODE, so the environment must be prepared before any cdxgen
 * module is first imported. No cdxgen module may be statically imported here.
 *
 * Introspection mode normally keeps the scanned project's build tooling
 * available, but secure mode wins: `isProjectToolingAllowed` must refuse to
 * run it even with introspect on (issue #4527).
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

import { it } from "poku";

process.env.CDXGEN_SECURE_MODE = "true";

const POM =
  "<project><modelVersion>4.0.0</modelVersion><groupId>org.example</groupId><artifactId>demo</artifactId><version>1.0.0</version><dependencies><dependency><groupId>com.example</groupId><artifactId>demo-lib</artifactId><version>1.0.0</version></dependency></dependencies></project>";

await it("secure mode wins over introspection: mvn does not start", async () => {
  if (process.platform === "win32") {
    // The stand-in is a POSIX shell script.
    return;
  }
  const savedPath = process.env.PATH;
  const savedHome = process.env.HOME;
  const root = mkdtempSync(join(tmpdir(), "cdxgen-tooling-secure-"));
  const binDir = join(root, "bin");
  const project = join(root, "project");
  const marker = join(root, "mvn-ran");
  mkdirSync(binDir);
  mkdirSync(project);
  mkdirSync(join(project, ".mvn"), { recursive: true });
  writeFileSync(join(project, "pom.xml"), POM);
  writeFileSync(
    join(project, ".mvn", "jvm.config"),
    "-javaagent:.mvn/agent.jar\n",
  );
  const fakeMvn = join(binDir, "mvn");
  writeFileSync(
    fakeMvn,
    `#!/bin/sh\nprintf 'ran\\n' > ${JSON.stringify(marker)}\nexit 1\n`,
  );
  chmodSync(fakeMvn, 0o755);
  try {
    process.env.PATH = [binDir, savedPath].filter(Boolean).join(delimiter);
    process.env.HOME = join(root, "home");
    mkdirSync(process.env.HOME);
    const { createJavaBom } = await import("./jvmBom.js");
    await createJavaBom(project, {
      installDeps: false,
      introspect: true,
      projectType: ["java"],
      specVersion: 1.6,
    });
    if (existsSync(marker)) {
      throw new Error(
        "mvn started in secure mode even though dependency installation is disabled",
      );
    }
  } finally {
    process.env.PATH = savedPath;
    process.env.HOME = savedHome;
    rmSync(root, { force: true, recursive: true });
  }
});
