import { tuitionDebitReasons, type FundsSnapshot } from "../cash/CashInvariants";
import type { Money } from "../money/Money";
import type { VirtualInstant } from "../time/Instant";
import { sortReasons, type ReasonCode } from "./ReasonCode";
import { compareByRouteId, compareForSelection, isQuoteExpired, type RouteEvaluation, type RouteQuote } from "./RouteQuote";

export type ObligationStatus = "PENDING" | "CREDITED";

export interface ObligationFacts {
  readonly id: string;
  readonly version: number;
  readonly status: ObligationStatus;
  /** Neto que debe recibir la universidad (CNY). */
  readonly netDue: Money;
  /** Única cuenta receptora admitida: la registrada por la universidad. */
  readonly recipientId: string;
  readonly dueAt: VirtualInstant;
  readonly reference: string;
}

/** Hechos tipados que recibe el motor. Todo sale del estado del servidor, nunca del texto del modelo. */
export interface TuitionRoutingFacts {
  readonly now: VirtualInstant;
  readonly obligation: ObligationFacts;
  readonly funds: FundsSnapshot;
  readonly policy: { readonly maxTuitionDebit: Money; readonly reserve: Money };
  /** Débitos confirmados más retenciones activas ya asociados a esta obligación (máximo acumulado). */
  readonly committedToObligation: Money;
  readonly acceptedChannels: readonly string[];
  readonly targetArrivalAt: VirtualInstant;
  readonly quotes: readonly RouteQuote[];
}

export interface TuitionRoutingResult {
  /** Razones que bloquean todo el plan (no dependen de la ruta). */
  readonly blockers: readonly ReasonCode[];
  /** Rutas viables en orden de selección. */
  readonly viable: readonly RouteEvaluation[];
  /** Rutas descartadas por id, cada una con sus razones. */
  readonly discarded: readonly RouteEvaluation[];
  readonly selected: RouteEvaluation | null;
}

/** Razones de una ruta concreta, sin los bloqueos del plan. */
export function evaluateTuitionQuote(facts: TuitionRoutingFacts, quote: RouteQuote): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const arrivesAt = facts.now.plusMinutes(quote.arrivalMinutes);
  if (arrivesAt.isAfter(facts.targetArrivalAt)) reasons.push("DEADLINE_MISSED");
  if (quote.net.currency !== facts.obligation.netDue.currency || quote.net.lessThan(facts.obligation.netDue)) {
    reasons.push("NET_INSUFFICIENT");
  }
  if (quote.receiverId !== facts.obligation.recipientId) reasons.push("RECEIVER_NOT_ALLOWED");
  if (!facts.acceptedChannels.includes(quote.channel)) reasons.push("CHANNEL_NOT_ALLOWED");
  if (isQuoteExpired(quote, facts.now)) reasons.push("QUOTE_EXPIRED");
  reasons.push(
    ...tuitionDebitReasons({
      debit: quote.debit,
      funds: facts.funds,
      reserve: facts.policy.reserve,
      maxTuitionDebit: facts.policy.maxTuitionDebit,
      committedToObligation: facts.committedToObligation,
    }),
  );
  return sortReasons(reasons);
}

/** Bloqueos que impiden cualquier ruta. */
export function tuitionPlanBlockers(facts: TuitionRoutingFacts): ReasonCode[] {
  const blockers: ReasonCode[] = [];
  if (facts.obligation.status !== "PENDING") blockers.push("OBLIGATION_NOT_PENDING");
  if (facts.targetArrivalAt.isAfter(facts.obligation.dueAt)) blockers.push("TARGET_LATER_THAN_DUE_DATE");
  return sortReasons(blockers);
}

/**
 * Motor de políticas de matrícula, puro y determinista (BUILD_PROMPT 8.3).
 * Excluye incumplimientos, minimiza el débito, desempata por plazo y por id de ruta.
 * La misma entrada da la misma salida, sin importar el orden de las cotizaciones.
 */
export function evaluateTuitionRoutes(facts: TuitionRoutingFacts): TuitionRoutingResult {
  const blockers = tuitionPlanBlockers(facts);
  const evaluations: RouteEvaluation[] = facts.quotes.map((quote) => ({
    quoteId: quote.quoteId,
    routeId: quote.routeId,
    channel: quote.channel,
    receiverId: quote.receiverId,
    debit: quote.debit,
    net: quote.net,
    arrivalMinutes: quote.arrivalMinutes,
    arrivesAt: facts.now.plusMinutes(quote.arrivalMinutes),
    expiresAt: quote.expiresAt,
    reasons: sortReasons([...evaluateTuitionQuote(facts, quote), ...blockers]),
  }));
  const viable = evaluations.filter((e) => e.reasons.length === 0).sort(compareForSelection);
  const discarded = evaluations.filter((e) => e.reasons.length > 0).sort(compareByRouteId);
  return { blockers, viable, discarded, selected: viable[0] ?? null };
}
