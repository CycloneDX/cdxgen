import { mkdtempSync } from "node:fs";
import { arch, platform, tmpdir } from "node:os";
import { join } from "node:path";
import {
  SDKMAN_TOOL_ALIASES,
  installSdkmanTool,
  isSdkmanAvailable,
} from "./envcontext.js";
import { DEBUG_MODE, hasAnyProjectType } from "./utils.js";

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
  // Check the pre-requisites for python
  preparePythonEnv(filePath, options);
}

/**
 * Method to prepare sdkman build environment for BOM generation purposes.
 *
 * @param {String} projectType Project type
 */
export function prepareSdkmanBuild(projectType) {
  if (!isSdkmanAvailable()) {
    console.log(
      "Install sdkman by following the instructions at https://sdkman.io/install",
    );
    return;
  }
  const toolType = "java";
  return installSdkmanTool(toolType, projectType);
}

/**
 * Method to check and prepare the environment for python
 *
 * @param {String} filePath Path
 * @param {Object} options CLI Options
 */
export function preparePythonEnv(filePath, options) {
  if (hasAnyProjectType("python", options, false)) {
    if (arch() !== "x64") {
      console.log(
        `INFO: Many pypi packages have poor support for ${arch()} architecture.\nRun the cdxgen container image with --platform=linux/amd64 for best experience.`,
      );
    }
    if (platform() === "win32") {
      console.log(
        "Install the appropriate compilers and build tools on Windows by following this documentation - https://wiki.python.org/moin/WindowsCompilers",
      );
    }
  }
  for (const pt of options.projectType) {
    for (const pyversion of [
      "python36",
      "python38",
      "python39",
      "python310",
      "python311",
      "python312",
    ]) {
      if (
        options.projectType.includes(pyversion) &&
        !process.env.PIP_INSTALL_ARGS
      ) {
        const tempDir = mkdtempSync(join(tmpdir(), "cdxgen-pip-"));
        const py_version_number = pyversion
          .replace("python", "")
          .replace("3", "3.");
        process.env.PIP_INSTALL_ARGS = `--python-version ${py_version_number} --ignore-requires-python --no-warn-conflicts --only-binary=:all:`;
        process.env.PIP_TARGET = tempDir;
        if (DEBUG_MODE) {
          console.log("PIP_INSTALL_ARGS set to", process.env.PIP_INSTALL_ARGS);
          console.log("PIP_TARGET set to", process.env.PIP_TARGET);
        }
        break;
      }
    }
  }
}
