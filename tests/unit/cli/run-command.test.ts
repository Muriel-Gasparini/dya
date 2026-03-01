import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RepeaterConfig } from "../../../src/config/types.js";
import type { ExecutionSummary } from "../../../src/request/types.js";

// Mock all dependencies before importing the module under test
vi.mock("../../../src/config/parser.js", () => ({
  parseConfig: vi.fn(),
}));

vi.mock("../../../src/template/engine.js", () => {
  const FakerTemplateEngine = vi.fn();
  FakerTemplateEngine.prototype.validateRecord = vi.fn();
  return { FakerTemplateEngine };
});

vi.mock("../../../src/request/http-client.js", () => {
  const UndiciHttpClient = vi.fn();
  return { UndiciHttpClient };
});

vi.mock("../../../src/request/executor.js", () => {
  const RequestExecutor = vi.fn();
  return { RequestExecutor };
});

vi.mock("../../../src/request/body-builder.js", () => {
  const DefaultBodyBuilder = vi.fn();
  return { DefaultBodyBuilder };
});

vi.mock("../../../src/reporter.js", () => {
  const ConsoleReporter = vi.fn();
  return { ConsoleReporter };
});

vi.mock("../../../src/runner.js", () => {
  const RepeaterRunner = vi.fn();
  RepeaterRunner.prototype.execute = vi.fn();
  return { RepeaterRunner };
});

import { runCommand } from "../../../src/cli/run-command.js";
import { parseConfig } from "../../../src/config/parser.js";
import { FakerTemplateEngine } from "../../../src/template/engine.js";
import { RepeaterRunner } from "../../../src/runner.js";
import { ConfigError } from "../../../src/errors.js";
import { TemplateError } from "../../../src/template/errors.js";

const mockParseConfig = vi.mocked(parseConfig);
const mockValidateRecord = vi.mocked(
  FakerTemplateEngine.prototype.validateRecord,
);
const mockRunnerExecute = vi.mocked(RepeaterRunner.prototype.execute);

const validConfig: RepeaterConfig = {
  method: "POST",
  url: "https://api.example.com/users",
  headers: { "Content-Type": "application/json" },
  bodyType: "json",
  body: { name: "{{faker.person.fullName}}" },
  queryParams: { source: "cli" },
  concurrency: 2,
  total: 10,
  timeoutMs: 5000,
};

const validSummary: ExecutionSummary = {
  totalRequests: 10,
  successCount: 10,
  failureCount: 0,
  avgDurationMs: 100,
  minDurationMs: 50,
  maxDurationMs: 200,
  totalDurationMs: 1000,
};

describe("runCommand", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);
    stderrSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("happy path: parses config, validates templates, executes runner without error", async () => {
    mockParseConfig.mockResolvedValue(validConfig);
    mockValidateRecord.mockImplementation(() => {});
    mockRunnerExecute.mockResolvedValue(validSummary);

    await runCommand("config.yaml");

    expect(mockParseConfig).toHaveBeenCalledWith("config.yaml");
    expect(mockValidateRecord).toHaveBeenCalledTimes(2);
    expect(mockValidateRecord).toHaveBeenCalledWith(validConfig.body);
    expect(mockValidateRecord).toHaveBeenCalledWith(validConfig.queryParams);
    expect(mockRunnerExecute).toHaveBeenCalledWith(validConfig);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("ConfigError: prints message to stderr and exits with code 1", async () => {
    mockParseConfig.mockRejectedValue(
      new ConfigError("Arquivo nao encontrado: config.yaml"),
    );

    await runCommand("config.yaml");

    expect(stderrSpy).toHaveBeenCalledWith(
      "Error: Arquivo nao encontrado: config.yaml",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("TemplateError: prints message to stderr and exits with code 1", async () => {
    mockParseConfig.mockResolvedValue(validConfig);
    mockValidateRecord.mockImplementation(() => {
      throw new TemplateError(
        "Template invalido: faker.naoExiste.metodo nao existe",
      );
    });

    await runCommand("config.yaml");

    expect(stderrSpy).toHaveBeenCalledWith(
      "Error: Template invalido: faker.naoExiste.metodo nao existe",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("unexpected error: prints message to stderr and exits with code 1", async () => {
    mockParseConfig.mockRejectedValue(new Error("Something went wrong"));

    await runCommand("config.yaml");

    expect(stderrSpy).toHaveBeenCalledWith(
      "Unexpected error: Something went wrong",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("runner.execute is called with correct config object", async () => {
    mockParseConfig.mockResolvedValue(validConfig);
    mockValidateRecord.mockImplementation(() => {});
    mockRunnerExecute.mockResolvedValue(validSummary);

    await runCommand("any-file.yaml");

    expect(mockRunnerExecute).toHaveBeenCalledWith(validConfig);
  });

  it("validates both body and queryParams templates before executing", async () => {
    const callOrder: string[] = [];
    mockParseConfig.mockResolvedValue(validConfig);
    mockValidateRecord.mockImplementation((fields) => {
      if (fields === validConfig.body) callOrder.push("body");
      if (fields === validConfig.queryParams) callOrder.push("queryParams");
    });
    mockRunnerExecute.mockResolvedValue(validSummary);

    await runCommand("config.yaml");

    expect(callOrder).toEqual(["body", "queryParams"]);
    expect(mockRunnerExecute).toHaveBeenCalledTimes(1);
  });

  it("does not call runner.execute when parseConfig throws ConfigError", async () => {
    mockParseConfig.mockRejectedValue(new ConfigError("bad config"));

    await runCommand("config.yaml");

    expect(mockRunnerExecute).not.toHaveBeenCalled();
  });

  it("does not call runner.execute when validateRecord throws TemplateError", async () => {
    mockParseConfig.mockResolvedValue(validConfig);
    mockValidateRecord.mockImplementation(() => {
      throw new TemplateError("bad template");
    });

    await runCommand("config.yaml");

    expect(mockRunnerExecute).not.toHaveBeenCalled();
  });

  it("runner execution error is caught and exits with code 1", async () => {
    mockParseConfig.mockResolvedValue(validConfig);
    mockValidateRecord.mockImplementation(() => {});
    mockRunnerExecute.mockRejectedValue(new Error("Network failure"));

    await runCommand("config.yaml");

    expect(stderrSpy).toHaveBeenCalledWith(
      "Unexpected error: Network failure",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
