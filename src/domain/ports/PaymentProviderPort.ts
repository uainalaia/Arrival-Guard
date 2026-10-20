import type { Money, MoneyJSON } from "../money/Money";
import type { RouteQuote } from "../policy/RouteQuote";
import type { VirtualInstant } from "../time/Instant";

/** Contexto de cada llamada a un simulador: el espacio y su hora virtual. */
export interface SimulationContext {
  readonly workspaceId: string;
  readonly now: VirtualInstant;
}

export interface TransferPayload {
  readonly kind: "TUITION" | "REMITTANCE";
  readonly routeId: string;
  readonly channel: string;
  readonly receiverId: string;
  readonly reference: string;
  readonly quoteId: string;
  readonly debit: MoneyJSON;
  readonly net: MoneyJSON;
  readonly arrivalMinutes: number;
}

export type SubmitResult =
  | { readonly status: "ACCEPTED"; readonly transferId: string; readonly acceptedAt: VirtualInstant; readonly expectedArrivalAt: VirtualInstant }
  | { readonly status: "FAILED"; readonly transferId: string; readonly code: string };

export interface ProviderTransfer {
  readonly transferId: string;
  readonly idempotencyKey: string;
  readonly status: "ACCEPTED" | "FAILED";
  readonly debit: Money;
  readonly acceptedAt: VirtualInstant | null;
  readonly expectedArrivalAt: VirtualInstant | null;
}

export interface ProviderEvent {
  /** Id de esta entrega concreta (cada copia de un duplicado tiene la suya). */
  readonly deliveryId: string;
  /** Id del evento del proveedor. Un duplicado llega con el mismo id. */
  readonly providerEventId: string;
  readonly transferId: string;
  readonly type: "DEBIT_CONFIRMED";
  readonly debit: Money;
  readonly emittedAt: VirtualInstant;
}

/** La respuesta del proveedor se perdió (timeout). El intento queda UNKNOWN y se concilia. */
export class ProviderTimeoutError extends Error {
  readonly code = "PROVIDER_TIMEOUT";
}

/** Misma clave de idempotencia con otro contenido. */
export class ProviderIdempotencyConflictError extends Error {
  readonly code = "PROVIDER_IDEMPOTENCY_CONFLICT";
}

/** Proveedor de pagos (simulado). Acepta un envío una sola vez por clave y devuelve lo existente si se repite. */
export interface PaymentProviderPort {
  quoteTuition(ctx: SimulationContext, request: { readonly universityRecipientId: string; readonly unverifiedRecipientId: string }): Promise<RouteQuote[]>;
  quoteRemittance(ctx: SimulationContext, request: { readonly net: Money; readonly recipientId: string }): Promise<RouteQuote[]>;
  /** Recotiza la misma ruta de una cotización anterior (A3). */
  requote(ctx: SimulationContext, previous: RouteQuote): Promise<RouteQuote>;
  submitTransfer(ctx: SimulationContext, idempotencyKey: string, payload: TransferPayload): Promise<SubmitResult>;
  getTransfer(ctx: SimulationContext, idempotencyKey: string): Promise<ProviderTransfer | null>;
  events(ctx: SimulationContext, transferId: string): Promise<ProviderEvent[]>;
}
