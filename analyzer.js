import { parse } from "@babel/parser";
import babelTraverse from "@babel/traverse";
import { join } from "path";
import { readdirSync, statSync, readFileSync } from "fs";
import { basename, resolve, isAbsolute } from "path";

const IGNORE_DIRS = [
  "node_modules",
  "venv",
  "docs",
  "test",
  "tests",
  "e2e",
  "examples",
  "cypress",
  "site-packages",
  "typings",
  "api_docs",
  "dev_docs",
  "types",
  "mock",
  "mocks"
];

const IGNORE_FILE_PATTERN = new RegExp(
  "(conf|test|spec|mock|\\.d)\\.(js|ts|tsx)$",
  "i"
);

const getAllFiles = (dir, extn, files, result, regex) => {
  files = files || readdirSync(dir);
  result = result || [];
  regex = regex || new RegExp(`\\${extn}$`);

  for (let i = 0; i < files.length; i++) {
    if (IGNORE_FILE_PATTERN.test(files[i])) {
      continue;
    }
    let file = join(dir, files[i]);
    if (statSync(file).isDirectory()) {
      // Ignore directories
      const dirName = basename(file);
      if (
        dirName.startsWith(".") ||
        IGNORE_DIRS.includes(dirName.toLowerCase())
      ) {
        continue;
      }
      try {
        result = getAllFiles(file, extn, readdirSync(file), result, regex);
      } catch (error) {
        continue;
      }
    } else {
      if (regex.test(file)) {
        result.push(file);
      }
    }
  }
  return result;
};

const babelParserOptions = {
  sourceType: "unambiguous",
  allowImportExportEverywhere: true,
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  allowSuperOutsideMethod: true,
  errorRecovery: true,
  allowUndeclaredExports: true,
  attachComment: false,
  plugins: [
    "optionalChaining",
    "classProperties",
    "decorators-legacy",
    "exportDefaultFrom",
    "doExpressions",
    "numericSeparator",
    "dynamicImport",
    "jsx",
    "typescript"
  ]
};

/**
 * Filter only references to (t|jsx?) or (less|scss) files for now.
 * Opt to use our relative paths.
 */
const setFileRef = (allImports, file, pathway) => {
  // remove unexpected extension imports
  if (/\.(svg|png|jpg|d\.ts)/.test(pathway)) {
    return;
  }

  // replace relative imports with full path
  let module = pathway;
  if (/\.\//g.test(pathway) || /\.\.\//g.test(pathway)) {
    module = resolve(file, "..", pathway);
  }

  // initialise or increase reference count for file
  if (Object.prototype.hasOwnProperty.call(allImports, module)) {
    allImports[module] = allImports[module] + 1;
  } else {
    allImports[module] = 1;
  }

  // Handle module package name
  // Eg: zone.js/dist/zone will be referred to as zone.js in package.json
  if (!isAbsolute(module) && module.includes("/")) {
    const modPkg = module.split("/")[0];
    if (Object.prototype.hasOwnProperty.call(allImports, modPkg)) {
      allImports[modPkg] = allImports[modPkg] + 1;
    } else {
      allImports[modPkg] = 1;
    }
  }
};

/**
 * Check AST tree for any (j|tsx?) files and set a file
 * references for any import, require or dynamic import files.
 */
const parseFileASTTree = (file, allImports) => {
  const ast = parse(readFileSync(file, "utf-8"), babelParserOptions);
  babelTraverse(ast, {
    // Used for all ES6 import statements
    ImportDeclaration: (path) => {
      if (path && path.node) {
        setFileRef(allImports, file, path.node.source.value);
      }
    },
    // For require('') statements
    Identifier: (path) => {
      if (
        path &&
        path.node &&
        path.node.name === "require" &&
        path.parent.type === "CallExpression"
      ) {
        setFileRef(allImports, file, path.parent.arguments[0].value);
      }
    },
    // Use for dynamic imports like routes.jsx
    CallExpression: (path) => {
      if (path && path.node && path.node.callee.type === "Import") {
        setFileRef(allImports, file, path.node.arguments[0].value);
      }
    },
    // Use for export barrells
    ExportAllDeclaration: (path) => {
      setFileRef(allImports, file, path.node.source.value);
    },
    ExportNamedDeclaration: (path) => {
      // ensure there is a path export
      if (path && path.node && path.node.source) {
        setFileRef(allImports, file, path.node.source.value);
      }
    }
  });
};

/**
 * Return paths to all (j|tsx?) files.
 */
const getAllSrcJSAndTSFiles = (src) =>
  Promise.all([
    getAllFiles(src, ".js"),
    getAllFiles(src, ".jsx"),
    getAllFiles(src, ".ts"),
    getAllFiles(src, ".tsx")
  ]);

/**
 * Where Node CLI runs from.
 */
export const findJSImports = async (src) => {
  const allImports = {};
  const errFiles = [];
  try {
    const promiseMap = await getAllSrcJSAndTSFiles(src);
    const srcFiles = promiseMap.flatMap((d) => d);
    for (const file of srcFiles) {
      try {
        parseFileASTTree(file, allImports);
      } catch (err) {
        errFiles.push(file);
      }
    }
    return allImports;
  } catch (err) {
    return allImports;
  }
};
