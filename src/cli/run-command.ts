import { parseConfig } from "../config/parser.js";
import { FakerTemplateEngine } from "../template/engine.js";
import { UndiciHttpClient } from "../request/http-client.js";
import { RequestExecutor } from "../request/executor.js";
import { DefaultBodyBuilder } from "../request/body-builder.js";
import { ConsoleReporter } from "../reporter.js";
import { RepeaterRunner } from "../runner.js";
import { ConfigError } from "../errors.js";
import { TemplateError } from "../template/errors.js";

export async function runCommand(file: string): Promise<void> {
  try {
    const config = await parseConfig(file);

    const templateEngine = new FakerTemplateEngine();
    templateEngine.validateRecord(config.body);
    templateEngine.validateRecord(config.queryParams);
    templateEngine.validateRecord(config.headers);

    const httpClient = new UndiciHttpClient();
    const requestExecutor = new RequestExecutor(httpClient);
    const bodyBuilder = new DefaultBodyBuilder();
    const reporter = new ConsoleReporter();
    const runner = new RepeaterRunner({
      templateEngine,
      requestExecutor,
      bodyBuilder,
      reporter,
    });

    await runner.execute(config);
  } catch (err) {
    if (err instanceof ConfigError || err instanceof TemplateError) {
      console.error(`Error: ${err.message}`);
    } else if (err instanceof Error) {
      console.error(`Unexpected error: ${err.message}`);
    } else {
      console.error("Unknown error");
    }
    return process.exit(1);
  }
}
