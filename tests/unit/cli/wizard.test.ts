import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parse } from "yaml";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock @inquirer/prompts (external terminal I/O -- legitimate mock)
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
  number: vi.fn(),
}));

import {
  wizardCommand,
  validateUrl,
  validateTotal,
} from "../../../src/cli/wizard.js";
import { select, input, confirm, number } from "@inquirer/prompts";

const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockConfirm = vi.mocked(confirm);
const mockNumber = vi.mocked(number);

describe("wizardCommand", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    tmpDir = await mkdtemp(join(tmpdir(), "wizard-test-"));
  });

  afterEach(async () => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    await rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: returns a temp file path inside the test's temp dir.
   */
  function tmpFile(name: string): string {
    return join(tmpDir, name);
  }

  /**
   * Helper: reads and parses the YAML file written by the wizard.
   */
  async function readYaml(filePath: string): Promise<Record<string, unknown>> {
    const content = await readFile(filePath, "utf-8");
    return parse(content) as Record<string, unknown>;
  }

  /**
   * Helper: reads the raw content of the file written by the wizard.
   */
  async function readRaw(filePath: string): Promise<string> {
    return readFile(filePath, "utf-8");
  }

  /**
   * Helper: set up all prompts for a complete POST wizard flow.
   */
  function setupFullPostFlow() {
    // method
    mockSelect.mockResolvedValueOnce("POST");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com/users");
    // add header?
    mockConfirm.mockResolvedValueOnce(true);
    // header key
    mockInput.mockResolvedValueOnce("Authorization");
    // header value
    mockInput.mockResolvedValueOnce("Bearer token123");
    // add another header?
    mockConfirm.mockResolvedValueOnce(false);
    // bodyType (only for POST/PUT/PATCH)
    mockSelect.mockResolvedValueOnce("json");
    // add body field?
    mockConfirm.mockResolvedValueOnce(true);
    // body key
    mockInput.mockResolvedValueOnce("name");
    // body value
    mockInput.mockResolvedValueOnce("{{faker.person.fullName}}");
    // add another body field?
    mockConfirm.mockResolvedValueOnce(false);
    // add query param?
    mockConfirm.mockResolvedValueOnce(true);
    // qp key
    mockInput.mockResolvedValueOnce("source");
    // qp value
    mockInput.mockResolvedValueOnce("cli");
    // add another qp?
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(5);
    // total
    mockInput.mockResolvedValueOnce("50");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);
  }

  it("happy path: collects all inputs and writes YAML file to disk", async () => {
    setupFullPostFlow();
    const outPath = tmpFile("dya.yaml");

    await wizardCommand({ output: outPath });

    // Read the REAL file from disk and parse it as YAML
    const config = await readYaml(outPath);
    expect(config.method).toBe("POST");
    expect(config.url).toBe("https://api.example.com/users");
    expect((config.headers as Record<string, string>).Authorization).toBe(
      "Bearer token123",
    );
    expect(config.bodyType).toBe("json");
    expect((config.body as Record<string, string>).name).toBe(
      "{{faker.person.fullName}}",
    );
    expect((config.queryParams as Record<string, string>).source).toBe("cli");
    expect(config.concurrency).toBe(5);
    expect(config.total).toBe(50);
    expect(config.timeoutMs).toBe(5000);
  });

  it("GET method: bodyType is automatically 'none', no body prompts asked", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com/users");
    // add header?
    mockConfirm.mockResolvedValueOnce(false);
    // add query param?
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(1);
    // total
    mockInput.mockResolvedValueOnce("10");
    // timeout
    mockNumber.mockResolvedValueOnce(3000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("test.yaml");
    await wizardCommand({ output: outPath });

    // Verify bodyType select was NOT called for GET (only method select)
    expect(mockSelect).toHaveBeenCalledTimes(1);

    const config = await readYaml(outPath);
    expect(config.method).toBe("GET");
    expect(config.bodyType).toBe("none");
  });

  it("DELETE method: bodyType is automatically 'none'", async () => {
    // method
    mockSelect.mockResolvedValueOnce("DELETE");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com/users/1");
    // add header?
    mockConfirm.mockResolvedValueOnce(false);
    // add query param?
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(1);
    // total
    mockInput.mockResolvedValueOnce("1");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("del.yaml");
    await wizardCommand({ output: outPath });

    const config = await readYaml(outPath);
    expect(config.bodyType).toBe("none");
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("confirmation 'No': file is NOT saved on disk", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header?
    mockConfirm.mockResolvedValueOnce(false);
    // add query param?
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(1);
    // total
    mockInput.mockResolvedValueOnce("1");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save -> NO
    mockConfirm.mockResolvedValueOnce(false);

    const outPath = tmpFile("should-not-exist.yaml");
    await wizardCommand({ output: outPath });

    // Verify file does NOT exist on disk
    await expect(access(outPath)).rejects.toThrow();
  });

  it("writes valid, parseable YAML (not manual string)", async () => {
    setupFullPostFlow();
    const outPath = tmpFile("out.yaml");

    await wizardCommand({ output: outPath });

    const raw = await readRaw(outPath);
    // Should be valid YAML that parses successfully
    const parsed = parse(raw);
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();
    // Should not have JavaScript object notation
    expect(raw).not.toContain("[object Object]");
  });

  it("shows preview before saving", async () => {
    setupFullPostFlow();
    const outPath = tmpFile("preview.yaml");

    await wizardCommand({ output: outPath });

    const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const hasPreviewStart = calls.some((c) => c.includes("--- Preview ---"));
    const hasPreviewEnd = calls.some((c) => c.includes("--- End ---"));
    expect(hasPreviewStart).toBe(true);
    expect(hasPreviewEnd).toBe(true);
  });

  it("writes file at the specified output path", async () => {
    setupFullPostFlow();
    const outPath = tmpFile("custom-name.yaml");

    await wizardCommand({ output: outPath });

    // Verify the file exists at the exact path
    const raw = await readRaw(outPath);
    expect(raw.length).toBeGreaterThan(0);
  });

  it("total 'infinite' is set as string in YAML", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header?
    mockConfirm.mockResolvedValueOnce(false);
    // add query param?
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(2);
    // total -> "infinite"
    mockInput.mockResolvedValueOnce("infinite");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("inf.yaml");
    await wizardCommand({ output: outPath });

    const raw = await readRaw(outPath);
    expect(raw).toContain("total: infinite");
    const config = await readYaml(outPath);
    expect(config.total).toBe("infinite");
  });

  it("multiple headers are added correctly", async () => {
    // method
    mockSelect.mockResolvedValueOnce("POST");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header? -> yes
    mockConfirm.mockResolvedValueOnce(true);
    // header 1 key
    mockInput.mockResolvedValueOnce("Authorization");
    // header 1 value
    mockInput.mockResolvedValueOnce("Bearer abc");
    // add another header? -> yes
    mockConfirm.mockResolvedValueOnce(true);
    // header 2 key
    mockInput.mockResolvedValueOnce("X-Custom");
    // header 2 value
    mockInput.mockResolvedValueOnce("value123");
    // add another header? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // bodyType
    mockSelect.mockResolvedValueOnce("none");
    // add query param? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(1);
    // total
    mockInput.mockResolvedValueOnce("1");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("multi-header.yaml");
    await wizardCommand({ output: outPath });

    const config = await readYaml(outPath);
    const headers = config.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer abc");
    expect(headers["X-Custom"]).toBe("value123");
  });

  it("multiple body fields are added correctly", async () => {
    // method
    mockSelect.mockResolvedValueOnce("POST");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // bodyType
    mockSelect.mockResolvedValueOnce("json");
    // add body field? -> yes
    mockConfirm.mockResolvedValueOnce(true);
    // body key 1
    mockInput.mockResolvedValueOnce("email");
    // body value 1
    mockInput.mockResolvedValueOnce("{{faker.internet.email}}");
    // add another? -> yes
    mockConfirm.mockResolvedValueOnce(true);
    // body key 2
    mockInput.mockResolvedValueOnce("phone");
    // body value 2
    mockInput.mockResolvedValueOnce("{{faker.phone.number}}");
    // add another? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // add query param? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(1);
    // total
    mockInput.mockResolvedValueOnce("5");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("body.yaml");
    await wizardCommand({ output: outPath });

    const config = await readYaml(outPath);
    const body = config.body as Record<string, string>;
    expect(body.email).toBe("{{faker.internet.email}}");
    expect(body.phone).toBe("{{faker.phone.number}}");
  });

  it("formdata bodyType is set correctly", async () => {
    // method
    mockSelect.mockResolvedValueOnce("PUT");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com/upload");
    // add header? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // bodyType -> formdata
    mockSelect.mockResolvedValueOnce("formdata");
    // add body field? -> yes
    mockConfirm.mockResolvedValueOnce(true);
    // body key
    mockInput.mockResolvedValueOnce("file_name");
    // body value
    mockInput.mockResolvedValueOnce("test.txt");
    // add another? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // add query param? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(1);
    // total
    mockInput.mockResolvedValueOnce("1");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("formdata.yaml");
    await wizardCommand({ output: outPath });

    const config = await readYaml(outPath);
    expect(config.bodyType).toBe("formdata");
  });

  it("prints 'Config discarded.' when user rejects save", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // add query param? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(1);
    // total
    mockInput.mockResolvedValueOnce("1");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save -> NO
    mockConfirm.mockResolvedValueOnce(false);

    const outPath = tmpFile("discard.yaml");
    await wizardCommand({ output: outPath });

    const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const hasDiscarded = calls.some((c) =>
      c.includes("Config discarded."),
    );
    expect(hasDiscarded).toBe(true);
  });

  it("adjusts concurrency to total when concurrency > total", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // add query param? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency = 10 (greater than total)
    mockNumber.mockResolvedValueOnce(10);
    // total = 5
    mockInput.mockResolvedValueOnce("5");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("adj.yaml");
    await wizardCommand({ output: outPath });

    const config = await readYaml(outPath);
    // concurrency should be clamped to total (5), not 10
    expect(config.concurrency).toBe(5);
    expect(config.total).toBe(5);
  });

  it("does NOT adjust concurrency when total is 'infinite'", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // add query param? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency = 10
    mockNumber.mockResolvedValueOnce(10);
    // total = infinite
    mockInput.mockResolvedValueOnce("infinite");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("inf-adj.yaml");
    await wizardCommand({ output: outPath });

    const config = await readYaml(outPath);
    // concurrency should remain 10 since total is infinite
    expect(config.concurrency).toBe(10);
    expect(config.total).toBe("infinite");
  });

  it("does NOT adjust concurrency when concurrency <= total", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // add query param? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency = 3
    mockNumber.mockResolvedValueOnce(3);
    // total = 10
    mockInput.mockResolvedValueOnce("10");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("no-adj.yaml");
    await wizardCommand({ output: outPath });

    const config = await readYaml(outPath);
    // concurrency should remain 3
    expect(config.concurrency).toBe(3);
    expect(config.total).toBe(10);
  });

  it("default successRange: not included in YAML when user declines customization", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // add query param? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(1);
    // total
    mockInput.mockResolvedValueOnce("1");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("default-sr.yaml");
    await wizardCommand({ output: outPath });

    const raw = await readRaw(outPath);
    expect(raw).not.toContain("successRange");
    const config = await readYaml(outPath);
    expect(config.successRange).toBeUndefined();
  });

  it("custom successRange: included in YAML when user customizes", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com");
    // add header? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // add query param? -> no
    mockConfirm.mockResolvedValueOnce(false);
    // concurrency
    mockNumber.mockResolvedValueOnce(1);
    // total
    mockInput.mockResolvedValueOnce("1");
    // timeout
    mockNumber.mockResolvedValueOnce(5000);
    // customize successRange? -> yes
    mockConfirm.mockResolvedValueOnce(true);
    // min
    mockNumber.mockResolvedValueOnce(200);
    // max
    mockNumber.mockResolvedValueOnce(399);
    // confirm save
    mockConfirm.mockResolvedValueOnce(true);

    const outPath = tmpFile("custom-sr.yaml");
    await wizardCommand({ output: outPath });

    const config = await readYaml(outPath);
    const sr = config.successRange as { min: number; max: number };
    expect(sr).toBeDefined();
    expect(sr.min).toBe(200);
    expect(sr.max).toBe(399);
  });
});

describe("validateUrl", () => {
  it("returns true for a valid HTTP URL", () => {
    expect(validateUrl("https://api.example.com/users")).toBe(true);
  });

  it("returns true for a valid URL with port and path", () => {
    expect(validateUrl("http://localhost:3000/api/v1")).toBe(true);
  });

  it("returns error string for an invalid URL", () => {
    const result = validateUrl("not-a-url");
    expect(typeof result).toBe("string");
    expect(result).toContain("Invalid URL");
  });

  it("returns error string for empty string", () => {
    const result = validateUrl("");
    expect(typeof result).toBe("string");
    expect(result).toContain("Invalid URL");
  });

  it("returns error string for URL without protocol", () => {
    const result = validateUrl("api.example.com/users");
    expect(typeof result).toBe("string");
    expect(result).toContain("Invalid URL");
  });
});

describe("validateTotal", () => {
  it('returns true for "infinite"', () => {
    expect(validateTotal("infinite")).toBe(true);
  });

  it("returns true for a valid positive integer string", () => {
    expect(validateTotal("10")).toBe(true);
  });

  it("returns true for '1' (minimum valid)", () => {
    expect(validateTotal("1")).toBe(true);
  });

  it("returns error string for '0'", () => {
    const result = validateTotal("0");
    expect(typeof result).toBe("string");
    expect(result).toContain("positive integer");
  });

  it("returns error string for negative number", () => {
    const result = validateTotal("-5");
    expect(typeof result).toBe("string");
    expect(result).toContain("positive integer");
  });

  it("returns error string for decimal number", () => {
    const result = validateTotal("3.5");
    expect(typeof result).toBe("string");
    expect(result).toContain("positive integer");
  });

  it("returns error string for non-numeric string", () => {
    const result = validateTotal("abc");
    expect(typeof result).toBe("string");
    expect(result).toContain("positive integer");
  });

  it("returns error string for empty string", () => {
    const result = validateTotal("");
    expect(typeof result).toBe("string");
    expect(result).toContain("positive integer");
  });
});
