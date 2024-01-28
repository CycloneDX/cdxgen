import { spawnSync } from "node:child_process";
import { isWin } from "./utils.js";
import process from "node:process";
import { Buffer } from "node:buffer";

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
    "HEAD"
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
          name: lastParts[lastParts.length - 1]
        });
      }
    });
  }
  return filesList;
};

/**
 * Execute a git command
 * @param {string} dir Repo directory
 * @param {Array} args arguments to git command
 *
 * @returns Output from the git command
 */
export const execGitCommand = (dir, args) => {
  const result = spawnSync(GIT_COMMAND, args, {
    cwd: dir,
    encoding: "utf-8",
    shell: isWin
  });
  if (result.status !== 0 || result.error) {
    return undefined;
  } else {
    const stdout = result.stdout;
    if (stdout) {
      const cmdOutput = Buffer.from(stdout).toString();
      return cmdOutput.trim();
    }
  }
};
