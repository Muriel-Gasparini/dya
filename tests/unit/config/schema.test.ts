import { describe, it, expect } from "vitest";
import { repeaterConfigSchema } from "../../../src/config/schema.js";

describe("repeaterConfigSchema", () => {
  describe("valid configs", () => {
    it("should parse a complete valid config with all fields", () => {
      const input = {
        method: "POST",
        url: "https://api.acme.com/v1/accounts",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tk_live_abc123",
        },
        bodyType: "json",
        body: {
          name: "{{faker.person.fullName}}",
          email: "{{faker.internet.email}}",
        },
        queryParams: {
          source: "cli-repeater",
          campaign: "load-test-2024",
        },
        concurrency: 5,
        total: 50,
        timeoutMs: 5000,
      };

      const result = repeaterConfigSchema.parse(input);

      expect(result.method).toBe("POST");
      expect(result.url).toBe("https://api.acme.com/v1/accounts");
      expect(result.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer tk_live_abc123",
      });
      expect(result.bodyType).toBe("json");
      expect(result.body).toEqual({
        name: "{{faker.person.fullName}}",
        email: "{{faker.internet.email}}",
      });
      expect(result.queryParams).toEqual({
        source: "cli-repeater",
        campaign: "load-test-2024",
      });
      expect(result.concurrency).toBe(5);
      expect(result.total).toBe(50);
      expect(result.timeoutMs).toBe(5000);
    });

    it("should apply defaults for minimal config (only method + url)", () => {
      const input = {
        method: "GET",
        url: "https://api.acme.com/health",
      };

      const result = repeaterConfigSchema.parse(input);

      expect(result.method).toBe("GET");
      expect(result.url).toBe("https://api.acme.com/health");
      expect(result.headers).toEqual({});
      expect(result.bodyType).toBe("none");
      expect(result.body).toEqual({});
      expect(result.queryParams).toEqual({});
      expect(result.concurrency).toBe(1);
      expect(result.total).toBe(1);
      expect(result.timeoutMs).toBe(5000);
    });

    it("should accept total = 'infinite'", () => {
      const input = {
        method: "GET",
        url: "https://api.acme.com/status",
        total: "infinite",
      };

      const result = repeaterConfigSchema.parse(input);
      expect(result.total).toBe("infinite");
    });

    it("should accept concurrency with total = 'infinite' (no refinement conflict)", () => {
      const input = {
        method: "GET",
        url: "https://api.acme.com/status",
        concurrency: 100,
        total: "infinite",
      };

      const result = repeaterConfigSchema.parse(input);
      expect(result.concurrency).toBe(100);
      expect(result.total).toBe("infinite");
    });

    it("should accept all valid HTTP methods", () => {
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
      for (const method of methods) {
        const result = repeaterConfigSchema.parse({
          method,
          url: "https://api.acme.com/test",
        });
        expect(result.method).toBe(method);
      }
    });

    it("should accept all valid body types", () => {
      const bodyTypes = ["json", "formdata", "urlencoded", "none"] as const;
      for (const bodyType of bodyTypes) {
        const result = repeaterConfigSchema.parse({
          method: "POST",
          url: "https://api.acme.com/test",
          bodyType,
        });
        expect(result.bodyType).toBe(bodyType);
      }
    });

    it("should accept URL with port (localhost)", () => {
      const result = repeaterConfigSchema.parse({
        method: "GET",
        url: "http://localhost:3000/api/v1/health",
      });
      expect(result.url).toBe("http://localhost:3000/api/v1/health");
    });
  });

  describe("invalid configs", () => {
    it("should reject invalid HTTP method", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "INVALID",
          url: "https://api.acme.com/test",
        })
      ).toThrow();
    });

    it("should reject invalid URL (not a URL)", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "not-a-url",
        })
      ).toThrow();
    });

    it("should reject missing method", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          url: "https://api.acme.com/test",
        })
      ).toThrow();
    });

    it("should reject missing url", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
        })
      ).toThrow();
    });

    it("should reject total = 0", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          total: 0,
        })
      ).toThrow();
    });

    it("should reject negative total", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          total: -5,
        })
      ).toThrow();
    });

    it("should reject decimal total", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          total: 3.5,
        })
      ).toThrow();
    });

    it("should reject invalid total string (not 'infinite')", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          total: "abc",
        })
      ).toThrow();
    });

    it("should reject concurrency = 0", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          concurrency: 0,
        })
      ).toThrow();
    });

    it("should reject negative concurrency", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          concurrency: -3,
        })
      ).toThrow();
    });

    it("should reject concurrency > total (numeric total) via refinement", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          concurrency: 10,
          total: 5,
        })
      ).toThrow();
    });

    it("should reject invalid bodyType", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "POST",
          url: "https://api.acme.com/test",
          bodyType: "xml",
        })
      ).toThrow();
    });
  });

  describe("edge cases", () => {
    it("should strip unknown/extra fields", () => {
      const input = {
        method: "GET",
        url: "https://api.acme.com/test",
        unknownField: "should be removed",
        anotherExtra: 42,
      };

      const result = repeaterConfigSchema.parse(input);
      expect(result).not.toHaveProperty("unknownField");
      expect(result).not.toHaveProperty("anotherExtra");
    });

    it("should accept concurrency = 1 and total = 1 (boundary)", () => {
      const result = repeaterConfigSchema.parse({
        method: "GET",
        url: "https://api.acme.com/test",
        concurrency: 1,
        total: 1,
      });
      expect(result.concurrency).toBe(1);
      expect(result.total).toBe(1);
    });

    it("should accept concurrency equal to total (exact boundary)", () => {
      const result = repeaterConfigSchema.parse({
        method: "GET",
        url: "https://api.acme.com/test",
        concurrency: 10,
        total: 10,
      });
      expect(result.concurrency).toBe(10);
      expect(result.total).toBe(10);
    });
  });

  describe("successRange", () => {
    it("should apply default successRange { min: 200, max: 299 } when not specified", () => {
      const result = repeaterConfigSchema.parse({
        method: "GET",
        url: "https://api.acme.com/test",
      });
      expect(result.successRange).toEqual({ min: 200, max: 299 });
    });

    it("should accept a custom successRange", () => {
      const result = repeaterConfigSchema.parse({
        method: "GET",
        url: "https://api.acme.com/test",
        successRange: { min: 200, max: 399 },
      });
      expect(result.successRange).toEqual({ min: 200, max: 399 });
    });

    it("should accept successRange with min = max (single status)", () => {
      const result = repeaterConfigSchema.parse({
        method: "GET",
        url: "https://api.acme.com/test",
        successRange: { min: 200, max: 200 },
      });
      expect(result.successRange).toEqual({ min: 200, max: 200 });
    });

    it("should reject successRange where min > max", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          successRange: { min: 300, max: 200 },
        })
      ).toThrow();
    });

    it("should reject successRange with min < 100", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          successRange: { min: 99, max: 299 },
        })
      ).toThrow();
    });

    it("should reject successRange with max > 599", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          successRange: { min: 200, max: 600 },
        })
      ).toThrow();
    });

    it("should reject successRange with non-integer min", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          successRange: { min: 200.5, max: 299 },
        })
      ).toThrow();
    });

    it("should reject successRange with non-integer max", () => {
      expect(() =>
        repeaterConfigSchema.parse({
          method: "GET",
          url: "https://api.acme.com/test",
          successRange: { min: 200, max: 299.5 },
        })
      ).toThrow();
    });

    it("should accept boundary values min=100 and max=599", () => {
      const result = repeaterConfigSchema.parse({
        method: "GET",
        url: "https://api.acme.com/test",
        successRange: { min: 100, max: 599 },
      });
      expect(result.successRange).toEqual({ min: 100, max: 599 });
    });
  });
});
