// Evinse (Evinse Verification Is Nearly SBoM Evidence)
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { join } from "node:path";
import fs from "node:fs";
import { homedir, platform as _platform } from "node:os";
import process from "node:process";
import { analyzeProject, createEvinseFile, prepareDB } from "../evinser.js";
import { validateBom } from "../validator.js";

const isWin = _platform() === "win32";
const isMac = _platform() === "darwin";
let ATOM_DB = join(homedir(), ".local", "share", ".atomdb");
if (isWin) {
  ATOM_DB = join(homedir(), "AppData", "Local", ".atomdb");
} else if (isMac) {
  ATOM_DB = join(homedir(), "Library", "Application Support", ".atomdb");
}

if (!process.env.ATOM_DB && !fs.existsSync(ATOM_DB)) {
  try {
    fs.mkdirSync(ATOM_DB, { recursive: true });
  } catch (e) {
    // ignore
  }
}
const args = yargs(hideBin(process.argv))
  .option("input", {
    alias: "i",
    description: "Input SBoM file. Default bom.json",
    default: "bom.json"
  })
  .option("output", {
    alias: "o",
    description: "Output file. Default bom.evinse.json",
    default: "bom.evinse.json"
  })
  .option("language", {
    alias: "l",
    description: "Application language",
    default: "java",
    choices: ["java", "jar", "javascript", "python", "android", "cpp"]
  })
  .option("db-path", {
    description: `Atom slices DB path. Default ${ATOM_DB}`,
    default: ATOM_DB
  })
  .option("force", {
    description: "Force creation of the database",
    default: false,
    type: "boolean"
  })
  .option("skip-maven-collector", {
    description:
      "Skip collecting maven jars. Can speedup re-runs if the data was cached previously.",
    default: false,
    type: "boolean"
  })
  .option("with-deep-jar-collector", {
    description:
      "Enable collection of all jars from maven cache directory. Useful to improve the recall for callstack evidence.",
    default: false,
    type: "boolean"
  })
  .option("annotate", {
    description: "Include contents of atom slices as annotations",
    default: true,
    type: "boolean"
  })
  .option("with-data-flow", {
    description: "Enable inter-procedural data-flow slicing.",
    default: false,
    type: "boolean"
  })
  .scriptName("evinse")
  .version()
  .help("h").argv;

const evinseArt = `
███████╗██╗   ██╗██╗███╗   ██╗███████╗███████╗
██╔════╝██║   ██║██║████╗  ██║██╔════╝██╔════╝
█████╗  ██║   ██║██║██╔██╗ ██║███████╗█████╗  
██╔══╝  ╚██╗ ██╔╝██║██║╚██╗██║╚════██║██╔══╝  
███████╗ ╚████╔╝ ██║██║ ╚████║███████║███████╗
╚══════╝  ╚═══╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝
`;

console.log(evinseArt);
(async () => {
  // First, prepare the database by cataloging jars and other libraries
  const dbObjMap = await prepareDB(ATOM_DB, args);
  if (dbObjMap) {
    // Analyze the project using atom. Convert package namespaces to purl using the db
    const sliceArtefacts = await analyzeProject(dbObjMap, args);
    // Create the SBoM with Evidence
    const bomJson = createEvinseFile(sliceArtefacts, args);
    // Validate our final SBoM
    if (!validateBom(bomJson)) {
      process.exit(1);
    }
  }
})();
