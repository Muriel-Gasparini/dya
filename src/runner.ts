import pLimit from "p-limit";
import type { RepeaterConfig } from "./config/types.js";
import type { ExecutionSummary, RequestResult } from "./request/types.js";
import type { ExecuteOptions } from "./request/executor.js";

/** Dependencias injetaveis do Runner */
export interface RunnerDeps {
  templateEngine: {
    resolve(template: string): string;
    resolveRecord(fields: Record<string, string>): Record<string, string>;
    validateRecord(fields: Record<string, string>): void;
  };
  requestExecutor: {
    execute(options: ExecuteOptions): Promise<RequestResult>;
  };
  bodyBuilder: {
    build(
      fields: Record<string, string>,
      bodyType: string,
    ): { body: string | FormData | null; contentType: string | null };
  };
  reporter: {
    reportResult(result: RequestResult, total: number | "infinite"): void;
    reportSummary(summary: ExecutionSummary): void;
  };
}

/**
 * Orquestrador principal do Repeater.
 * Recebe config e coordena template resolution, body building,
 * request execution e reporting.
 */
export class RepeaterRunner {
  private aborted = false;

  constructor(private deps: RunnerDeps) {}

  async execute(config: RepeaterConfig): Promise<ExecutionSummary> {
    const limit = pLimit(config.concurrency);

    // SIGINT handler para modo infinito
    const sigintHandler = () => {
      this.aborted = true;
    };
    process.on("SIGINT", sigintHandler);

    // Contadores (NAO acumular array para modo infinito)
    let totalRequests = 0;
    let successCount = 0;
    let failureCount = 0;
    let sumDuration = 0;
    let minDuration = Infinity;
    let maxDuration = 0;
    const overallStart = performance.now();

    try {
      const isInfinite = config.total === "infinite";
      const totalCount: number = isInfinite
        ? Infinity
        : (config.total as number);

      // Set de promises pendentes (para modo infinito, nao acumular array)
      const pending = new Set<Promise<void>>();

      for (let i = 1; i <= totalCount && !this.aborted; i++) {
        // Backpressure: se todos os slots estao ocupados, aguardar um liberar
        // Isso evita acumular milhoes de promises na fila do p-limit
        if (pending.size >= config.concurrency) {
          await Promise.race(pending);
        }

        if (this.aborted) break;

        const index = i;
        const p = limit(async () => {
          if (this.aborted) return;

          // 1. Resolve templates para body e queryParams
          const resolvedBody = this.deps.templateEngine.resolveRecord(
            config.body,
          );
          const resolvedParams = this.deps.templateEngine.resolveRecord(
            config.queryParams,
          );

          // 2. Build body
          const { body, contentType } = this.deps.bodyBuilder.build(
            resolvedBody,
            config.bodyType,
          );

          // 3. Build URL com query params
          let url: URL;
          try {
            url = new URL(config.url);
          } catch {
            throw new Error(`Invalid URL: ${config.url}`);
          }
          for (const [k, v] of Object.entries(resolvedParams)) {
            url.searchParams.append(k, v);
          }
          const finalUrl = Object.keys(resolvedParams).length > 0
            ? url.toString()
            : config.url;

          // 4. Build headers (resolve templates, Content-Type do bodyBuilder tem precedencia)
          const headers: Record<string, string> = this.deps.templateEngine.resolveRecord(config.headers);
          if (contentType) {
            headers["Content-Type"] = contentType;
          }

          // 5. Execute request
          const result = await this.deps.requestExecutor.execute({
            index,
            method: config.method,
            url: finalUrl,
            headers,
            body,
            timeoutMs: config.timeoutMs,
          });

          // 6. Update contadores
          totalRequests++;
          if (
            result.status !== null &&
            result.status >= config.successRange.min &&
            result.status <= config.successRange.max
          ) {
            successCount++;
          } else {
            failureCount++;
          }
          sumDuration += result.durationMs;
          minDuration = Math.min(minDuration, result.durationMs);
          maxDuration = Math.max(maxDuration, result.durationMs);

          // 7. Report resultado individual
          this.deps.reporter.reportResult(result, config.total);
        });

        pending.add(p);
        p.finally(() => pending.delete(p)).catch(() => {/* handled by Promise.all */});
      }

      // Aguardar todas as pendentes
      await Promise.all(pending);
    } finally {
      // Cleanup SIGINT handler (always, even on error)
      process.removeListener("SIGINT", sigintHandler);
    }

    // Build summary
    const summary: ExecutionSummary = {
      totalRequests,
      successCount,
      failureCount,
      avgDurationMs:
        totalRequests > 0 ? Math.round(sumDuration / totalRequests) : 0,
      minDurationMs: totalRequests > 0 ? minDuration : 0,
      maxDurationMs: maxDuration,
      totalDurationMs: Math.round(performance.now() - overallStart),
    };

    this.deps.reporter.reportSummary(summary);

    // Reset aborted para reutilizacao
    this.aborted = false;

    return summary;
  }

  /** Seta flag de abort (para testes e SIGINT) */
  abort(): void {
    this.aborted = true;
  }
}
