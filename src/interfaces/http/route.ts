import { randomUUID } from "node:crypto";
import { ipAddress } from "@vercel/functions";
import type { z } from "zod";
import type { ActorContext } from "@/application/ActorContext";
import { NotFoundError, ValidationError, WorkspaceMismatchError } from "@/application/errors/ApplicationError";
import type { ActorRole } from "@/domain/events/DomainEvent";
import { getServerEnv } from "@/infrastructure/config/env";
import { getContainer, type Container } from "@/infrastructure/container";
import { httpErrorMapper } from "./httpErrorMapper";
import { resolveActor } from "./session";

const MAX_BODY_BYTES = 16_384;

export interface RouteContext<P> {
  readonly params?: Promise<P>;
}

export interface HandlerInput<B, Q, P> {
  readonly actor: ActorContext;
  readonly body: B;
  readonly query: Q;
  readonly params: P;
  readonly request: Request;
  readonly requestId: string;
  readonly app: Container;
}

export interface RouteSpec<B, Q> {
  /** Roles permitidos, o "public" (solo crear un espacio con código). */
  readonly roles: readonly ActorRole[] | "public";
  readonly mutating: boolean;
  readonly body?: z.ZodType<B>;
  readonly query?: z.ZodType<Q>;
  /** false solo en GET /api/session: es como la pestaña averigua a qué espacio pertenece. */
  readonly scoped?: boolean;
}

export class JsonResponse {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly headers: Readonly<Record<string, string | string[]>> = {},
  ) {}
}

/**
 * Envoltorio de toda ruta de la API: requestId, verificación de Origin, Content-Type y encabezado propio en
 * rutas que mutan (CSRF, BUILD_PROMPT 14.1), actor de sesión, validación Zod y mapeo único de errores.
 */
export function apiRoute<B = undefined, Q = undefined, P = Record<string, never>>(
  spec: RouteSpec<B, Q>,
  handler: (input: HandlerInput<B, Q, P> & { readonly actor: ActorContext | null }) => Promise<unknown>,
) {
  return async (request: Request, context?: RouteContext<P>): Promise<Response> => {
    const requestId = randomUUID();
    try {
      if (spec.mutating) {
        assertSameOrigin(request);
        if (!request.headers.get("x-ag-actor")) throw new ValidationError("Missing x-ag-actor header.");
        if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
          throw new ValidationError("Content-Type must be application/json.");
        }
      }
      const app = getContainer();
      const actor =
        spec.roles === "public"
          ? null
          : await resolveActor({ selectedRole: request.headers.get("x-ag-actor"), cookieHeader: request.headers.get("cookie") }, spec.roles, app.sessions);
      // La interfaz declara en qué espacio está la pestaña; si las cookies ya son de otro, no se opera en silencio.
      const scope = request.headers.get("x-ag-workspace");
      if (spec.scoped !== false && actor && scope && scope !== actor.workspaceId) throw new WorkspaceMismatchError();
      const body = spec.body ? await parseBody(request, spec.body) : (undefined as B);
      const query = spec.query ? parseQuery(request, spec.query) : (undefined as Q);
      const params = ((await context?.params) ?? {}) as P;
      const result = await handler({ actor: actor as ActorContext, body, query, params, request, requestId, app });
      return toResponse(result, requestId);
    } catch (error) {
      const mapped = httpErrorMapper(error, requestId);
      return Response.json(mapped.body, { status: mapped.status, headers: { ...baseHeaders(requestId), ...mapped.headers } });
    }
  };
}

function baseHeaders(requestId: string): Record<string, string> {
  return { "cache-control": "no-store", "x-request-id": requestId };
}

function toResponse(result: unknown, requestId: string): Response {
  if (result instanceof Response) return result;
  if (result instanceof JsonResponse) {
    const headers = new Headers(baseHeaders(requestId));
    for (const [key, value] of Object.entries(result.headers)) {
      for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
    }
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(result.body), { status: result.status, headers });
  }
  return Response.json(result, { status: 200, headers: baseHeaders(requestId) });
}

/** Origin debe ser el host propio (o la URL pública configurada). */
function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  // Solo hosts que fija el servidor (la URL de la petición y la configuración), nunca X-Forwarded-Host (VC6).
  const env = getServerEnv();
  const allowed = new Set<string>([new URL(request.url).host]);
  if (env.APP_BASE_URL) allowed.add(new URL(env.APP_BASE_URL).host);
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) if (host) allowed.add(host);
  if (!originHost || !allowed.has(originHost)) throw new ValidationError("Origin not allowed.");
}

async function parseBody<B>(request: Request, schema: z.ZodType<B>): Promise<B> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ValidationError("Request body is too large.");
  let json: unknown;
  try {
    json = text.length ? JSON.parse(text) : {};
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ValidationError("The request is not valid.", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  return parsed.data;
}

function parseQuery<Q>(request: Request, schema: z.ZodType<Q>): Q {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new ValidationError("The query is not valid.", parsed.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`));
  return parsed.data;
}

/** Ids de ruta: un id con formato inválido se trata igual que uno inexistente (404). */
export function requireUuid(value: string | undefined): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new NotFoundError();
  return value;
}

/** IP para los límites de acceso: la que fija la plataforma (x-real-ip en Vercel) antes que X-Forwarded-For (deuda de VC6). */
export function clientIp(request: Request): string {
  return ipAddress(request) || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
