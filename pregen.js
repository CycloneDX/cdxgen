import {
  SDKMAN_TOOL_ALIASES,
  installSdkmanTool,
  isSdkmanAvailable,
} from "./envcontext.js";

/**
 * Method to prepare the build environment for BOM generation purposes.
 *
 * @param {String} filePath Path
 * @param {Object} options CLI options
 */
export function prepareEnv(filePath, options) {
  if (!options.projectType) {
    return;
  }
  for (const pt of options.projectType) {
    if (SDKMAN_TOOL_ALIASES[pt]) {
      prepareSdkmanBuild(pt);
      break;
    }
  }
}

/**
 * Method to prepare sdkman build environment for BOM generation purposes.
 *
 * @param {String} projectType Project type
 */

export function prepareSdkmanBuild(projectType) {
  if (!isSdkmanAvailable()) {
    return;
  }
  const toolType = "java";
  return installSdkmanTool(toolType, projectType);
}
