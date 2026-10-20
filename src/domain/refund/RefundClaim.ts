import { PolicyViolationError } from "../errors/DomainError";
import type { Money } from "../money/Money";
import { assertTransition, type TransitionTable } from "../shared/StateMachine";

export const REFUND_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REFUNDED", "REJECTED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_TRANSITIONS: TransitionTable<RefundStatus> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["REFUNDED"],
  REFUNDED: [],
  REJECTED: [],
};

export interface RefundClaimProps {
  readonly id: string;
  readonly workspaceId: string;
  readonly obligationId: string;
  /** Exceso verificado contra el libro de la institución (moneda de la obligación). */
  readonly verifiedExcess: Money;
  readonly amount: Money;
  /** Siempre la cuenta de origen del pago (A2). */
  readonly destinationAccountId: string;
  readonly status: RefundStatus;
  readonly institutionClaimId: string | null;
  /** Monto liquidado por la institución en la cuenta de origen (puede ser otra moneda, p. ej. USD 70.00). */
  readonly settlement: Money | null;
  readonly version: number;
}

/** Reclamo de devolución por el exceso verificado, con destino fijo en la cuenta de origen (enmienda A2). */
export class RefundClaim {
  private constructor(private props: RefundClaimProps) {}

  static prepare(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly obligationId: string;
    readonly verifiedExcess: Money;
    readonly sourceAccountId: string;
    readonly requestedAmount?: Money;
    readonly requestedDestinationAccountId?: string;
  }): RefundClaim {
    if (input.requestedDestinationAccountId !== undefined && input.requestedDestinationAccountId !== input.sourceAccountId) {
      throw new PolicyViolationError(["REFUND_DESTINATION_FIXED"]);
    }
    const amount = input.requestedAmount ?? input.verifiedExcess;
    if (!input.verifiedExcess.isPositive() || !amount.isPositive() || amount.greaterThan(input.verifiedExcess)) {
      throw new PolicyViolationError(["REFUND_EXCEEDS_VERIFIED_EXCESS"]);
    }
    return new RefundClaim({
      id: input.id,
      workspaceId: input.workspaceId,
      obligationId: input.obligationId,
      verifiedExcess: input.verifiedExcess,
      amount,
      destinationAccountId: input.sourceAccountId,
      status: "DRAFT",
      institutionClaimId: null,
      settlement: null,
      version: 1,
    });
  }

  static rehydrate(props: RefundClaimProps): RefundClaim {
    return new RefundClaim({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get status(): RefundStatus {
    return this.props.status;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get destinationAccountId(): string {
    return this.props.destinationAccountId;
  }
  get institutionClaimId(): string | null {
    return this.props.institutionClaimId;
  }
  get settlement(): Money | null {
    return this.props.settlement;
  }

  toProps(): RefundClaimProps {
    return { ...this.props };
  }

  transitionTo(next: RefundStatus): void {
    assertTransition("RefundClaim", REFUND_TRANSITIONS, this.props.status, next);
    this.props = { ...this.props, status: next, version: this.props.version + 1 };
  }

  submit(institutionClaimId: string): void {
    this.transitionTo("SUBMITTED");
    this.props = { ...this.props, institutionClaimId };
  }

  markRefunded(settlement: Money): void {
    this.transitionTo("REFUNDED");
    this.props = { ...this.props, settlement };
  }
}
