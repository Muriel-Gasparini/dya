import type { HttpMethod } from "../config/types.js";

/** Resultado de uma request individual */
export interface RequestResult {
  /** Indice da request (1-based) */
  index: number;
  /** Metodo HTTP usado */
  method: HttpMethod;
  /** URL final (com query params resolvidos) */
  url: string;
  /** Status code da resposta (null se erro de rede/timeout) */
  status: number | null;
  /** Duracao em milissegundos */
  durationMs: number;
  /** Mensagem de erro (null se sucesso) */
  error: string | null;
}

/** Summary da execucao completa */
export interface ExecutionSummary {
  /** Total de requests disparadas */
  totalRequests: number;
  /** Requests com sucesso (status 2xx) */
  successCount: number;
  /** Requests com falha (status != 2xx ou erro) */
  failureCount: number;
  /** Tempo medio de resposta em ms */
  avgDurationMs: number;
  /** Tempo minimo de resposta em ms */
  minDurationMs: number;
  /** Tempo maximo de resposta em ms */
  maxDurationMs: number;
  /** Tempo total de execucao em ms */
  totalDurationMs: number;
}

/** Opcoes para o HTTP client executar uma request */
export interface HttpRequestOptions {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string | FormData | null;
  timeoutMs: number;
}

/** Resposta crua do HTTP client */
export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
}
