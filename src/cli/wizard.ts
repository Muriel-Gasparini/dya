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
    return "URL invalida. Informe uma URL completa (ex: https://api.example.com/endpoint)";
  }
}

export function validateTotal(value: string): true | string {
  if (value === "infinite") return true;
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isInteger(num) || num < 1) {
    return 'Informe um numero inteiro positivo ou "infinite"';
  }
  return true;
}

export async function wizardCommand(options: WizardOptions): Promise<void> {
  // 1. Method
  const method = await select({
    message: "Metodo HTTP:",
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
    message: "URL do endpoint:",
    validate: validateUrl,
  });

  // 3. Headers (loop)
  const headers: Record<string, string> = {};
  while (await confirm({ message: "Adicionar header?" })) {
    const key = await input({ message: "Header key:" });
    const value = await input({ message: "Header value:" });
    headers[key] = value;
  }

  // 4. Body type (only for methods that support body)
  const methodsWithBody = ["POST", "PUT", "PATCH"];
  let bodyType: string = "none";
  if (methodsWithBody.includes(method)) {
    bodyType = await select({
      message: "Tipo do body:",
      choices: [
        { value: "json", name: "JSON" },
        { value: "formdata", name: "FormData" },
        { value: "urlencoded", name: "urlencoded (application/x-www-form-urlencoded)" },
        { value: "none", name: "Nenhum" },
      ],
    });
  }

  // 5. Body fields (loop, only if bodyType != none)
  const body: Record<string, string> = {};
  if (bodyType !== "none") {
    while (
      await confirm({
        message:
          "Adicionar campo ao body? (use {{faker.module.method}} para dados dinamicos)",
      })
    ) {
      const key = await input({ message: "Campo key:" });
      const value = await input({ message: "Campo value:" });
      body[key] = value;
    }
  }

  // 6. Query params (loop)
  const queryParams: Record<string, string> = {};
  while (await confirm({ message: "Adicionar query parameter?" })) {
    const key = await input({ message: "Query param key:" });
    const value = await input({ message: "Query param value:" });
    queryParams[key] = value;
  }

  // 7. Concurrency
  let concurrency = (await number({
    message: "Concorrencia (requests simultaneas):",
    default: 1,
    min: 1,
  })) as number;

  // 8. Total
  const totalRaw = await input({
    message: 'Total de requests (numero ou "infinite"):',
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
    message: "Timeout por request (ms):",
    default: 5000,
    min: 100,
  })) as number;

  // 10. Success range (optional)
  const customizeSuccessRange = await confirm({
    message: "Customizar range de sucesso? (default: 200-299)",
  });

  let successRange: { min: number; max: number } | undefined;
  if (customizeSuccessRange) {
    const srMin = (await number({
      message: "Status code minimo (sucesso):",
      default: 200,
      min: 100,
      max: 599,
    })) as number;
    const srMax = (await number({
      message: "Status code maximo (sucesso):",
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
  console.log("--- Fim ---");

  // 11. Confirmation
  const shouldSave = await confirm({
    message: `Salvar em ${options.output}?`,
  });

  if (shouldSave) {
    await writeFile(options.output, yamlString, "utf-8");
    console.log(`Configuracao salva em ${options.output}`);
  } else {
    console.log("Configuracao descartada.");
  }
}
