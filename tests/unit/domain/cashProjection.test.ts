import { describe, expect, it } from "vitest";
import { availableForArrivalExpenses, availableForTuition, spendable } from "@/domain/cash/CashInvariants";
import { projectCash, type CashProjectionInput } from "@/domain/cash/CashProjection";
import { VirtualInstant } from "@/domain/time/Instant";
import { cny, usd } from "../../support/scenarioFacts";

const start = VirtualInstant.fromISO("2026-10-20T09:00:00.000Z");

function input(expenseUsd: string, overrides: Partial<CashProjectionInput> = {}): CashProjectionInput {
  return {
    payerFunds: { balance: usd("5000.00"), earmarkedRemaining: usd("1800.00"), activeHolds: usd("0.00") },
    arrivalEarmarkRemaining: usd("1800.00"),
    plannedTuitionDebit: usd("2860.00"),
    localFunds: { balance: cny("0.00"), status: "PENDING_OPENING" },
    pendingObligations: [{ id: "obl-1", label: "Tuition invoice AG-STUDENT-01", amount: cny("20000.00") }],
    conditionalIncomes: [
      { id: "ci-1", kind: "SCHOLARSHIP", amount: cny("20000.00"), expectedAt: start.plusDays(60), condition: "LOCAL_ACCOUNT_OPEN", status: "AWARDED_NOT_DISBURSED" },
    ],
    expectedExpenses: [{ id: "exp-1", label: "Arrival costs", amount: usd(expenseUsd), source: "USER_ESTIMATE" }],
    ...overrides,
  };
}

describe("Invariantes de caja (BUILD_PROMPT 8.3)", () => {
  const funds = { balance: usd("2140.00"), earmarkedRemaining: usd("1800.00"), activeHolds: usd("100.00") };

  it("availableForTuition = balance - earmarks - activeHolds", () => {
    expect(availableForTuition(funds).toDecimalString()).toBe("240.00");
  });

  it("availableForArrivalExpenses = reserva de llegada restante + disponible para matrícula", () => {
    expect(availableForArrivalExpenses(funds, usd("1800.00")).toDecimalString()).toBe("2040.00");
  });

  it("spendable = balance - activeHolds", () => {
    expect(spendable(funds).toDecimalString()).toBe("2040.00");
  });
});

describe("Proyección de caja por moneda (T4)", () => {
  it("N07: con la matrícula por B y gastos de USD 1,800.00 queda COVERED con margen de USD 340.00", () => {
    const projection = projectCash(input("1800.00"));
    expect(projection.verdict.status).toBe("COVERED");
    expect(projection.verdict.margin.toDecimalString()).toBe("340.00");
    expect(projection.verdict.margin.currency).toBe("USD");
    const usdLine = projection.byCurrency.find((c) => c.currency === "USD")!;
    expect(usdLine.confirmedBalance.toDecimalString()).toBe("5000.00");
    expect(usdLine.plannedDebits.toDecimalString()).toBe("2860.00");
    expect(usdLine.balanceAfterPlanned.toDecimalString()).toBe("2140.00");
    expect(usdLine.arrivalReserve.toDecimalString()).toBe("1800.00");
    expect(usdLine.availableForArrivalExpenses.toDecimalString()).toBe("2140.00");
  });

  it("N08: con gastos de USD 2,500.00 queda DEFICIT de USD 360.00 y la beca aparece aparte sin contarse", () => {
    const projection = projectCash(input("2500.00"));
    expect(projection.verdict.status).toBe("DEFICIT");
    expect(projection.verdict.margin.toDecimalString()).toBe("-360.00");
    expect(projection.verdict.shortfall?.toDecimalString()).toBe("360.00");
    expect(projection.notCounted).toHaveLength(1);
    expect(projection.notCounted[0]?.amount.equals(cny("20000.00"))).toBe(true);
    expect(projection.notCounted[0]?.reason).toBe("CONDITIONAL_FUNDS_NOT_AVAILABLE");
  });

  it("un ingreso condicionado nunca cambia el veredicto ni el disponible", () => {
    const withScholarship = projectCash(input("2500.00"));
    const without = projectCash(input("2500.00", { conditionalIncomes: [] }));
    expect(withScholarship.verdict.margin.equals(without.verdict.margin)).toBe(true);
    expect(withScholarship.byCurrency.find((c) => c.currency === "CNY")!.confirmedBalance.isZero()).toBe(true);
  });

  it("no suma monedas: la obligación en CNY va en su propia sección", () => {
    const projection = projectCash(input("1800.00"));
    const cnyLine = projection.byCurrency.find((c) => c.currency === "CNY")!;
    expect(cnyLine.pendingObligations.toDecimalString()).toBe("20000.00");
    expect(cnyLine.pendingObligations.currency).toBe("CNY");
    expect(projection.byCurrency.map((c) => c.currency)).toEqual(["USD", "CNY"]);
  });

  it("con la matrícula ya acreditada no resta débito planificado (escenario arrival_remittance)", () => {
    const projection = projectCash(
      input("1800.00", {
        payerFunds: { balance: usd("2140.00"), earmarkedRemaining: usd("1800.00"), activeHolds: usd("0.00") },
        plannedTuitionDebit: null,
        pendingObligations: [],
      }),
    );
    expect(projection.verdict.status).toBe("COVERED");
    expect(projection.verdict.margin.toDecimalString()).toBe("340.00");
  });

  it("una retención activa ya cuenta como dinero comprometido", () => {
    const projection = projectCash(
      input("1800.00", {
        payerFunds: { balance: usd("5000.00"), earmarkedRemaining: usd("1800.00"), activeHolds: usd("2860.00") },
        plannedTuitionDebit: null,
      }),
    );
    expect(projection.verdict.margin.toDecimalString()).toBe("340.00");
  });

  it("rechaza gastos estimados en una moneda distinta de la cuenta del pagador", () => {
    expect(() =>
      projectCash(input("1800.00", { expectedExpenses: [{ id: "x", label: "x", amount: cny("100.00"), source: "USER_ESTIMATE" }] })),
    ).toThrow();
  });
});
