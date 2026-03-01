/** Metodos HTTP suportados pelo Repeater */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Tipo do body da request */
export type BodyType = "json" | "formdata" | "urlencoded" | "none";

/** Total de requests: numero finito ou modo infinito */
export type RequestTotal = number | "infinite";

/** Configuracao principal do Repeater, consumida por todos os modulos */
export interface RepeaterConfig {
  /** Metodo HTTP */
  method: HttpMethod;
  /** URL do endpoint (pode conter {{faker.*}} em query params) */
  url: string;
  /** Headers HTTP (chave-valor, valores podem conter {{faker.*}}) */
  headers: Record<string, string>;
  /** Tipo do body */
  bodyType: BodyType;
  /** Campos do body (chave-valor, valores podem conter {{faker.*}}) */
  body: Record<string, string>;
  /** Query parameters (chave-valor, valores podem conter {{faker.*}}) */
  queryParams: Record<string, string>;
  /** Numero maximo de requests simultaneas */
  concurrency: number;
  /** Total de requests a disparar */
  total: RequestTotal;
  /** Timeout por request em milissegundos */
  timeoutMs: number;
  /** Range de status codes considerados sucesso (inclusive) */
  successRange: { min: number; max: number };
}
