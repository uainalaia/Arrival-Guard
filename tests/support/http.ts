// Navegador mínimo para probar los handlers de la API sin levantar un servidor: guarda cookies como lo haría
// un navegador y manda Origin, Content-Type y x-ag-actor como la interfaz.

export const BASE_URL = "http://localhost:3000";

// `never` como parámetro: acepta cualquier handler de ruta, con o sin parámetros dinámicos.
type Handler = (request: Request, context: { params: Promise<never> }) => Promise<Response>;

export interface CallOptions {
  readonly role?: "student" | "payer" | "evaluator" | "guest";
  readonly body?: unknown;
  readonly params?: Record<string, string>;
  readonly headers?: Record<string, string>;
  readonly origin?: string | null;
  readonly contentType?: string | null;
  readonly withCookies?: boolean;
}

export interface CallResult<T = Record<string, unknown>> {
  readonly status: number;
  readonly json: T;
  readonly setCookies: string[];
}

export class TestBrowser {
  readonly cookies = new Map<string, string>();

  async call<T = Record<string, unknown>>(handler: Handler, method: string, path: string, options: CallOptions = {}): Promise<CallResult<T>> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.origin !== null) headers.origin = options.origin ?? BASE_URL;
    if (method !== "GET" && options.contentType !== null) headers["content-type"] = options.contentType ?? "application/json";
    if (options.role) headers["x-ag-actor"] = options.role;
    if (options.withCookies !== false && this.cookies.size > 0) {
      headers.cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
    }
    const request = new Request(`${BASE_URL}${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    });
    const response = await handler(request, { params: Promise.resolve(options.params ?? {}) as Promise<never> });
    const setCookies = response.headers.getSetCookie();
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const [name, ...rest] = (pair ?? "").split("=");
      if (name) this.cookies.set(name.trim(), decodeURIComponent(rest.join("=")));
    }
    const text = await response.text();
    return { status: response.status, json: (text ? JSON.parse(text) : {}) as T, setCookies };
  }
}
