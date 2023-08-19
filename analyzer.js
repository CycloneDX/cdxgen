import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { join } from "path";
import { readdirSync, statSync, readFileSync } from "fs";
import { basename, resolve, isAbsolute, relative } from "path";

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
  "mocks",
  "__tests__"
];

const IGNORE_FILE_PATTERN = new RegExp(
  "(conf|config|test|spec|mock|\\.d)\\.(js|ts|tsx)$",
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
    const file = join(dir, files[i]);
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
  allowNewTargetOutsideFunction: true,
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
const setFileRef = (allImports, src, file, pathnode) => {
  const pathway = pathnode.value || pathnode.name;
  const sourceLoc = pathnode.loc?.start;
  if (!pathway) {
    return;
  }
  const fileRelativeLoc = relative(src, file);
  // remove unexpected extension imports
  if (/\.(svg|png|jpg|d\.ts)/.test(pathway)) {
    return;
  }
  const occurrence = {
    importedAs: pathway,
    isExternal: true,
    fileName: fileRelativeLoc,
    lineNumber: sourceLoc && sourceLoc.line ? sourceLoc.line : undefined,
    columnNumber: sourceLoc && sourceLoc.column ? sourceLoc.column : undefined
  };
  // replace relative imports with full path
  let moduleFullPath = pathway;
  let wasAbsolute = false;
  if (/\.\//g.test(pathway) || /\.\.\//g.test(pathway)) {
    moduleFullPath = resolve(file, "..", pathway);
    if (isAbsolute(moduleFullPath)) {
      moduleFullPath = relative(src, moduleFullPath);
      wasAbsolute = true;
    }
    occurrence.isExternal = false;
  }
  allImports[moduleFullPath] = allImports[moduleFullPath] || new Set();
  allImports[moduleFullPath].add(occurrence);
  // Handle module package name
  // Eg: zone.js/dist/zone will be referred to as zone.js in package.json
  if (!wasAbsolute && moduleFullPath.includes("/")) {
    const modPkg = moduleFullPath.split("/")[0];
    allImports[modPkg] = allImports[modPkg] || new Set();
    allImports[modPkg].add(occurrence);
  }
};

/**
 * Check AST tree for any (j|tsx?) files and set a file
 * references for any import, require or dynamic import files.
 */
const parseFileASTTree = (src, file, allImports) => {
  const ast = parse(readFileSync(file, "utf-8"), babelParserOptions);
  traverse.default(ast, {
    ImportDeclaration: (path) => {
      if (path && path.node) {
        setFileRef(allImports, src, file, path.node.source);
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
        setFileRef(allImports, src, file, path.parent.arguments[0]);
      }
    },
    // Use for dynamic imports like routes.jsx
    CallExpression: (path) => {
      if (path && path.node && path.node.callee.type === "Import") {
        setFileRef(allImports, src, file, path.node.arguments[0]);
      }
    },
    // Use for export barrells
    ExportAllDeclaration: (path) => {
      setFileRef(allImports, src, file, path.node.source);
    },
    ExportNamedDeclaration: (path) => {
      // ensure there is a path export
      if (path && path.node && path.node.source) {
        setFileRef(allImports, src, file, path.node.source);
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
        parseFileASTTree(src, file, allImports);
      } catch (err) {
        errFiles.push(file);
      }
    }
    return allImports;
  } catch (err) {
    return allImports;
  }
};
