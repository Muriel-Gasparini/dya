import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// Mock ONLY the external network dependency (undici)
vi.mock("undici", () => ({
  request: vi.fn(),
}));

import { runCommand } from "../../../src/cli/run-command.js";
import { request as mockRequest } from "undici";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../../fixtures");

const mockedRequest = vi.mocked(mockRequest);

/**
 * Helper: create a fake undici response matching the shape UndiciHttpClient expects.
 */
function fakeResponse(statusCode: number) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: { dump: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("runCommand", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);
    stderrSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    stdoutSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it("happy path: parses real fixture, validates templates, executes runner with undici mock returning 200", async () => {
    mockedRequest.mockResolvedValue(fakeResponse(200) as never);

    await runCommand(resolve(fixturesDir, "valid-config.yaml"));

    // valid-config.yaml has total: 50, so undici.request should be called 50 times
    expect(mockedRequest).toHaveBeenCalledTimes(50);
    // Each call should target the configured URL (with possible query params)
    const firstCall = mockedRequest.mock.calls[0];
    expect(firstCall[0]).toContain("https://api.acme.com/v1/accounts");
    // Should NOT have called process.exit (success path)
    expect(exitSpy).not.toHaveBeenCalled();
    // Reporter should have printed summary
    const logCalls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    expect(logCalls.some((c) => c.includes("Summary"))).toBe(true);
    expect(logCalls.some((c) => c.includes("Total:"))).toBe(true);
  });

  it("happy path with minimal config: GET request, all defaults applied", async () => {
    mockedRequest.mockResolvedValue(fakeResponse(200) as never);

    await runCommand(resolve(fixturesDir, "minimal-config.yaml"));

    // minimal-config.yaml has total: 1 (default)
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    const firstCall = mockedRequest.mock.calls[0];
    expect(firstCall[0]).toBe("https://api.acme.com/health");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("file not found: prints 'File not found' to stderr and exits with code 1", async () => {
    await runCommand("/nonexistent/path/to/config.yaml");

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("File not found"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    // undici should NOT have been called
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("YAML invalid: prints error to stderr and exits with code 1", async () => {
    let tmpDir: string | undefined;
    try {
      tmpDir = await mkdtemp(join(tmpdir(), "run-cmd-test-"));
      const badYamlPath = join(tmpDir, "bad.yaml");
      await writeFile(badYamlPath, "method: GET\n  invalid:\nindentation: broken\n  : :");

      await runCommand(badYamlPath);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error:"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockedRequest).not.toHaveBeenCalled();
    } finally {
      if (tmpDir) await rm(tmpDir, { recursive: true });
    }
  });

  it("schema validation error: prints 'Invalid config' to stderr and exits with code 1", async () => {
    await runCommand(resolve(fixturesDir, "invalid-config.yaml"));

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid config"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("template invalid: fixture with bad faker path prints 'Invalid template' and exits 1", async () => {
    let tmpDir: string | undefined;
    try {
      tmpDir = await mkdtemp(join(tmpdir(), "run-cmd-test-"));
      const badTemplatePath = join(tmpDir, "bad-template.yaml");
      await writeFile(
        badTemplatePath,
        [
          "method: POST",
          "url: https://api.example.com/test",
          "bodyType: json",
          "body:",
          '  name: "{{faker.nonExistent.fakeMethod}}"',
        ].join("\n"),
      );

      await runCommand(badTemplatePath);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid template"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockedRequest).not.toHaveBeenCalled();
    } finally {
      if (tmpDir) await rm(tmpDir, { recursive: true });
    }
  });

  it("network error (ECONNREFUSED): runner handles it, reports failure, does NOT crash", async () => {
    const connError = new Error("connect ECONNREFUSED 127.0.0.1:3000");
    (connError as NodeJS.ErrnoException).code = "ECONNREFUSED";
    mockedRequest.mockRejectedValue(connError as never);

    await runCommand(resolve(fixturesDir, "minimal-config.yaml"));

    // The runner catches network errors via RequestExecutor and reports them.
    // It should NOT cause process.exit -- the run completes with failures reported.
    expect(exitSpy).not.toHaveBeenCalled();
    // Reporter should show summary with failure
    const logCalls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    expect(logCalls.some((c) => c.includes("Failures:"))).toBe(true);
  });

  it("formdata config: executes requests with formdata body type", async () => {
    mockedRequest.mockResolvedValue(fakeResponse(200) as never);

    await runCommand(resolve(fixturesDir, "formdata-config.yaml"));

    // formdata-config.yaml has total: 10
    expect(mockedRequest).toHaveBeenCalledTimes(10);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("urlencoded config: executes requests with urlencoded body type", async () => {
    mockedRequest.mockResolvedValue(fakeResponse(200) as never);

    await runCommand(resolve(fixturesDir, "urlencoded-config.yaml"));

    // urlencoded-config.yaml has total: 10
    expect(mockedRequest).toHaveBeenCalledTimes(10);
    expect(exitSpy).not.toHaveBeenCalled();
    // The request should include urlencoded content type
    const firstCall = mockedRequest.mock.calls[0];
    const requestOptions = firstCall[1] as Record<string, unknown>;
    const headers = requestOptions.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("HTTP 500 responses: runner reports them as failures, no process.exit", async () => {
    mockedRequest.mockResolvedValue(fakeResponse(500) as never);

    await runCommand(resolve(fixturesDir, "minimal-config.yaml"));

    expect(exitSpy).not.toHaveBeenCalled();
    // Reporter should show summary with failure
    const logCalls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const failureLine = logCalls.find((c) => c.includes("Failures:"));
    expect(failureLine).toBeDefined();
    expect(failureLine).toContain("1");
  });

  it("empty config file: prints error and exits 1", async () => {
    let tmpDir: string | undefined;
    try {
      tmpDir = await mkdtemp(join(tmpdir(), "run-cmd-test-"));
      const emptyPath = join(tmpDir, "empty.yaml");
      await writeFile(emptyPath, "");

      await runCommand(emptyPath);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error:"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      if (tmpDir) await rm(tmpDir, { recursive: true });
    }
  });

  it("validates both body and queryParams templates before executing", async () => {
    // valid-config.yaml has both body and queryParams with faker templates
    // If validation passes, undici should be called
    mockedRequest.mockResolvedValue(fakeResponse(200) as never);

    await runCommand(resolve(fixturesDir, "valid-config.yaml"));

    expect(exitSpy).not.toHaveBeenCalled();
    expect(mockedRequest).toHaveBeenCalled();
  });

  it("template invalid in headers: prints 'Invalid template' and exits 1", async () => {
    let tmpDir: string | undefined;
    try {
      tmpDir = await mkdtemp(join(tmpdir(), "run-cmd-test-"));
      const badHeaderPath = join(tmpDir, "bad-header-template.yaml");
      await writeFile(
        badHeaderPath,
        [
          "method: GET",
          "url: https://api.example.com/test",
          "headers:",
          '  Authorization: "Bearer {{faker.nonExistent.fakeMethod}}"',
        ].join("\n"),
      );

      await runCommand(badHeaderPath);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid template"),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockedRequest).not.toHaveBeenCalled();
    } finally {
      if (tmpDir) await rm(tmpDir, { recursive: true });
    }
  });

  it("ConfigError messages are prefixed with 'Error:' (not 'Unexpected error:')", async () => {
    await runCommand("/nonexistent/config.yaml");

    const errorCall = stderrSpy.mock.calls[0][0] as string;
    expect(errorCall).toMatch(/^Error: /);
    expect(errorCall).not.toMatch(/^Unexpected error:/);
  });
});
