import { describe, expect, it } from "vitest";
import { SCENARIOS, getScenario } from "@/infrastructure/scenarios/definitions";
import { validateAllScenarios } from "@/infrastructure/scenarios/validateScenario";

describe("Escenarios: valores exactos de BUILD_PROMPT 6", () => {
  const base = getScenario("base");

  it("datos base (6.1)", () => {
    expect(base.payer).toEqual({ displayName: "Carlos Ramos", accountMasked: "•••• 4821", balanceUsd: "5000.00" });
    expect(base.arrivalReserveUsd).toBe("1800.00");
    expect(base.policy).toEqual({ maxTuitionDebitUsd: "2900.00", reserveUsd: "1800.00" });
    expect(base.obligation.netDueCny).toBe("20000.00");
    expect(base.obligation.reference).toBe("AG-STUDENT-01");
    expect(base.obligation.receiverDisplayName).toBe("Arrival University, tuition account ending 0098");
    expect(base.obligation.dueInHours).toBe(48);
    expect(base.defaultTargetArrivalHours).toBe(48);
    expect(base.scholarship).toEqual({ amountCny: "20000.00", status: "AWARDED_NOT_DISBURSED", expectedInDays: 60, condition: "LOCAL_ACCOUNT_OPEN" });
    expect(base.student.localAccount).toEqual({ bankName: "Arrival Bank", masked: "•••• 7310", status: "PENDING_OPENING", verified: false });
    expect(base.expectedArrivalExpenseUsd).toBe("1800.00");
    expect(base.quoteValidityMinutes).toBe(15);
    expect(base.approvalValidityHours).toBe(24);
  });

  it("rutas de matrícula (6.2)", () => {
    expect(base.tuitionRoutes.map((r) => [r.routeId, r.channel, r.debitUsd, r.netCny, r.arrivalHours])).toEqual([
      ["A", "BANK_WIRE_STANDARD", "2820.00", "20000.00", 72],
      ["B", "EDU_PAY_PARTNER", "2860.00", "20000.00", 24],
      ["C", "FX_BROKER_FAST", "2840.00", "19800.00", 12],
      ["D", "EXPRESS_EDU", "2880.00", "20000.00", 2],
      ["E", "UNVERIFIED_AGENT", "2830.00", "20000.00", 12],
    ]);
    expect(base.tuitionRoutes.find((r) => r.routeId === "E")?.receiver).toBe("UNVERIFIED_AGENT_ACCOUNT");
    expect(base.tuitionRoutes.find((r) => r.routeId === "B")?.requoteDebitUsd).toBe("2865.00");
    expect(base.requote.aboveMaxDebitUsd).toBe("2905.00");
  });

  it("rutas de remesa (6.4)", () => {
    expect(base.remittanceReferenceNetCny).toBe("2000.00");
    expect(base.remittanceRoutes.map((r) => [r.routeId, r.debitUsd, r.netCny, r.arrivalHours])).toEqual([
      ["R1", "288.00", "2000.00", 24],
      ["R2", "292.50", "2000.00", 1],
      ["R3", "284.00", "1950.00", 6],
    ]);
  });

  it("escenarios preconfigurados (6.3)", () => {
    expect(Object.keys(SCENARIOS)).toEqual(["base", "deadline_impossible", "scholarship_deficit", "arrival_remittance", "overpayment_refund"]);
    expect(SCENARIOS.deadline_impossible.requestedTargetArrivalHours).toBe(1);
    expect(SCENARIOS.scholarship_deficit.expectedArrivalExpenseUsd).toBe("2500.00");
    const arrival = SCENARIOS.arrival_remittance;
    expect(arrival.payer.balanceUsd).toBe("2140.00");
    expect(arrival.arrivalReserveUsd).toBe("1800.00");
    expect(arrival.obligation.status).toBe("CREDITED");
    expect(arrival.student.localAccount.status).toBe("OPEN");
    expect(arrival.student.localAccount.verified).toBe(true);
    expect(arrival.mandate).toEqual({ purpose: "ARRIVAL_EXPENSES", periodMaxUsd: "600.00", periodDays: 30, expiresInDays: 90 });
    const refund = SCENARIOS.overpayment_refund;
    expect(refund.obligation.historicalPaidCny).toBe("20500.00");
    expect(refund.refund).toEqual({ verifiedExcessCny: "500.00", settlementUsd: "70.00", settlesInHours: 24 });
  });

  it("db:seed-check: todos los escenarios son válidos y el motor da los resultados de control", () => {
    for (const check of validateAllScenarios()) expect(check.errors, check.scenario).toEqual([]);
  });
});
