import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import process from "node:process";
import {
  CARGO_CMD,
  DOTNET_CMD,
  GCC_CMD,
  GO_CMD,
  NODE_CMD,
  NPM_CMD,
  RUSTC_CMD,
  getJavaCommand,
  getPythonCommand,
  isWin,
} from "./utils.js";

export const GIT_COMMAND = process.env.GIT_CMD || "git";

// sdkman tool aliases
export const SDKMAN_TOOL_ALIASES = {
  java8: "8.0.422-tem",
  java11: "11.0.24-tem",
  java17: "17.0.12-tem",
  java21: "21.0.4-tem",
  java22: "22.0.2-tem",
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
export function getBranch(configKey, dir) {
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
  const result = spawnSync(cmd, args, {
    cwd: dir,
    encoding: "utf-8",
    shell: isWin,
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
    process.env?.SDKMAN_VERSION &&
    ["SDKMAN_DIR", "SDKMAN_CANDIDATES_DIR"].filter(
      (v) => process.env[v] && existsSync(process.env[v]),
    ).length === 2;
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
      },
    );
    if (result.status === 1 || result.error) {
      if (console.stdout) {
        console.log(result.stdout);
      }
      if (console.stderr) {
        console.log(result.stderr);
      }
      return false;
    }
  }
  const toolUpper = toolType.toUpperCase();
  // Set process env variables
  if (process.env[`${toolUpper}_HOME`]) {
    process.env[`${toolUpper}_HOME`] = process.env[`${toolUpper}_HOME`].replace(
      "current",
      toolName,
    );
  } else if (process.env.SDKMAN_CANDIDATES_DIR) {
    process.env[`${toolUpper}_HOME`] = join(
      process.env.SDKMAN_CANDIDATES_DIR,
      toolType,
      toolName,
    );
  }
  const toolCurrentBin = join(toolType, "current", "bin");
  if (process.env?.PATH.includes(toolCurrentBin)) {
    process.env.PATH = process.env.PATH.replace(
      toolCurrentBin,
      join(toolType, toolName, "bin"),
    );
  } else if (process.env.SDKMAN_CANDIDATES_DIR) {
    process.env.PATH = `${process.env.PATH}${delimiter}${join(process.env.SDKMAN_CANDIDATES_DIR, toolType, toolName, "bin")}`;
  }
  return true;
}

/**
 * Retrieve sdkman tool full name
 */
function getSdkmanToolFullname(toolName) {
  return SDKMAN_TOOL_ALIASES[toolName] || toolName;
}
