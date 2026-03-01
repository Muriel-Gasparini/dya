import { describe, it, expect } from "vitest";
import { ConfigError } from "../../src/errors.js";
import { TemplateError } from "../../src/template/errors.js";

describe("ConfigError", () => {
  it("should be instantiable with a message", () => {
    const error = new ConfigError("invalid config");
    expect(error).toBeInstanceOf(ConfigError);
  });

  it("should have name = 'ConfigError'", () => {
    const error = new ConfigError("test");
    expect(error.name).toBe("ConfigError");
  });

  it("should preserve the original message", () => {
    const msg = "Campo 'method' e obrigatorio";
    const error = new ConfigError(msg);
    expect(error.message).toBe(msg);
  });

  it("should be instanceof Error", () => {
    const error = new ConfigError("test");
    expect(error).toBeInstanceOf(Error);
  });

  it("should have a useful stack trace", () => {
    const error = new ConfigError("stack test");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("ConfigError");
    expect(error.stack).toContain("stack test");
  });

  it("should work with empty message", () => {
    const error = new ConfigError("");
    expect(error.message).toBe("");
    expect(error.name).toBe("ConfigError");
  });
});

describe("TemplateError", () => {
  it("should be instantiable with a message", () => {
    const error = new TemplateError("invalid template");
    expect(error).toBeInstanceOf(TemplateError);
  });

  it("should have name = 'TemplateError'", () => {
    const error = new TemplateError("test");
    expect(error.name).toBe("TemplateError");
  });

  it("should preserve the original message", () => {
    const msg =
      "Template invalido no campo 'body.phone': faker.naoExiste nao e um metodo valido";
    const error = new TemplateError(msg);
    expect(error.message).toBe(msg);
  });

  it("should be instanceof Error", () => {
    const error = new TemplateError("test");
    expect(error).toBeInstanceOf(Error);
  });

  it("should have a useful stack trace", () => {
    const error = new TemplateError("stack test");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("TemplateError");
    expect(error.stack).toContain("stack test");
  });

  it("should work with empty message", () => {
    const error = new TemplateError("");
    expect(error.message).toBe("");
    expect(error.name).toBe("TemplateError");
  });
});

describe("Error class isolation", () => {
  it("ConfigError should not be instanceof TemplateError", () => {
    const error = new ConfigError("test");
    expect(error).not.toBeInstanceOf(TemplateError);
  });

  it("TemplateError should not be instanceof ConfigError", () => {
    const error = new TemplateError("test");
    expect(error).not.toBeInstanceOf(ConfigError);
  });
});
