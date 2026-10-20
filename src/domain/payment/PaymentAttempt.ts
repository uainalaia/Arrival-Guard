import { InvalidTransitionError } from "../errors/DomainError";
import type { Money } from "../money/Money";
import type { ReasonCode } from "../policy/ReasonCode";
import { assertTransition, type TransitionTable } from "../shared/StateMachine";
import type { VirtualInstant } from "../time/Instant";

export type AttemptKind = "TUITION" | "REMITTANCE";

export const ATTEMPT_STATUSES = [
  "SUBMITTING",
  "PROVIDER_ACCEPTED",
  "UNKNOWN",
  "FAILED_CONFIRMED",
  "PENDING_UNIVERSITY",
  "CREDITED",
  "DELIVERED",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/** Estados con un efecto financiero posible en curso: impiden un intento nuevo (incluido UNKNOWN). */
export const ACTIVE_ATTEMPT_STATUSES = ["SUBMITTING", "UNKNOWN", "PROVIDER_ACCEPTED", "PENDING_UNIVERSITY"] as const satisfies readonly AttemptStatus[];

/** Origen de un cambio de estado. Salir de UNKNOWN exige conciliación (BUILD_PROMPT 8.5). */
export type TransitionSource = "SUBMISSION" | "PROVIDER" | "RECONCILIATION" | "INSTITUTION";

const TUITION_TRANSITIONS: TransitionTable<AttemptStatus> = {
  SUBMITTING: ["PROVIDER_ACCEPTED", "UNKNOWN", "FAILED_CONFIRMED"],
  UNKNOWN: ["PROVIDER_ACCEPTED", "FAILED_CONFIRMED"],
  PROVIDER_ACCEPTED: ["PENDING_UNIVERSITY"],
  PENDING_UNIVERSITY: ["CREDITED"],
  CREDITED: [],
  FAILED_CONFIRMED: [],
  DELIVERED: [],
};

const REMITTANCE_TRANSITIONS: TransitionTable<AttemptStatus> = {
  SUBMITTING: ["PROVIDER_ACCEPTED", "UNKNOWN", "FAILED_CONFIRMED"],
  UNKNOWN: ["PROVIDER_ACCEPTED", "FAILED_CONFIRMED"],
  PROVIDER_ACCEPTED: ["DELIVERED"],
  PENDING_UNIVERSITY: [],
  CREDITED: [],
  FAILED_CONFIRMED: [],
  DELIVERED: [],
};

export interface PaymentAttemptProps {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: AttemptKind;
  /** Plan (matrícula) o remesa. */
  readonly subjectId: string;
  readonly obligationId: string | null;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly approvalId: string | null;
  readonly mandateId: string | null;
  readonly status: AttemptStatus;
  readonly providerTransferId: string | null;
  readonly debit: Money;
  readonly quoteId: string;
  readonly createdAt: VirtualInstant;
}

export class PaymentAttempt {
  private constructor(private props: PaymentAttemptProps) {}

  static rehydrate(props: PaymentAttemptProps): PaymentAttempt {
    return new PaymentAttempt({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get kind(): AttemptKind {
    return this.props.kind;
  }
  get status(): AttemptStatus {
    return this.props.status;
  }
  get debit(): Money {
    return this.props.debit;
  }
  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }
  get providerTransferId(): string | null {
    return this.props.providerTransferId;
  }

  toProps(): PaymentAttemptProps {
    return { ...this.props };
  }

  isActive(): boolean {
    return (ACTIVE_ATTEMPT_STATUSES as readonly AttemptStatus[]).includes(this.props.status);
  }

  transitionTo(next: AttemptStatus, via: TransitionSource): void {
    if (this.props.status === "UNKNOWN" && via !== "RECONCILIATION") {
      throw new InvalidTransitionError(`PaymentAttempt(${this.props.kind})`, `${this.props.status} via ${via}`, next);
    }
    const table = this.props.kind === "TUITION" ? TUITION_TRANSITIONS : REMITTANCE_TRANSITIONS;
    assertTransition(`PaymentAttempt(${this.props.kind})`, table, this.props.status, next);
    this.props = { ...this.props, status: next };
  }

  recordProviderTransfer(providerTransferId: string): void {
    this.props = { ...this.props, providerTransferId };
  }
}

/**
 * ¿Se puede crear un intento nuevo para esta obligación? UNKNOWN (y todo estado activo) nunca habilita otro
 * pago; tras FAILED_CONFIRMED sí, con revalidación y aprobación nueva. Que la OBLIGACIÓN esté acreditada lo
 * decide su estado (OBLIGATION_NOT_PENDING en el guard), y los intentos ya debitados cuentan para el máximo
 * acumulado (DEC-015).
 */
export function newAttemptBlockers(existing: readonly AttemptStatus[]): ReasonCode[] {
  if (existing.some((s) => (ACTIVE_ATTEMPT_STATUSES as readonly AttemptStatus[]).includes(s))) return ["ACTIVE_ATTEMPT_EXISTS"];
  return [];
}
