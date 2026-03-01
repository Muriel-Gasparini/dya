import type { RequestResult, ExecutionSummary } from "./request/types.js";
import type { RequestTotal } from "./config/types.js";

/** Interface publica do Reporter */
export interface Reporter {
  reportResult(result: RequestResult, total: RequestTotal): void;
  reportSummary(summary: ExecutionSummary): void;
}

/** Funcoes de escrita injetaveis para facilitar testes */
interface WriterFunctions {
  stdout: (msg: string) => void;
  stderr: (msg: string) => void;
}

/** Reporter que imprime resultados no console (stdout/stderr) */
export class ConsoleReporter implements Reporter {
  private writers: WriterFunctions;

  constructor(writers?: Partial<WriterFunctions>) {
    this.writers = {
      stdout: console.log,
      stderr: console.error,
      ...writers,
    };
  }

  reportResult(result: RequestResult, total: RequestTotal): void {
    const index =
      total === "infinite"
        ? `[${result.index}]`
        : `[${result.index}/${total}]`;

    const method = result.method.toUpperCase();
    const duration = `${Math.round(result.durationMs)}ms`;

    let statusPart: string;
    if (result.status === null) {
      statusPart = `ERR ${result.error ?? "Unknown error"}`;
    } else {
      statusPart = `${result.status} ${duration}`;
    }

    this.writers.stdout(`${index} ${method} ${result.url} ${statusPart}`);
  }

  reportSummary(summary: ExecutionSummary): void {
    const {
      totalRequests,
      successCount,
      failureCount,
      avgDurationMs,
      minDurationMs,
      maxDurationMs,
      totalDurationMs,
    } = summary;

    const successPct =
      totalRequests > 0
        ? ((successCount / totalRequests) * 100).toFixed(1)
        : "0.0";
    const failurePct =
      totalRequests > 0
        ? ((failureCount / totalRequests) * 100).toFixed(1)
        : "0.0";

    const durationStr = this.formatDuration(totalDurationMs);

    this.writers.stdout("--- Summary ---");
    this.writers.stdout(`Total:    ${totalRequests}`);
    this.writers.stdout(`Success:  ${successCount} (${successPct}%)`);
    this.writers.stdout(`Failures: ${failureCount} (${failurePct}%)`);
    this.writers.stdout(
      `Avg: ${Math.round(avgDurationMs)}ms | Min: ${Math.round(minDurationMs)}ms | Max: ${Math.round(maxDurationMs)}ms`,
    );
    this.writers.stdout(`Duration: ${durationStr}`);
    this.writers.stdout("--- End ---");
  }

  private formatDuration(ms: number): string {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${Math.round(ms)}ms`;
  }
}
