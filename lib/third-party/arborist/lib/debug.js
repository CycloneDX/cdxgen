// certain assertions we should do only when testing arborist itself, because
// they are too expensive or aggressive and would break user programs if we
// miss a situation where they are actually valid.
//
// call like this:
//
// /* istanbul ignore next - debug check */
// debug(() => {
//   if (someExpensiveCheck)
//     throw new Error('expensive check should have returned false')
// })
// run in debug mode if explicitly requested, running arborist tests,
// or working in the arborist project directory.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));

const debug =
  process.env.ARBORIST_DEBUG !== "0" &&
  (process.env.ARBORIST_DEBUG === "1" ||
    /\barborist\b/.test(process.env.NODE_DEBUG || "") ||
    (process.env.npm_package_name === "@npmcli/arborist" &&
      ["test", "snap"].includes(process.env.npm_lifecycle_event)) ||
    process.cwd() === resolve(__dirname, ".."));

const debugFunction = debug
  ? (fn) => fn()
  : () => {
      // ignore
    };

const red = process.stderr.isTTY ? (msg) => `\x1B[31m${msg}\x1B[39m` : (m) => m;

debugFunction.log = (...msg) =>
  debugFunction(() => {
    const prefix = `\n${process.pid} ${red(format(msg.shift()))} `;
    msg = (
      prefix +
      format(...msg)
        .trim()
        .split("\n")
        .join(prefix)
    ).trim();
    /* eslint-disable-next-line no-console */
    console.error(msg);
  });

export default debugFunction;
