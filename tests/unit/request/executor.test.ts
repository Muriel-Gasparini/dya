import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpClient } from "../../../src/request/http-client.js";
import type { HttpResponse } from "../../../src/request/types.js";
import { RequestExecutor } from "../../../src/request/executor.js";

describe("RequestExecutor", () => {
  let mockHttpClient: HttpClient;
  let executor: RequestExecutor;

  beforeEach(() => {
    mockHttpClient = {
      execute: vi.fn(),
    };
    executor = new RequestExecutor(mockHttpClient);
  });

  describe("execute - happy path", () => {
    it("should return RequestResult with status 200 and error null on success", async () => {
      const mockResponse: HttpResponse = {
        statusCode: 200,
        headers: { "content-type": "application/json" },
      };
      vi.mocked(mockHttpClient.execute).mockResolvedValue(mockResponse);

      const result = await executor.execute({
        index: 1,
        method: "GET",
        url: "https://api.example.com/users",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.status).toBe(200);
      expect(result.error).toBeNull();
    });

    it("should return durationMs > 0 on success", async () => {
      const mockResponse: HttpResponse = {
        statusCode: 200,
        headers: {},
      };
      vi.mocked(mockHttpClient.execute).mockResolvedValue(mockResponse);

      const result = await executor.execute({
        index: 1,
        method: "GET",
        url: "https://api.example.com/health",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should propagate index correctly in RequestResult", async () => {
      const mockResponse: HttpResponse = {
        statusCode: 200,
        headers: {},
      };
      vi.mocked(mockHttpClient.execute).mockResolvedValue(mockResponse);

      const result = await executor.execute({
        index: 42,
        method: "POST",
        url: "https://api.example.com/register",
        headers: {},
        body: '{"name":"test"}',
        timeoutMs: 5000,
      });

      expect(result.index).toBe(42);
    });

    it("should propagate method correctly in RequestResult", async () => {
      const mockResponse: HttpResponse = {
        statusCode: 201,
        headers: {},
      };
      vi.mocked(mockHttpClient.execute).mockResolvedValue(mockResponse);

      const result = await executor.execute({
        index: 1,
        method: "POST",
        url: "https://api.example.com/register",
        headers: { "content-type": "application/json" },
        body: '{"name":"test"}',
        timeoutMs: 5000,
      });

      expect(result.method).toBe("POST");
    });

    it("should propagate url correctly in RequestResult", async () => {
      const mockResponse: HttpResponse = {
        statusCode: 200,
        headers: {},
      };
      vi.mocked(mockHttpClient.execute).mockResolvedValue(mockResponse);

      const targetUrl = "https://api.example.com/users?page=1&limit=10";

      const result = await executor.execute({
        index: 1,
        method: "GET",
        url: targetUrl,
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.url).toBe(targetUrl);
    });
  });

  describe("execute - HTTP error status codes", () => {
    it("should return RequestResult with status 500 and error null for server errors", async () => {
      const mockResponse: HttpResponse = {
        statusCode: 500,
        headers: {},
      };
      vi.mocked(mockHttpClient.execute).mockResolvedValue(mockResponse);

      const result = await executor.execute({
        index: 3,
        method: "POST",
        url: "https://api.example.com/fail",
        headers: {},
        body: '{"data":"test"}',
        timeoutMs: 5000,
      });

      expect(result.status).toBe(500);
      expect(result.error).toBeNull();
    });

    it("should return RequestResult with status 404 and error null for not found", async () => {
      const mockResponse: HttpResponse = {
        statusCode: 404,
        headers: {},
      };
      vi.mocked(mockHttpClient.execute).mockResolvedValue(mockResponse);

      const result = await executor.execute({
        index: 5,
        method: "GET",
        url: "https://api.example.com/notfound",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.status).toBe(404);
      expect(result.error).toBeNull();
    });

    it("should return RequestResult with status 400 and error null for bad request", async () => {
      const mockResponse: HttpResponse = {
        statusCode: 400,
        headers: {},
      };
      vi.mocked(mockHttpClient.execute).mockResolvedValue(mockResponse);

      const result = await executor.execute({
        index: 2,
        method: "PUT",
        url: "https://api.example.com/update",
        headers: {},
        body: '{"invalid":"data"}',
        timeoutMs: 5000,
      });

      expect(result.status).toBe(400);
      expect(result.error).toBeNull();
    });
  });

  describe("execute - timeout handling", () => {
    it("should return RequestResult with status null and error containing timeout message", async () => {
      vi.mocked(mockHttpClient.execute).mockRejectedValue(
        new Error("Timeout of 5000ms exceeded"),
      );

      const result = await executor.execute({
        index: 7,
        method: "GET",
        url: "https://api.example.com/slow",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.status).toBeNull();
      expect(result.error).toContain("Timeout");
    });

    it("should return positive durationMs on timeout", async () => {
      vi.mocked(mockHttpClient.execute).mockRejectedValue(
        new Error("Timeout of 3000ms exceeded"),
      );

      const result = await executor.execute({
        index: 1,
        method: "POST",
        url: "https://api.example.com/slow",
        headers: {},
        body: '{"data":"test"}',
        timeoutMs: 3000,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should propagate index and method on timeout", async () => {
      vi.mocked(mockHttpClient.execute).mockRejectedValue(
        new Error("Timeout of 5000ms exceeded"),
      );

      const result = await executor.execute({
        index: 15,
        method: "DELETE",
        url: "https://api.example.com/resource/123",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.index).toBe(15);
      expect(result.method).toBe("DELETE");
      expect(result.url).toBe("https://api.example.com/resource/123");
    });
  });

  describe("execute - network error handling", () => {
    it("should return RequestResult with status null and error message for ECONNREFUSED", async () => {
      vi.mocked(mockHttpClient.execute).mockRejectedValue(
        new Error("Connection refused (ECONNREFUSED): connect ECONNREFUSED 127.0.0.1:3000"),
      );

      const result = await executor.execute({
        index: 2,
        method: "GET",
        url: "https://localhost:3000/api",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.status).toBeNull();
      expect(result.error).toContain("ECONNREFUSED");
    });

    it("should return RequestResult with error message for ENOTFOUND (DNS error)", async () => {
      vi.mocked(mockHttpClient.execute).mockRejectedValue(
        new Error("Host not found (ENOTFOUND): getaddrinfo ENOTFOUND api.naoexiste.com"),
      );

      const result = await executor.execute({
        index: 4,
        method: "POST",
        url: "https://api.naoexiste.com/endpoint",
        headers: {},
        body: '{"data":"test"}',
        timeoutMs: 5000,
      });

      expect(result.status).toBeNull();
      expect(result.error).toContain("ENOTFOUND");
    });

    it("should return positive durationMs on network error", async () => {
      vi.mocked(mockHttpClient.execute).mockRejectedValue(
        new Error("Connection refused (ECONNREFUSED): connect ECONNREFUSED 127.0.0.1:3000"),
      );

      const result = await executor.execute({
        index: 1,
        method: "GET",
        url: "https://localhost:3000/api",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("execute - never throws", () => {
    it("should return RequestResult with error for non-Error thrown values", async () => {
      vi.mocked(mockHttpClient.execute).mockRejectedValue("string error");

      const result = await executor.execute({
        index: 1,
        method: "GET",
        url: "https://api.example.com/test",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.status).toBeNull();
      expect(result.error).toBe("string error");
    });

    it("should return RequestResult with error for undefined thrown values", async () => {
      vi.mocked(mockHttpClient.execute).mockRejectedValue(undefined);

      const result = await executor.execute({
        index: 1,
        method: "GET",
        url: "https://api.example.com/test",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.status).toBeNull();
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    });

    it("should never reject the promise regardless of httpClient behavior", async () => {
      vi.mocked(mockHttpClient.execute).mockRejectedValue(
        new TypeError("Cannot read properties of undefined"),
      );

      // This should NOT throw - executor must always return RequestResult
      const result = await executor.execute({
        index: 1,
        method: "PATCH",
        url: "https://api.example.com/broken",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result).toBeDefined();
      expect(result.status).toBeNull();
      expect(result.error).toContain("Cannot read properties");
    });
  });

  describe("execute - durationMs reflects real timing", () => {
    it("should measure durationMs that reflects actual elapsed time", async () => {
      // Simulate a delay of ~50ms by using a delayed mock
      vi.mocked(mockHttpClient.execute).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ statusCode: 200, headers: {} }),
              50,
            ),
          ),
      );

      const result = await executor.execute({
        index: 1,
        method: "GET",
        url: "https://api.example.com/delayed",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      // Should be at least ~50ms (with some tolerance for test environment)
      expect(result.durationMs).toBeGreaterThanOrEqual(40);
      expect(result.durationMs).toBeLessThan(500);
    });

    it("should measure durationMs on error that reflects actual elapsed time", async () => {
      // Simulate a delay of ~30ms before rejecting
      vi.mocked(mockHttpClient.execute).mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("delayed error")),
              30,
            ),
          ),
      );

      const result = await executor.execute({
        index: 1,
        method: "GET",
        url: "https://api.example.com/delayed-error",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(20);
      expect(result.durationMs).toBeLessThan(500);
    });
  });

  describe("execute - httpClient called with correct arguments", () => {
    it("should pass url, method, headers, body, and timeoutMs to httpClient.execute", async () => {
      vi.mocked(mockHttpClient.execute).mockResolvedValue({
        statusCode: 200,
        headers: {},
      });

      const options = {
        index: 1,
        method: "POST" as const,
        url: "https://api.example.com/register",
        headers: { "content-type": "application/json", authorization: "Bearer token" },
        body: '{"phone":"555-1234"}',
        timeoutMs: 8000,
      };

      await executor.execute(options);

      expect(mockHttpClient.execute).toHaveBeenCalledWith({
        url: "https://api.example.com/register",
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer token" },
        body: '{"phone":"555-1234"}',
        timeoutMs: 8000,
      });
    });

    it("should pass null body for GET requests", async () => {
      vi.mocked(mockHttpClient.execute).mockResolvedValue({
        statusCode: 200,
        headers: {},
      });

      await executor.execute({
        index: 1,
        method: "GET",
        url: "https://api.example.com/list",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });

      expect(mockHttpClient.execute).toHaveBeenCalledWith({
        url: "https://api.example.com/list",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 5000,
      });
    });
  });
});
