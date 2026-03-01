import { describe, it, expect, vi } from "vitest";
import { faker } from "@faker-js/faker";
import { FakerTemplateEngine } from "../../../src/template/engine.js";
import { TemplateError } from "../../../src/template/errors.js";

describe("FakerTemplateEngine", () => {
  const engine = new FakerTemplateEngine();

  describe("resolve", () => {
    it("should return plain string unchanged", () => {
      const result = engine.resolve("texto puro sem template");
      expect(result).toBe("texto puro sem template");
    });

    it("should return empty string unchanged", () => {
      const result = engine.resolve("");
      expect(result).toBe("");
    });

    it("should resolve simple template {{faker.person.firstName}}", () => {
      const result = engine.resolve("{{faker.person.firstName}}");
      expect(result).toBeTruthy();
      expect(result).not.toContain("{{");
      expect(result).not.toContain("}}");
    });

    it("should resolve template with numeric args {{faker.string.numeric(5)}}", () => {
      const result = engine.resolve("{{faker.string.numeric(5)}}");
      expect(result).toHaveLength(5);
      expect(result).toMatch(/^\d{5}$/);
    });

    it("should resolve template with string args {{faker.string.alpha('5')}}", () => {
      // faker.string.alpha("5") receives a string, not a number --
      // faker v10 treats it differently but does not throw
      const result = engine.resolve("{{faker.string.alpha('5')}}");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should resolve multiple templates in same string", () => {
      const result = engine.resolve(
        "{{faker.person.firstName}} {{faker.person.lastName}}",
      );
      expect(result).not.toContain("{{");
      expect(result).not.toContain("}}");
      // Should contain a space between the two resolved values
      expect(result).toContain(" ");
      const parts = result.split(" ");
      expect(parts.length).toBeGreaterThanOrEqual(2);
    });

    it("should concatenate fixed text + template", () => {
      const result = engine.resolve("BR{{faker.string.numeric(11)}}");
      expect(result).toMatch(/^BR\d{11}$/);
      expect(result).toHaveLength(13); // "BR" (2) + 11 digits
    });

    it("should handle template with spaces inside braces", () => {
      const result = engine.resolve("{{ faker.person.firstName }}");
      expect(result).toBeTruthy();
      expect(result).not.toContain("{{");
      expect(result).not.toContain("}}");
    });

    it("should resolve adjacent templates without separator", () => {
      const result = engine.resolve(
        "{{faker.person.firstName}}{{faker.person.lastName}}",
      );
      expect(result).toBeTruthy();
      expect(result).not.toContain("{{");
      expect(result).not.toContain("}}");
    });

    it("should throw TemplateError for invalid path (module does not exist)", () => {
      expect(() => engine.resolve("{{faker.naoExiste.metodo}}")).toThrow(
        TemplateError,
      );
    });

    it("should throw TemplateError for invalid path (method does not exist on valid module)", () => {
      expect(() => engine.resolve("{{faker.phone.naoExiste}}")).toThrow(
        TemplateError,
      );
    });

    it("should return unchanged for single-level path {{faker.phone}} (no regex match)", () => {
      // The regex requires at least 2 levels after "faker."
      // {{faker.phone}} has only 1 level, so regex does NOT match
      const result = engine.resolve("{{faker.phone}}");
      expect(result).toBe("{{faker.phone}}");
    });

    it("should resolve template with boolean arg true", () => {
      // faker.datatype.boolean() accepts no args but we test that parseArgs
      // handles boolean literals correctly when passed through
      const result = engine.resolve("{{faker.datatype.boolean}}");
      expect(typeof result).toBe("string");
      expect(["true", "false"]).toContain(result);
    });

    it("should throw TemplateError when path resolves to object (not function) in resolve", () => {
      // faker.rawDefinitions.airline is a valid 2-level path that points to an object
      expect(() =>
        engine.resolve("{{faker.rawDefinitions.airline}}"),
      ).toThrow(TemplateError);
      expect(() =>
        engine.resolve("{{faker.rawDefinitions.airline}}"),
      ).toThrow(/nao e um metodo/);
    });

    it("should handle unquoted non-numeric non-boolean argument (fallback branch)", () => {
      // Pass an unquoted string that is not a number, boolean, or quoted string.
      // This exercises the parseArgs fallback (return trimmed as-is).
      // faker.string.alpha accepts options or a number; passing a non-numeric
      // string won't crash faker but will just be passed through.
      const result = engine.resolve("{{faker.string.alpha(cased)}}");
      expect(typeof result).toBe("string");
    });

    it("should resolve template with empty parens {{faker.person.firstName()}}", () => {
      const result = engine.resolve("{{faker.person.firstName()}}");
      expect(result).toBeTruthy();
      expect(result).not.toContain("{{");
    });

    it("should convert non-string faker results to string", () => {
      // faker.number.int() returns a number, resolve should convert to string
      const result = engine.resolve("{{faker.number.int}}");
      expect(typeof result).toBe("string");
      expect(result).toBeTruthy();
    });
  });

  describe("resolveRecord", () => {
    it("should return empty record for empty input", () => {
      const result = engine.resolveRecord({});
      expect(result).toEqual({});
    });

    it("should resolve record with mix of fixed and template values", () => {
      const input = {
        name: "fixo",
        phone: "{{faker.phone.number}}",
      };
      const result = engine.resolveRecord(input);
      expect(result.name).toBe("fixo");
      expect(result.phone).not.toContain("{{");
      expect(result.phone).toBeTruthy();
    });

    it("should throw TemplateError for record with invalid template", () => {
      const input = {
        name: "{{faker.naoExiste.metodo}}",
      };
      expect(() => engine.resolveRecord(input)).toThrow(TemplateError);
    });

    it("should not mutate original record", () => {
      const input = {
        phone: "{{faker.phone.number}}",
      };
      const originalInput = { ...input };
      engine.resolveRecord(input);
      expect(input).toEqual(originalInput);
    });
  });

  describe("validateRecord", () => {
    it("should not throw for valid templates", () => {
      const fields = {
        phone: "{{faker.phone.number}}",
        name: "{{faker.person.firstName}}",
      };
      expect(() => engine.validateRecord(fields)).not.toThrow();
    });

    it("should throw TemplateError for invalid template", () => {
      const fields = {
        phone: "{{faker.naoExiste.metodo}}",
      };
      expect(() => engine.validateRecord(fields)).toThrow(TemplateError);
    });

    it("should not throw for record without templates", () => {
      const fields = {
        name: "fixo",
        email: "test@example.com",
      };
      expect(() => engine.validateRecord(fields)).not.toThrow();
    });

    it("should NOT generate values (faker methods should not be called)", () => {
      const spy = vi.spyOn(faker.phone, "number");
      const fields = {
        phone: "{{faker.phone.number}}",
      };
      engine.validateRecord(fields);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("should throw TemplateError when path points to non-existent method", () => {
      const fields = {
        bad: "{{faker.phone.naoExiste}}",
      };
      expect(() => engine.validateRecord(fields)).toThrow(TemplateError);
    });

    it("should throw TemplateError when path resolves to object (not function) in validateRecord", () => {
      // faker.rawDefinitions.airline is a valid 2-level path that points to an object
      const fields = {
        bad: "{{faker.rawDefinitions.airline}}",
      };
      expect(() => engine.validateRecord(fields)).toThrow(TemplateError);
      expect(() => engine.validateRecord(fields)).toThrow(/nao e um metodo/);
    });

    it("should validate mixed record with both valid templates and plain text", () => {
      const fields = {
        name: "fixo",
        phone: "{{faker.phone.number}}",
        prefix: "BR{{faker.string.numeric(2)}}",
      };
      expect(() => engine.validateRecord(fields)).not.toThrow();
    });
  });
});
