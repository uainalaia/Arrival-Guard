import type { ActorRole } from "@/domain/events/DomainEvent";
import type { RealInstant } from "@/domain/time/Instant";
import { RoleNotAllowedError } from "./errors/ApplicationError";

/**
 * Quién actúa. Sale SIEMPRE de la sesión del servidor (BUILD_PROMPT 4.3), nunca del cuerpo de la petición,
 * de un argumento de herramienta ni del texto del modelo. Los casos de uso vuelven a comprobar el rol.
 */
export interface ActorContext {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly role: ActorRole;
  /** Vencimiento real de la sesión que resolvió al actor (hora real, no virtual). */
  readonly sessionExpiresAt?: RealInstant;
}

export function requireRole(actor: ActorContext, ...roles: readonly ActorRole[]): void {
  if (!roles.includes(actor.role)) throw new RoleNotAllowedError();
}
