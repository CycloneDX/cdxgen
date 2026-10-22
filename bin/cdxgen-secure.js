#!/usr/bin/env node
// cdxgen-secure: cdxgen in secure mode.
//
// This is an entry point of its own rather than a second name for
// bin/cdxgen.js. cdxgen recognised the command from the script path in
// process.argv[1], but bun reports the real file behind a symlink there and
// the npm shims on Windows always name bin/cdxgen.js, so in both cases a
// `cdxgen-secure` that pointed at bin/cdxgen.js ran as plain cdxgen. Turning
// secure mode on here, before any cdxgen module loads, also means the modules
// that read CDXGEN_SECURE_MODE once at import see it.
import process from "node:process";

process.env.CDXGEN_SECURE_MODE = "true";

await import("./cdxgen.js");
