import type { ActorContext } from "@/application/ActorContext";
import { RoleNotAllowedError, UnauthenticatedError } from "@/application/errors/ApplicationError";
import type { SessionPort } from "@/application/ports/SessionPort";
import { ACTOR_ROLES, type ActorRole } from "@/domain/events/DomainEvent";

export const ROLE_COOKIES: Readonly<Record<ActorRole, string>> = {
  student: "ag_student",
  payer: "ag_payer",
  evaluator: "ag_evaluator",
};

export function isActorRole(value: string | null | undefined): value is ActorRole {
  return typeof value === "string" && (ACTOR_ROLES as readonly string[]).includes(value);
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Actor de la petición (BUILD_PROMPT 14.1). El encabezado x-ag-actor solo ELIGE cuál de las sesiones del
 * navegador usar; el servidor verifica que exista, esté vigente, tenga ese rol y que el rol esté permitido.
 * Rol, actor y espacio salen de la sesión; nunca del cuerpo, de un argumento de herramienta ni del modelo.
 */
export async function resolveActor(
  input: { readonly selectedRole: string | null; readonly cookieHeader: string | null },
  allowed: readonly ActorRole[],
  sessions: SessionPort,
): Promise<ActorContext> {
  if (!isActorRole(input.selectedRole)) throw new UnauthenticatedError("Choose a role: send x-ag-actor as student, payer or evaluator.");
  const token = readCookie(input.cookieHeader, ROLE_COOKIES[input.selectedRole]);
  if (!token) throw new UnauthenticatedError();
  const session = await sessions.resolve(token);
  if (!session || session.role !== input.selectedRole) throw new UnauthenticatedError();
  if (!allowed.includes(session.role)) throw new RoleNotAllowedError(session.role === "student" ? "Only Carlos can do this." : "This role cannot do this.");
  return { workspaceId: session.workspaceId, actorId: session.actorId, role: session.role, sessionExpiresAt: session.expiresAt };
}

/** Tokens de sesión que trae la petición, para revocarlos al abrir otro espacio o al salir. */
export function sessionTokens(cookieHeader: string | null): string[] {
  return ACTOR_ROLES.map((role) => readCookie(cookieHeader, ROLE_COOKIES[role])).filter((t): t is string => Boolean(t));
}

export interface CookieSpec {
  readonly name: string;
  readonly value: string;
  readonly maxAgeSeconds: number;
}

/** Cookie de sesión: HttpOnly, Secure, SameSite=Strict, Path=/ (BUILD_PROMPT 11 y 14.1). */
export function sessionCookieHeader(cookie: CookieSpec): string {
  return `${cookie.name}=${encodeURIComponent(cookie.value)}; Max-Age=${cookie.maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
