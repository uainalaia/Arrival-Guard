import { InvariantViolationError } from "../errors/DomainError";
import { Money } from "../money/Money";
import type { ReasonCode } from "../policy/ReasonCode";
import type { VirtualInstant } from "../time/Instant";

export type MandateStatus = "ACTIVE" | "REVOKED" | "EXPIRED";
export type MandatePurpose = "ARRIVAL_EXPENSES";

export interface StandingMandateProps {
  readonly id: string;
  readonly workspaceId: string;
  readonly payerActorId: string;
  readonly purpose: MandatePurpose;
  readonly recipientId: string;
  readonly periodMax: Money;
  readonly periodDays: number;
  readonly expiresAt: VirtualInstant;
  readonly status: MandateStatus;
  readonly version: number;
}

/** Débito ejecutado (o retenido) bajo el mandato, con su hora virtual. */
export interface MandateUsage {
  readonly debit: Money;
  readonly at: VirtualInstant;
}

export type MandateDecision =
  | { readonly mode: "WITHIN_MANDATE"; readonly usedBefore: Money; readonly usedAfter: Money; readonly periodMax: Money }
  | { readonly mode: "NEEDS_PAYER_APPROVAL"; readonly reasons: readonly ReasonCode[] };

/**
 * Mandato permanente del pagador para remesas de gastos de llegada (enmienda A1): propósito, destinatario
 * verificado, tope por período móvil en días virtuales, vencimiento y estado. Dentro del tope no hace falta
 * aprobación nueva; por encima, o sin mandato vigente, el pagador aprueba una vez.
 */
export class StandingMandate {
  private constructor(private props: StandingMandateProps) {}

  static rehydrate(props: StandingMandateProps): StandingMandate {
    return new StandingMandate({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get status(): MandateStatus {
    return this.props.status;
  }
  get version(): number {
    return this.props.version;
  }
  get periodMax(): Money {
    return this.props.periodMax;
  }
  get periodDays(): number {
    return this.props.periodDays;
  }
  get recipientId(): string {
    return this.props.recipientId;
  }
  get expiresAt(): VirtualInstant {
    return this.props.expiresAt;
  }

  toProps(): StandingMandateProps {
    return { ...this.props };
  }

  /** Suma de débitos dentro de la ventana móvil (now - periodDays, now]. */
  usedInPeriod(usages: readonly MandateUsage[], now: VirtualInstant): Money {
    const windowStart = now.plusDays(-this.props.periodDays);
    return Money.sum(
      this.props.periodMax.currency,
      usages.filter((u) => u.at.isAfter(windowStart) && !u.at.isAfter(now)).map((u) => u.debit),
    );
  }

  authorize(input: {
    readonly purpose: MandatePurpose;
    readonly recipientId: string;
    readonly debit: Money;
    readonly now: VirtualInstant;
    readonly usages: readonly MandateUsage[];
  }): MandateDecision {
    if (this.props.status === "REVOKED") return { mode: "NEEDS_PAYER_APPROVAL", reasons: ["MANDATE_REVOKED"] };
    if (this.props.status === "EXPIRED" || !input.now.isBefore(this.props.expiresAt)) {
      return { mode: "NEEDS_PAYER_APPROVAL", reasons: ["MANDATE_EXPIRED"] };
    }
    if (input.purpose !== this.props.purpose || input.recipientId !== this.props.recipientId) {
      return { mode: "NEEDS_PAYER_APPROVAL", reasons: ["MANDATE_MISSING"] };
    }
    const usedBefore = this.usedInPeriod(input.usages, input.now);
    const usedAfter = usedBefore.add(input.debit);
    if (usedAfter.greaterThan(this.props.periodMax)) {
      return { mode: "NEEDS_PAYER_APPROVAL", reasons: ["EXCEEDS_MANDATE_PERIOD_LIMIT"] };
    }
    return { mode: "WITHIN_MANDATE", usedBefore, usedAfter, periodMax: this.props.periodMax };
  }

  changePeriodMax(periodMax: Money): void {
    if (this.props.status !== "ACTIVE") throw new InvariantViolationError("Solo se cambia un mandato activo");
    if (periodMax.isNegative()) throw new InvariantViolationError("El tope no puede ser negativo");
    this.props = { ...this.props, periodMax, version: this.props.version + 1 };
  }

  revoke(): void {
    if (this.props.status === "REVOKED") return;
    this.props = { ...this.props, status: "REVOKED", version: this.props.version + 1 };
  }
}

/** Sin mandato no hay ejecución autónoma: el pagador aprueba una vez. */
export function decisionWithoutMandate(): MandateDecision {
  return { mode: "NEEDS_PAYER_APPROVAL", reasons: ["MANDATE_MISSING"] };
}
