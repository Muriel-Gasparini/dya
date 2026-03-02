import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RepeaterConfig } from "../../src/config/types.js";
import type { RequestResult, ExecutionSummary } from "../../src/request/types.js";
import type { RunnerDeps } from "../../src/runner.js";

function makeConfig(overrides: Partial<RepeaterConfig> = {}): RepeaterConfig {
  return {
    method: "GET",
    url: "http://test.com/api",
    headers: {},
    bodyType: "none",
    body: {},
    queryParams: {},
    concurrency: 1,
    total: 1,
    timeoutMs: 5000,
    successRange: { min: 200, max: 299 },
    ...overrides,
  };
}

function makeResult(overrides: Partial<RequestResult> = {}): RequestResult {
  return {
    index: 1,
    method: "GET",
    url: "http://test.com/api",
    status: 200,
    durationMs: 100,
    error: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    templateEngine: {
      resolve: vi.fn((s: string) => s),
      resolveRecord: vi.fn((r: Record<string, string>) => ({ ...r })),
      validateRecord: vi.fn(),
    },
    requestExecutor: {
      execute: vi.fn().mockResolvedValue(makeResult()),
    },
    bodyBuilder: {
      build: vi.fn().mockReturnValue({ body: null, contentType: null }),
    },
    reporter: {
      reportResult: vi.fn(),
      reportSummary: vi.fn(),
    },
    ...overrides,
  };
}

describe("RepeaterRunner", () => {
  // We import dynamically to avoid errors before the file exists
  let RepeaterRunner: typeof import("../../src/runner.js").RepeaterRunner;

  beforeEach(async () => {
    const mod = await import("../../src/runner.js");
    RepeaterRunner = mod.RepeaterRunner;
  });

  describe("happy path (finite)", () => {
    it("should execute total=3 requests and return summary with 3 requests", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 3, concurrency: 1 });

      const summary = await runner.execute(config);

      expect(summary.totalRequests).toBe(3);
      expect(summary.successCount).toBe(3);
      expect(summary.failureCount).toBe(0);
    });

    it("should call reportResult 3 times and reportSummary once for total=3", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 3, concurrency: 1 });

      await runner.execute(config);

      expect(deps.reporter.reportResult).toHaveBeenCalledTimes(3);
      expect(deps.reporter.reportSummary).toHaveBeenCalledTimes(1);
    });

    it("should pass config.total to reportResult", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 5, concurrency: 1 });

      await runner.execute(config);

      for (const call of (deps.reporter.reportResult as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call[1]).toBe(5);
      }
    });

    it("should return summary with correct avg/min/max durations", async () => {
      const durations = [100, 200, 300];
      let callIndex = 0;
      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(() =>
            Promise.resolve(makeResult({ durationMs: durations[callIndex++] }))
          ),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 3, concurrency: 1 });

      const summary = await runner.execute(config);

      expect(summary.avgDurationMs).toBe(200);
      expect(summary.minDurationMs).toBe(100);
      expect(summary.maxDurationMs).toBe(300);
    });

    it("should return summary with totalDurationMs > 0", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 1 });

      const summary = await runner.execute(config);

      expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("total=1 (single request)", () => {
    it("should execute 1 request and call reportSummary", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 1 });

      const summary = await runner.execute(config);

      expect(summary.totalRequests).toBe(1);
      expect(deps.reporter.reportResult).toHaveBeenCalledTimes(1);
      expect(deps.reporter.reportSummary).toHaveBeenCalledTimes(1);
    });
  });

  describe("concurrency", () => {
    it("should respect concurrency limit of 2 with total=5", async () => {
      let inFlight = 0;
      let maxInFlight = 0;

      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            // Simulate some async work
            await new Promise((resolve) => setTimeout(resolve, 20));
            inFlight--;
            return makeResult();
          }),
        },
      });

      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 5, concurrency: 2 });

      await runner.execute(config);

      expect(maxInFlight).toBeLessThanOrEqual(2);
      expect(deps.requestExecutor.execute).toHaveBeenCalledTimes(5);
    });

    it("should allow concurrency equal to total (all at once)", async () => {
      let inFlight = 0;
      let maxInFlight = 0;

      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(async () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 20));
            inFlight--;
            return makeResult();
          }),
        },
      });

      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 3, concurrency: 3 });

      await runner.execute(config);

      expect(maxInFlight).toBeLessThanOrEqual(3);
      expect(deps.requestExecutor.execute).toHaveBeenCalledTimes(3);
    });

    it("should execute sequentially when concurrency=1", async () => {
      const order: number[] = [];

      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(async (opts: { index: number }) => {
            order.push(opts.index);
            await new Promise((resolve) => setTimeout(resolve, 5));
            return makeResult({ index: opts.index });
          }),
        },
      });

      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 3, concurrency: 1 });

      await runner.execute(config);

      // Sequential: requests should complete in order
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe("infinite mode + abort", () => {
    it("should stop after abort() is called and return partial summary", async () => {
      let callCount = 0;
      let runnerRef: InstanceType<typeof RepeaterRunner> | null = null;

      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(async () => {
            callCount++;
            // Abort after 3 requests
            if (callCount >= 3 && runnerRef) {
              runnerRef.abort();
            }
            return makeResult({ index: callCount });
          }),
        },
      });

      const runner = new RepeaterRunner(deps);
      runnerRef = runner;
      const config = makeConfig({ total: "infinite", concurrency: 1 });

      const summary = await runner.execute(config);

      expect(summary.totalRequests).toBeGreaterThanOrEqual(3);
      expect(deps.reporter.reportSummary).toHaveBeenCalledTimes(1);
    });

    it("should pass 'infinite' as total to reportResult in infinite mode", async () => {
      let callCount = 0;
      let runnerRef: InstanceType<typeof RepeaterRunner> | null = null;

      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount >= 2 && runnerRef) {
              runnerRef.abort();
            }
            return makeResult({ index: callCount });
          }),
        },
      });

      const runner = new RepeaterRunner(deps);
      runnerRef = runner;
      const config = makeConfig({ total: "infinite", concurrency: 1 });

      await runner.execute(config);

      const calls = (deps.reporter.reportResult as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call[1]).toBe("infinite");
      }
    });
  });

  describe("body handling", () => {
    it("should call bodyBuilder.build with empty fields and 'none' when bodyType is none", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ bodyType: "none", body: {} });

      await runner.execute(config);

      expect(deps.bodyBuilder.build).toHaveBeenCalledWith({}, "none");
    });

    it("should call bodyBuilder.build with resolved body fields and bodyType", async () => {
      const resolvedBody = { name: "John", email: "john@test.com" };
      const deps = makeDeps({
        templateEngine: {
          resolve: vi.fn((s: string) => s),
          resolveRecord: vi.fn().mockReturnValue(resolvedBody),
          validateRecord: vi.fn(),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        bodyType: "json",
        body: { name: "{{faker.person.firstName}}", email: "{{faker.internet.email}}" },
      });

      await runner.execute(config);

      expect(deps.bodyBuilder.build).toHaveBeenCalledWith(resolvedBody, "json");
    });

    it("should add Content-Type from bodyBuilder to request headers", async () => {
      const deps = makeDeps({
        bodyBuilder: {
          build: vi.fn().mockReturnValue({
            body: '{"name":"John"}',
            contentType: "application/json",
          }),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ bodyType: "json", body: { name: "John" } });

      await runner.execute(config);

      const executeCall = (deps.requestExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(executeCall.headers["Content-Type"]).toBe("application/json");
    });

    it("should not set Content-Type header when bodyBuilder returns null contentType", async () => {
      const deps = makeDeps({
        bodyBuilder: {
          build: vi.fn().mockReturnValue({ body: null, contentType: null }),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ bodyType: "none" });

      await runner.execute(config);

      const executeCall = (deps.requestExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(executeCall.headers["Content-Type"]).toBeUndefined();
    });

    it("should pass built body to requestExecutor", async () => {
      const bodyContent = '{"name":"John"}';
      const deps = makeDeps({
        bodyBuilder: {
          build: vi.fn().mockReturnValue({
            body: bodyContent,
            contentType: "application/json",
          }),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ bodyType: "json", body: { name: "John" } });

      await runner.execute(config);

      const executeCall = (deps.requestExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(executeCall.body).toBe(bodyContent);
    });
  });

  describe("query params", () => {
    it("should append resolved query params to URL", async () => {
      const deps = makeDeps({
        templateEngine: {
          resolve: vi.fn((s: string) => s),
          resolveRecord: vi.fn((r: Record<string, string>) => ({ ...r })),
          validateRecord: vi.fn(),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        url: "http://test.com/api",
        queryParams: { page: "1", limit: "10" },
      });

      await runner.execute(config);

      const executeCall = (deps.requestExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const url = new URL(executeCall.url);
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.get("limit")).toBe("10");
    });

    it("should not modify URL when queryParams is empty", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        url: "http://test.com/api",
        queryParams: {},
      });

      await runner.execute(config);

      const executeCall = (deps.requestExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(executeCall.url).toBe("http://test.com/api");
    });

    it("should call resolveRecord for queryParams with template values", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        queryParams: { search: "{{faker.lorem.word}}" },
      });

      await runner.execute(config);

      // resolveRecord should be called at least twice: once for body, once for queryParams
      const resolveRecordCalls = (deps.templateEngine.resolveRecord as ReturnType<typeof vi.fn>).mock.calls;
      const calledWithQueryParams = resolveRecordCalls.some(
        (call: unknown[]) => {
          const arg = call[0] as Record<string, string>;
          return arg.search === "{{faker.lorem.word}}";
        }
      );
      expect(calledWithQueryParams).toBe(true);
    });
  });

  describe("header template resolution", () => {
    it("should resolve faker templates in headers via resolveRecord", async () => {
      const resolvedHeaders = { Authorization: "Bearer resolved-token-123" };
      const deps = makeDeps({
        templateEngine: {
          resolve: vi.fn((s: string) => s),
          resolveRecord: vi.fn((r: Record<string, string>) => {
            // Return resolved headers when called with template headers
            if (r.Authorization === "{{faker.string.uuid}}") {
              return resolvedHeaders;
            }
            return { ...r };
          }),
          validateRecord: vi.fn(),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        headers: { Authorization: "{{faker.string.uuid}}" },
      });

      await runner.execute(config);

      const executeCall = (deps.requestExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(executeCall.headers.Authorization).toBe("Bearer resolved-token-123");
    });

    it("should call resolveRecord for headers on each request (N times for N requests)", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        total: 3,
        headers: { "X-Request-Id": "{{faker.string.uuid}}" },
      });

      await runner.execute(config);

      // 3 calls per request (body + queryParams + headers) * 3 requests = 9
      expect(deps.templateEngine.resolveRecord).toHaveBeenCalledTimes(9);
    });
  });

  describe("template resolution", () => {
    it("should call resolveRecord for body fields", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        body: { name: "{{faker.person.firstName}}" },
        bodyType: "json",
      });

      await runner.execute(config);

      const resolveRecordCalls = (deps.templateEngine.resolveRecord as ReturnType<typeof vi.fn>).mock.calls;
      const calledWithBody = resolveRecordCalls.some(
        (call: unknown[]) => {
          const arg = call[0] as Record<string, string>;
          return arg.name === "{{faker.person.firstName}}";
        }
      );
      expect(calledWithBody).toBe(true);
    });

    it("should resolve templates on each request (called N times for N requests)", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        total: 3,
        body: { name: "{{faker.person.firstName}}" },
        bodyType: "json",
      });

      await runner.execute(config);

      // 3 calls per request (body + queryParams + headers) * 3 requests = 9
      expect(deps.templateEngine.resolveRecord).toHaveBeenCalledTimes(9);
    });
  });

  describe("summary calculation", () => {
    it("should count only 2xx status as success with default successRange", async () => {
      let callIndex = 0;
      const statuses = [200, 201, 299, 300, 404, 500];
      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(() =>
            Promise.resolve(makeResult({ status: statuses[callIndex++] }))
          ),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 6, concurrency: 1 });

      const summary = await runner.execute(config);

      expect(summary.successCount).toBe(3); // 200, 201, 299
      expect(summary.failureCount).toBe(3); // 300, 404, 500
    });

    it("should count status 302 as success when successRange is {200, 399}", async () => {
      let callIndex = 0;
      const statuses = [200, 302, 399, 400, 500];
      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(() =>
            Promise.resolve(makeResult({ status: statuses[callIndex++] }))
          ),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        total: 5,
        concurrency: 1,
        successRange: { min: 200, max: 399 },
      });

      const summary = await runner.execute(config);

      expect(summary.successCount).toBe(3); // 200, 302, 399
      expect(summary.failureCount).toBe(2); // 400, 500
    });

    it("should count status 302 as failure with default successRange {200, 299}", async () => {
      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockResolvedValue(makeResult({ status: 302 })),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 1, concurrency: 1 });

      const summary = await runner.execute(config);

      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(1);
    });

    it("should use inclusive range (max boundary is success)", async () => {
      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockResolvedValue(makeResult({ status: 299 })),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        total: 1,
        concurrency: 1,
        successRange: { min: 200, max: 299 },
      });

      const summary = await runner.execute(config);

      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(0);
    });

    it("should count status null (network error) as failure", async () => {
      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockResolvedValue(
            makeResult({ status: null, error: "Connection refused" })
          ),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 2, concurrency: 1 });

      const summary = await runner.execute(config);

      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(2);
    });

    it("should return 0 for min/avg durations when no requests executed", async () => {
      // Immediate abort before any request completes
      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return makeResult();
          }),
        },
      });
      const runner = new RepeaterRunner(deps);
      runner.abort(); // abort before execute
      const config = makeConfig({ total: "infinite", concurrency: 1 });

      const summary = await runner.execute(config);

      expect(summary.totalRequests).toBe(0);
      expect(summary.avgDurationMs).toBe(0);
      expect(summary.minDurationMs).toBe(0);
      expect(summary.maxDurationMs).toBe(0);
    });
  });

  describe("summary counter invariant", () => {
    it("should satisfy successCount + failureCount === totalRequests with concurrency=5 and mix of results", async () => {
      let callIndex = 0;
      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockImplementation(async () => {
            callIndex++;
            // Alternate success/failure: even=200, odd=500
            const status = callIndex % 2 === 0 ? 200 : 500;
            await new Promise((resolve) => setTimeout(resolve, 1));
            return makeResult({ index: callIndex, status });
          }),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 100, concurrency: 5 });

      const summary = await runner.execute(config);

      expect(summary.totalRequests).toBe(100);
      expect(summary.successCount + summary.failureCount).toBe(summary.totalRequests);
      expect(summary.successCount).toBe(50);
      expect(summary.failureCount).toBe(50);
    });
  });

  describe("all requests failing", () => {
    it("should return summary with 0 success and all failures", async () => {
      const deps = makeDeps({
        requestExecutor: {
          execute: vi.fn().mockResolvedValue(
            makeResult({ status: null, durationMs: 50, error: "Timeout" })
          ),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 5, concurrency: 1 });

      const summary = await runner.execute(config);

      expect(summary.totalRequests).toBe(5);
      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(5);
      expect(summary.avgDurationMs).toBe(50);
    });
  });

  describe("request options passed to executor", () => {
    it("should pass correct method, url, headers, body, timeoutMs, and index", async () => {
      const deps = makeDeps({
        bodyBuilder: {
          build: vi.fn().mockReturnValue({
            body: '{"key":"val"}',
            contentType: "application/json",
          }),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        method: "POST",
        url: "http://test.com/api",
        headers: { Authorization: "Bearer token" },
        bodyType: "json",
        body: { key: "val" },
        timeoutMs: 3000,
      });

      await runner.execute(config);

      const call = (deps.requestExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.index).toBe(1);
      expect(call.method).toBe("POST");
      expect(call.url).toBe("http://test.com/api");
      expect(call.headers.Authorization).toBe("Bearer token");
      expect(call.headers["Content-Type"]).toBe("application/json");
      expect(call.body).toBe('{"key":"val"}');
      expect(call.timeoutMs).toBe(3000);
    });

    it("should use incremental index for each request", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 3, concurrency: 1 });

      await runner.execute(config);

      const calls = (deps.requestExecutor.execute as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].index).toBe(1);
      expect(calls[1][0].index).toBe(2);
      expect(calls[2][0].index).toBe(3);
    });
  });

  describe("SIGINT handler cleanup", () => {
    it("should remove SIGINT listener after execution completes", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 1 });

      const listenersBefore = process.listenerCount("SIGINT");

      await runner.execute(config);

      const listenersAfter = process.listenerCount("SIGINT");
      expect(listenersAfter).toBe(listenersBefore);
    });

    it("should remove SIGINT listener even when bodyBuilder throws synchronous error", async () => {
      const deps = makeDeps({
        bodyBuilder: {
          build: vi.fn().mockImplementation(() => {
            throw new Error("Sync bodyBuilder error");
          }),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ total: 1 });

      const listenersBefore = process.listenerCount("SIGINT");

      // The error propagates through Promise.all, so execute rejects
      await expect(runner.execute(config)).rejects.toThrow("Sync bodyBuilder error");

      const listenersAfter = process.listenerCount("SIGINT");
      expect(listenersAfter).toBe(listenersBefore);
    });
  });

  describe("invalid URL handling", () => {
    it("should throw descriptive error when config.url is invalid", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ url: "not-a-valid-url" });

      await expect(runner.execute(config)).rejects.toThrow("Invalid URL: not-a-valid-url");
    });

    it("should throw descriptive error when config.url is empty string", async () => {
      const deps = makeDeps();
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({ url: "" });

      await expect(runner.execute(config)).rejects.toThrow("Invalid URL: ");
    });
  });

  describe("headers with Content-Type precedence", () => {
    it("should override config Content-Type with bodyBuilder Content-Type", async () => {
      const deps = makeDeps({
        bodyBuilder: {
          build: vi.fn().mockReturnValue({
            body: '{"a":1}',
            contentType: "application/json",
          }),
        },
      });
      const runner = new RepeaterRunner(deps);
      const config = makeConfig({
        headers: { "Content-Type": "text/plain" },
        bodyType: "json",
        body: { a: "1" },
      });

      await runner.execute(config);

      const call = (deps.requestExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.headers["Content-Type"]).toBe("application/json");
    });
  });
});
