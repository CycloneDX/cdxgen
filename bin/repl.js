#!/usr/bin/env node

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
  printOSTable,
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

// Use canonical terminal settings to support custom readlines
process.env.NODE_NO_READLINE = 1;

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
      console.log(`✅ SBOM imported successfully from ${sbomOrPath}`);
    } catch (e) {
      console.log(
        `⚠ Unable to import the SBOM from ${sbomOrPath} due to ${e}`
      );
    }
  } else {
    console.log(`⚠ ${sbomOrPath} is invalid.`);
  }
};
// Load any sbom passed from the command line
if (process.argv.length > 2) {
  importSbom(process.argv[process.argv.length - 1]);
  console.log("💭 Type .print to view the SBOM as a table");
} else if (fs.existsSync("bom.json")) {
  // If the current directory has a bom.json load it
  importSbom("bom.json");
} else {
  console.log("💭 Use .create <path> to create an SBOM for the given path.");
  console.log("💭 Use .import <json> to import an existing SBOM.");
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
  help: "create an SBOM for the given path",
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
      console.log("✅ BoM imported successfully.");
      console.log("💭 Type .print to view the BoM as a table");
    } else {
      console.log("BoM was not generated successfully");
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("import", {
  help: "import an existing BoM",
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
        "⚠ No BoM is loaded. Use .import command to import an existing BoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("search", {
  help: "search the current bom. performs case insensitive search on various attributes.",
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
        "⚠ No BoM is loaded. Use .import command to import an existing BoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("sort", {
  help: "sort the current bom based on the attribute",
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
        "⚠ No BoM is loaded. Use .import command to import an existing BoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("query", {
  help: "query the current bom using jsonata expression",
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
        "⚠ No BoM is loaded. Use .import command to import an existing BoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("print", {
  help: "print the current bom as a table",
  action() {
    if (sbom) {
      printTable(sbom);
    } else {
      console.log(
        "⚠ No BoM is loaded. Use .import command to import an existing BoM"
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
        "⚠ No BoM is loaded. Use .import command to import an existing BoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("validate", {
  help: "validate the bom using jsonschema",
  action() {
    if (sbom) {
      const result = validateBom(sbom);
      if (result) {
        console.log("SBOM is valid!");
      }
    } else {
      console.log(
        "⚠ No BoM is loaded. Use .import command to import an existing BoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("save", {
  help: "save the bom to a new file",
  action(saveToFile) {
    if (sbom) {
      if (!saveToFile) {
        saveToFile = "bom.json";
      }
      fs.writeFileSync(saveToFile, JSON.stringify(sbom, null, 2));
      console.log(`BoM saved successfully to ${saveToFile}`);
    } else {
      console.log(
        "⚠ No BoM is loaded. Use .import command to import an existing BoM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("update", {
  help: "update the bom components based on the given query",
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
      console.log("BoM updated successfully.");
    } else {
      console.log(
        "⚠ No BoM is loaded. Use .import command to import an existing BoM"
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
            "No results found. Use evinse command to generate an BoM with evidence."
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
        "⚠ No BoM is loaded. Use .import command to import an evinse BoM"
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
            "callstack evidence was not found. Use evinse command to generate an SBOM with evidence."
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
        "⚠ No SBOM is loaded. Use .import command to import an evinse SBOM"
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
            "No services found. Use evinse command to generate an SBOM with evidence."
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
        "⚠ No SBOM is loaded. Use .import command to import an evinse SBOM"
      );
    }
    this.displayPrompt();
  }
});
cdxgenRepl.defineCommand("osinfocategories", {
  help: "view the category names for the OS info from the obom",
  async action() {
    if (sbom) {
      try {
        const expression = jsonata(
          '$distinct(components.properties[name="cdx:osquery:category"].value)'
        );
        let catgories = await expression.evaluate(sbom);
        if (!catgories) {
          console.log(
            "Unable to retrieve the os info categories. Only OBoMs generated by cdxgen are supported by this tool."
          );
        } else {
          console.log(catgories.join("\n"));
        }
      } catch (e) {
        console.log(e);
      }
    } else {
      console.log(
        "⚠ No OBoM is loaded. Use .import command to import an OBoM"
      );
    }
    this.displayPrompt();
  }
});

// Let's dynamically define more commands from the queries
[
  "apt_sources",
  "behavioral_reverse_shell",
  "certificates",
  "chrome_extensions",
  "crontab_snapshot",
  "deb_packages",
  "docker_container_ports",
  "docker_containers",
  "docker_networks",
  "docker_volumes",
  "etc_hosts",
  "firefox_addons",
  "homebrew_packages",
  "installed_applications",
  "interface_addresses",
  "kernel_info",
  "kernel_integrity",
  "kernel_modules",
  "ld_preload",
  "listening_ports",
  "os_version",
  "pipes",
  "pipes_snapshot",
  "portage_packages",
  "process_events",
  "processes",
  "python_packages",
  "rpm_packages",
  "scheduled_tasks",
  "services_snapshot",
  "startup_items",
  "system_info_snapshot",
  "windows_drivers",
  "windows_patches",
  "windows_programs",
  "windows_shared_resources",
  "yum_sources",
  "appcompat_shims",
  "atom_packages",
  "browser_plugins",
  "certificates",
  "chocolatey_packages",
  "chrome_extensions",
  "etc_hosts",
  "firefox_addons",
  "ie_extensions",
  "kernel_info",
  "npm_packages",
  "opera_extensions",
  "pipes_snapshot",
  "process_open_sockets",
  "safari_extensions",
  "scheduled_tasks",
  "services_snapshot",
  "startup_items",
  "routes",
  "system_info_snapshot",
  "win_version",
  "windows_firewall_rules",
  "windows_optional_features",
  "windows_programs",
  "windows_shared_resources",
  "windows_update_history",
  "wmi_cli_event_consumers",
  "wmi_cli_event_consumers_snapshot",
  "wmi_event_filters",
  "wmi_filter_consumer_binding"
].forEach((c) => {
  cdxgenRepl.defineCommand(c, {
    help: `query the ${c} category from the OS info`,
    async action() {
      if (sbom) {
        try {
          const expression = jsonata(
            `components[properties[name="cdx:osquery:category" and value="${c}"]]`
          );
          let components = await expression.evaluate(sbom);
          if (!components) {
            console.log("No results found.");
          } else {
            if (!Array.isArray(components)) {
              components = [components];
            }
            printOSTable({ components });
          }
        } catch (e) {
          console.log(e);
        }
      } else {
        console.log(
          "⚠ No OBoM is loaded. Use .import command to import an OBoM"
        );
      }
      this.displayPrompt();
    }
  });
});
