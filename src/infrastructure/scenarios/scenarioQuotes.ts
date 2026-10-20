import { Money } from "@/domain/money/Money";
import type { RouteQuote } from "@/domain/policy/RouteQuote";
import type { VirtualInstant } from "@/domain/time/Instant";
import type { ScenarioDefinition, TuitionRouteConfig } from "./types";

// Convierte la configuración de rutas del escenario en cotizaciones de dominio. Lo usan el proveedor simulado,
// db:seed-check y las pruebas, para que todos partan de los mismos números.

export interface ReceiverIds {
  /** Cuenta registrada por la universidad. */
  readonly university: string;
  /** Cuenta distinta a la que paga la ruta E. */
  readonly unverifiedAgent: string;
}

export function tuitionQuote(
  scenario: ScenarioDefinition,
  route: TuitionRouteConfig,
  receivers: ReceiverIds,
  now: VirtualInstant,
  options: { readonly quoteId: string; readonly debitUsd?: string; readonly providerMessage?: string | null },
): RouteQuote {
  return {
    quoteId: options.quoteId,
    routeId: route.routeId,
    channel: route.channel,
    receiverId: route.receiver === "UNIVERSITY" ? receivers.university : receivers.unverifiedAgent,
    debit: Money.fromDecimal("USD", options.debitUsd ?? route.debitUsd),
    net: Money.fromDecimal("CNY", route.netCny),
    arrivalMinutes: route.arrivalHours * 60,
    quotedAt: now,
    expiresAt: now.plusMinutes(scenario.quoteValidityMinutes),
    providerMessage: options.providerMessage ?? null,
  };
}

export function tuitionQuotes(scenario: ScenarioDefinition, receivers: ReceiverIds, now: VirtualInstant, idPrefix = "q"): RouteQuote[] {
  return scenario.tuitionRoutes.map((route) => tuitionQuote(scenario, route, receivers, now, { quoteId: `${idPrefix}-${route.routeId}` }));
}

/**
 * Remesas: para netos distintos del de referencia, débito y neto escalan de forma lineal con redondeo bancario
 * (CNY 3,000.00 por R1 da USD 432.00, BUILD_PROMPT 6.4).
 */
export function remittanceQuotes(
  scenario: ScenarioDefinition,
  requestedNet: Money,
  recipientId: string,
  now: VirtualInstant,
  idPrefix = "rq",
): RouteQuote[] {
  const reference = Money.fromDecimal("CNY", scenario.remittanceReferenceNetCny);
  return scenario.remittanceRoutes.map((route) => ({
    quoteId: `${idPrefix}-${route.routeId}`,
    routeId: route.routeId,
    channel: route.channel,
    receiverId: recipientId,
    debit: Money.fromDecimal("USD", route.debitUsd).mulDiv(requestedNet.minor, reference.minor),
    net: Money.fromDecimal("CNY", route.netCny).mulDiv(requestedNet.minor, reference.minor),
    arrivalMinutes: route.arrivalHours * 60,
    quotedAt: now,
    expiresAt: now.plusMinutes(scenario.quoteValidityMinutes),
    providerMessage: null,
  }));
}
