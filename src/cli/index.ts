import { Command } from "commander";
import { runCommand } from "./run-command.js";
import { wizardCommand } from "./wizard.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("dya")
    .description("DYA - Destroy Your App")
    .version("0.1.0");

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

  return program;
}
