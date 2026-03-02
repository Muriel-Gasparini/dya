import { describe, it, expect } from "vitest";
import { createProgram } from "../../../src/cli/index.js";
import pkg from "../../../package.json" with { type: "json" };

describe("createProgram", () => {
  it("should create a program named 'dya'", () => {
    const program = createProgram();
    expect(program.name()).toBe("dya");
  });

  it("should register 'run', 'init', and 'update' subcommands", () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("run");
    expect(commandNames).toContain("init");
    expect(commandNames).toContain("update");
  });

  it("should have version matching package.json", () => {
    const program = createProgram();
    expect(program.version()).toBe(pkg.version);
  });

  it("'run' command should accept a file argument", () => {
    const program = createProgram();
    const runCmd = program.commands.find((c) => c.name() === "run");
    expect(runCmd).toBeDefined();
    // run command has 1 required argument <file>
    expect(runCmd!.registeredArguments.length).toBe(1);
    expect(runCmd!.registeredArguments[0].name()).toBe("file");
    expect(runCmd!.registeredArguments[0].required).toBe(true);
  });

  it("'init' command should have -o/--output option", () => {
    const program = createProgram();
    const initCmd = program.commands.find((c) => c.name() === "init");
    expect(initCmd).toBeDefined();
    const outputOpt = initCmd!.options.find((o) => o.long === "--output");
    expect(outputOpt).toBeDefined();
    expect(outputOpt!.defaultValue).toBe("dya.yaml");
  });

  it("'update' command should be registered", () => {
    const program = createProgram();
    const updateCmd = program.commands.find((c) => c.name() === "update");
    expect(updateCmd).toBeDefined();
    expect(updateCmd!.description()).toBe(
      "Check and install latest version",
    );
  });
});
