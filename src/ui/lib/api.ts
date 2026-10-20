// Cliente de la API para la interfaz. El navegador manda sus cookies de sesión; `x-ag-actor` solo elige cuál de
// las tres usar (BUILD_PROMPT 11). Origin lo pone el navegador. Nunca se manda rol, actor ni espacio en el cuerpo.

export type ActorRole = "student" | "payer" | "evaluator";

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly reasons?: readonly string[];
  readonly existingAttemptId?: string;
  readonly currentVersion?: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
  }

  get code(): string {
    return this.body.code;
  }

  get reasons(): readonly string[] {
    return this.body.reasons ?? [];
  }
}

/** Sin red o sin respuesta: el estado del pago queda guardado en el servidor (UI_UX 9.6). */
export const NETWORK_ERROR: ApiErrorBody = { code: "NETWORK", message: "Couldn't reach ArrivalGuard. Your payment state is saved. Try again." };

export interface ApiOptions {
  readonly role?: ActorRole | "guest";
  readonly method?: "GET" | "POST";
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

let workspaceScope: string | null = null;

/** Espacio de la pestaña: viaja como x-ag-workspace y el servidor lo compara con el de la sesión. */
export function setWorkspaceScope(workspaceId: string | null): void {
  workspaceScope = workspaceId;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.role) headers["x-ag-actor"] = options.role;
  if (workspaceScope && options.role && options.role !== "guest") headers["x-ag-workspace"] = workspaceScope;
  if (method === "POST") headers["content-type"] = "application/json";
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, NETWORK_ERROR);
  }
  const text = await response.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    const error = (json as { error?: ApiErrorBody }).error;
    throw new ApiError(response.status, error ?? { code: `HTTP_${response.status}`, message: "Something went wrong. Your payment state is saved. Try again." });
  }
  return json as T;
}

/** Clave de idempotencia nueva para una acción del usuario. Se reutiliza en los reintentos de esa misma acción. */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
