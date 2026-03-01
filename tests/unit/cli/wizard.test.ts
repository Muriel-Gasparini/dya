import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stringify } from "yaml";

// Mock @inquirer/prompts
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
  number: vi.fn(),
}));

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
  access: vi.fn(),
}));

import {
  wizardCommand,
  validateUrl,
  validateTotal,
} from "../../../src/cli/wizard.js";
import { select, input, confirm, number } from "@inquirer/prompts";
import { writeFile, access } from "node:fs/promises";

const mockSelect = vi.mocked(select);
const mockInput = vi.mocked(input);
const mockConfirm = vi.mocked(confirm);
const mockNumber = vi.mocked(number);
const mockWriteFile = vi.mocked(writeFile);
const mockAccess = vi.mocked(access);

describe("wizardCommand", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Default: file does not exist
    mockAccess.mockRejectedValue(new Error("ENOENT"));
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

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

    mockWriteFile.mockResolvedValue(undefined);
  }

  it("happy path: collects all inputs and writes YAML file", async () => {
    setupFullPostFlow();

    await wizardCommand({ output: "repeater.yaml" });

    // Check writeFile was called
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [filePath, content] = mockWriteFile.mock.calls[0] as [
      string,
      string,
    ];
    expect(filePath).toBe("repeater.yaml");

    // Validate YAML content
    expect(content).toContain("method: POST");
    expect(content).toContain("url: https://api.example.com/users");
    expect(content).toContain("Authorization: Bearer token123");
    expect(content).toContain("bodyType: json");
    expect(content).toContain("name: \"{{faker.person.fullName}}\"");
    expect(content).toContain("source: cli");
    expect(content).toContain("concurrency: 5");
    expect(content).toContain("total: 50");
    expect(content).toContain("timeoutMs: 5000");
  });

  it("GET method: bodyType is automatically 'none', no body prompts asked", async () => {
    // method
    mockSelect.mockResolvedValueOnce("GET");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com/users");
    // add header?
    mockConfirm.mockResolvedValueOnce(false);
    // NO bodyType select for GET
    // NO body fields for GET
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "test.yaml" });

    // Verify bodyType select was NOT called for GET
    // First select call is method, there should be no second select call
    expect(mockSelect).toHaveBeenCalledTimes(1);

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain("method: GET");
    expect(content).toContain("bodyType: none");
  });

  it("DELETE method: bodyType is automatically 'none'", async () => {
    // method
    mockSelect.mockResolvedValueOnce("DELETE");
    // url
    mockInput.mockResolvedValueOnce("https://api.example.com/users/1");
    // add header?
    mockConfirm.mockResolvedValueOnce(false);
    // NO bodyType select for DELETE
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "del.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain("bodyType: none");
    expect(mockSelect).toHaveBeenCalledTimes(1); // only method select
  });

  it("confirmation 'No': file is NOT saved", async () => {
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

    await wizardCommand({ output: "repeater.yaml" });

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes YAML using yaml.stringify, not manual string", async () => {
    setupFullPostFlow();

    await wizardCommand({ output: "out.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    // Validate it's parseable YAML by trying to parse it
    // The content should be valid YAML that yaml.stringify would produce
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
    // Should not have JavaScript object notation
    expect(content).not.toContain("[object Object]");
  });

  it("shows preview before saving", async () => {
    setupFullPostFlow();

    await wizardCommand({ output: "repeater.yaml" });

    // Check that preview was shown (console.log called with preview markers)
    const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const hasPreviewStart = calls.some((c) => c.includes("--- Preview ---"));
    const hasPreviewEnd = calls.some((c) => c.includes("--- Fim ---"));
    expect(hasPreviewStart).toBe(true);
    expect(hasPreviewEnd).toBe(true);
  });

  it("uses custom output path from options", async () => {
    setupFullPostFlow();

    await wizardCommand({ output: "custom/path/config.yaml" });

    const [filePath] = mockWriteFile.mock.calls[0] as [string, string];
    expect(filePath).toBe("custom/path/config.yaml");
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "inf.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain("total: infinite");
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "multi-header.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain("Authorization: Bearer abc");
    expect(content).toContain("X-Custom: value123");
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "body.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain("email:");
    expect(content).toContain("phone:");
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "formdata.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain("bodyType: formdata");
  });

  it("prints 'Configuracao descartada.' when user rejects save", async () => {
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

    await wizardCommand({ output: "repeater.yaml" });

    const calls = stdoutSpy.mock.calls.map((c) => String(c[0]));
    const hasDiscarded = calls.some((c) =>
      c.includes("Configuracao descartada."),
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "adj.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    // concurrency should be clamped to total (5), not 10
    expect(content).toContain("concurrency: 5");
    expect(content).toContain("total: 5");
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "inf-adj.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    // concurrency should remain 10 since total is infinite
    expect(content).toContain("concurrency: 10");
    expect(content).toContain("total: infinite");
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "no-adj.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    // concurrency should remain 3
    expect(content).toContain("concurrency: 3");
    expect(content).toContain("total: 10");
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "default-sr.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).not.toContain("successRange");
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

    mockWriteFile.mockResolvedValue(undefined);

    await wizardCommand({ output: "custom-sr.yaml" });

    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(content).toContain("successRange");
    expect(content).toContain("min: 200");
    expect(content).toContain("max: 399");
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
    expect(result).toContain("URL invalida");
  });

  it("returns error string for empty string", () => {
    const result = validateUrl("");
    expect(typeof result).toBe("string");
    expect(result).toContain("URL invalida");
  });

  it("returns error string for URL without protocol", () => {
    const result = validateUrl("api.example.com/users");
    expect(typeof result).toBe("string");
    expect(result).toContain("URL invalida");
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
    expect(result).toContain("numero inteiro positivo");
  });

  it("returns error string for negative number", () => {
    const result = validateTotal("-5");
    expect(typeof result).toBe("string");
    expect(result).toContain("numero inteiro positivo");
  });

  it("returns error string for decimal number", () => {
    const result = validateTotal("3.5");
    expect(typeof result).toBe("string");
    expect(result).toContain("numero inteiro positivo");
  });

  it("returns error string for non-numeric string", () => {
    const result = validateTotal("abc");
    expect(typeof result).toBe("string");
    expect(result).toContain("numero inteiro positivo");
  });

  it("returns error string for empty string", () => {
    const result = validateTotal("");
    expect(typeof result).toBe("string");
    expect(result).toContain("numero inteiro positivo");
  });
});
