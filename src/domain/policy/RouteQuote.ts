import type { Money } from "../money/Money";
import type { VirtualInstant } from "../time/Instant";
import type { ReasonCode } from "./ReasonCode";

/**
 * Cotización sintética de una ruta (matrícula A a E o remesa R1 a R3).
 * `providerMessage` es texto del proveedor: siempre DATO, nunca instrucción. El motor no lo lee.
 */
export interface RouteQuote {
  readonly quoteId: string;
  readonly routeId: string;
  readonly channel: string;
  readonly receiverId: string;
  /** Débito total en la cuenta de origen (USD). */
  readonly debit: Money;
  /** Lo que recibe el receptor (CNY). */
  readonly net: Money;
  readonly arrivalMinutes: number;
  readonly quotedAt: VirtualInstant;
  readonly expiresAt: VirtualInstant;
  readonly providerMessage: string | null;
}

export interface RouteEvaluation {
  readonly quoteId: string;
  readonly routeId: string;
  readonly channel: string;
  readonly receiverId: string;
  readonly debit: Money;
  readonly net: Money;
  readonly arrivalMinutes: number;
  readonly arrivesAt: VirtualInstant;
  readonly expiresAt: VirtualInstant;
  readonly reasons: readonly ReasonCode[];
}

export function isQuoteExpired(quote: Pick<RouteQuote, "expiresAt">, now: VirtualInstant): boolean {
  return !now.isBefore(quote.expiresAt);
}

/** Orden de selección (BUILD_PROMPT 8.3): menor débito, después menor plazo y al final id de ruta. */
export function compareForSelection(a: RouteEvaluation, b: RouteEvaluation): number {
  const byDebit = a.debit.compare(b.debit);
  if (byDebit !== 0) return byDebit;
  if (a.arrivalMinutes !== b.arrivalMinutes) return a.arrivalMinutes - b.arrivalMinutes;
  return a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0;
}

export function compareByRouteId(a: { routeId: string }, b: { routeId: string }): number {
  return a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0;
}
