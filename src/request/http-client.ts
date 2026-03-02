import { request } from "undici";
import type { HttpRequestOptions, HttpResponse } from "./types.js";

/** Interface para abstração do HTTP client */
export interface HttpClient {
  execute(options: HttpRequestOptions): Promise<HttpResponse>;
}

/** Implementação do HttpClient usando undici */
export class UndiciHttpClient implements HttpClient {
  async execute(options: HttpRequestOptions): Promise<HttpResponse> {
    try {
      const response = await request(options.url, {
        method: options.method,
        headers: options.headers,
        body: (options.body ?? undefined) as
          | string
          | import("undici").FormData
          | undefined,
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      // IMPORTANTE: consumir body para liberar conexão no pool do undici
      await response.body.dump();

      // Converter headers para Record<string, string>
      const headers: Record<string, string> = {};
      const rawHeaders = response.headers;
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (value == null) continue;
        headers[key] = Array.isArray(value) ? value[0] : String(value);
      }

      return {
        statusCode: response.statusCode,
        headers,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "AbortError" || error.name === "TimeoutError") {
          throw new Error(`Timeout of ${options.timeoutMs}ms exceeded`);
        }

        const code = (error as NodeJS.ErrnoException).code;

        if (code === "ECONNREFUSED") {
          throw new Error(
            `Connection refused (ECONNREFUSED): ${error.message}`,
          );
        }

        if (code === "ENOTFOUND") {
          throw new Error(
            `Host not found (ENOTFOUND): ${error.message}`,
          );
        }
      }

      throw error;
    }
  }
}
