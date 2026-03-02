import { Command } from "commander";
import { runCommand } from "./run-command.js";
import { wizardCommand } from "./wizard.js";
import { updateCommand } from "../updater/update-command.js";
import { checkAndNotify } from "../updater/version-checker.js";
import pkg from "../../package.json" with { type: "json" };

export function createProgram(): Command {
  const program = new Command();

  program
    .name("dya")
    .description("DYA - Destroy Your App")
    .version(pkg.version);

  program
    .command("run")
    .description("Run requests from YAML config")
    .argument("<file>", "Path to YAML config file")
    .action(runCommand);

  program
    .command("init")
    .description("Create config via interactive wizard")
    .option("-o, --output <path>", "Output file path", "dya.yaml")
    .action(wizardCommand);

  program
    .command("update")
    .description("Check and install latest version")
    .action(updateCommand);

  program.hook("postAction", async () => {
    await checkAndNotify({ currentVersion: pkg.version });
  });

  return program;
}
