import repl from "node:repl";
import jsonata from "jsonata";
import fs from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import process from "node:process";

import { createBom } from "../index.js";
import { validateBom } from "../validator.js";
import {
  printCallStack,
  printOccurrences,
  printTable,
  printDependencyTree,
  printServices
} from "../display.js";

const options = {
  useColors: true,
  breakEvalOnSigint: true,
  preview: true,
  prompt: "cdx ↝ ",
  ignoreUndefined: true,
  useGlobal: true
};

const cdxArt = `
 ██████╗██████╗ ██╗  ██╗
██╔════╝██╔══██╗╚██╗██╔╝
██║     ██║  ██║ ╚███╔╝ 
██║     ██║  ██║ ██╔██╗ 
╚██████╗██████╔╝██╔╝ ██╗
 ╚═════╝╚═════╝ ╚═╝  ╚═╝
`;

console.log(cdxArt);

// The current sbom is stored here
let sbom = undefined;

let historyFile = undefined;
const historyConfigDir = join(homedir(), ".config", ".cdxgen");
if (!process.env.CDXGEN_REPL_HISTORY && !fs.existsSync(historyConfigDir)) {
  try {
    fs.mkdirSync(historyConfigDir, { recursive: true });
    historyFile = join(historyConfigDir, ".repl_history");
  } catch (e) {
    // ignore
  }
} else {
  historyFile = join(historyConfigDir, ".repl_history");
}

export const importSbom = (sbomOrPath) => {
  if (sbomOrPath && sbomOrPath.endsWith(".json") && fs.existsSync(sbomOrPath)) {
    try {
      sbom = JSON.parse(fs.readFileSync(sbomOrPath, "utf-8"));
      console.log(`✅ SBoM imported successfully from ${sbomOrPath}`);
    } catch (e) {
      console.log(
        `⚠ Unable to import the SBoM from ${sbomOrPath} due to ${e}`
      );
    }
  } else {
    console.log(`⚠ ${sbomOrPath} is invalid.`);
  }
};
// Load any sbom passed from the command line
if (process.argv.length > 2) {
  importSbom(process.argv[process.argv.length - 1]);
  console.log("💭 Type .print to view the SBoM as a table");
} else if (fs.existsSync("bom.json")) {
  // If the current directory has a bom.json load it
  importSbom("bom.json");
} else {
  console.log("💭 Use .create <path> to create an SBoM for the given path.");
  console.log("💭 Use .import <json> to import an existing SBoM.");
  console.log("💭 Type .exit or press ctrl+d to close.");
}

const cdxgenRepl = repl.start(options);
if (historyFile) {
  cdxgenRepl.setupHistory(
    process.env.CDXGEN_REPL_HISTORY || historyFile,
    (err) => {
      if (err) {
        console.log(
          "⚠ REPL history would not be persisted for this session. Set the environment variable CDXGEN_REPL_HISTORY to specify a custom history file"
        );
      }
    }
  );
}
cdxgenRepl.defineCommand("create", {
  help: "create an SBoM for the given path",
  async action(sbomOrPath) {
    this.clearBufferedCommand();
    const tempDir = fs.mkdtempSync(join(tmpdir(), "cdxgen-repl-"));
    const bomFile = join(tempDir, "bom.json");
    const bomNSData = await createBom(sbomOrPath, {
      multiProject: true,
      installDeps: true,
      output: bomFile
    });
    if (bomNSData) {
      sbom = bomNSData.bomJson;
      console.log("✅ SBoM imported successfully.");
      console.log("💭 Type .print to view the SBoM as a table");
    } else {
      console.log("SBoM was not generated successfully");
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("import", {
  help: "import an existing SBoM",
  action(sbomOrPath) {
    this.clearBufferedCommand();
    importSbom(sbomOrPath);
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("exit", {
  help: "exit",
  action() {
    this.close();
  }
});
cdxgenRepl.defineCommand("sbom", {
  help: "show the current sbom",
  action() {
    if (sbom) {
      console.log(sbom);
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an existing SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("search", {
  help: "search the current sbom. performs case insensitive search on various attributes.",
  async action(searchStr) {
    if (sbom) {
      if (searchStr) {
        try {
          if (!searchStr.includes("~>")) {
            searchStr = `components[group ~> /${searchStr}/i or name ~> /${searchStr}/i or description ~> /${searchStr}/i or publisher ~> /${searchStr}/i or purl ~> /${searchStr}/i]`;
          }
          const expression = jsonata(searchStr);
          let components = await expression.evaluate(sbom);
          if (!components) {
            console.log("No results found!");
          } else {
            printTable({ components, dependencies: [] });
          }
        } catch (e) {
          console.log(e);
        }
      } else {
        console.log(
          "⚠ Specify the search string. Eg: .search <search string>"
        );
      }
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an existing SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("sort", {
  help: "sort the current sbom based on the attribute",
  async action(sortStr) {
    if (sbom) {
      if (sortStr) {
        try {
          if (!sortStr.includes("^")) {
            sortStr = `components^(${sortStr})`;
          }
          const expression = jsonata(sortStr);
          let components = await expression.evaluate(sbom);
          if (!components) {
            console.log("No results found!");
          } else {
            printTable({ components, dependencies: [] });
            // Store the sorted list in memory
            if (components.length === sbom.components.length) {
              sbom.components = components;
            }
          }
        } catch (e) {
          console.log(e);
        }
      } else {
        console.log("⚠ Specify the attribute to sort by. Eg: .sort name");
      }
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an existing SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("query", {
  help: "query the current sbom using jsonata expression",
  async action(querySpec) {
    if (sbom) {
      if (querySpec) {
        try {
          const expression = jsonata(querySpec);
          console.log(await expression.evaluate(sbom));
        } catch (e) {
          console.log(e);
        }
      } else {
        console.log(
          "⚠ Specify the search specification in jsonata format. Eg: .query metadata.component"
        );
      }
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an existing SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("print", {
  help: "print the current sbom as a table",
  action() {
    if (sbom) {
      printTable(sbom);
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an existing SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("tree", {
  help: "display the dependency tree",
  action() {
    if (sbom) {
      printDependencyTree(sbom);
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an existing SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("validate", {
  help: "validate the sbom using jsonschema",
  action() {
    if (sbom) {
      const result = validateBom(sbom);
      if (result) {
        console.log("SBoM is valid!");
      }
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an existing SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("save", {
  help: "save the sbom to a new file",
  action(saveToFile) {
    if (sbom) {
      if (!saveToFile) {
        saveToFile = "bom.json";
      }
      fs.writeFileSync(saveToFile, JSON.stringify(sbom, null, 2));
      console.log(`SBoM saved successfully to ${saveToFile}`);
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an existing SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("update", {
  help: "update the sbom components based on the given query",
  async action(updateSpec) {
    if (sbom) {
      if (!updateSpec) {
        return;
      }
      if (!updateSpec.startsWith("|")) {
        updateSpec = "|" + updateSpec;
      }
      if (!updateSpec.endsWith("|")) {
        updateSpec = updateSpec + "|";
      }
      updateSpec = "$ ~> " + updateSpec;
      const expression = jsonata(updateSpec);
      const newSbom = await expression.evaluate(sbom);
      if (newSbom && newSbom.components.length <= sbom.components.length) {
        sbom = newSbom;
      }
      console.log("SBoM updated successfully.");
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an existing SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("occurrences", {
  help: "view components with evidence.occurrences",
  async action() {
    if (sbom) {
      try {
        const expression = jsonata(
          "components[$count(evidence.occurrences) > 0]"
        );
        let components = await expression.evaluate(sbom);
        if (!components) {
          console.log(
            "No results found. Use evinse command to generate an SBoM with evidence."
          );
        } else {
          if (!Array.isArray(components)) {
            components = [components];
          }
          printOccurrences({ components });
        }
      } catch (e) {
        console.log(e);
      }
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an evinse SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("discord", {
  help: "display the discord invite link for support",
  async action() {
    console.log("Head to https://discord.gg/pF4BYWEJcS for support");
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("sponsor", {
  help: "display the sponsorship link to fund this project",
  async action() {
    console.log(
      "Hey, thanks a lot for considering! https://github.com/sponsors/prabhu"
    );
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("callstack", {
  help: "view components with evidence.callstack",
  async action() {
    if (sbom) {
      try {
        const expression = jsonata(
          "components[$count(evidence.callstack.frames) > 0]"
        );
        let components = await expression.evaluate(sbom);
        if (!components) {
          console.log(
            "callstack evidence was not found. Use evinse command to generate an SBoM with evidence."
          );
        } else {
          if (!Array.isArray(components)) {
            components = [components];
          }
          printCallStack({ components });
        }
      } catch (e) {
        console.log(e);
      }
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an evinse SBoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("services", {
  help: "view services",
  async action() {
    if (sbom) {
      try {
        const expression = jsonata("services");
        let services = await expression.evaluate(sbom);
        if (!services) {
          console.log(
            "No services found. Use evinse command to generate an SBoM with evidence."
          );
        } else {
          if (!Array.isArray(services)) {
            services = [services];
          }
          printServices({ services });
        }
      } catch (e) {
        console.log(e);
      }
    } else {
      console.log(
        "⚠ No SBoM is loaded. Use .import command to import an evinse SBoM"
      );
    }
    this.displayPrompt();
  }
});
