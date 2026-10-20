import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { formatMoney } from "@/interfaces/format/money";

// Textos de cada ReasonCode (UI_UX 9.5, DESIGN_PLAN 7.4). Las cifras salen del caso, nunca de valores fijos:
// si falta un dato, la frase se dice sin cifra.

export interface ReasonContext {
  readonly routeHours?: number;
  readonly targetHours?: number;
  readonly routeNet?: MoneyDTO;
  readonly invoiceNet?: MoneyDTO;
  readonly limit?: MoneyDTO;
  readonly reserve?: MoneyDTO;
  readonly available?: MoneyDTO;
  readonly payerName?: string;
  readonly studentName?: string;
  readonly mandateUsed?: MoneyDTO;
  readonly mandateMax?: MoneyDTO;
  readonly verifiedExcess?: MoneyDTO;
  readonly institution?: string;
  readonly dueInHours?: number;
}

export interface ReasonCopy {
  readonly title: string;
  readonly detail: string;
}

const m = (money: MoneyDTO | undefined) => (money ? formatMoney(money) : null);

export function reasonCopy(code: string, ctx: ReasonContext = {}): ReasonCopy {
  const payer = ctx.payerName ?? "Carlos";
  const student = ctx.studentName ?? "Sofía";
  switch (code) {
    case "DEADLINE_MISSED":
      return {
        title: "Arrives too late",
        detail:
          ctx.routeHours !== undefined && ctx.targetHours !== undefined
            ? `Takes ${ctx.routeHours} h. You need it within ${ctx.targetHours} h.`
            : "It does not arrive by your deadline.",
      };
    case "NET_INSUFFICIENT":
      return {
        title: "University would receive less",
        detail: ctx.routeNet && ctx.invoiceNet ? `Delivers ${m(ctx.routeNet)}. The invoice is ${m(ctx.invoiceNet)}.` : "The university would receive less than the invoice.",
      };
    case "RECEIVER_NOT_ALLOWED":
      return { title: "Not the university's registered account", detail: "Payments go only to the account on the invoice." };
    case "CHANNEL_NOT_ALLOWED":
      return { title: "Channel not accepted", detail: `${ctx.institution ?? "The university"} does not accept this payment channel.` };
    case "QUOTE_EXPIRED":
      return { title: "Price expired", detail: "Getting a fresh price for the same route." };
    case "EXCEEDS_PAYER_MAX":
      return {
        title: "Above the tuition limit",
        detail: ctx.limit ? `${payer} set a limit of ${m(ctx.limit)} for this tuition.` : `It is above the limit ${payer} set for this tuition.`,
      };
    case "BREAKS_RESERVE":
      return {
        title: "Would use the arrival reserve",
        detail: ctx.reserve ? `${m(ctx.reserve)} stays aside for the first weeks.` : "The arrival reserve stays aside for the first weeks.",
      };
    case "INSUFFICIENT_FUNDS":
      return { title: "Not enough available funds", detail: ctx.available ? `Available now: ${m(ctx.available)}.` : "There is not enough available money for this payment." };
    case "OBLIGATION_NOT_PENDING":
      return { title: "Invoice already settled", detail: "This tuition invoice has nothing left to pay." };
    case "ACTIVE_ATTEMPT_EXISTS":
      return { title: "A payment is already on its way", detail: "Check that payment instead of sending another." };
    case "APPROVAL_MISSING":
      return { title: `Needs ${payer}'s approval`, detail: `Send the request. ${payer} approves on his own screen.` };
    case "APPROVAL_INVALID":
      return { title: "Approval no longer matches", detail: `The plan changed. ${payer} needs to approve the new one.` };
    case "APPROVAL_EXPIRED":
      return { title: "Approval expired", detail: "Request a new approval to continue." };
    case "APPROVAL_REVOKED":
      return { title: "Approval revoked", detail: `${payer} revoked this approval.` };
    case "MANDATE_MISSING":
      return { title: "No standing permission", detail: `${payer} needs to approve this transfer.` };
    case "MANDATE_REVOKED":
      return { title: "Standing permission revoked", detail: `${payer} needs to approve this transfer.` };
    case "MANDATE_EXPIRED":
      return { title: "Standing permission expired", detail: `${payer} needs to approve this transfer.` };
    case "EXCEEDS_MANDATE_PERIOD_LIMIT":
      return {
        title: "Over this month's transfer limit",
        detail:
          ctx.mandateUsed && ctx.mandateMax
            ? `${m(ctx.mandateUsed)} of ${m(ctx.mandateMax)} used. ${payer} needs to approve this one.`
            : `${payer} needs to approve this one.`,
      };
    case "RECIPIENT_NOT_VERIFIED":
      return { title: "Recipient not verified", detail: `Only accounts ${payer} has verified can receive transfers.` };
    case "RECIPIENT_ACCOUNT_NOT_OPEN":
      return { title: "Local account not open yet", detail: `Transfers start once ${student}'s account in China is open.` };
    case "CONDITIONAL_FUNDS_NOT_AVAILABLE":
      return { title: "Scholarship not received yet", detail: "It is shown apart and not counted as available money." };
    case "REFUND_EXCEEDS_VERIFIED_EXCESS":
      return {
        title: "More than the overpayment",
        detail: ctx.verifiedExcess ? `The verified overpayment is ${m(ctx.verifiedExcess)}.` : "A refund can only cover the verified overpayment.",
      };
    case "REFUND_DESTINATION_FIXED":
      return { title: "Refunds return to the paying account", detail: "They cannot be sent to another account." };
    case "TARGET_LATER_THAN_DUE_DATE":
      return {
        title: "Later than the due date",
        detail: ctx.dueInHours !== undefined ? `The invoice is due in ${ctx.dueInHours} h. Choose ${ctx.dueInHours} h or less.` : "Choose a deadline before the invoice is due.",
      };
    case "ROLE_NOT_ALLOWED":
      return { title: `Only ${payer} can do this`, detail: `Ask ${payer} to do it from his view.` };
    case "OUT_OF_SCOPE":
      return { title: "Outside what ArrivalGuard does", detail: "It can plan and send education payments, transfers for arrival costs and refund requests." };
    default:
      return { title: "Blocked", detail: code };
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  INDUCED_TRANSFER: "Blocked: possible induced transfer",
  DATA_EXTRACTION: "Blocked: possible data extraction",
  PRIVILEGE_ESCALATION: "Blocked: privilege escalation attempt",
  PROMPT_INJECTION: "Blocked: possible prompt injection",
};

/** Categoría oficial de seguridad como texto de interfaz; un texto ya redactado pasa tal cual. */
export function securityCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
