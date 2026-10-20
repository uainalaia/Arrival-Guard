import { tuitionDebitReasons, type FundsSnapshot } from "../cash/CashInvariants";
import { Money } from "../money/Money";
import { sortReasons, type ReasonCode } from "../policy/ReasonCode";
import { isQuoteExpired, type RouteQuote } from "../policy/RouteQuote";
import type { HasherPort } from "../ports/HasherPort";
import type { VirtualInstant } from "../time/Instant";
import type { Approval } from "./Approval";

export type RequoteDecision =
  | { readonly allowed: true; readonly previousDebit: Money; readonly newDebit: Money }
  | { readonly allowed: false; readonly reasons: readonly ReasonCode[] };

/**
 * Enmienda A3: la aprobación cubre ruta, receptor y monto máximo mientras no venza. Si la cotización venció,
 * el ejecutor puede recotizar LA MISMA ruta y ejecutar solo si la aprobación sigue vigente, la nueva cotización
 * está vigente, el débito sigue dentro del máximo y se conserva la reserva. El alcance sale del payload firmado
 * de la propia aprobación (verificado por su huella). Máximo efectivo: el menor entre el aprobado y el vigente;
 * reserva efectiva: la mayor.
 */
export function checkRequoteWithinApproval(input: {
  readonly approval: Approval;
  readonly hasher: HasherPort;
  readonly newQuote: RouteQuote;
  readonly funds: FundsSnapshot;
  readonly currentPolicy: { readonly maxTuitionDebit: Money; readonly reserve: Money };
  readonly committedToObligation: Money;
  readonly now: VirtualInstant;
  readonly targetArrivalAt: VirtualInstant;
}): RequoteDecision {
  const approved = input.approval.signedTuitionPayload(input.hasher);
  if (!approved) return { allowed: false, reasons: ["APPROVAL_INVALID"] };
  const usable = input.approval.usableFor({
    subjectType: "TUITION_PLAN",
    subjectId: approved.planId,
    subjectVersion: approved.planVersion,
    fingerprint: input.approval.fingerprint,
    now: input.now,
  });
  if (usable.length > 0) return { allowed: false, reasons: usable };

  const { newQuote } = input;
  const sameScope =
    newQuote.routeId === approved.routeId &&
    newQuote.channel === approved.channel &&
    newQuote.receiverId === approved.receiverId &&
    newQuote.net.equals(Money.fromJSON(approved.netAmount));
  if (!sameScope) return { allowed: false, reasons: ["APPROVAL_INVALID"] };

  const reasons: ReasonCode[] = tuitionDebitReasons({
    debit: newQuote.debit,
    funds: input.funds,
    reserve: Money.max(Money.fromJSON(approved.reserve), input.currentPolicy.reserve),
    maxTuitionDebit: Money.min(Money.fromJSON(approved.maxDebit), input.currentPolicy.maxTuitionDebit),
    committedToObligation: input.committedToObligation,
  });
  if (isQuoteExpired(newQuote, input.now)) reasons.push("QUOTE_EXPIRED");
  if (input.now.plusMinutes(newQuote.arrivalMinutes).isAfter(input.targetArrivalAt)) reasons.push("DEADLINE_MISSED");
  if (reasons.length > 0) return { allowed: false, reasons: sortReasons(reasons) };
  return { allowed: true, previousDebit: Money.fromJSON(approved.proposedDebit), newDebit: newQuote.debit };
}
