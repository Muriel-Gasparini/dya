import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpRequestOptions } from "../../../src/request/types.js";

vi.mock("undici", () => ({
  request: vi.fn(),
}));

import { request as undiciRequest } from "undici";
import { UndiciHttpClient } from "../../../src/request/http-client.js";

const mockRequest = vi.mocked(undiciRequest);

describe("UndiciHttpClient", () => {
  let client: UndiciHttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new UndiciHttpClient();
  });

  describe("execute - happy path", () => {
    it("should return HttpResponse with statusCode and headers on success", async () => {
      const dumpFn = vi.fn().mockResolvedValue(undefined);
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: { "content-type": "application/json", "x-request-id": "abc" },
        body: { dump: dumpFn },
      } as any);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/users",
        method: "GET",
        headers: { authorization: "Bearer token" },
        body: null,
        timeoutMs: 5000,
      };

      const response = await client.execute(options);

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("application/json");
      expect(response.headers["x-request-id"]).toBe("abc");
    });

    it("should return correct statusCode for different status codes (201, 400, 500)", async () => {
      for (const statusCode of [201, 400, 404, 500]) {
        const dumpFn = vi.fn().mockResolvedValue(undefined);
        mockRequest.mockResolvedValue({
          statusCode,
          headers: {},
          body: { dump: dumpFn },
        } as any);

        const options: HttpRequestOptions = {
          url: "https://api.example.com/resource",
          method: "POST",
          headers: {},
          body: '{"key":"value"}',
          timeoutMs: 5000,
        };

        const response = await client.execute(options);
        expect(response.statusCode).toBe(statusCode);
      }
    });
  });

  describe("execute - body handling", () => {
    it("should pass body as string to undici.request for JSON body", async () => {
      const dumpFn = vi.fn().mockResolvedValue(undefined);
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { dump: dumpFn },
      } as any);

      const jsonBody = '{"phone":"555-1234","name":"John"}';
      const options: HttpRequestOptions = {
        url: "https://api.example.com/register",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: jsonBody,
        timeoutMs: 5000,
      };

      await client.execute(options);

      expect(mockRequest).toHaveBeenCalledWith(
        options.url,
        expect.objectContaining({
          body: jsonBody,
        }),
      );
    });

    it("should pass body as undefined/null to undici.request for GET (body null)", async () => {
      const dumpFn = vi.fn().mockResolvedValue(undefined);
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { dump: dumpFn },
      } as any);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/health",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 5000,
      };

      await client.execute(options);

      const callArgs = mockRequest.mock.calls[0][1] as any;
      expect(callArgs.body == null).toBe(true);
    });
  });

  describe("execute - timeout handling", () => {
    it("should throw error with descriptive message when AbortError occurs", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockRequest.mockRejectedValue(abortError);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/slow",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 3000,
      };

      await expect(client.execute(options)).rejects.toThrow(
        "Timeout of 3000ms exceeded",
      );
    });

    it("should include timeoutMs value in timeout error message", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockRequest.mockRejectedValue(abortError);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/slow",
        method: "POST",
        headers: {},
        body: '{"data":"test"}',
        timeoutMs: 10000,
      };

      await expect(client.execute(options)).rejects.toThrow(
        "Timeout of 10000ms exceeded",
      );
    });
  });

  describe("execute - network error handling", () => {
    it("should throw descriptive error for ECONNREFUSED", async () => {
      const networkError = new Error("connect ECONNREFUSED 127.0.0.1:3000");
      (networkError as any).code = "ECONNREFUSED";
      mockRequest.mockRejectedValue(networkError);

      const options: HttpRequestOptions = {
        url: "https://localhost:3000/api",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 5000,
      };

      await expect(client.execute(options)).rejects.toThrow("ECONNREFUSED");
      await expect(client.execute(options)).rejects.toThrow(
        /Connection refused/,
      );
    });

    it("should throw descriptive error for ENOTFOUND (DNS error)", async () => {
      const dnsError = new Error(
        "getaddrinfo ENOTFOUND api.naoexiste.com",
      );
      (dnsError as any).code = "ENOTFOUND";
      mockRequest.mockRejectedValue(dnsError);

      const options: HttpRequestOptions = {
        url: "https://api.naoexiste.com/endpoint",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 5000,
      };

      await expect(client.execute(options)).rejects.toThrow("ENOTFOUND");
      await expect(client.execute(options)).rejects.toThrow(
        /Host not found/,
      );
    });

    it("should re-throw unknown errors with original message", async () => {
      const unknownError = new Error("Something unexpected happened");
      mockRequest.mockRejectedValue(unknownError);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/test",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 5000,
      };

      await expect(client.execute(options)).rejects.toThrow(
        "Something unexpected happened",
      );
    });

    it("should re-throw non-Error thrown values as-is", async () => {
      mockRequest.mockRejectedValue("string error");

      const options: HttpRequestOptions = {
        url: "https://api.example.com/test",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 5000,
      };

      await expect(client.execute(options)).rejects.toBe("string error");
    });
  });

  describe("execute - AbortSignal.timeout", () => {
    it("should call undici.request with an AbortSignal", async () => {
      const dumpFn = vi.fn().mockResolvedValue(undefined);
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { dump: dumpFn },
      } as any);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/test",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 7000,
      };

      const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

      await client.execute(options);

      expect(timeoutSpy).toHaveBeenCalledWith(7000);

      const callArgs = mockRequest.mock.calls[0][1] as any;
      expect(callArgs.signal).toBeInstanceOf(AbortSignal);

      timeoutSpy.mockRestore();
    });
  });

  describe("execute - response body consumption", () => {
    it("should consume response body by calling .body.dump()", async () => {
      const dumpFn = vi.fn().mockResolvedValue(undefined);
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: { dump: dumpFn },
      } as any);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/page",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 5000,
      };

      await client.execute(options);

      expect(dumpFn).toHaveBeenCalledOnce();
    });
  });

  describe("execute - headers conversion", () => {
    it("should convert array header values to first element", async () => {
      const dumpFn = vi.fn().mockResolvedValue(undefined);
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: {
          "set-cookie": ["cookie1=value1", "cookie2=value2"],
          "content-type": "application/json",
        },
        body: { dump: dumpFn },
      } as any);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/login",
        method: "POST",
        headers: {},
        body: '{"user":"admin"}',
        timeoutMs: 5000,
      };

      const response = await client.execute(options);

      expect(response.headers["set-cookie"]).toBe("cookie1=value1");
      expect(response.headers["content-type"]).toBe("application/json");
    });

    it("should handle undefined header values gracefully", async () => {
      const dumpFn = vi.fn().mockResolvedValue(undefined);
      mockRequest.mockResolvedValue({
        statusCode: 204,
        headers: {
          "content-type": undefined,
          "x-present": "value",
        },
        body: { dump: dumpFn },
      } as any);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/delete",
        method: "DELETE",
        headers: {},
        body: null,
        timeoutMs: 5000,
      };

      const response = await client.execute(options);

      expect(response.statusCode).toBe(204);
      expect(response.headers["x-present"]).toBe("value");
    });

    it("should pass request headers to undici.request", async () => {
      const dumpFn = vi.fn().mockResolvedValue(undefined);
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { dump: dumpFn },
      } as any);

      const requestHeaders = {
        authorization: "Bearer my-token",
        "content-type": "application/json",
        "x-custom": "custom-value",
      };

      const options: HttpRequestOptions = {
        url: "https://api.example.com/protected",
        method: "POST",
        headers: requestHeaders,
        body: '{"data":"test"}',
        timeoutMs: 5000,
      };

      await client.execute(options);

      expect(mockRequest).toHaveBeenCalledWith(
        options.url,
        expect.objectContaining({
          headers: requestHeaders,
        }),
      );
    });
  });

  describe("execute - undici.request call arguments", () => {
    it("should pass method to undici.request", async () => {
      const dumpFn = vi.fn().mockResolvedValue(undefined);
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: { dump: dumpFn },
      } as any);

      const options: HttpRequestOptions = {
        url: "https://api.example.com/resource",
        method: "PATCH",
        headers: {},
        body: '{"field":"value"}',
        timeoutMs: 5000,
      };

      await client.execute(options);

      expect(mockRequest).toHaveBeenCalledWith(
        "https://api.example.com/resource",
        expect.objectContaining({
          method: "PATCH",
        }),
      );
    });
  });
});
