import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { MAX_BUFFER, getAllFiles, getTmpDir, isWin } from "../helpers/utils.js";

export function getBomWithOras(image) {
  let result = spawnSync(
    "oras",
    [
      "discover",
      "--format",
      "json",
      "--artifact-type",
      "sbom/cyclonedx",
      image,
    ],
    {
      encoding: "utf-8",
      shell: isWin,
      maxBuffer: MAX_BUFFER,
    },
  );
  if (result.status !== 0 || result.error) {
    console.log(
      "Install oras by following the instructions at: https://oras.land/docs/installation",
    );
    if (result.stderr) {
      console.log(result.stderr);
    }
    return undefined;
  }
  if (result.stdout) {
    const out = Buffer.from(result.stdout).toString();
    try {
      const manifestObj = JSON.parse(out);
      if (
        manifestObj?.manifests?.length &&
        Array.isArray(manifestObj.manifests) &&
        manifestObj.manifests[0]?.reference
      ) {
        const imageRef = manifestObj.manifests[0].reference;
        const tmpDir = getTmpDir();
        result = spawnSync("oras", ["pull", imageRef, "-o", tmpDir], {
          encoding: "utf-8",
          shell: isWin,
          maxBuffer: MAX_BUFFER,
        });
        if (result.status !== 0 || result.error) {
          console.log(
            `Unable to pull the SBOM attachment for ${imageRef} with oras!`,
          );
          return undefined;
        }
        const bomFiles = getAllFiles(tmpDir, "**/*.{bom,cdx}.json");
        if (bomFiles.length) {
          return JSON.parse(fs.readFileSync(bomFiles.pop(), "utf8"));
        }
      } else {
        console.log(`${image} does not contain any SBOM attachment!`);
      }
    } catch (e) {
      console.log(e);
    }
  }
  return undefined;
}
