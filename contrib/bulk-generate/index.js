#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getTmpDir } from "../../lib/helpers/utils.js";

let url = import.meta?.url;
if (url && !url.startsWith("file://")) {
  url = new URL(`file://${import.meta.url}`).toString();
}
const dirName = url ? dirname(fileURLToPath(url)) : __dirname;

const DOCKER_CMD = process.env.DOCKER_CMD || "docker";

function gitClone(name, repoUrl, commit, cloneDir) {
  const repoDir = join(cloneDir, name);
  const gitArgs = ["clone", repoUrl, repoDir];
  console.log(`Cloning Repo ${name} to ${repoDir}`);
  let result = spawnSync("git", gitArgs, {
    encoding: "utf-8",
    shell: false,
    cwd: cloneDir,
  });
  if (result.status !== 0) {
    console.log(result.stderr);
    process.exit(1);
  }
  if (!existsSync(repoDir)) {
    console.log(`${repoDir} doesn't exist!`);
    process.exit(1);
  }
  if (commit) {
    result = spawnSync("git", ["checkout", commit], {
      encoding: "utf-8",
      shell: false,
      cwd: repoDir,
    });
    if (result.status !== 0) {
      console.log(`Unable to checkout ${commit}`);
      console.log(result.stderr);
      process.exit(1);
    }
  }
  if (existsSync(join(repoDir, ".gitmodules"))) {
    result = spawnSync("git", ["submodule", "update", "--init"], {
      encoding: "utf-8",
      shell: false,
      cwd: repoDir,
    });
    if (result.status !== 0) {
      console.log(`Unable to checkout ${commit}`);
      console.log(result.stderr);
      process.exit(1);
    }
  }
  return repoDir;
}

function runWithDocker(args, options = {}) {
  console.log(`Executing ${DOCKER_CMD} ${args.join(" ")}`);
  const result = spawnSync(DOCKER_CMD, args, {
    ...options,
    encoding: "utf-8",
    stdio: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.log(result.stdout, result.stderr, result.error);
  }
  return result;
}

function readcsv(acsv, outputDir) {
  const argsList = [];
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, {
      recursive: true,
    });
  }
  const csvLines = readFileSync(acsv, { encoding: "utf-8" })
    .split("\n")
    .slice(1);
  for (const aline of csvLines) {
    const values = aline.split(/[,|]/);
    argsList.push({
      project: values[0],
      link: values[1],
      commit: values[2],
      image: values[3],
      language: values[4],
      cdxgen_vars: values[5],
    });
  }
  return argsList;
}

function main(argvs) {
  if (argvs.length !== 2) {
    console.log("USAGE: node index.js <csv file> <output directory>");
    process.exit(1);
  }
  const tempDir = mkdtempSync(join(getTmpDir(), "bulk-generate-"));
  const reposList = readcsv(argvs[0], argvs[1]);
  for (const repoArgs of reposList) {
    if (!repoArgs?.project?.length) {
      continue;
    }
    const repoDir = gitClone(
      repoArgs.project,
      repoArgs.link,
      repoArgs.commit,
      tempDir,
    );
    const repoOutputDir = join(argvs[1], repoArgs.project, repoArgs.commit);
    const envVars = ["-e", "CDXGEN_DEBUG_MODE=debug"];
    if (repoArgs.cdxgen_vars) {
      for (const avaluePair of repoArgs.cdxgen_vars(" ")) {
        if (avaluePair.includes("=")) {
          envVars.push("-e");
          envVars.push(avaluePair);
        }
      }
    }
    if (!existsSync(repoOutputDir)) {
      mkdirSync(repoOutputDir, {
        recursive: true,
      });
    }
    const bomFile = join(
      repoOutputDir,
      `bom-${repoArgs.language.replaceAll(" ", "-")}.json`,
    );
    const dockerArgs = [
      "run",
      "--rm",
      "--pull=always",
      ...envVars,
      "-v",
      "/tmp:/tmp",
      "-v",
      `${repoDir}:/app:rw`,
      "-w",
      "/app",
      "-it",
      repoArgs.image,
      "-r",
      "/app",
      "-o",
      "/app/bom.json",
    ];
    for (const alang of repoArgs.language.split(" ")) {
      dockerArgs.push("-t");
      dockerArgs.push(alang);
    }
    runWithDocker(dockerArgs, { cwd: repoDir });
    if (existsSync(join(repoDir, "bom.json"))) {
      copyFileSync(join(repoDir, "bom.json"), bomFile);
    } else {
      console.log(
        join(repoDir, "bom.json"),
        "was not found! Check if the image used is valid for this project:",
        repoArgs.image,
        repoArgs.language,
      );
      process.exit(1);
    }
  }
  if (tempDir.startsWith(tmpdir())) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main(process.argv.slice(2));
