import { describe, it, expect } from "vitest";
import { createProgram } from "../../../src/cli/index.js";

describe("createProgram", () => {
  it("should create a program named 'repeater'", () => {
    const program = createProgram();
    expect(program.name()).toBe("repeater");
  });

  it("should register 'run' and 'init' subcommands", () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("run");
    expect(commandNames).toContain("init");
  });

  it("should have a version set", () => {
    const program = createProgram();
    expect(program.version()).toBe("0.1.0");
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
    expect(outputOpt!.defaultValue).toBe("repeater.yaml");
  });
});
