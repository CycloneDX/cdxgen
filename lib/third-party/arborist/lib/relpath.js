import { relative } from "node:path";

const relpath = (from, to) => relative(from, to).replace(/\\/g, "/");

export default relpath;
