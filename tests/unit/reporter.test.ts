import { describe, it, expect, beforeEach } from "vitest";
import { ConsoleReporter } from "../../src/reporter.js";
import type { RequestResult, ExecutionSummary } from "../../src/request/types.js";
import type { RequestTotal } from "../../src/config/types.js";

describe("ConsoleReporter", () => {
  let output: string[];
  let reporter: ConsoleReporter;

  beforeEach(() => {
    output = [];
    reporter = new ConsoleReporter({ stdout: (msg: string) => output.push(msg) });
  });

  describe("reportResult", () => {
    it("should format finite mode: [index/total] METHOD URL status durationMs", () => {
      const result: RequestResult = {
        index: 1,
        method: "POST",
        url: "https://api.example.com/register",
        status: 200,
        durationMs: 320,
        error: null,
      };

      reporter.reportResult(result, 50);

      expect(output).toHaveLength(1);
      expect(output[0]).toContain("[1/50]");
      expect(output[0]).toContain("POST");
      expect(output[0]).toContain("200");
      expect(output[0]).toContain("ms");
    });

    it("should format infinite mode: [index] without slash", () => {
      const result: RequestResult = {
        index: 1,
        method: "POST",
        url: "https://api.example.com/register",
        status: 200,
        durationMs: 150,
        error: null,
      };

      reporter.reportResult(result, "infinite");

      expect(output).toHaveLength(1);
      expect(output[0]).toContain("[1]");
      // Should NOT contain index/total pattern like [1/50]
      expect(output[0]).not.toMatch(/\[\d+\/\d+\]/);
    });

    it("should format error result with ERR and error message when status is null", () => {
      const result: RequestResult = {
        index: 3,
        method: "POST",
        url: "https://api.example.com/register",
        status: null,
        durationMs: 5000,
        error: "Timeout of 5000ms exceeded",
      };

      reporter.reportResult(result, 50);

      expect(output).toHaveLength(1);
      expect(output[0]).toContain("ERR");
      expect(output[0]).toContain("Timeout");
    });

    it("should display status 404 as-is, NOT as ERR", () => {
      const result: RequestResult = {
        index: 2,
        method: "GET",
        url: "https://api.example.com/notfound",
        status: 404,
        durationMs: 80,
        error: null,
      };

      reporter.reportResult(result, 10);

      expect(output).toHaveLength(1);
      expect(output[0]).toContain("404");
      expect(output[0]).not.toContain("ERR");
    });

    it("should display status 500 as-is, NOT as ERR", () => {
      const result: RequestResult = {
        index: 5,
        method: "POST",
        url: "https://api.example.com/fail",
        status: 500,
        durationMs: 200,
        error: null,
      };

      reporter.reportResult(result, 100);

      expect(output).toHaveLength(1);
      expect(output[0]).toContain("500");
      expect(output[0]).not.toContain("ERR");
    });

    it("should include the URL in the output", () => {
      const result: RequestResult = {
        index: 1,
        method: "GET",
        url: "https://api.example.com/users?page=1&limit=10",
        status: 200,
        durationMs: 100,
        error: null,
      };

      reporter.reportResult(result, 5);

      expect(output[0]).toContain("https://api.example.com/users?page=1&limit=10");
    });
  });

  describe("reportSummary", () => {
    it("should display complete summary with total, success, failures, avg, min, max, and duration", () => {
      const summary: ExecutionSummary = {
        totalRequests: 50,
        successCount: 45,
        failureCount: 5,
        avgDurationMs: 320,
        minDurationMs: 120,
        maxDurationMs: 890,
        totalDurationMs: 12500,
      };

      reporter.reportSummary(summary);

      const fullOutput = output.join("\n");
      expect(fullOutput).toContain("50");
      expect(fullOutput).toContain("45");
      expect(fullOutput).toContain("5");
      expect(fullOutput).toContain("320ms");
      expect(fullOutput).toContain("120ms");
      expect(fullOutput).toContain("890ms");
      expect(fullOutput).toContain("90.0%");
      expect(fullOutput).toContain("10.0%");
      expect(fullOutput).toContain("12.5s");
    });

    it("should handle 0 total requests without errors (no division by zero)", () => {
      const summary: ExecutionSummary = {
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        avgDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        totalDurationMs: 0,
      };

      expect(() => reporter.reportSummary(summary)).not.toThrow();

      const fullOutput = output.join("\n");
      expect(fullOutput).toContain("0");
      expect(fullOutput).toContain("0.0%");
    });

    it("should handle all failures (successCount 0)", () => {
      const summary: ExecutionSummary = {
        totalRequests: 10,
        successCount: 0,
        failureCount: 10,
        avgDurationMs: 5000,
        minDurationMs: 4900,
        maxDurationMs: 5100,
        totalDurationMs: 50000,
      };

      reporter.reportSummary(summary);

      const fullOutput = output.join("\n");
      expect(fullOutput).toContain("0.0%");
      expect(fullOutput).toContain("100.0%");
      expect(fullOutput).toContain("10");
    });

    it("should display Summary header and End footer", () => {
      const summary: ExecutionSummary = {
        totalRequests: 1,
        successCount: 1,
        failureCount: 0,
        avgDurationMs: 100,
        minDurationMs: 100,
        maxDurationMs: 100,
        totalDurationMs: 100,
      };

      reporter.reportSummary(summary);

      const fullOutput = output.join("\n");
      expect(fullOutput).toContain("Summary");
      expect(fullOutput).toContain("End");
    });

    it("should convert totalDurationMs to seconds with 1 decimal when >= 1000", () => {
      const summary: ExecutionSummary = {
        totalRequests: 5,
        successCount: 5,
        failureCount: 0,
        avgDurationMs: 200,
        minDurationMs: 100,
        maxDurationMs: 300,
        totalDurationMs: 1500,
      };

      reporter.reportSummary(summary);

      const fullOutput = output.join("\n");
      expect(fullOutput).toContain("1.5s");
    });

    it("should display totalDurationMs in ms when < 1000", () => {
      const summary: ExecutionSummary = {
        totalRequests: 2,
        successCount: 2,
        failureCount: 0,
        avgDurationMs: 50,
        minDurationMs: 30,
        maxDurationMs: 70,
        totalDurationMs: 500,
      };

      reporter.reportSummary(summary);

      const fullOutput = output.join("\n");
      expect(fullOutput).toContain("500ms");
    });
  });

  describe("formatting", () => {
    it("should display durationMs as integer (Math.round)", () => {
      const result: RequestResult = {
        index: 1,
        method: "GET",
        url: "https://api.example.com/test",
        status: 200,
        durationMs: 123.789,
        error: null,
      };

      reporter.reportResult(result, 10);

      // Should contain "124ms" (Math.round(123.789))
      expect(output[0]).toContain("124ms");
      expect(output[0]).not.toContain("123.789");
    });

    it("should display method in uppercase", () => {
      const result: RequestResult = {
        index: 1,
        method: "POST",
        url: "https://api.example.com/data",
        status: 201,
        durationMs: 200,
        error: null,
      };

      reporter.reportResult(result, 5);

      expect(output[0]).toContain("POST");
    });

    it("should round avgDurationMs in summary as integer", () => {
      const summary: ExecutionSummary = {
        totalRequests: 3,
        successCount: 3,
        failureCount: 0,
        avgDurationMs: 123.456,
        minDurationMs: 100.2,
        maxDurationMs: 150.8,
        totalDurationMs: 370,
      };

      reporter.reportSummary(summary);

      const fullOutput = output.join("\n");
      expect(fullOutput).toContain("123ms");
      expect(fullOutput).toContain("100ms");
      expect(fullOutput).toContain("151ms");
    });
  });
});
