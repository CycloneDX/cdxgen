// this file is a wrapper of ./lib/cli/index.js that can be used by commonjs projects importing this module
// that prefer to use require instead of await import()
const importPromise = import("./lib/cli/index.js");

module.exports = new Proxy(
  {},
  {
    get:
      (_, prop) =>
      async (...args) => {
        const mod = await importPromise;
        return typeof mod[prop] === "function" ? mod[prop](...args) : mod[prop];
      },
  },
);
