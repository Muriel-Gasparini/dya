import { describe, it, expect } from "vitest";
import { DefaultBodyBuilder } from "../../../src/request/body-builder.js";

describe("DefaultBodyBuilder", () => {
  const builder = new DefaultBodyBuilder();

  describe("json", () => {
    it("should return JSON.stringify of fields and contentType application/json", () => {
      const fields = { name: "John", email: "john@example.com" };
      const result = builder.build(fields, "json");

      expect(result.body).toBe(JSON.stringify(fields));
      expect(result.contentType).toBe("application/json");
    });

    it("should return '{}' and contentType application/json for empty fields", () => {
      const result = builder.build({}, "json");

      expect(result.body).toBe("{}");
      expect(result.contentType).toBe("application/json");
    });

    it("should escape special characters (quotes, newlines) correctly via JSON.stringify", () => {
      const fields = {
        text: 'He said "hello"',
        multiline: "line1\nline2",
        tab: "col1\tcol2",
        backslash: "path\\to\\file",
      };
      const result = builder.build(fields, "json");

      expect(result.contentType).toBe("application/json");
      // JSON.stringify should produce valid JSON that can be parsed back
      const parsed = JSON.parse(result.body as string);
      expect(parsed.text).toBe('He said "hello"');
      expect(parsed.multiline).toBe("line1\nline2");
      expect(parsed.tab).toBe("col1\tcol2");
      expect(parsed.backslash).toBe("path\\to\\file");
    });

    it("should preserve unicode characters in JSON body", () => {
      const fields = { greeting: "Ola mundo", emoji: "cafe" };
      const result = builder.build(fields, "json");

      const parsed = JSON.parse(result.body as string);
      expect(parsed.greeting).toBe("Ola mundo");
      expect(parsed.emoji).toBe("cafe");
      expect(result.contentType).toBe("application/json");
    });
  });

  describe("formdata", () => {
    it("should return FormData with populated fields and contentType null", () => {
      const fields = { name: "John", email: "john@example.com" };
      const result = builder.build(fields, "formdata");

      expect(result.body).toBeInstanceOf(FormData);
      expect(result.contentType).toBeNull();

      const fd = result.body as FormData;
      expect(fd.get("name")).toBe("John");
      expect(fd.get("email")).toBe("john@example.com");
    });

    it("should return empty FormData and contentType null for empty fields", () => {
      const result = builder.build({}, "formdata");

      expect(result.body).toBeInstanceOf(FormData);
      expect(result.contentType).toBeNull();

      const fd = result.body as FormData;
      // FormData vazio nao tem entries
      const entries = Array.from(fd.entries());
      expect(entries).toHaveLength(0);
    });

    it("should have correct values for each key via FormData.get()", () => {
      const fields = {
        username: "alice",
        age: "30",
        city: "Sao Paulo",
      };
      const result = builder.build(fields, "formdata");
      const fd = result.body as FormData;

      for (const [key, value] of Object.entries(fields)) {
        expect(fd.get(key)).toBe(value);
      }
    });

    it("should preserve unicode characters in FormData values", () => {
      const fields = { name: "Joao" };
      const result = builder.build(fields, "formdata");
      const fd = result.body as FormData;

      expect(fd.get("name")).toBe("Joao");
    });
  });

  describe("urlencoded", () => {
    it("should return URL-encoded string and contentType application/x-www-form-urlencoded", () => {
      const fields = { key1: "value1", key2: "value2" };
      const result = builder.build(fields, "urlencoded");

      expect(result.body).toBe("key1=value1&key2=value2");
      expect(result.contentType).toBe("application/x-www-form-urlencoded");
    });

    it("should return empty string and contentType application/x-www-form-urlencoded for empty fields", () => {
      const result = builder.build({}, "urlencoded");

      expect(result.body).toBe("");
      expect(result.contentType).toBe("application/x-www-form-urlencoded");
    });

    it("should escape special characters (spaces, &, =) correctly via URLSearchParams", () => {
      const fields = {
        name: "John Doe",
        query: "a&b=c",
        path: "foo/bar baz",
      };
      const result = builder.build(fields, "urlencoded");

      expect(result.contentType).toBe("application/x-www-form-urlencoded");
      // URLSearchParams should properly encode special characters
      const params = new URLSearchParams(result.body as string);
      expect(params.get("name")).toBe("John Doe");
      expect(params.get("query")).toBe("a&b=c");
      expect(params.get("path")).toBe("foo/bar baz");
    });

    it("should preserve unicode characters in urlencoded body", () => {
      const fields = { greeting: "Ola mundo", city: "Sao Paulo" };
      const result = builder.build(fields, "urlencoded");

      const params = new URLSearchParams(result.body as string);
      expect(params.get("greeting")).toBe("Ola mundo");
      expect(params.get("city")).toBe("Sao Paulo");
      expect(result.contentType).toBe("application/x-www-form-urlencoded");
    });
  });

  describe("none", () => {
    it("should return body null and contentType null", () => {
      const result = builder.build({}, "none");

      expect(result.body).toBeNull();
      expect(result.contentType).toBeNull();
    });

    it("should ignore non-empty fields and return null when bodyType is none", () => {
      const fields = { name: "John", email: "john@example.com" };
      const result = builder.build(fields, "none");

      expect(result.body).toBeNull();
      expect(result.contentType).toBeNull();
    });
  });
});
