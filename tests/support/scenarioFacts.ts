import { Money } from "@/domain/money/Money";
import type { TuitionRoutingFacts } from "@/domain/policy/PolicyEngine";
import type { RouteQuote } from "@/domain/policy/RouteQuote";
import { VirtualInstant } from "@/domain/time/Instant";
import { getScenario } from "@/infrastructure/scenarios/definitions";
import { tuitionQuotes as scenarioTuitionQuotes } from "@/infrastructure/scenarios/scenarioQuotes";
import type { ScenarioDefinition, ScenarioId } from "@/infrastructure/scenarios/types";

// Arma hechos de dominio a partir de la configuración de escenarios, para que las pruebas usen los mismos números.

export const UNIVERSITY_RECIPIENT = "rcp-university";
export const OTHER_RECIPIENT = "rcp-unverified-agent";

export const usd = (text: string): Money => Money.fromDecimal("USD", text);
export const cny = (text: string): Money => Money.fromDecimal("CNY", text);

export function startOf(scenario: ScenarioDefinition): VirtualInstant {
  return VirtualInstant.fromISO(scenario.startVirtualTime);
}

export function tuitionQuotes(scenario: ScenarioDefinition, now: VirtualInstant): RouteQuote[] {
  return scenarioTuitionQuotes(scenario, { university: UNIVERSITY_RECIPIENT, unverifiedAgent: OTHER_RECIPIENT }, now);
}

export interface TuitionFactsOptions {
  readonly targetHours?: number;
  readonly now?: VirtualInstant;
  readonly balanceUsd?: string;
  readonly earmarkedUsd?: string;
  readonly activeHoldsUsd?: string;
  readonly committedUsd?: string;
  readonly maxTuitionDebitUsd?: string;
  readonly reserveUsd?: string;
  readonly quotes?: RouteQuote[];
  readonly acceptedChannels?: readonly string[];
  readonly obligationStatus?: "PENDING" | "CREDITED";
}

export function tuitionFacts(id: ScenarioId = "base", options: TuitionFactsOptions = {}): TuitionRoutingFacts {
  const scenario = getScenario(id);
  const start = startOf(scenario);
  const now = options.now ?? start;
  const targetHours = options.targetHours ?? scenario.requestedTargetArrivalHours ?? scenario.defaultTargetArrivalHours;
  return {
    now,
    obligation: {
      id: "obl-1",
      version: 1,
      status: options.obligationStatus ?? scenario.obligation.status,
      netDue: cny(scenario.obligation.netDueCny),
      recipientId: UNIVERSITY_RECIPIENT,
      dueAt: start.plusHours(scenario.obligation.dueInHours),
      reference: scenario.obligation.reference,
    },
    funds: {
      balance: usd(options.balanceUsd ?? scenario.payer.balanceUsd),
      earmarkedRemaining: usd(options.earmarkedUsd ?? scenario.arrivalReserveUsd),
      activeHolds: usd(options.activeHoldsUsd ?? "0.00"),
    },
    policy: {
      maxTuitionDebit: usd(options.maxTuitionDebitUsd ?? scenario.policy.maxTuitionDebitUsd),
      reserve: usd(options.reserveUsd ?? scenario.policy.reserveUsd),
    },
    committedToObligation: usd(options.committedUsd ?? "0.00"),
    acceptedChannels: options.acceptedChannels ?? scenario.acceptedTuitionChannels,
    targetArrivalAt: now.plusHours(targetHours),
    quotes: options.quotes ?? tuitionQuotes(scenario, now),
  };
}
