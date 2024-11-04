import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { arch, platform, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";
import {
  SDKMAN_JAVA_TOOL_ALIASES,
  getOrInstallNvmTool,
  installSdkmanTool,
  isNvmAvailable,
  isSdkmanAvailable,
  runSwiftCommand,
} from "../../helpers/envcontext.js";
import {
  DEBUG_MODE,
  TIMEOUT_MS,
  getAllFiles,
  hasAnyProjectType,
} from "../../helpers/utils.js";

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
    if (SDKMAN_JAVA_TOOL_ALIASES[pt]) {
      prepareSdkmanBuild(pt);
      break;
    }
  }
  if (filePath) {
    filePath = resolve(filePath);
  }
  // Check the pre-requisites for various types
  preparePythonEnv(filePath, options);
  prepareNodeEnv(filePath, options);
  prepareSwiftEnv(filePath, options);
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
 * @param {String} _filePath Path
 * @param {Object} options CLI Options
 */
export function preparePythonEnv(_filePath, options) {
  if (hasAnyProjectType(["python"], options, false)) {
    if (process.env?.CDXGEN_IN_CONTAINER !== "true" && arch() !== "x64") {
      console.log(
        `INFO: Many pypi packages have limited support for ${arch()} architecture.\nRun the cdxgen container image with --platform=linux/amd64 for best experience.`,
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
        const py_version_number = pyversion.replace("python3", "3.");
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
      pt.startsWith("node") &&
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

  const result = spawnSync(process.env.SHELL || "bash", ["-c", command], {
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
  if (["0", "false"].includes(process.env?.NODE_INSTALL_ARGS)) {
    return;
  }
  const newPath = `${nvmNodePath}${delimiter}${process.env.PATH}`;
  const installArgs = process.env.NPM_INSTALL_ARGS || "--package-lock-only";
  const resultNpmInstall = spawnSync(
    process.env.SHELL || "bash",
    [
      "-i",
      "-c",
      `export PATH='${nvmNodePath}${delimiter}$PATH' && npm install ${installArgs}`,
    ],
    {
      encoding: "utf-8",
      shell: process.env.SHELL || true,
      timeout: TIMEOUT_MS,
      cwd: filePath,
      env: {
        ...process.env,
        PATH: newPath,
      },
    },
  );

  if (resultNpmInstall.status !== 0 || resultNpmInstall.error) {
    // There was some problem with NpmInstall
    if (DEBUG_MODE) {
      if (resultNpmInstall.stdout) {
        console.log(resultNpmInstall.stdout);
      }
      if (resultNpmInstall.stderr) {
        console.log(resultNpmInstall.stderr);
      }
    }
  }
}

/**
 * Method to check and build the swift project
 *
 * @param {String} filePath Path
 * @param {Object} options CLI Options
 */
export function prepareSwiftEnv(filePath, options) {
  if (hasAnyProjectType(["swift"], options, false)) {
    if (platform() === "win32") {
      console.log(
        "Ensure Swift for Windows is installed by following the instructions at https://www.swift.org/install/windows/",
      );
    }
    if (
      process.env?.CDXGEN_IN_CONTAINER !== "true" &&
      platform() === "linux" &&
      arch() !== "x64"
    ) {
      console.log(
        "INFO: Swift for Linux has known issues on non x64 machines.\nRun the cdxgen container image with --platform=linux/amd64 for best experience.",
      );
    }
    if (options.deep || options?.lifecycle?.includes("post-build")) {
      const swiftFiles = getAllFiles(
        filePath,
        `${options.multiProject ? "**/" : ""}Package*.swift`,
        options,
      );
      const pkgResolvedFiles = getAllFiles(
        filePath,
        `${options.multiProject ? "**/" : ""}Package.resolved`,
        options,
      );
      const outputFileMaps = getAllFiles(
        filePath,
        ".build/**/debug/**/output-file-map.json",
        options,
      );
      const fastlaneFiles = getAllFiles(
        filePath,
        `${options.multiProject ? "**/" : ""}Fastfile`,
        options,
      );
      if (
        (!pkgResolvedFiles.length || !outputFileMaps.length) &&
        swiftFiles.length
      ) {
        if (fastlaneFiles.length) {
          console.log(
            "For best results, build the project using the 'bundle exec fastlane' command prior to invoking cdxgen.",
          );
          console.log(
            "Look for any Makefile or CI workflow files to identify the full command along with the arguments to build this project.\nYou may also need access to keychain and private dependencies used.",
          );
          return;
        }
        for (const f of swiftFiles) {
          const basePath = dirname(f);
          console.log(
            "Attempting to generate the Package.resolved file",
            basePath,
          );
          const cmdOutput = runSwiftCommand(basePath, [
            "package",
            "-v",
            "resolve",
          ]);
          const resolvedFile = join(basePath, "Package.resolved");
          if (!cmdOutput) {
            console.log(
              "Swift build was not successful. Build this project manually before invoking cdxgen.",
            );
          }
          if (!existsSync(resolvedFile)) {
            console.log(
              "Package.resolved file did not get generated successfully. Check the Package.swift file for declared dependencies.\nCheck if any private registry needs to be configured for the build to succeed.",
            );
          }
        }
      }
    }
  }
}
