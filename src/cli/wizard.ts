import { select, input, confirm, number } from "@inquirer/prompts";
import { stringify } from "yaml";
import { writeFile } from "node:fs/promises";

interface WizardOptions {
  output: string;
}

export function validateUrl(value: string): true | string {
  try {
    new URL(value);
    return true;
  } catch {
    return "Invalid URL. Provide a full URL (e.g. https://api.example.com/endpoint)";
  }
}

export function validateTotal(value: string): true | string {
  if (value === "infinite") return true;
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isInteger(num) || num < 1) {
    return 'Enter a positive integer or "infinite"';
  }
  return true;
}

export async function wizardCommand(options: WizardOptions): Promise<void> {
  // 1. Method
  const method = await select({
    message: "HTTP method:",
    choices: [
      { value: "GET" },
      { value: "POST" },
      { value: "PUT" },
      { value: "PATCH" },
      { value: "DELETE" },
    ],
  });

  // 2. URL
  const url = await input({
    message: "Endpoint URL:",
    validate: validateUrl,
  });

  // 3. Headers (loop)
  const headers: Record<string, string> = {};
  while (await confirm({ message: "Add header?" })) {
    const key = await input({ message: "Header key:" });
    const value = await input({ message: "Header value:" });
    headers[key] = value;
  }

  // 4. Body type (only for methods that support body)
  const methodsWithBody = ["POST", "PUT", "PATCH"];
  let bodyType: string = "none";
  if (methodsWithBody.includes(method)) {
    bodyType = await select({
      message: "Body type:",
      choices: [
        { value: "json", name: "JSON" },
        { value: "formdata", name: "FormData" },
        { value: "urlencoded", name: "urlencoded (application/x-www-form-urlencoded)" },
        { value: "none", name: "None" },
      ],
    });
  }

  // 5. Body fields (loop, only if bodyType != none)
  const body: Record<string, string> = {};
  if (bodyType !== "none") {
    while (
      await confirm({
        message:
          "Add body field? (use {{faker.module.method}} for dynamic data)",
      })
    ) {
      const key = await input({ message: "Field key:" });
      const value = await input({ message: "Field value:" });
      body[key] = value;
    }
  }

  // 6. Query params (loop)
  const queryParams: Record<string, string> = {};
  while (await confirm({ message: "Add query parameter?" })) {
    const key = await input({ message: "Query param key:" });
    const value = await input({ message: "Query param value:" });
    queryParams[key] = value;
  }

  // 7. Concurrency
  let concurrency = (await number({
    message: "Concurrency (simultaneous requests):",
    default: 1,
    min: 1,
  })) as number;

  // 8. Total
  const totalRaw = await input({
    message: 'Total requests (number or "infinite"):',
    default: "1",
    validate: validateTotal,
  });
  const total: number | string =
    totalRaw === "infinite" ? "infinite" : Number(totalRaw);

  // Adjust concurrency if it exceeds total
  if (typeof total === "number" && concurrency > total) {
    concurrency = total;
  }

  // 9. Timeout
  const timeoutMs = (await number({
    message: "Timeout per request (ms):",
    default: 5000,
    min: 100,
  })) as number;

  // 10. Success range (optional)
  const customizeSuccessRange = await confirm({
    message: "Customize success range? (default: 200-299)",
  });

  let successRange: { min: number; max: number } | undefined;
  if (customizeSuccessRange) {
    const srMin = (await number({
      message: "Minimum status code (success):",
      default: 200,
      min: 100,
      max: 599,
    })) as number;
    const srMax = (await number({
      message: "Maximum status code (success):",
      default: 299,
      min: 100,
      max: 599,
    })) as number;
    successRange = { min: srMin, max: srMax };
  }

  // Build config object
  const config: Record<string, unknown> = {
    method,
    url,
    headers,
    bodyType,
    body,
    queryParams,
    concurrency,
    total,
    timeoutMs,
  };

  if (successRange) {
    config.successRange = successRange;
  }

  // 10. Preview
  const yamlString = stringify(config);
  console.log("--- Preview ---");
  console.log(yamlString);
  console.log("--- End ---");

  // 11. Confirmation
  const shouldSave = await confirm({
    message: `Save to ${options.output}?`,
  });

  if (shouldSave) {
    await writeFile(options.output, yamlString, "utf-8");
    console.log(`Config saved to ${options.output}`);
  } else {
    console.log("Config discarded.");
  }
}
