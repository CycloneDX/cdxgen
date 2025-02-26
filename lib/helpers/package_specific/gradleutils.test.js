import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { analyzeBuildSettings } from "./gradleutils.js";

test("analyzeBuildSettings tests", () => {
  expect(analyzeBuildSettings()).toBeUndefined();
  expect(
    analyzeBuildSettings(
      undefined,
      `rootProject.name = "my-composite"

includeBuild("my-app")
includeBuild("my-utils")`,
    ),
  ).toEqual({
    includedBuilds: [":my-app", ":my-utils"],
  });
  expect(
    analyzeBuildSettings(
      undefined,
      `rootProject.name = 'my-composite'

includeBuild 'my-app'
includeBuild 'my-utils'`,
    ),
  ).toEqual({
    includedBuilds: [":my-app", ":my-utils"],
  });
  expect(
    analyzeBuildSettings(
      undefined,
      `tasks.register("run") {
    dependsOn(gradle.includedBuild("my-app").task(":app:run"))
}`,
    ),
  ).toEqual({
    includedBuilds: [":my-app"],
  });
  expect(
    analyzeBuildSettings(
      undefined,
      `tasks.register('run') {
    dependsOn gradle.includedBuild('my-app').task(':app:run')
}`,
    ),
  ).toEqual({
    includedBuilds: [":my-app"],
  });

  expect(
    analyzeBuildSettings(
      undefined,
      `pluginManagement {
    includeBuild("../url-verifier-plugin")
}`,
    ),
  ).toBeUndefined();
  expect(
    analyzeBuildSettings(
      undefined,
      `pluginManagement {
    includeBuild '../url-verifier-plugin'
}`,
    ),
  ).toBeUndefined();
});
