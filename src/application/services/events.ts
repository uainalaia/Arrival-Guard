import type { ActorRole, DomainEventDraft, DomainEventType } from "@/domain/events/DomainEvent";
import type { VirtualInstant } from "@/domain/time/Instant";

/** Atajo para armar eventos de la bitácora. El repositorio pone secuencia y hora real, y redacta el payload. */
export function event(
  type: DomainEventType,
  actorRole: ActorRole | "system",
  subject: { readonly type: string; readonly id: string },
  virtualAt: VirtualInstant,
  payload: Record<string, unknown> = {},
): DomainEventDraft {
  return { type, actorRole, subjectType: subject.type, subjectId: subject.id, payload, virtualAt };
}
