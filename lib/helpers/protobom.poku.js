import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { assert, it } from "poku";

import { readBinary, writeBinary } from "./protobom.js";
import { getTmpDir } from "./utils.js";

const tempDir = mkdtempSync(join(getTmpDir(), "bin-tests-"));
const testBom = JSON.parse(
  readFileSync("./test/data/bom-java.json", { encoding: "utf-8" }),
);

it("proto binary tests", () => {
  const binFile = join(tempDir, "test.cdx.bin");
  writeBinary({}, binFile);
  assert.deepStrictEqual(existsSync(binFile), true);
  writeBinary(testBom, binFile);
  assert.deepStrictEqual(existsSync(binFile), true);
  let bomObject = readBinary(binFile);
  assert.ok(bomObject);
  assert.deepStrictEqual(
    bomObject.serialNumber,
    "urn:uuid:cc8b5a04-2698-4375-b04c-cedfa4317fee",
  );
  assert.deepStrictEqual(bomObject.specVersion, "1.5");
  bomObject = readBinary(binFile, false, 1.5);
  assert.ok(bomObject);
  assert.deepStrictEqual(
    bomObject.serialNumber,
    "urn:uuid:cc8b5a04-2698-4375-b04c-cedfa4317fee",
  );
  assert.deepStrictEqual(bomObject.specVersion, "1.5");
  if (tempDir?.startsWith(getTmpDir()) && rmSync) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
