import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { arch, platform, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  SDKMAN_TOOL_ALIASES,
  getNvmToolDirectory,
  getOrInstallNvmTool,
  installSdkmanTool,
  isNvmAvailable,
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
  prepareNodeEnv(filePath, options);
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

/**
 * Method to check and prepare the environment for node
 *
 * @param {String} filePath Path
 * @param {Object} options CLI Options
 */
export function prepareNodeEnv(filePath, options) {
  // check tool for windows
  for (const pt of options.projectType) {
    const nodeVersion = pt.replace(/\D/g, "");
    if (
      pt.startsWith("nodejs") &&
      nodeVersion &&
      !process.env.NODE_INSTALL_ARGS
    ) {
      if (!isNvmAvailable()) {
        if (process.env.NVM_DIR) {
          // for scenarios where nvm is not present, but
          // we have $NVM_DIR
          // custom logic to find nvmNodePath
          let nvmNodePath;
          const possibleNodeDir = join(process.env.NVM_DIR, "versions", "node");

          if (!tryLoadNvmAndInstallTool(nodeVersion)) {
            console.log(
              `Could not install Nodejs${nodeVersion}. There is a problem with loading nvm from ${process.env.NVM_DIR}`,
            );
            return;
          }

          const nodeVersionArray = readdirSync(possibleNodeDir, {
            withFileTypes: true,
          });
          const nodeRe = new RegExp(`^v${nodeVersion}.`);
          for (const nodeVersionsIter of nodeVersionArray) {
            const fullPath = join(possibleNodeDir, nodeVersionsIter.name);
            if (
              nodeVersionsIter.isDirectory() &&
              nodeRe.test(nodeVersionsIter.name)
            ) {
              nvmNodePath = join(fullPath, "bin");
            }
          }
          if (nvmNodePath) {
            doNpmInstall(filePath, nvmNodePath);
          } else {
            console.log(
              `"node version ${nodeVersion} was not found. Please install it with 'nvm install ${nodeVersion}"`,
            );
            return;
          }
        } else {
          console.log(
            "Install nvm by following the instructions at https://github.com/nvm-sh/nvm",
          );
          return;
        }
      }
      // set path instead of nvm use
      const nvmNodePath = getOrInstallNvmTool(nodeVersion);
      doNpmInstall(filePath, nvmNodePath);
    }
  }
}

/**
 * If NVM_DIR is in path, however nvm command is not loaded.
 * it is possible that required nodeVersion is not installed.
 * This function loads nvm and install the nodeVersion
 *
 * @param {String} nodeVersion required version number
 *
 * @returns {Boolean} true if successful, otherwise false
 */
export function tryLoadNvmAndInstallTool(nodeVersion) {
  const NVM_DIR = process.env.NVM_DIR;

  const command = `
      if [ -f ${NVM_DIR}/nvm.sh ]; then
        . ${NVM_DIR}/nvm.sh
        nvm install ${nodeVersion}
      else
        echo "NVM script not found at ${NVM_DIR}/nvm.sh"
        exit 1
      fi
      `;

  const spawnedShell = spawnSync(process.env.SHELL || "bash", ["-c", command], {
    encoding: "utf-8",
    shell: process.env.SHELL || true,
  });

  return result.status === 0;
}

/**
 * This method installs and create package-lock.json
 *
 * @param {String} filePath Path
 * @param {String} nvmNodePath Path to node version in nvm
 */
export function doNpmInstall(filePath, nvmNodePath) {
  // we do not install if INSTALL_ARGS set false
  if (process.env.NODE_INSTALL_ARGS === false) {
    return;
  }

  const newPath = `${nvmNodePath}${delimiter}${process.env.PATH}`;

  const resultNpmInstall = spawnSync(
    process.env.SHELL || "bash",
    [
      "-i",
      "-c",
      `export PATH='${nvmNodePath}${delimiter}$PATH' && npm install --package-lock-only`,
    ],
    {
      encoding: "utf-8",
      shell: process.env.SHELL || true,
      cwd: filePath,
      env: {
        ...process.env,
        PATH: newPath,
      },
    },
  );

  if (resultNpmInstall.status !== 0 || resultNpmInstall.stderr) {
    // There was some problem with NpmInstall
    if (DEBUG_MODE) {
      if (console.stdout) {
        console.log(result.stdout);
      }
      if (console.stderr) {
        console.log(result.stderr);
      }
    }
  }
}
