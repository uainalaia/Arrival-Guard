import type { VirtualInstant } from "../time/Instant";

/** Bitácora de evidencia: solo se agregan eventos (BUILD_PROMPT 8.6). */
export const DOMAIN_EVENT_TYPES = [
  "WORKSPACE_CREATED",
  "PLAN_CREATED",
  "PLAN_NOT_VIABLE",
  "APPROVAL_REQUESTED",
  "APPROVAL_GRANTED",
  "APPROVAL_INVALIDATED",
  "APPROVAL_REVOKED",
  "AUTO_REQUOTE_WITHIN_APPROVAL",
  "EXECUTION_BLOCKED",
  "ATTEMPT_CREATED",
  "HOLD_PLACED",
  "PROVIDER_SUBMIT_SENT",
  "PROVIDER_RESPONSE_LOST",
  "ATTEMPT_UNKNOWN",
  "PROVIDER_ACCEPTED",
  "PROVIDER_FAILED_CONFIRMED",
  "HOLD_CAPTURED",
  "HOLD_RELEASED",
  "DEBIT_CONFIRMED",
  "INSTITUTION_PENDING",
  "INSTITUTION_CREDITED",
  "REMITTANCE_EXECUTED_UNDER_MANDATE",
  "REMITTANCE_ESCALATED",
  "REMITTANCE_DELIVERED",
  "MANDATE_CHANGED",
  "MANDATE_REVOKED",
  "POLICY_CHANGED",
  "REFUND_CLAIM_SUBMITTED",
  "REFUND_CLAIM_UPDATED",
  "SECURITY_BLOCK",
  "AI_FALLBACK_ACTIVATED",
  "CLOCK_ADVANCED",
  "FAULT_INJECTED",
  "DUPLICATE_EVENT_IGNORED",
  "SCRIPTED_TASKS_RUN",
] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/** Categorías oficiales de seguridad del FinTechathon. */
export const SECURITY_CATEGORIES = ["INDUCED_TRANSFER", "DATA_EXTRACTION", "PRIVILEGE_ESCALATION", "PROMPT_INJECTION"] as const;
export type SecurityCategory = (typeof SECURITY_CATEGORIES)[number];

export const ACTOR_ROLES = ["student", "payer", "evaluator"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** Evento listo para agregar. El número de secuencia y la hora real los pone el repositorio. */
export interface DomainEventDraft {
  readonly type: DomainEventType;
  readonly actorRole: ActorRole | "system";
  readonly subjectType: string;
  readonly subjectId: string;
  /** Se redacta antes de guardarse (sin secretos y con cuentas enmascaradas). */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly virtualAt: VirtualInstant;
}
