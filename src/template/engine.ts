import { faker } from "@faker-js/faker";
import { TemplateError } from "./errors.js";

const TEMPLATE_REGEX =
  /\{\{\s*faker\.([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+)(?:\(([^)]*)\))?\s*\}\}/g;

/**
 * Parses argument string from template (e.g. "5, true, 'hello'")
 * into an array of typed values.
 */
function parseArgs(raw: string): unknown[] {
  if (!raw.trim()) return [];
  return raw.split(",").map((arg) => {
    const trimmed = arg.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    // Remove quotes if present (single or double)
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  });
}

/**
 * Navigates the faker object by path and returns the target.
 * Throws TemplateError if path is invalid.
 */
function navigateFakerPath(fakerPath: string): unknown {
  const parts = fakerPath.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = faker;
  for (const part of parts) {
    current = current[part];
    if (current === undefined) {
      throw new TemplateError(
        `Template invalido: faker.${fakerPath} nao existe`,
      );
    }
  }
  return current;
}

export class FakerTemplateEngine {
  /**
   * Resolves all {{faker.*}} templates in a string by calling faker methods.
   * Returns the string with all templates replaced by generated values.
   * Throws TemplateError if any template path is invalid or not a function.
   */
  resolve(template: string): string {
    return template.replace(
      TEMPLATE_REGEX,
      (_match: string, fakerPath: string, rawArgs: string | undefined) => {
        const target = navigateFakerPath(fakerPath);

        if (typeof target !== "function") {
          throw new TemplateError(
            `faker.${fakerPath} nao e um metodo (e ${typeof target})`,
          );
        }

        const args = rawArgs !== undefined ? parseArgs(rawArgs) : [];
        return String(target(...args));
      },
    );
  }

  /**
   * Resolves all template values in a Record<string, string>.
   * Returns a new record with all templates replaced.
   */
  resolveRecord(
    fields: Record<string, string>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      result[key] = this.resolve(value);
    }
    return result;
  }

  /**
   * Validates all templates in a Record<string, string> WITHOUT generating values.
   * Throws TemplateError if any template path is invalid or not a function.
   */
  validateRecord(fields: Record<string, string>): void {
    for (const [_key, value] of Object.entries(fields)) {
      // Use a fresh regex instance (since we use the global flag)
      const regex = new RegExp(TEMPLATE_REGEX.source, TEMPLATE_REGEX.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(value)) !== null) {
        const fakerPath = match[1];
        const target = navigateFakerPath(fakerPath);
        if (typeof target !== "function") {
          throw new TemplateError(
            `faker.${fakerPath} nao e um metodo (e ${typeof target})`,
          );
        }
      }
    }
  }
}
