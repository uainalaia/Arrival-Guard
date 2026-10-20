import type { Money } from "../money/Money";
import type { VirtualInstant } from "../time/Instant";
import type { SimulationContext } from "./PaymentProviderPort";

export interface CreditReceipt {
  readonly receiptId: string;
  readonly net: Money;
  readonly reference: string;
  readonly creditedAt: VirtualInstant;
}

export interface CreditStatus {
  readonly reference: string;
  readonly transferId: string;
  readonly status: "PENDING" | "CREDITED";
  readonly expectedCreditAt: VirtualInstant;
  readonly receipt: CreditReceipt | null;
  /** Aviso institucional: texto, nunca instrucciones ni autoridad. */
  readonly notice: string | null;
}

export interface LedgerSummary {
  readonly reference: string;
  readonly owed: Money;
  readonly credited: Money;
  /** Exceso verificado (credited - owed, nunca negativo). */
  readonly verifiedExcess: Money;
}

export type InstitutionRefundStatus = "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REFUNDED" | "REJECTED";

export interface InstitutionRefund {
  readonly institutionClaimId: string;
  readonly status: InstitutionRefundStatus;
  readonly settlement: Money | null;
  readonly settledAt: VirtualInstant | null;
}

/** Institución simulada (Arrival University): acredita, lleva el libro y tramita devoluciones. */
export interface InstitutionPort {
  getCreditStatus(ctx: SimulationContext, reference: string, transferId: string): Promise<CreditStatus | null>;
  getLedger(ctx: SimulationContext, reference: string): Promise<LedgerSummary>;
  submitRefundClaim(
    ctx: SimulationContext,
    claim: { readonly claimRef: string; readonly reference: string; readonly amount: Money; readonly destinationAccountRef: string },
  ): Promise<{ readonly institutionClaimId: string }>;
  getRefundStatus(ctx: SimulationContext, institutionClaimId: string): Promise<InstitutionRefund | null>;
}
