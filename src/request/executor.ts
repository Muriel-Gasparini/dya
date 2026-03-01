import type { HttpClient } from "./http-client.js";
import type { RequestResult, HttpRequestOptions } from "./types.js";
import type { HttpMethod } from "../config/types.js";

export interface ExecuteOptions {
  index: number;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string | FormData | null;
  timeoutMs: number;
}

export class RequestExecutor {
  constructor(private httpClient: HttpClient) {}

  async execute(options: ExecuteOptions): Promise<RequestResult> {
    const { index, method, url, headers, body, timeoutMs } = options;
    const start = performance.now();

    try {
      const httpOptions: HttpRequestOptions = {
        url,
        method,
        headers,
        body,
        timeoutMs,
      };

      const response = await this.httpClient.execute(httpOptions);
      const durationMs = Math.round(performance.now() - start);

      return {
        index,
        method,
        url,
        status: response.statusCode,
        durationMs,
        error: null,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      const error = err instanceof Error ? err.message : String(err);

      return {
        index,
        method,
        url,
        status: null,
        durationMs,
        error,
      };
    }
  }
}
