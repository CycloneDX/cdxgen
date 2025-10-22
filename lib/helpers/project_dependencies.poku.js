import { readFileSync } from "node:fs";

import { assert, it } from "poku";
import { parse as yaml } from "yaml";

it("checks NPM dependency overrides in package.json", async () => {
  const pkgJson = JSON.parse(readFileSync("./package.json", "utf8"));
  for (var dependency in pkgJson.dependencies) {
    assert(
      Object.hasOwn(pkgJson.overrides, dependency),
      `NPM overrides contains dependency ${dependency}`,
    );
    assert(
      pkgJson.overrides[dependency] === pkgJson.dependencies[dependency],
      `NPM overrides contains same version for dependency ${dependency}`,
    );
  }
  for (dependency in pkgJson.devDependencies) {
    assert(
      Object.hasOwn(pkgJson.overrides, dependency),
      `NPM overrides contains devDependency ${dependency}`,
    );
    assert(
      pkgJson.overrides[dependency] === pkgJson.devDependencies[dependency],
      `NPM overrides contains same version for devDependency ${dependency}`,
    );
  }
  for (dependency in pkgJson.optionalDependencies) {
    assert(
      Object.hasOwn(pkgJson.overrides, dependency),
      `NPM overrides contains optionalDependency ${dependency}`,
    );
    assert(
      pkgJson.overrides[dependency] ===
        pkgJson.optionalDependencies[dependency],
      `NPM overrides contains same version for optionalDependency ${dependency}`,
    );
  }
});

it("checks PNPM dependency overrides in package.json", async () => {
  const pkgJson = JSON.parse(readFileSync("./package.json", "utf8"));
  for (var dependency in pkgJson.dependencies) {
    assert(
      Object.hasOwn(pkgJson.pnpm.overrides, dependency),
      `PNPM overrides contains dependency ${dependency}`,
    );
    assert(
      pkgJson.pnpm.overrides[dependency] === pkgJson.dependencies[dependency],
      `PNPM overrides contains same version for dependency ${dependency}`,
    );
  }
  for (dependency in pkgJson.devDependencies) {
    assert(
      Object.hasOwn(pkgJson.pnpm.overrides, dependency),
      `PNPM overrides contains devDependency ${dependency}`,
    );
    assert(
      pkgJson.pnpm.overrides[dependency] ===
        pkgJson.devDependencies[dependency],
      `PNPM overrides contains same version for devDependency ${dependency}`,
    );
  }
  for (dependency in pkgJson.optionalDependencies) {
    assert(
      Object.hasOwn(pkgJson.pnpm.overrides, dependency),
      `PNPM overrides contains optionalDependency ${dependency}`,
    );
    assert(
      pkgJson.pnpm.overrides[dependency] ===
        pkgJson.optionalDependencies[dependency],
      `PNPM overrides contains same version for optionalDependency ${dependency}`,
    );
  }
});

it("compares NPM overrides with PNPM overrides", async () => {
  const pkgJson = JSON.parse(readFileSync("./package.json", "utf8"));
  for (var override in pkgJson.overrides) {
    assert(
      Object.hasOwn(pkgJson.pnpm.overrides, override),
      `PNPM overrides contains NPM override ${override}`,
    );
    assert(
      pkgJson.pnpm.overrides[override] === pkgJson.overrides[override],
      `PNPM overrides contains same version for NPM override ${override}`,
    );
  }
  for (override in pkgJson.pnpm.overrides) {
    assert(
      Object.hasOwn(pkgJson.overrides, override),
      `NPM overrides contains PNPM override ${override}`,
    );
    assert(
      pkgJson.overrides[override] === pkgJson.pnpm.overrides[override],
      `NPM overrides contains same version for PNPM override ${override}`,
    );
  }
});

it("checks PNPM dependency overrides in pnpm-lock.yaml", async () => {
  const pnpmLockYaml = yaml(readFileSync("./pnpm-lock.yaml", "utf8"));
  var _package;
  var packageName;
  var packageVersion;
  for (_package in pnpmLockYaml.packages) {
    const packageInfo = _package.split("@");
    if (packageInfo.length === 2) {
      packageName = packageInfo[0];
      packageVersion = packageInfo[1];
    } else {
      packageName = `@${packageInfo[1]}`;
      packageVersion = packageInfo[2];
    }
    assert(
      Object.hasOwn(pnpmLockYaml.overrides, packageName),
      `PNPM overrides contains package ${packageName}`,
    );
    assert(
      pnpmLockYaml.overrides[packageName] === packageVersion,
      `PNPM overrides contains same version for package ${packageName}`,
    );
  }
  for (packageName of Object.keys(pnpmLockYaml.overrides)) {
    packageVersion = pnpmLockYaml.overrides[packageName];
    if (packageVersion.startsWith("npm:")) {
      console.log(packageVersion);
      _package = packageVersion.substring(4);
      const packageInfo = _package.split("@");
      if (packageInfo.length === 2) {
        packageName = packageInfo[0];
        packageVersion = packageInfo[1];
      } else {
        packageName = `@${packageInfo[1]}`;
        packageVersion = packageInfo[2];
      }
      assert(
        Object.hasOwn(pnpmLockYaml.overrides, packageName),
        `PNPM overrides contains overriden package ${packageName}`,
      );
      assert(
        pnpmLockYaml.overrides[packageName] === packageVersion,
        `PNPM overrides contains same version for overriden package ${packageName}`,
      );
    }
    assert(
      Object.hasOwn(pnpmLockYaml.packages, `${packageName}@${packageVersion}`),
      `Installed packages contains override package ${packageName} with same version`,
    );
  }
});
