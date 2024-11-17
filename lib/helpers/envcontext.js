import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";
import {
  CARGO_CMD,
  DEBUG_MODE,
  DOTNET_CMD,
  GCC_CMD,
  GO_CMD,
  MAX_BUFFER,
  NODE_CMD,
  NPM_CMD,
  RUSTC_CMD,
  SWIFT_CMD,
  TIMEOUT_MS,
  getJavaCommand,
  getPythonCommand,
  isWin,
} from "./utils.js";

export const GIT_COMMAND = process.env.GIT_CMD || "git";

// sdkman tool aliases
export const SDKMAN_JAVA_TOOL_ALIASES = {
  java8: process.env.JAVA8_TOOL || "8.0.432-tem",
  java11: process.env.JAVA11_TOOL || "11.0.25-tem",
  java17: process.env.JAVA17_TOOL || "17.0.13-tem",
  java21: process.env.JAVA21_TOOL || "21.0.5-tem",
  java22: process.env.JAVA22_TOOL || "22.0.2-tem",
  java23: process.env.JAVA23_TOOL || "23.0.1-tem",
};

/**
 * Retrieves a git config item
 * @param {string} configKey Git config key
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export function getGitConfig(configKey, dir) {
  return execGitCommand(dir, ["config", "--get", configKey]);
}

/**
 * Retrieves the git origin url
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export function getOriginUrl(dir) {
  return getGitConfig("remote.origin.url", dir);
}

/**
 * Retrieves the git branch name
 * @param {string} configKey Git config key
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export function getBranch(_configKey, dir) {
  return execGitCommand(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

/**
 * Retrieves the tree and parent hash for a git repo
 * @param {string} dir repo directory
 *
 * @returns Output from git cat-file or undefined
 */
export function gitTreeHashes(dir) {
  const treeHashes = {};
  const output = execGitCommand(dir, ["cat-file", "commit", "HEAD"]);
  if (output) {
    output.split("\n").forEach((l) => {
      l = l.replace("\r", "");
      if (l === "\n" || l.startsWith("#")) {
        return;
      }
      if (l.startsWith("tree") || l.startsWith("parent")) {
        const tmpA = l.split(" ");
        if (tmpA && tmpA.length === 2) {
          treeHashes[tmpA[0]] = tmpA[1];
        }
      }
    });
  }
  return treeHashes;
}

/**
 * Retrieves the files list from git
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export function listFiles(dir) {
  const filesList = [];
  const output = execGitCommand(dir, [
    "ls-tree",
    "-l",
    "-r",
    "--full-tree",
    "HEAD",
  ]);
  if (output) {
    output.split("\n").forEach((l) => {
      l = l.replace("\r", "");
      if (l === "\n" || l.startsWith("#")) {
        return;
      }
      const tmpA = l.split(" ");
      if (tmpA && tmpA.length >= 5) {
        const lastParts = tmpA[tmpA.length - 1].split("\t");
        filesList.push({
          hash: tmpA[2],
          name: lastParts[lastParts.length - 1],
          omniborId: `gitoid:blob:sha1:${tmpA[2]}`,
          swhid: `swh:1:rev:${tmpA[2]}`,
        });
      }
    });
  }
  return filesList;
}

/**
 * Execute a git command
 *
 * @param {string} dir Repo directory
 * @param {Array} args arguments to git command
 *
 * @returns Output from the git command
 */
export function execGitCommand(dir, args) {
  return getCommandOutput(GIT_COMMAND, dir, args);
}

/**
 * Collect Java version and installed modules
 *
 * @param {string} dir Working directory
 * @returns Object containing the java details
 */
export function collectJavaInfo(dir) {
  const versionDesc = getCommandOutput(getJavaCommand(), dir, ["--version"]);
  const moduleDesc =
    getCommandOutput(getJavaCommand(), dir, ["--list-modules"]) || "";
  if (versionDesc) {
    return {
      type: "platform",
      name: "java",
      version: versionDesc.split("\n")[0].replace("java ", ""),
      description: versionDesc,
      properties: [
        {
          name: "java:modules",
          value: moduleDesc.replaceAll("\n", ", "),
        },
      ],
    };
  }
  return undefined;
}

/**
 * Collect dotnet version
 *
 * @param {string} dir Working directory
 * @returns Object containing dotnet details
 */
export function collectDotnetInfo(dir) {
  const versionDesc = getCommandOutput(DOTNET_CMD, dir, ["--version"]);
  const moduleDesc =
    getCommandOutput(DOTNET_CMD, dir, ["--list-runtimes"]) || "";
  if (versionDesc) {
    return {
      type: "platform",
      name: "dotnet",
      version: versionDesc.trim(),
      description: moduleDesc.replaceAll("\n", "\\n"),
    };
  }
  return undefined;
}

/**
 * Collect python version
 *
 * @param {string} dir Working directory
 * @returns Object containing python details
 */
export function collectPythonInfo(dir) {
  const versionDesc = getCommandOutput(getPythonCommand(), dir, ["--version"]);
  const moduleDesc =
    getCommandOutput(getPythonCommand(), dir, ["-m", "pip", "--version"]) || "";
  if (versionDesc) {
    return {
      type: "platform",
      name: "python",
      version: versionDesc.replace("Python ", ""),
      description: moduleDesc.replaceAll("\n", "\\n"),
    };
  }
  return undefined;
}

/**
 * Collect node version
 *
 * @param {string} dir Working directory
 * @returns Object containing node details
 */
export function collectNodeInfo(dir) {
  const versionDesc = getCommandOutput(NODE_CMD, dir, ["--version"]);
  let moduleDesc = getCommandOutput(NPM_CMD, dir, ["--version"]);
  if (moduleDesc) {
    moduleDesc = `npm: ${moduleDesc}`;
  }
  if (versionDesc) {
    return {
      type: "platform",
      name: "node",
      version: versionDesc.trim(),
      description: moduleDesc,
    };
  }
  return undefined;
}

/**
 * Collect gcc version
 *
 * @param {string} dir Working directory
 * @returns Object containing gcc details
 */
export function collectGccInfo(dir) {
  const versionDesc = getCommandOutput(GCC_CMD, dir, ["--version"]);
  const moduleDesc = getCommandOutput(GCC_CMD, dir, ["-print-search-dirs"]);
  if (versionDesc) {
    return {
      type: "platform",
      name: "gcc",
      version: versionDesc.split("\n")[0],
      description: moduleDesc.replaceAll("\n", "\\n"),
    };
  }
  return undefined;
}

/**
 * Collect rust version
 *
 * @param {string} dir Working directory
 * @returns Object containing rust details
 */
export function collectRustInfo(dir) {
  const versionDesc = getCommandOutput(RUSTC_CMD, dir, ["--version"]);
  const moduleDesc = getCommandOutput(CARGO_CMD, dir, ["--version"]);
  if (versionDesc) {
    return {
      type: "platform",
      name: "rustc",
      version: versionDesc.trim(),
      description: moduleDesc.trim(),
    };
  }
  return undefined;
}

/**
 * Collect go version
 *
 * @param {string} dir Working directory
 * @returns Object containing go details
 */
export function collectGoInfo(dir) {
  const versionDesc = getCommandOutput(GO_CMD, dir, ["version"]);
  if (versionDesc) {
    return {
      type: "platform",
      name: "go",
      version: versionDesc.trim(),
    };
  }
  return undefined;
}

/**
 * Collect swift version
 *
 * @param {string} dir Working directory
 * @returns Object containing swift details
 */
export function collectSwiftInfo(dir) {
  const versionDesc = getCommandOutput(SWIFT_CMD, dir, ["--version"]);
  if (versionDesc) {
    return {
      type: "platform",
      name: "swift",
      version: versionDesc.trim(),
    };
  }
  return undefined;
}

/**
 * Method to run a swift command
 *
 * @param {String} dir Working directory
 * @param {Array} args Command arguments
 * @returns Object containing swift details
 */
export function runSwiftCommand(dir, args) {
  return getCommandOutput(SWIFT_CMD, dir, args);
}

export function collectEnvInfo(dir) {
  const infoComponents = [];
  let cmp = collectJavaInfo(dir);
  if (cmp) {
    infoComponents.push(cmp);
  }
  cmp = collectDotnetInfo(dir);
  if (cmp) {
    infoComponents.push(cmp);
  }
  cmp = collectPythonInfo(dir);
  if (cmp) {
    infoComponents.push(cmp);
  }
  cmp = collectNodeInfo(dir);
  if (cmp) {
    infoComponents.push(cmp);
  }
  cmp = collectGccInfo(dir);
  if (cmp) {
    infoComponents.push(cmp);
  }
  cmp = collectRustInfo(dir);
  if (cmp) {
    infoComponents.push(cmp);
  }
  cmp = collectGoInfo(dir);
  if (cmp) {
    infoComponents.push(cmp);
  }
  return infoComponents;
}

/**
 * Execute any command to retrieve the output
 *
 * @param {*} cmd Command to execute
 * @param {*} dir working directory
 * @param {*} args arguments
 * @returns String output from the command or undefined in case of error
 */
const getCommandOutput = (cmd, dir, args) => {
  let commandToUse = cmd;
  // If the command includes space, automatically move it to the front of the args.
  if (cmd?.trim().includes(" ")) {
    const tmpA = cmd.split(" ");
    commandToUse = tmpA.shift();
    if (args?.length && tmpA.length) {
      args = tmpA.concat(args);
    }
  }
  if (DEBUG_MODE) {
    console.log(`Executing ${commandToUse} ${args.join(" ")} in ${dir}`);
  }
  const result = spawnSync(commandToUse, args, {
    cwd: dir,
    encoding: "utf-8",
    shell: isWin,
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  if (result.status !== 0 || result.error) {
    return undefined;
  }
  const stdout = result.stdout;
  if (stdout) {
    const cmdOutput = Buffer.from(stdout).toString();
    return cmdOutput.trim().replaceAll("\r", "");
  }
};

/**
 * Method to check if sdkman is available.
 */
export function isSdkmanAvailable() {
  let isSdkmanSetup =
    ["SDKMAN_DIR", "SDKMAN_CANDIDATES_DIR"].filter(
      (v) => process.env[v] && existsSync(process.env[v]),
    ).length >= 1;
  if (!isSdkmanSetup && existsSync(join(homedir(), ".sdkman", "bin"))) {
    process.env.SDKMAN_DIR = join(homedir(), ".sdkman");
    process.env.SDKMAN_CANDIDATES_DIR = join(
      homedir(),
      ".sdkman",
      "candidates",
    );
    isSdkmanSetup = true;
  }
  return isSdkmanSetup;
}

/**
 * Method to check if nvm is available.
 */
export function isNvmAvailable() {
  let isNvmSetup = false;
  const result = spawnSync(process.env.SHELL || "bash", ["-i", "-c", "nvm"], {
    encoding: "utf-8",
    shell: process.env.SHELL || true,
  });
  if (result.status === 0) {
    isNvmSetup = true;
  }
  return isNvmSetup;
}

/**
 * Method to check if a given sdkman tool is installed and available.
 *
 * @param {String} toolType Tool type such as java, gradle, maven etc.
 * @param {String} toolName Tool name with version. Eg: 22.0.2-tem
 *
 * @returns {Boolean} true if the tool is available. false otherwise.
 */
export function isSdkmanToolAvailable(toolType, toolName) {
  toolName = getSdkmanToolFullname(toolName);
  let isToolAvailable =
    process.env.SDKMAN_CANDIDATES_DIR &&
    existsSync(
      join(process.env.SDKMAN_CANDIDATES_DIR, toolType, toolName, "bin"),
    );
  if (
    !isToolAvailable &&
    existsSync(
      join(homedir(), ".sdkman", "candidates", toolType, toolName, "bin"),
    )
  ) {
    process.env.SDKMAN_CANDIDATES_DIR = join(
      homedir(),
      ".sdkman",
      "candidates",
    );
    isToolAvailable = true;
  }
  return isToolAvailable;
}

/**
 * Method to install and use a given sdkman tool.
 *
 * @param {String} toolType Tool type such as java, gradle, maven etc.
 * @param {String} toolName Tool name with version. Eg: 22.0.2-tem
 *
 * @returns {Boolean} true if the tool is available. false otherwise.
 */
export function installSdkmanTool(toolType, toolName) {
  if (isWin) {
    return false;
  }
  toolName = getSdkmanToolFullname(toolName);
  let result = undefined;
  if (!isSdkmanToolAvailable(toolType, toolName)) {
    console.log("About to install", toolType, toolName);
    result = spawnSync(
      process.env.SHELL || "bash",
      ["-i", "-c", `"echo -e "no" | sdk install ${toolType} ${toolName}"`],
      {
        encoding: "utf-8",
        shell: process.env.SHELL || true,
        timeout: TIMEOUT_MS,
      },
    );
    if (DEBUG_MODE) {
      if (console.stdout) {
        console.log(result.stdout);
      }
      if (console.stderr) {
        console.log(result.stderr);
      }
    }
    if (result.status === 1 || result.error) {
      console.log(
        "Unable to install",
        toolType,
        toolName,
        "due to below errors.",
      );
      return false;
    }
  }
  const toolUpper = toolType.toUpperCase();
  // Set process env variables
  if (
    process.env[`${toolUpper}_HOME`] &&
    process.env[`${toolUpper}_HOME`].includes("current")
  ) {
    process.env[`${toolUpper}_HOME`] = process.env[`${toolUpper}_HOME`].replace(
      "current",
      toolName,
    );
    console.log(
      `${toolUpper}_HOME`,
      "set to",
      process.env[`${toolUpper}_HOME`],
    );
  } else if (
    process.env.SDKMAN_CANDIDATES_DIR &&
    existsSync(join(process.env.SDKMAN_CANDIDATES_DIR, toolType, toolName))
  ) {
    process.env[`${toolUpper}_HOME`] = join(
      process.env.SDKMAN_CANDIDATES_DIR,
      toolType,
      toolName,
    );
    console.log(
      `${toolUpper}_HOME`,
      "set to",
      process.env[`${toolUpper}_HOME`],
    );
  } else {
    console.log(
      "Directory",
      join(process.env.SDKMAN_CANDIDATES_DIR, toolType, toolName),
      "is not found",
    );
  }
  const toolCurrentBin = join(toolType, "current", "bin");
  if (process.env?.PATH.includes(toolCurrentBin)) {
    process.env.PATH = process.env.PATH.replace(
      toolCurrentBin,
      join(toolType, toolName, "bin"),
    );
  } else if (process.env.SDKMAN_CANDIDATES_DIR) {
    const fullToolBinDir = join(
      process.env.SDKMAN_CANDIDATES_DIR,
      toolType,
      toolName,
      "bin",
    );
    if (!process.env?.PATH?.includes(fullToolBinDir)) {
      process.env.PATH = `${fullToolBinDir}${delimiter}${process.env.PATH}`;
    }
  }
  return true;
}

/**
 * Method to check if a given nvm tool is installed and available.
 *
 * @param {String} toolName Tool name with version. Eg: 22.0.2-tem
 *
 * @returns {String} path of nvm if present, otherwise false
 */
export function getNvmToolDirectory(toolName) {
  const resultWhichNode = spawnSync(
    process.env.SHELL || "bash",
    ["-i", "-c", `"nvm which ${toolName}"`],
    {
      encoding: "utf-8",
      shell: process.env.SHELL || true,
      timeout: TIMEOUT_MS,
    },
  );
  if (DEBUG_MODE) {
    if (console.stdout) {
      console.log(resultWhichNode.stdout);
    }
    if (console.stderr) {
      console.log(resultWhichNode.stderr);
    }
  }
  if (resultWhichNode.status !== 0 || resultWhichNode.stderr) {
    return;
  }

  return dirname(resultWhichNode.stdout.trim());
}

/**
 * Method to return nvm tool path
 *
 * @param {String} toolVersion Tool name with version. Eg: 22.0.2-tem
 *
 * @returns {String} path of the tool if not found installs and then returns paths. false if encounters an error.
 */
export function getOrInstallNvmTool(toolVersion) {
  const nvmNodePath = getNvmToolDirectory(toolVersion);
  if (!nvmNodePath) {
    // nvm couldn't directly use toolName so maybe needs to be installed
    const resultInstall = spawnSync(
      process.env.SHELL || "bash",
      ["-i", "-c", `"nvm install ${toolVersion}"`],
      {
        encoding: "utf-8",
        shell: process.env.SHELL || true,
        timeout: TIMEOUT_MS,
      },
    );

    if (DEBUG_MODE) {
      if (console.stdout) {
        console.log(resultInstall.stdout);
      }
      if (console.stderr) {
        console.log(resultInstall.stderr);
      }
    }

    if (resultInstall.status !== 0) {
      // There was some problem install the tool
      // output has already been printed out
      return false;
    }
    const nvmNodePath = getNvmToolDirectory(toolVersion);
    if (nvmNodePath) {
      return nvmNodePath;
    }
    return false;
  }
  return nvmNodePath;
}

/**
 * Retrieve sdkman tool full name
 */
function getSdkmanToolFullname(toolName) {
  return SDKMAN_JAVA_TOOL_ALIASES[toolName] || toolName;
}
