import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  CARGO_CMD,
  DOTNET_CMD,
  GCC_CMD,
  GO_CMD,
  JAVA_CMD,
  NODE_CMD,
  NPM_CMD,
  PYTHON_CMD,
  RUSTC_CMD,
  isWin,
} from "./utils.js";

const GIT_COMMAND = process.env.GIT_CMD || "git";

/**
 * Retrieves a git config item
 * @param {string} configKey Git config key
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export const getGitConfig = (configKey, dir) => {
  return execGitCommand(dir, ["config", "--get", configKey]);
};

/**
 * Retrieves the git origin url
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export const getOriginUrl = (dir) => {
  return getGitConfig("remote.origin.url", dir);
};

/**
 * Retrieves the git branch name
 * @param {string} configKey Git config key
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export const getBranch = (configKey, dir) => {
  return execGitCommand(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
};

/**
 * Retrieves the tree and parent hash for a git repo
 * @param {string} dir repo directory
 *
 * @returns Output from git cat-file or undefined
 */
export const gitTreeHashes = (dir) => {
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
        if (tmpA && tmpA.length == 2) {
          treeHashes[tmpA[0]] = tmpA[1];
        }
      }
    });
  }
  return treeHashes;
};

/**
 * Retrieves the files list from git
 * @param {string} dir repo directory
 *
 * @returns Output from git config or undefined
 */
export const listFiles = (dir) => {
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
          ref: `gitoid:blob:sha1:${tmpA[2]}`,
        });
      }
    });
  }
  return filesList;
};

/**
 * Execute a git command
 *
 * @param {string} dir Repo directory
 * @param {Array} args arguments to git command
 *
 * @returns Output from the git command
 */
export const execGitCommand = (dir, args) => {
  return getCommandOutput(GIT_COMMAND, dir, args);
};

/**
 * Collect Java version and installed modules
 *
 * @param {string} dir Working directory
 * @returns Object containing the java details
 */
export const collectJavaInfo = (dir) => {
  const versionDesc = getCommandOutput(JAVA_CMD, dir, ["--version"]);
  const moduleDesc = getCommandOutput(JAVA_CMD, dir, ["--list-modules"]) || "";
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
};

/**
 * Collect dotnet version
 *
 * @param {string} dir Working directory
 * @returns Object containing dotnet details
 */
export const collectDotnetInfo = (dir) => {
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
};

/**
 * Collect python version
 *
 * @param {string} dir Working directory
 * @returns Object containing python details
 */
export const collectPythonInfo = (dir) => {
  const versionDesc = getCommandOutput(PYTHON_CMD, dir, ["--version"]);
  const moduleDesc =
    getCommandOutput(PYTHON_CMD, dir, ["-m", "pip", "--version"]) || "";
  if (versionDesc) {
    return {
      type: "platform",
      name: "python",
      version: versionDesc.replace("Python ", ""),
      description: moduleDesc.replaceAll("\n", "\\n"),
    };
  }
  return undefined;
};

/**
 * Collect node version
 *
 * @param {string} dir Working directory
 * @returns Object containing node details
 */
export const collectNodeInfo = (dir) => {
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
};

/**
 * Collect gcc version
 *
 * @param {string} dir Working directory
 * @returns Object containing gcc details
 */
export const collectGccInfo = (dir) => {
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
};

/**
 * Collect rust version
 *
 * @param {string} dir Working directory
 * @returns Object containing rust details
 */
export const collectRustInfo = (dir) => {
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
};

/**
 * Collect go version
 *
 * @param {string} dir Working directory
 * @returns Object containing go details
 */
export const collectGoInfo = (dir) => {
  const versionDesc = getCommandOutput(GO_CMD, dir, ["version"]);
  if (versionDesc) {
    return {
      type: "platform",
      name: "go",
      version: versionDesc.trim(),
    };
  }
  return undefined;
};

export const collectEnvInfo = (dir) => {
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
};

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
    return cmdOutput.trim();
  }
};
