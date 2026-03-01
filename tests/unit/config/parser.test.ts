import { describe, it, expect, vi } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig } from "../../../src/config/parser.js";
import { ConfigError } from "../../../src/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../../fixtures");

describe("parseConfig", () => {
  describe("happy path", () => {
    it("should parse valid-config.yaml and return a complete RepeaterConfig", async () => {
      const config = await parseConfig(resolve(fixturesDir, "valid-config.yaml"));

      expect(config.method).toBe("POST");
      expect(config.url).toBe("https://api.acme.com/v1/accounts");
      expect(config.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer tk_live_abc123",
      });
      expect(config.bodyType).toBe("json");
      expect(config.body).toEqual({
        name: "{{faker.person.fullName}}",
        email: "{{faker.internet.email}}",
        phone: "{{faker.phone.number}}",
      });
      expect(config.queryParams).toEqual({
        source: "cli-repeater",
        campaign: "load-test-2024",
      });
      expect(config.concurrency).toBe(5);
      expect(config.total).toBe(50);
      expect(config.timeoutMs).toBe(5000);
    });

    it("should parse minimal-config.yaml and fill defaults", async () => {
      const config = await parseConfig(resolve(fixturesDir, "minimal-config.yaml"));

      expect(config.method).toBe("GET");
      expect(config.url).toBe("https://api.acme.com/health");
      expect(config.headers).toEqual({});
      expect(config.bodyType).toBe("none");
      expect(config.body).toEqual({});
      expect(config.queryParams).toEqual({});
      expect(config.concurrency).toBe(1);
      expect(config.total).toBe(1);
      expect(config.timeoutMs).toBe(5000);
    });

    it("should parse formdata-config.yaml correctly", async () => {
      const config = await parseConfig(resolve(fixturesDir, "formdata-config.yaml"));

      expect(config.method).toBe("POST");
      expect(config.bodyType).toBe("formdata");
      expect(config.body).toEqual({
        firstName: "{{faker.person.firstName}}",
        lastName: "{{faker.person.lastName}}",
        email: "{{faker.internet.email}}",
        company: "{{faker.company.name}}",
        phone: "BR{{faker.string.numeric(11)}}",
      });
      expect(config.concurrency).toBe(3);
      expect(config.total).toBe(10);
      expect(config.timeoutMs).toBe(8000);
    });

    it("should parse infinite-config.yaml with total = 'infinite'", async () => {
      const config = await parseConfig(resolve(fixturesDir, "infinite-config.yaml"));

      expect(config.method).toBe("GET");
      expect(config.total).toBe("infinite");
      expect(config.concurrency).toBe(2);
    });
  });

  describe("error handling", () => {
    it("should throw ConfigError when file does not exist", async () => {
      const nonExistentPath = resolve(fixturesDir, "does-not-exist.yaml");

      await expect(parseConfig(nonExistentPath)).rejects.toThrow(ConfigError);
      await expect(parseConfig(nonExistentPath)).rejects.toThrow(
        /Arquivo nao encontrado/
      );
      await expect(parseConfig(nonExistentPath)).rejects.toThrow(
        nonExistentPath
      );
    });

    it("should throw ConfigError when YAML syntax is invalid", async () => {
      let tmpDir: string | undefined;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), "repeater-test-"));
        const invalidYamlPath = join(tmpDir, "bad-yaml.yaml");
        await writeFile(invalidYamlPath, "method: GET\n  invalid:\nindentation: broken\n  : :");

        await expect(parseConfig(invalidYamlPath)).rejects.toThrow(ConfigError);
      } finally {
        if (tmpDir) await rm(tmpDir, { recursive: true });
      }
    });

    it("should throw ConfigError when file is empty", async () => {
      let tmpDir: string | undefined;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), "repeater-test-"));
        const emptyPath = join(tmpDir, "empty.yaml");
        await writeFile(emptyPath, "");

        await expect(parseConfig(emptyPath)).rejects.toThrow(ConfigError);
      } finally {
        if (tmpDir) await rm(tmpDir, { recursive: true });
      }
    });

    it("should throw ConfigError when YAML is valid but schema validation fails", async () => {
      const invalidConfigPath = resolve(fixturesDir, "invalid-config.yaml");

      await expect(parseConfig(invalidConfigPath)).rejects.toThrow(ConfigError);
      await expect(parseConfig(invalidConfigPath)).rejects.toThrow(
        /Configuracao invalida/
      );
    });

    it("should throw ConfigError with 'Sem permissao de leitura' when file is not readable (EACCES)", async () => {
      let tmpDir: string | undefined;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), "repeater-test-"));
        const noReadPath = join(tmpDir, "no-read.yaml");
        await writeFile(noReadPath, "method: GET\nurl: https://example.com\n");
        await chmod(noReadPath, 0o000);

        await expect(parseConfig(noReadPath)).rejects.toThrow(ConfigError);
        await expect(parseConfig(noReadPath)).rejects.toThrow(
          /Sem permissao de leitura/
        );
      } finally {
        if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("should throw ConfigError when YAML content is a scalar (not an object)", async () => {
      let tmpDir: string | undefined;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), "repeater-test-"));
        const scalarPath = join(tmpDir, "scalar.yaml");
        await writeFile(scalarPath, "just a plain string");

        await expect(parseConfig(scalarPath)).rejects.toThrow(ConfigError);
        await expect(parseConfig(scalarPath)).rejects.toThrow(
          /Configuracao vazia ou invalida/
        );
      } finally {
        if (tmpDir) await rm(tmpDir, { recursive: true });
      }
    });

    it("should throw ConfigError when YAML content is a number (not an object)", async () => {
      let tmpDir: string | undefined;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), "repeater-test-"));
        const numberPath = join(tmpDir, "number.yaml");
        await writeFile(numberPath, "42");

        await expect(parseConfig(numberPath)).rejects.toThrow(ConfigError);
        await expect(parseConfig(numberPath)).rejects.toThrow(
          /Configuracao vazia ou invalida/
        );
      } finally {
        if (tmpDir) await rm(tmpDir, { recursive: true });
      }
    });

    it("should throw ConfigError with generic message for unknown fs errors (e.g., EISDIR)", async () => {
      let tmpDir: string | undefined;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), "repeater-test-"));
        // Trying to read a directory as a file triggers EISDIR
        await expect(parseConfig(tmpDir)).rejects.toThrow(ConfigError);
        await expect(parseConfig(tmpDir)).rejects.toThrow(
          /Erro ao ler arquivo/
        );
      } finally {
        if (tmpDir) await rm(tmpDir, { recursive: true });
      }
    });
  });
});
