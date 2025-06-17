#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const DOCKER_CMD = process.env.DOCKER_CMD || "docker";

function checkImageExists(owner, repo, tag) {
  const image = `ghcr.io/${owner}/${repo}:${tag}`;
  const args = ["manifest", "inspect", image];
  const result = spawnSync(DOCKER_CMD, args, {
    encoding: "utf-8",
    stdio: "ignore",
    env: process.env,
  });
  if (result.status === 0) {
    console.log(`${image}: Exists`);
    return true;
  } else {
    console.log(`${image}: Not found`);
    return false;
  }
}

function readcsv(acsv) {
  const argsList = [];
  const csvLines = readFileSync(acsv, { encoding: "utf-8" })
    .split("\n")
    .filter(Boolean)
    .slice(1);
  for (const aline of csvLines) {
    const values = aline.split(/[,|]/);
    if (values.length < 3) continue;
    argsList.push({
      owner: values[0].trim(),
      repo: values[1].trim(),
      tag: values[2].trim(),
    });
  }
  return argsList;
}

function main(argvs) {
  if (argvs.length !== 1) {
    console.log("USAGE: node image-avail.js <csv file>");
    process.exit(1);
  }
  if (!existsSync(argvs[0])){
    throw new Error("File does not exist!")
  }
  const imagesList = readcsv(argvs[0]);
  for (const imageArgs of imagesList) {
    if (!imageArgs?.owner || !imageArgs?.repo || !imageArgs?.tag) {
      continue;
    }
    checkImageExists(imageArgs.owner, imageArgs.repo, imageArgs.tag);
  }
}

main(process.argv.slice(2)); 