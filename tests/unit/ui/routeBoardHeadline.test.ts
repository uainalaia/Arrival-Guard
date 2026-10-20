import { describe, expect, it } from "vitest";
import type { RouteEvaluationDTO, RoutingDTO } from "@/application/dto/CaseDTO";
import { noRouteHeadline } from "@/ui/finance/RouteBoard";

const route = (routeId: string, arrivalHours: number, reasons: string[]): RouteEvaluationDTO => ({
  routeId,
  channel: "EDU_PAY_PARTNER",
  quoteId: `q-${routeId}`,
  arrivalHours,
  arrivesAt: "2026-10-21T09:00:00.000Z",
  quoteExpiresAt: "2026-10-20T10:00:00.000Z",
  debit: { currency: "USD", minor: "286000" },
  net: { currency: "CNY", minor: "2000000" },
  receiverMasked: "•••• 0098",
  receiverIsRegistered: true,
  reasons,
});
const invoiceNet = { currency: "CNY" as const, minor: "2000000" };

describe("Titular del tablero sin ruta elegida (VC7)", () => {
  it("con todas las rutas sobre el límite no habla de plazo", () => {
    const routing: RoutingDTO = { selectedRouteId: null, blockers: [], viable: [], discarded: [route("B", 24, ["EXCEEDS_PAYER_MAX"]), route("D", 2, ["EXCEEDS_PAYER_MAX"])] };
    const h = noRouteHeadline(routing, 48, routing.discarded[1]!, invoiceNet);
    expect(h.title).toBe("Above the tuition limit");
    expect(h.title).not.toMatch(/arrives in time/);
  });

  it("solo dice 'arrives in time' cuando todas fallan por plazo", () => {
    const routing: RoutingDTO = { selectedRouteId: null, blockers: [], viable: [], discarded: [route("B", 24, ["DEADLINE_MISSED"]), route("D", 2, ["DEADLINE_MISSED"])] };
    expect(noRouteHeadline(routing, 1, routing.discarded[1]!, invoiceNet)).toEqual({ title: "No route arrives in time", detail: "The fastest route takes 2 h. You need it within 1 h." });
  });

  it("los bloqueos del plan mandan y las razones mezcladas no inventan una", () => {
    expect(noRouteHeadline({ selectedRouteId: null, blockers: ["OBLIGATION_NOT_PENDING"], viable: [], discarded: [] }, 48, null, invoiceNet).title).not.toMatch(/arrives in time/);
    const mixed: RoutingDTO = { selectedRouteId: null, blockers: [], viable: [], discarded: [route("A", 72, ["DEADLINE_MISSED"]), route("C", 12, ["NET_INSUFFICIENT"])] };
    expect(noRouteHeadline(mixed, 48, null, invoiceNet).title).toBe("No route meets every rule");
  });
});
