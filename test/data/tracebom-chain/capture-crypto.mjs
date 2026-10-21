// Captures the raw safer-exec crypto result for the tracebom chain fixtures:
// runs the same curl workload gen.sh drives through bin/tracebom.js, via
// cdxgen's own executeAndTrace (which relays the engine's report-channel
// CRYPTO result unmodified), and writes it to crypto-result.json. Run by
// test/data/tracebom-chain/gen.sh; see that script for the tool versions.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { executeAndTrace } from "../../../lib/inventory/traceRunner.js";

const here = dirname(fileURLToPath(import.meta.url));
const ports = process.argv.slice(2).map(Number).filter(Boolean);
if (!ports.length) {
  console.error("usage: node capture-crypto.mjs <port>...");
  process.exit(1);
}
// One shell: executeAndTrace parses the command itself (no shell), so the
// `;`-joined curls and the empty --noproxy argument must stay inside one
// sh -c argument.
const curls = ports
  .map((port) => `curl -sk --noproxy "" https://localhost:${port}/`)
  .join(" ; ");
const result = await executeAndTrace(`sh -c '${curls}'`, here, {
  proxyEgress: true,
  allowHosts: ["localhost"],
  allowPorts: ports,
  timeoutMs: 60000,
});
if (!result?.cryptoResult?.ciphers?.length) {
  console.error("no crypto result captured; is safer-exec >= 1.2.0 installed?");
  process.exit(1);
}
writeFileSync(
  join(here, "crypto-result.json"),
  `${JSON.stringify(result.cryptoResult, null, 2)}\n`,
);
console.log(
  `captured ${result.cryptoResult.ciphers.length} cipher entr(y|ies) with chains`,
);
