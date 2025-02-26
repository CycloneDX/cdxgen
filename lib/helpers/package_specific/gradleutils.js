import { existsSync, readFileSync } from "node:fs";

/**
 * Function to parse the given gradle build file to identify properties such as included builds
 *
 * @param buildFile {build,settings}.gradle(.kts)? Build file in groovy or kotlin format
 * @param buildContent String content to parse directly.
 */
export function analyzeBuildSettings(buildFile, buildContent) {
  const includedBuilds = new Set();
  if (!buildContent && !existsSync(buildFile)) {
    return undefined;
  }
  const data = buildContent || readFileSync(buildFile, "utf-8");
  let pluginManagementMode = false;
  for (let aline of data.split("\n")) {
    aline = aline.replaceAll("\r", "").trim();
    if (aline.includes("pluginManagement {")) {
      pluginManagementMode = true;
    }
    if (pluginManagementMode && aline === "}") {
      pluginManagementMode = false;
    }
    if (!pluginManagementMode) {
      if (aline.includes("includeBuild")) {
        aline = aline.replace("includeBuild", "").replaceAll(/[ "'()]/g, "");
        // Ignore relative includes for now
        if (!aline.startsWith(".")) {
          includedBuilds.add(`:${aline.trim()}`);
        }
      } else if (aline.includes("includedBuild(")) {
        aline = aline
          .split("includedBuild(")[1]
          .split(")")[0]
          .replaceAll(/[ "'()]/g, "");
        if (!aline.startsWith(".")) {
          includedBuilds.add(`:${aline.trim()}`);
        }
      }
    }
  }
  if (!includedBuilds.size) {
    return undefined;
  }
  return {
    includedBuilds: Array.from(includedBuilds),
  };
}
