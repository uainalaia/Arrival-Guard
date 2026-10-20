import type { RefundDTO, RemittanceDTO } from "@/application/dto/CaseDTO";
import type { PillStatus } from "./StatusPill";

// Estado visible de una remesa y de un reclamo de devolución (UI_UX 9.4). Sale del estado del servidor: de la remesa
// y, mientras se envía, del intento.

export interface StatusView {
  readonly pill: PillStatus;
  readonly label: string;
}

export function remittanceStatus(r: Pick<RemittanceDTO, "status" | "attempt">, payerName = "Carlos"): StatusView {
  switch (r.status) {
    case "READY":
      return { pill: "PLAN_READY", label: "Ready to send" };
    case "APPROVAL_REQUESTED":
      return { pill: "WAITING_FOR_PAYER", label: `Waiting for ${payerName}` };
    case "APPROVED":
      return { pill: "APPROVED", label: "Approved" };
    case "EXECUTING":
      if (r.attempt?.status === "UNKNOWN") return { pill: "UNCERTAIN", label: "Checking with the provider" };
      if (r.attempt?.status === "SUBMITTING") return { pill: "SENDING", label: "Sending" };
      return { pill: "PROVIDER_ACCEPTED", label: "Accepted by provider" };
    case "DELIVERED":
      return { pill: "DELIVERED", label: "Delivered" };
    case "FAILED":
      return { pill: "FAILED_NO_DEBIT", label: "Failed, no money left the account" };
    default:
      return { pill: "BLOCKED", label: "Blocked" };
  }
}

export function refundStatus(c: Pick<RefundDTO, "status">): StatusView {
  switch (c.status) {
    case "DRAFT":
      return { pill: "PLAN_READY", label: "Ready to submit" };
    case "SUBMITTED":
      return { pill: "REFUND_REQUESTED", label: "Refund requested" };
    case "UNDER_REVIEW":
      return { pill: "UNDER_REVIEW", label: "Under review" };
    case "APPROVED":
      return { pill: "PROVIDER_ACCEPTED", label: "Approved" };
    case "REFUNDED":
      return { pill: "REFUNDED", label: "Refunded" };
    default:
      return { pill: "REFUND_DECLINED", label: "Refund declined" };
  }
}

/** "ending 7310" a partir de una cuenta enmascarada ("•••• 7310"). */
export function endingOf(masked: string): string {
  return `ending ${masked.replace(/\D/g, "").slice(-4)}`;
}
