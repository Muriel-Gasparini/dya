import { z } from "zod";

/**
 * Zod schema for validating and parsing Repeater YAML configuration files.
 *
 * Accepts a raw object (parsed from YAML) and returns a fully typed
 * RepeaterConfig with defaults applied. Rejects invalid values with
 * clear error messages.
 */
export const repeaterConfigSchema = z
  .object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).default({}),
    bodyType: z.enum(["json", "formdata", "none"]).default("none"),
    body: z.record(z.string(), z.string()).default({}),
    queryParams: z.record(z.string(), z.string()).default({}),
    concurrency: z.number().int().min(1).default(1),
    total: z
      .union([z.literal("infinite"), z.number().int().min(1)])
      .default(1),
    timeoutMs: z.number().int().min(1).default(5000),
  })
  .refine(
    (data) =>
      data.total === "infinite" || data.concurrency <= data.total,
    {
      message: "concurrency must be <= total",
      path: ["concurrency"],
    }
  );
