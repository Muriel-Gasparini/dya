import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { ZodError } from "zod";
import { repeaterConfigSchema } from "./schema.js";
import { ConfigError } from "../errors.js";
import type { RepeaterConfig } from "./types.js";

/**
 * Maps known Node.js file-system error codes to user-friendly messages.
 */
function fileErrorMessage(code: string | undefined, filePath: string): string {
  switch (code) {
    case "ENOENT":
      return `File not found: ${filePath}`;
    case "EACCES":
      return `Permission denied: ${filePath}`;
    default:
      return `Failed to read file: ${filePath}`;
  }
}

/**
 * Formats a ZodError into a human-readable string listing each invalid field.
 */
function formatZodError(error: ZodError, filePath: string): string {
  const details = error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  return `Invalid config in ${filePath}: ${details}`;
}

/**
 * Reads a YAML configuration file from disk, parses it, and validates it
 * against the repeaterConfigSchema. Returns a fully typed RepeaterConfig
 * with all defaults applied.
 *
 * @throws {ConfigError} If the file is not found, has invalid YAML syntax,
 *   or fails schema validation.
 */
export async function parseConfig(filePath: string): Promise<RepeaterConfig> {
  // 1. Read file from disk
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (error: unknown) {
    const code =
      error instanceof Error && "code" in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    throw new ConfigError(fileErrorMessage(code, filePath));
  }

  // 2. Parse YAML
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : String(error);
    throw new ConfigError(
      `Invalid YAML in ${filePath}: ${detail}`
    );
  }

  // 3. Handle empty file (YAML.parse returns null for empty input)
  if (parsed == null || typeof parsed !== "object") {
    throw new ConfigError(
      `Empty or invalid config in ${filePath}`
    );
  }

  // 4. Validate against zod schema
  try {
    const config = repeaterConfigSchema.parse(parsed);
    return config as RepeaterConfig;
  } catch (error: unknown) {
    throw new ConfigError(
      error instanceof ZodError
        ? formatZodError(error, filePath)
        : `Validation error in ${filePath}`
    );
  }
}
