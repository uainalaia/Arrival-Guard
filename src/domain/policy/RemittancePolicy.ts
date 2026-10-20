import { availableForArrivalExpenses, type FundsSnapshot } from "../cash/CashInvariants";
import type { Money } from "../money/Money";
import type { VirtualInstant } from "../time/Instant";
import { sortReasons, type ReasonCode } from "./ReasonCode";
import { compareByRouteId, compareForSelection, isQuoteExpired, type RouteEvaluation, type RouteQuote } from "./RouteQuote";

export interface RemittanceRoutingFacts {
  readonly now: VirtualInstant;
  readonly recipient: {
    readonly id: string;
    readonly verified: boolean;
    readonly accountStatus: "OPEN" | "PENDING_OPENING";
    readonly currency: Money["currency"];
  };
  readonly requestedNet: Money;
  readonly targetArrivalAt: VirtualInstant;
  readonly funds: FundsSnapshot;
  readonly arrivalEarmarkRemaining: Money;
  readonly quotes: readonly RouteQuote[];
}

export interface RemittanceRoutingResult {
  readonly blockers: readonly ReasonCode[];
  readonly viable: readonly RouteEvaluation[];
  readonly discarded: readonly RouteEvaluation[];
  readonly selected: RouteEvaluation | null;
}

/**
 * Bloqueos del destinatario: una cuenta que aún no abre no puede verificarse, así que se informa solo
 * RECIPIENT_ACCOUNT_NOT_OPEN; una cuenta abierta sin verificar da RECIPIENT_NOT_VERIFIED.
 */
export function remittanceBlockers(facts: RemittanceRoutingFacts): ReasonCode[] {
  if (facts.recipient.accountStatus !== "OPEN") return ["RECIPIENT_ACCOUNT_NOT_OPEN"];
  if (!facts.recipient.verified) return ["RECIPIENT_NOT_VERIFIED"];
  return [];
}

/** Rutas de remesa para gastos de llegada: mismo orden de selección que la matrícula. */
export function evaluateRemittanceRoutes(facts: RemittanceRoutingFacts): RemittanceRoutingResult {
  const blockers = remittanceBlockers(facts);
  const available = availableForArrivalExpenses(facts.funds, facts.arrivalEarmarkRemaining);
  const evaluations: RouteEvaluation[] = facts.quotes.map((quote) => {
    const reasons: ReasonCode[] = [...blockers];
    if (facts.now.plusMinutes(quote.arrivalMinutes).isAfter(facts.targetArrivalAt)) reasons.push("DEADLINE_MISSED");
    if (quote.net.currency !== facts.requestedNet.currency || quote.net.lessThan(facts.requestedNet)) reasons.push("NET_INSUFFICIENT");
    if (quote.receiverId !== facts.recipient.id) reasons.push("RECEIVER_NOT_ALLOWED");
    if (isQuoteExpired(quote, facts.now)) reasons.push("QUOTE_EXPIRED");
    if (quote.debit.greaterThan(available)) reasons.push("INSUFFICIENT_FUNDS");
    return {
      quoteId: quote.quoteId,
      routeId: quote.routeId,
      channel: quote.channel,
      receiverId: quote.receiverId,
      debit: quote.debit,
      net: quote.net,
      arrivalMinutes: quote.arrivalMinutes,
      arrivesAt: facts.now.plusMinutes(quote.arrivalMinutes),
      expiresAt: quote.expiresAt,
      reasons: sortReasons(reasons),
    };
  });
  const viable = evaluations.filter((e) => e.reasons.length === 0).sort(compareForSelection);
  const discarded = evaluations.filter((e) => e.reasons.length > 0).sort(compareByRouteId);
  return { blockers, viable, discarded, selected: viable[0] ?? null };
}
