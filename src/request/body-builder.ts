import type { BodyType } from "../config/types.js";

/** Interface para construcao do body da request */
export interface BodyBuilder {
  build(
    fields: Record<string, string>,
    bodyType: BodyType,
  ): {
    body: string | FormData | null;
    contentType: string | null;
  };
}

/** Implementacao padrao do BodyBuilder */
export class DefaultBodyBuilder implements BodyBuilder {
  build(
    fields: Record<string, string>,
    bodyType: BodyType,
  ): {
    body: string | FormData | null;
    contentType: string | null;
  } {
    switch (bodyType) {
      case "json":
        return { body: JSON.stringify(fields), contentType: "application/json" };
      case "formdata": {
        const fd = new FormData();
        for (const [key, value] of Object.entries(fields)) {
          fd.append(key, value);
        }
        return { body: fd, contentType: null };
      }
      case "urlencoded": {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(fields)) {
          params.append(k, v);
        }
        return { body: params.toString(), contentType: "application/x-www-form-urlencoded" };
      }
      case "none":
        return { body: null, contentType: null };
    }
  }
}
