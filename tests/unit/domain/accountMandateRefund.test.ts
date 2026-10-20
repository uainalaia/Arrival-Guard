import { describe, expect, it } from "vitest";
import { Account } from "@/domain/account/Account";
import { StandingMandate } from "@/domain/consent/StandingMandate";
import { InvariantViolationError, PolicyViolationError } from "@/domain/errors/DomainError";
import { evaluateRemittanceRoutes, type RemittanceRoutingFacts } from "@/domain/policy/RemittancePolicy";
import type { RouteQuote } from "@/domain/policy/RouteQuote";
import { RefundClaim } from "@/domain/refund/RefundClaim";
import { VirtualInstant } from "@/domain/time/Instant";
import { getScenario } from "@/infrastructure/scenarios/definitions";
import { cny, usd } from "../../support/scenarioFacts";

const now = VirtualInstant.fromISO("2026-10-20T09:00:00.000Z");
const LOCAL = "rcp-sofia-local";

function payerAccount(balance: string, used = "0.00"): Account {
  return Account.rehydrate({
    id: "acc-payer",
    workspaceId: "ws-1",
    ownerActorId: "act-payer",
    kind: "PAYER_USD",
    currency: "USD",
    balance: usd(balance),
    maskedNumber: "•••• 4821",
    status: "OPEN",
    version: 1,
    earmarks: [{ id: "em-1", purpose: "ARRIVAL_EXPENSES", amount: usd("1800.00"), used: usd(used) }],
    holds: [],
  });
}

function mandate(overrides: Partial<Parameters<typeof StandingMandate.rehydrate>[0]> = {}): StandingMandate {
  return StandingMandate.rehydrate({
    id: "man-1",
    workspaceId: "ws-1",
    payerActorId: "act-payer",
    purpose: "ARRIVAL_EXPENSES",
    recipientId: LOCAL,
    periodMax: usd("600.00"),
    periodDays: 30,
    expiresAt: now.plusDays(90),
    status: "ACTIVE",
    version: 1,
    ...overrides,
  });
}

function remittanceQuotes(netCny: string): RouteQuote[] {
  const scenario = getScenario("arrival_remittance");
  const ref = cny(scenario.remittanceReferenceNetCny);
  const net = cny(netCny);
  return scenario.remittanceRoutes.map((r) => {
    const refNet = cny(r.netCny);
    return {
      quoteId: `q-${r.routeId}`,
      routeId: r.routeId,
      channel: r.channel,
      receiverId: LOCAL,
      debit: usd(r.debitUsd).mulDiv(net.minor, ref.minor),
      net: refNet.mulDiv(net.minor, ref.minor),
      arrivalMinutes: r.arrivalHours * 60,
      quotedAt: now,
      expiresAt: now.plusMinutes(15),
      providerMessage: null,
    };
  });
}

function remittanceFacts(netCny: string, overrides: Partial<RemittanceRoutingFacts> = {}): RemittanceRoutingFacts {
  return {
    now,
    recipient: { id: LOCAL, verified: true, accountStatus: "OPEN", currency: "CNY" },
    requestedNet: cny(netCny),
    targetArrivalAt: now.plusHours(48),
    funds: payerAccount("2140.00").funds(),
    arrivalEarmarkRemaining: usd("1800.00"),
    quotes: remittanceQuotes(netCny),
    ...overrides,
  };
}

describe("Cuenta: retenciones y reserva (BUILD_PROMPT 8.3)", () => {
  it("una retención se captura una sola vez y el débito no se descuenta dos veces", () => {
    const account = payerAccount("5000.00");
    account.placeHold("hold-1", "att-1", usd("2860.00"));
    expect(account.funds().activeHolds.toDecimalString()).toBe("2860.00");
    expect(account.captureHold("att-1", { consumeArrivalReserve: false })).toBe("CAPTURED");
    expect(account.captureHold("att-1", { consumeArrivalReserve: false })).toBe("ALREADY_CAPTURED");
    expect(account.balance.toDecimalString()).toBe("2140.00");
    expect(account.funds().activeHolds.isZero()).toBe(true);
    expect(account.earmarkRemaining("ARRIVAL_EXPENSES").toDecimalString()).toBe("1800.00");
  });

  it("una falla confirmada libera la retención una sola vez y no mueve el saldo", () => {
    const account = payerAccount("5000.00");
    account.placeHold("hold-1", "att-1", usd("2860.00"));
    expect(account.releaseHold("att-1")).toBe("RELEASED");
    expect(account.releaseHold("att-1")).toBe("ALREADY_RELEASED");
    expect(account.balance.toDecimalString()).toBe("5000.00");
    expect(() => account.captureHold("att-1", { consumeArrivalReserve: false })).toThrow(InvariantViolationError);
  });

  it("no libera lo ya capturado ni duplica la retención de un mismo intento", () => {
    const account = payerAccount("5000.00");
    account.placeHold("hold-1", "att-1", usd("2860.00"));
    expect(() => account.placeHold("hold-2", "att-1", usd("2860.00"))).toThrow(InvariantViolationError);
    account.captureHold("att-1", { consumeArrivalReserve: false });
    expect(() => account.releaseHold("att-1")).toThrow(InvariantViolationError);
  });

  it("no retiene más de lo que puede salir de la cuenta", () => {
    const account = payerAccount("1000.00");
    expect(() => account.placeHold("hold-1", "att-1", usd("1000.01"))).toThrow(PolicyViolationError);
  });

  it("una remesa consume primero la reserva de llegada: 288.00 deja 1,512.00 y saldo 1,852.00 (N05)", () => {
    const account = payerAccount("2140.00");
    account.placeHold("hold-1", "att-r1", usd("288.00"));
    account.captureHold("att-r1", { consumeArrivalReserve: true });
    expect(account.balance.toDecimalString()).toBe("1852.00");
    expect(account.earmarkRemaining("ARRIVAL_EXPENSES").toDecimalString()).toBe("1512.00");
  });

  it("la reserva consumida nunca pasa de su monto", () => {
    const account = payerAccount("5000.00", "1700.00");
    account.placeHold("hold-1", "att-r1", usd("288.00"));
    account.captureHold("att-r1", { consumeArrivalReserve: true });
    expect(account.earmarkRemaining("ARRIVAL_EXPENSES").toDecimalString()).toBe("0.00");
    expect(account.balance.toDecimalString()).toBe("4712.00");
  });
});

describe("Política de remesas (A1, BUILD_PROMPT 6.4)", () => {
  it("CNY 2,000.00: elige R1 por USD 288.00; R2 viable; R3 descartada por neto CNY 1,950.00", () => {
    const result = evaluateRemittanceRoutes(remittanceFacts("2000.00"));
    expect(result.selected?.routeId).toBe("R1");
    expect(result.selected?.debit.toDecimalString()).toBe("288.00");
    expect(result.viable.map((r) => r.routeId)).toEqual(["R1", "R2"]);
    expect(result.viable[1]?.debit.toDecimalString()).toBe("292.50");
    expect(result.discarded.map((r) => [r.routeId, r.reasons])).toEqual([["R3", ["NET_INSUFFICIENT"]]]);
  });

  it("CNY 3,000.00 por R1 escala lineal a USD 432.00", () => {
    expect(evaluateRemittanceRoutes(remittanceFacts("3000.00")).selected?.debit.toDecimalString()).toBe("432.00");
  });

  it("con plazo de 6 h elige R2", () => {
    expect(evaluateRemittanceRoutes(remittanceFacts("2000.00", { targetArrivalAt: now.plusHours(6) })).selected?.routeId).toBe("R2");
  });

  it("cuenta local sin abrir: RECIPIENT_ACCOUNT_NOT_OPEN (N18)", () => {
    const result = evaluateRemittanceRoutes(remittanceFacts("2000.00", { recipient: { id: LOCAL, verified: false, accountStatus: "PENDING_OPENING", currency: "CNY" } }));
    expect(result.blockers).toEqual(["RECIPIENT_ACCOUNT_NOT_OPEN"]);
    expect(result.selected).toBeNull();
  });

  it("destinatario no verificado: RECIPIENT_NOT_VERIFIED (S15)", () => {
    const result = evaluateRemittanceRoutes(remittanceFacts("2000.00", { recipient: { id: "rcp-new", verified: false, accountStatus: "OPEN", currency: "CNY" } }));
    expect(result.blockers).toEqual(["RECIPIENT_NOT_VERIFIED"]);
    expect(result.selected).toBeNull();
  });

  it("no gasta más de lo disponible para gastos de llegada", () => {
    const funds = payerAccount("200.00").funds();
    const result = evaluateRemittanceRoutes(remittanceFacts("2000.00", { funds, arrivalEarmarkRemaining: usd("0.00") }));
    expect(result.selected).toBeNull();
    expect(result.discarded.find((r) => r.routeId === "R1")?.reasons).toEqual(["INSUFFICIENT_FUNDS"]);
  });
});

describe("Mandato permanente con período móvil (A1, N05 y N17)", () => {
  it("R1 por USD 288.00 entra en el mandato: 288.00 de 600.00", () => {
    const decision = mandate().authorize({ purpose: "ARRIVAL_EXPENSES", recipientId: LOCAL, debit: usd("288.00"), now, usages: [] });
    expect(decision).toMatchObject({ mode: "WITHIN_MANDATE" });
    if (decision.mode === "WITHIN_MANDATE") {
      expect(decision.usedAfter.toDecimalString()).toBe("288.00");
      expect(decision.periodMax.toDecimalString()).toBe("600.00");
    }
  });

  it("una segunda remesa de USD 432.00 suma 720.00 > 600.00: pide aprobación puntual", () => {
    const decision = mandate().authorize({
      purpose: "ARRIVAL_EXPENSES",
      recipientId: LOCAL,
      debit: usd("432.00"),
      now: now.plusHours(1),
      usages: [{ debit: usd("288.00"), at: now }],
    });
    expect(decision).toEqual({ mode: "NEEDS_PAYER_APPROVAL", reasons: ["EXCEEDS_MANDATE_PERIOD_LIMIT"] });
  });

  it("el período es móvil: lo usado hace más de 30 días ya no cuenta", () => {
    const m = mandate();
    const later = now.plusDays(31);
    expect(m.usedInPeriod([{ debit: usd("288.00"), at: now }], later).isZero()).toBe(true);
    expect(m.usedInPeriod([{ debit: usd("288.00"), at: now }], now.plusDays(29)).toDecimalString()).toBe("288.00");
    expect(m.authorize({ purpose: "ARRIVAL_EXPENSES", recipientId: LOCAL, debit: usd("432.00"), now: later, usages: [{ debit: usd("288.00"), at: now }] }).mode).toBe("WITHIN_MANDATE");
  });

  it("revocado, vencido o para otro destinatario no autoriza sin el pagador", () => {
    const query = { purpose: "ARRIVAL_EXPENSES" as const, recipientId: LOCAL, debit: usd("10.00"), now, usages: [] };
    expect(mandate({ status: "REVOKED" }).authorize(query)).toEqual({ mode: "NEEDS_PAYER_APPROVAL", reasons: ["MANDATE_REVOKED"] });
    expect(mandate({ expiresAt: now }).authorize(query)).toEqual({ mode: "NEEDS_PAYER_APPROVAL", reasons: ["MANDATE_EXPIRED"] });
    expect(mandate().authorize({ ...query, recipientId: "rcp-other" })).toEqual({ mode: "NEEDS_PAYER_APPROVAL", reasons: ["MANDATE_MISSING"] });
  });

  it("revocar y cambiar el tope suben la versión", () => {
    const m = mandate();
    m.changePeriodMax(usd("400.00"));
    expect(m.version).toBe(2);
    expect(m.periodMax.toDecimalString()).toBe("400.00");
    m.revoke();
    expect(m.status).toBe("REVOKED");
    expect(m.version).toBe(3);
  });
});

describe("Reclamo de devolución (A2)", () => {
  const base = { id: "rc-1", workspaceId: "ws-1", obligationId: "obl-1", sourceAccountId: "acc-payer" };

  it("se prepara por el exceso verificado CNY 500.00 y con destino fijo en la cuenta de origen (N13)", () => {
    const claim = RefundClaim.prepare({ ...base, verifiedExcess: cny("500.00") });
    expect(claim.amount.toDecimalString()).toBe("500.00");
    expect(claim.destinationAccountId).toBe("acc-payer");
    expect(claim.status).toBe("DRAFT");
  });

  it("no admite montos sobre el exceso verificado", () => {
    expect(() => RefundClaim.prepare({ ...base, verifiedExcess: cny("500.00"), requestedAmount: cny("500.01") })).toThrow(PolicyViolationError);
    try {
      RefundClaim.prepare({ ...base, verifiedExcess: cny("500.00"), requestedAmount: cny("900.00") });
    } catch (error) {
      expect((error as PolicyViolationError).reasons).toEqual(["REFUND_EXCEEDS_VERIFIED_EXCESS"]);
    }
  });

  it("sin exceso verificado no hay reclamo (N14)", () => {
    expect(() => RefundClaim.prepare({ ...base, verifiedExcess: cny("0.00") })).toThrow(PolicyViolationError);
  });

  it("rechaza cualquier otro destino: REFUND_DESTINATION_FIXED (S14)", () => {
    try {
      RefundClaim.prepare({ ...base, verifiedExcess: cny("500.00"), requestedDestinationAccountId: "acc-attacker" });
      expect.unreachable();
    } catch (error) {
      expect((error as PolicyViolationError).reasons).toEqual(["REFUND_DESTINATION_FIXED"]);
    }
  });

  it("se liquida en USD 70.00 hacia la cuenta de origen al terminar", () => {
    const claim = RefundClaim.prepare({ ...base, verifiedExcess: cny("500.00") });
    claim.submit("inst-claim-1");
    claim.transitionTo("UNDER_REVIEW");
    claim.transitionTo("APPROVED");
    claim.markRefunded(usd("70.00"));
    expect(claim.status).toBe("REFUNDED");
    expect(claim.settlement?.toDecimalString()).toBe("70.00");
    expect(claim.institutionClaimId).toBe("inst-claim-1");
  });
});
