import { Console } from "node:console";
import fs from "node:fs";
import process from "node:process";
import colors from "yoctocolors";

// Enable think mode
export const THINK_MODE =
  process.env.CDXGEN_THOUGHT_LOG ||
  ["true", "1"].includes(process.env.CDXGEN_THINK_MODE);

const output = process.env.CDXGEN_THOUGHT_LOG
  ? fs.createWriteStream(process.env.CDXGEN_THOUGHT_LOG)
  : process.stdout;
const errorOutput = process.env.CDXGEN_THOUGHT_LOG
  ? fs.createWriteStream(process.env.CDXGEN_THOUGHT_LOG)
  : process.stderr;
const tlogger = new Console({ stdout: output, stderr: errorOutput });

if (THINK_MODE) {
  tlogger.group(colorizeText("<think>"));
}
export function thoughtLog(s, args) {
  if (!THINK_MODE) {
    return;
  }
  if (!s?.endsWith(".") && !s?.endsWith("?") && !s?.endsWith("!")) {
    s = `${s}.`;
  }
  if (args) {
    tlogger.log(colorizeText(`${s}`), args);
  } else {
    tlogger.log(colorizeText(`${s}`));
  }
}
export function thoughtEnd() {
  if (THINK_MODE) {
    tlogger.groupEnd();
    tlogger.log(colorizeText("</think>"));
  }
}

function colorizeText(s) {
  s = s.replace(/(\d+)/g, colors.cyanBright("$1"));
  return process.env.CDXGEN_THOUGHT_LOG ? s : colors.dim(s);
}
