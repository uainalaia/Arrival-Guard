import { CurrencyMismatchError } from "../errors/DomainError";
import { Money, type Currency } from "../money/Money";
import type { ReasonCode } from "../policy/ReasonCode";
import type { VirtualInstant } from "../time/Instant";
import { availableForArrivalExpenses, type FundsSnapshot } from "./CashInvariants";

export interface ConditionalIncome {
  readonly id: string;
  readonly kind: "SCHOLARSHIP";
  readonly amount: Money;
  readonly expectedAt: VirtualInstant;
  readonly condition: "LOCAL_ACCOUNT_OPEN";
  readonly status: "AWARDED_NOT_DISBURSED" | "DISBURSED";
}

export interface ExpectedExpense {
  readonly id: string;
  readonly label: string;
  readonly amount: Money;
  readonly source: "USER_ESTIMATE";
}

export interface CashProjectionInput {
  /** Cuenta del pagador (USD). */
  readonly payerFunds: FundsSnapshot;
  readonly arrivalEarmarkRemaining: Money;
  /** Débito de matrícula planificado y todavía sin retención. Si ya hay retención, va en `activeHolds`. */
  readonly plannedTuitionDebit: Money | null;
  /** Cuenta local de la estudiante (CNY). */
  readonly localFunds: { readonly balance: Money; readonly status: "OPEN" | "PENDING_OPENING" };
  readonly pendingObligations: readonly { readonly id: string; readonly label: string; readonly amount: Money }[];
  readonly conditionalIncomes: readonly ConditionalIncome[];
  readonly expectedExpenses: readonly ExpectedExpense[];
}

export interface CurrencyProjection {
  readonly currency: Currency;
  readonly confirmedBalance: Money;
  readonly arrivalReserve: Money;
  readonly activeHolds: Money;
  readonly plannedDebits: Money;
  readonly balanceAfterPlanned: Money;
  readonly availableForArrivalExpenses: Money;
  readonly expectedExpenses: Money;
  readonly pendingObligations: Money;
}

export interface CashProjection {
  readonly byCurrency: readonly CurrencyProjection[];
  readonly verdict: {
    readonly status: "COVERED" | "DEFICIT";
    readonly currency: Currency;
    /** Disponible para gastos de llegada menos gastos estimados (negativo si falta). */
    readonly margin: Money;
    readonly shortfall: Money | null;
  };
  /** Ingresos condicionados: se muestran aparte y nunca se suman (BUILD_PROMPT 8.3). */
  readonly notCounted: readonly (ConditionalIncome & { readonly reason: ReasonCode })[];
}

/** Proyección de caja por moneda, sin contar dinero que todavía no llegó y sin sumar monedas distintas. */
export function projectCash(input: CashProjectionInput): CashProjection {
  const payerCurrency = input.payerFunds.balance.currency;
  const planned = input.plannedTuitionDebit ?? Money.zero(payerCurrency);
  const afterPlanned: FundsSnapshot = { ...input.payerFunds, balance: input.payerFunds.balance.subtract(planned) };
  const forArrival = availableForArrivalExpenses(afterPlanned, input.arrivalEarmarkRemaining);
  const expenses = sumIn(payerCurrency, input.expectedExpenses.map((e) => e.amount));
  const margin = forArrival.subtract(expenses);

  const localCurrency = input.localFunds.balance.currency;
  const payerLine: CurrencyProjection = {
    currency: payerCurrency,
    confirmedBalance: input.payerFunds.balance,
    arrivalReserve: input.arrivalEarmarkRemaining,
    activeHolds: input.payerFunds.activeHolds,
    plannedDebits: planned,
    balanceAfterPlanned: afterPlanned.balance,
    availableForArrivalExpenses: forArrival,
    expectedExpenses: expenses,
    pendingObligations: sumIn(payerCurrency, input.pendingObligations.filter((o) => o.amount.currency === payerCurrency).map((o) => o.amount)),
  };
  const localLine: CurrencyProjection = {
    currency: localCurrency,
    confirmedBalance: input.localFunds.balance,
    arrivalReserve: Money.zero(localCurrency),
    activeHolds: Money.zero(localCurrency),
    plannedDebits: Money.zero(localCurrency),
    balanceAfterPlanned: input.localFunds.balance,
    availableForArrivalExpenses: input.localFunds.status === "OPEN" ? input.localFunds.balance : Money.zero(localCurrency),
    expectedExpenses: Money.zero(localCurrency),
    pendingObligations: sumIn(localCurrency, input.pendingObligations.filter((o) => o.amount.currency === localCurrency).map((o) => o.amount)),
  };

  return {
    byCurrency: [payerLine, localLine],
    verdict: {
      status: margin.isNegative() ? "DEFICIT" : "COVERED",
      currency: payerCurrency,
      margin,
      shortfall: margin.isNegative() ? margin.negate() : null,
    },
    notCounted: input.conditionalIncomes
      .filter((income) => income.status !== "DISBURSED")
      .map((income) => ({ ...income, reason: "CONDITIONAL_FUNDS_NOT_AVAILABLE" as const })),
  };
}

function sumIn(currency: Currency, items: readonly Money[]): Money {
  for (const item of items) if (item.currency !== currency) throw new CurrencyMismatchError(currency, item.currency);
  return Money.sum(currency, items);
}
