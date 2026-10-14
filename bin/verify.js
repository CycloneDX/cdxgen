#!/usr/bin/env node

import fs from "node:fs";
import { join } from "node:path";
import process from "node:process";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import {
  displayValue,
  loadSharedSecret,
  loadVerificationKey,
  verifyBomSignatures,
} from "../lib/helpers/bomSigner.js";
import {
  getNonCycloneDxErrorMessage,
  isCycloneDxBom,
} from "../lib/helpers/bomUtils.js";
import { isProtoBomPath } from "../lib/helpers/protobomLoader.js";
import {
  dirNameStr,
  retrieveCdxgenVersion,
  safeExistsSync,
} from "../lib/helpers/utils.js";
import { getBomWithOras } from "../lib/managers/oci.js";
import { parseStrictJson } from "../lib/parsers/strictJson.js";

const dirName = dirNameStr;

const _yargs = yargs(hideBin(process.argv));

const args = _yargs
  .option("input", {
    alias: "i",
    default: "bom.json",
    description:
      "Input CycloneDX JSON or protobuf BOM to verify. Default bom.json",
  })
  .option("platform", {
    description: "The platform to validate. No default",
  })
  .option("public-key", {
    type: "array",
    string: true,
    description:
      "Trusted public key in PEM format. Repeat to trust several keys; a signature entry verifies when one of them verifies it.",
  })
  .option("secret-key", {
    type: "string",
    description:
      "File holding the shared secret for HMAC (HS256, HS384, HS512) signatures. HMAC signatures are only accepted with this option.",
  })
  .option("deep", {
    type: "boolean",
    default: true,
    description:
      "Strictly verify all nested component, service, and annotation signatures against the provided keys. Pass --no-deep to verify only the root signature.",
  })
  .option("require-all", {
    type: "boolean",
    default: false,
    description:
      "Require every entry of a signers or chain signature to verify with one of the keys, instead of at least one.",
  })
  .option("allow-nested-only", {
    type: "boolean",
    default: false,
    description:
      "Accept a BOM without a root signature when every component, service, and annotation carries a signature that verifies. No signature then covers the other members of the BOM.",
  })
  .completion("completion", "Generate bash/zsh completion")
  .epilogue("for documentation, visit https://cdxgen.github.io/cdxgen")
  .scriptName("cdx-verify")
  .version(retrieveCdxgenVersion())
  .help(false)
  .option("help", {
    alias: "h",
    type: "boolean",
    description: "Show help",
  })
  .wrap(Math.min(120, yargs().terminalWidth())).argv;

if (args.help) {
  console.log(`${retrieveCdxgenVersion()}\n`);
  _yargs.showHelp();
  process.exit(0);
}

if (args.version) {
  const packageJsonAsString = fs.readFileSync(
    join(dirName, "..", "package.json"),
    "utf-8",
  );
  const packageJson = JSON.parse(packageJsonAsString);

  console.log(packageJson.version);
  process.exit(0);
}

if (process.env?.CDXGEN_NODE_OPTIONS) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} ${process.env.CDXGEN_NODE_OPTIONS}`;
}

async function getBom(args) {
  if (safeExistsSync(args.input)) {
    if (isProtoBomPath(args.input)) {
      console.log(
        "cdx-verify: protobuf BOM input does not currently preserve JSF signature blocks. Verify signatures against the source JSON BOM instead.",
      );
      process.exit(1);
    }
    try {
      return parseStrictJson(fs.readFileSync(args.input));
    } catch (error) {
      console.log(`Failed to parse '${args.input}': ${error.message}`);
      process.exit(1);
    }
  }
  if (
    args.input.includes(":") ||
    args.input.includes("docker") ||
    args.input.includes("ghcr")
  ) {
    try {
      return await getBomWithOras(args.input, args.platform, {
        checkBytes: parseStrictJson,
      });
    } catch (error) {
      console.log(
        `Failed to parse the BOM attached to '${args.input}': ${error.message}`,
      );
      process.exit(1);
    }
  }
  return undefined;
}

const publicKeyFiles = args.publicKey || [];
if (publicKeyFiles.length && args.secretKey) {
  console.log("Use either --public-key or --secret-key, not both.");
  process.exit(1);
}
if (!publicKeyFiles.length && !args.secretKey) {
  console.log(
    "Name the trusted key with --public-key <file>, or --secret-key <file> for HMAC signatures.",
  );
  process.exit(1);
}

const bomJson = await getBom(args);

if (!bomJson) {
  console.log(`${args.input} is invalid!`);
  process.exit(1);
}
if (!isCycloneDxBom(bomJson)) {
  console.log(getNonCycloneDxErrorMessage(bomJson, "cdx-verify"));
  process.exit(1);
}

const verificationKeys = [];
for (const keyFile of args.secretKey ? [args.secretKey] : publicKeyFiles) {
  if (!safeExistsSync(keyFile)) {
    console.log(
      args.secretKey
        ? `Shared secret '${keyFile}' for signature verification is missing!`
        : `Public key '${keyFile}' for signature verification is missing!`,
    );
    process.exit(1);
  }
  try {
    verificationKeys.push(
      args.secretKey
        ? loadSharedSecret(fs.readFileSync(keyFile))
        : loadVerificationKey(fs.readFileSync(keyFile, "utf8")),
    );
  } catch (error) {
    console.log(`Unable to use '${keyFile}': ${error.message}`);
    process.exit(1);
  }
}

function describeEntry(node, entry) {
  const parts = [displayValue(entry.algorithm)];
  if (entry.keyId !== undefined) {
    parts.push(`keyId '${displayValue(entry.keyId)}'`);
  }
  const position =
    node.form === "single" ? "" : `${node.form}[${entry.index}] `;
  return `${position}(${parts.join(", ")})`;
}

function printRejections(node) {
  for (const reason of node.reasons) {
    console.log(`  - ${reason}`);
  }
  for (const entry of node.entries) {
    for (const reason of entry.reasons) {
      console.log(
        `  - ${node.form === "single" ? "" : `${node.form}[${entry.index}]: `}${reason}`,
      );
    }
  }
}

const report = verifyBomSignatures(bomJson, verificationKeys, {
  deep: args.deep,
  allowNestedOnly: args.allowNestedOnly,
  requireAll: args.requireAll,
});

for (const error of report.errors) {
  console.log(error);
}
const keyFiles = args.secretKey ? [args.secretKey] : publicKeyFiles;
if (args.requireAll && report.root?.form) {
  report.root.keysMatched.forEach((matched, index) => {
    if (!matched) {
      console.log(`  - key #${index + 1}: ${keyFiles[index]}`);
    }
  });
}
const invalidNested = report.nested.filter((item) => !item.verified);
for (const item of invalidNested) {
  console.log(`${item.label} signature is invalid!`);
  printRejections(item);
}
if (invalidNested.length) {
  console.log("One or more nested signatures are invalid!");
  if (report.root?.verified) {
    console.log(
      "The root signature verifies with this key. Nested signatures belong to the party that created them, so pass --no-deep to verify only the root signature with this key.",
    );
  }
}
if (report.root && !report.root.verified) {
  console.log("BOM signature is invalid!");
  printRejections(report.root);
  if (!report.root.reasons.length && !report.root.match) {
    console.log(
      "If this BOM was signed with cdxgen 12.8.4, 13.2.0, or an earlier release, re-sign it with this version of cdx-sign.",
    );
  }
}
if (!report.root && !bomJson.signature && !args.allowNestedOnly) {
  console.log(
    "Pass --allow-nested-only to accept a BOM whose components, services, and annotations are all signed.",
  );
}
for (const notice of report.notices) {
  console.log(`Note: ${notice}`);
}
if (!report.verified) {
  process.exit(1);
}

if (report.root) {
  const rootMatch = report.root.match;
  const identifier = rootMatch.keyId
    ? `KeyId: '${displayValue(rootMatch.keyId)}'`
    : `Algorithm: '${rootMatch.algorithm}'`;
  console.log(`✓ Signature is valid! (Matched ${identifier})`);
  const unverified = report.root.entries.filter((entry) => !entry.verified);
  if (unverified.length) {
    console.log(
      `Warning: ${unverified.length} of ${report.root.entries.length} ${report.root.form} entries did not verify with the given key(s). Pass --require-all to fail in that case.`,
    );
    for (const entry of unverified) {
      console.log(
        `  - ${describeEntry(report.root, entry)}: ${entry.reasons[0] || "not verified"}`,
      );
    }
  }
} else {
  console.log(`✓ ${report.nested.length} nested signature(s) are valid!`);
}
const MAX_LISTED_ENTRIES = 10;
const unverifiedNested = report.nested.flatMap((item) =>
  item.entries
    .filter((entry) => !entry.verified)
    .map(
      (entry) =>
        `${item.label} ${describeEntry(item, entry)}: ${entry.reasons[0] || "not verified"}`,
    ),
);
if (unverifiedNested.length) {
  console.log(
    `Warning: ${unverifiedNested.length} nested signature entries did not verify with the given key(s). Pass --require-all to fail in that case.`,
  );
  for (const line of unverifiedNested.slice(0, MAX_LISTED_ENTRIES)) {
    console.log(`  - ${line}`);
  }
  if (unverifiedNested.length > MAX_LISTED_ENTRIES) {
    console.log(`  - and ${unverifiedNested.length - MAX_LISTED_ENTRIES} more`);
  }
}
