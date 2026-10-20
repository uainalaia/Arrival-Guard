import { DomainError } from "@/domain/errors/DomainError";
import { Money } from "@/domain/money/Money";
import { evaluateTuitionRoutes } from "@/domain/policy/PolicyEngine";
import { evaluateRemittanceRoutes } from "@/domain/policy/RemittancePolicy";
import { VirtualInstant } from "@/domain/time/Instant";
import { SCENARIOS } from "./definitions";
import { remittanceQuotes, tuitionQuotes } from "./scenarioQuotes";
import { SCENARIO_IDS, type ScenarioDefinition } from "./types";

const RECEIVERS = { university: "rcp-university", unverifiedAgent: "rcp-unverified-agent" };
const LOCAL = "rcp-student-local";

export interface ScenarioCheck {
  readonly scenario: string;
  readonly errors: readonly string[];
  readonly notes: readonly string[];
}

/** Valida la configuración de un escenario y que el motor dé los resultados de control de BUILD_PROMPT 6. */
export function validateScenario(scenario: ScenarioDefinition): ScenarioCheck {
  const errors: string[] = [];
  const notes: string[] = [];
  const attempt = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (error) {
      errors.push(`${label}: ${error instanceof DomainError || error instanceof Error ? error.message : String(error)}`);
    }
  };

  attempt("montos", () => {
    const usdFields = [scenario.payer.balanceUsd, scenario.arrivalReserveUsd, scenario.arrivalReserveUsedUsd, scenario.policy.maxTuitionDebitUsd, scenario.policy.reserveUsd, scenario.expectedArrivalExpenseUsd, scenario.requote.aboveMaxDebitUsd];
    for (const v of usdFields) Money.fromDecimal("USD", v);
    for (const v of [scenario.obligation.netDueCny, scenario.scholarship.amountCny, scenario.remittanceReferenceNetCny]) Money.fromDecimal("CNY", v);
    for (const r of scenario.tuitionRoutes) {
      Money.fromDecimal("USD", r.debitUsd);
      Money.fromDecimal("USD", r.requoteDebitUsd);
      Money.fromDecimal("CNY", r.netCny);
      if (!Number.isInteger(r.arrivalHours) || r.arrivalHours <= 0) throw new Error(`plazo inválido en ruta ${r.routeId}`);
    }
    for (const r of scenario.remittanceRoutes) {
      Money.fromDecimal("USD", r.debitUsd);
      Money.fromDecimal("CNY", r.netCny);
    }
  });

  const ids = scenario.tuitionRoutes.map((r) => r.routeId).join("");
  if (ids !== "ABCDE") errors.push(`rutas de matrícula esperadas A a E, hay ${ids}`);
  if (scenario.remittanceRoutes.map((r) => r.routeId).join(",") !== "R1,R2,R3") errors.push("rutas de remesa esperadas R1 a R3");
  if (scenario.quoteValidityMinutes !== 15) errors.push("la cotización debe valer 15 minutos virtuales");
  if (scenario.approvalValidityHours !== 24) errors.push("la aprobación debe valer 24 horas virtuales");

  attempt("motor", () => {
    const start = VirtualInstant.fromISO(scenario.startVirtualTime);
    const facts = (targetHours: number) => ({
      now: start,
      obligation: {
        id: "obl",
        version: 1,
        status: scenario.obligation.status,
        netDue: Money.fromDecimal("CNY", scenario.obligation.netDueCny),
        recipientId: RECEIVERS.university,
        dueAt: start.plusHours(scenario.obligation.dueInHours),
        reference: scenario.obligation.reference,
      },
      funds: {
        balance: Money.fromDecimal("USD", scenario.payer.balanceUsd),
        earmarkedRemaining: Money.fromDecimal("USD", scenario.arrivalReserveUsd).subtract(Money.fromDecimal("USD", scenario.arrivalReserveUsedUsd)),
        activeHolds: Money.zero("USD"),
      },
      policy: {
        maxTuitionDebit: Money.fromDecimal("USD", scenario.policy.maxTuitionDebitUsd),
        reserve: Money.fromDecimal("USD", scenario.policy.reserveUsd),
      },
      committedToObligation: Money.zero("USD"),
      acceptedChannels: scenario.acceptedTuitionChannels,
      targetArrivalAt: start.plusHours(targetHours),
      quotes: tuitionQuotes(scenario, RECEIVERS, start),
    });
    if (scenario.obligation.status === "PENDING") {
      const target = scenario.requestedTargetArrivalHours ?? scenario.defaultTargetArrivalHours;
      const selected = evaluateTuitionRoutes(facts(target)).selected;
      if (target === 1) {
        if (selected) errors.push(`con 1 h no debería haber ruta viable y se eligió ${selected.routeId}`);
        else notes.push("1 h: sin ruta viable (esperado)");
      } else {
        const b = evaluateTuitionRoutes(facts(48)).selected;
        const d = evaluateTuitionRoutes(facts(6)).selected;
        if (b?.routeId !== "B" || b.debit.toDecimalString() !== "2860.00") errors.push(`48 h debería elegir B por 2860.00 y eligió ${b?.routeId}`);
        if (d?.routeId !== "D" || d.debit.toDecimalString() !== "2880.00") errors.push(`6 h debería elegir D por 2880.00 y eligió ${d?.routeId}`);
        notes.push(`48 h: ${b?.routeId} USD ${b?.debit.toDecimalString()}; 6 h: ${d?.routeId} USD ${d?.debit.toDecimalString()}`);
      }
    } else {
      notes.push("matrícula ya acreditada al inicio");
    }
    if (scenario.mandate) {
      const local = scenario.student.localAccount;
      const result = evaluateRemittanceRoutes({
        now: start,
        recipient: { id: LOCAL, verified: local.verified, accountStatus: local.status, currency: "CNY" },
        requestedNet: Money.fromDecimal("CNY", scenario.remittanceReferenceNetCny),
        targetArrivalAt: start.plusHours(48),
        funds: facts(48).funds,
        arrivalEarmarkRemaining: facts(48).funds.earmarkedRemaining,
        quotes: remittanceQuotes(scenario, Money.fromDecimal("CNY", scenario.remittanceReferenceNetCny), LOCAL, start),
      });
      if (result.selected?.routeId !== "R1" || result.selected.debit.toDecimalString() !== "288.00") errors.push("la remesa de referencia debería ir por R1 a USD 288.00");
      else notes.push("remesa CNY 2000.00: R1 USD 288.00");
    }
  });

  return { scenario: scenario.id, errors, notes };
}

export function validateAllScenarios(): ScenarioCheck[] {
  return SCENARIO_IDS.map((id) => validateScenario(SCENARIOS[id]));
}
