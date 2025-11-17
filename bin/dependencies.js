#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { parse as yaml } from "yaml";

const pkgJson = JSON.parse(readFileSync("./package.json", "utf8"));
const pnpmLockYaml = yaml(readFileSync("./pnpm-lock.yaml", "utf8"));

const installedPackages = [];

const incorrectNpmOverridesVersions = [];
const incorrectPnpmOverridesVersions = [];
const missingNpmOverrides = [];
const missingPnpmOverrides = [];

const obsoleteNpmOverrides = [];
const obsoletePnpmOverrides = [];

var packageName;
var packageVersion;
for (const _package in pnpmLockYaml.packages) {
  const packageInfo = _package.split("@");
  if (packageInfo.length === 2) {
    packageName = packageInfo[0];
    packageVersion = packageInfo[1];
  } else {
    packageName = `@${packageInfo[1]}`;
    packageVersion = packageInfo[2];
  }
  installedPackages.push(packageName);
  if (!Object.hasOwn(pkgJson.overrides, packageName)) {
    missingNpmOverrides.push(`  "${packageName}": "${packageVersion}"`);
  } else if (pkgJson.overrides[packageName] !== packageVersion) {
    incorrectNpmOverridesVersions.push(
      ` - ${packageName} (${pkgJson.overrides[packageName]} instead of ${packageVersion})`,
    );
  }
  if (!Object.hasOwn(pkgJson.pnpm.overrides, packageName)) {
    missingPnpmOverrides.push(`  "${packageName}": "${packageVersion}"`);
  } else if (pkgJson.pnpm.overrides[packageName] !== packageVersion) {
    incorrectPnpmOverridesVersions.push(
      ` - ${packageName} (${pkgJson.pnpm.overrides[packageName]} instead of ${packageVersion})`,
    );
  }
}
for (const override in pkgJson.overrides) {
  checkOverride(override, pkgJson.overrides, obsoleteNpmOverrides);
}
for (const override in pkgJson.pnpm.overrides) {
  checkOverride(override, pkgJson.pnpm.overrides, obsoletePnpmOverrides);
}

export function checkDependencies() {
  return (
    incorrectNpmOverridesVersions.length +
    incorrectPnpmOverridesVersions.length +
    missingNpmOverrides.length +
    missingPnpmOverrides.length +
    obsoleteNpmOverrides.length +
    obsoletePnpmOverrides.length
  );
}

function checkOverride(override, overrideList, obsoletionArray) {
  if (
    !installedPackages.includes(override) &&
    !overrideList[override].startsWith("npm:")
  ) {
    obsoletionArray.push(override);
  }
}

if (missingNpmOverrides.length) {
  console.log("The following dependencies are not in the 'overrides'-block:");
  console.log(missingNpmOverrides.join(",\n"));
}
if (incorrectNpmOverridesVersions.length) {
  console.log(
    "The following dependencies have a different version in the 'overrides'-block:",
  );
  console.log(incorrectNpmOverridesVersions.join("\n"));
}
if (missingPnpmOverrides.length) {
  console.log(
    "The following dependencies are not in the 'pnpm.overrides'-block:",
  );
  console.log(missingPnpmOverrides.join(",\n"));
}
if (incorrectPnpmOverridesVersions.length) {
  console.log(
    "The following dependencies have a different version in the 'pnpm.overrides'-block:",
  );
  console.log(incorrectPnpmOverridesVersions.join("\n"));
}
if (obsoleteNpmOverrides.length) {
  console.log("The following entries in 'overrides' are not used:");
  console.log(obsoleteNpmOverrides.join("\n"));
}
if (obsoletePnpmOverrides.length) {
  console.log("The following entries in 'pnpm.overrides' are not used:");
  console.log(obsoletePnpmOverrides.join("\n"));
}
