import type { Money } from "../money/Money";
import type { ReasonCode } from "../policy/ReasonCode";

/** Foto de los fondos de la cuenta del pagador (una sola moneda). */
export interface FundsSnapshot {
  readonly balance: Money;
  /** Total apartado que queda sin usar (todas las reservas). */
  readonly earmarkedRemaining: Money;
  /** Suma de retenciones ACTIVE de pagos en curso. */
  readonly activeHolds: Money;
}

/** availableForTuition = balance - earmarks - activeHolds (BUILD_PROMPT 8.3). */
export function availableForTuition(funds: FundsSnapshot): Money {
  return funds.balance.subtract(funds.earmarkedRemaining).subtract(funds.activeHolds);
}

/**
 * availableForArrivalExpenses = earmarkRemaining(ARRIVAL_EXPENSES) + (balance - earmarks - activeHolds).
 * La reserva de llegada se consume primero.
 */
export function availableForArrivalExpenses(funds: FundsSnapshot, arrivalEarmarkRemaining: Money): Money {
  return arrivalEarmarkRemaining.add(availableForTuition(funds));
}

/** Dinero que de verdad puede salir de la cuenta: balance - activeHolds. */
export function spendable(funds: FundsSnapshot): Money {
  return funds.balance.subtract(funds.activeHolds);
}

/**
 * Chequeos de dinero de un débito de matrícula:
 * - INSUFFICIENT_FUNDS si supera lo que puede salir de la cuenta;
 * - BREAKS_RESERVE si tocaría dinero apartado o dejaría el saldo bajo la reserva mínima del pagador;
 * - EXCEEDS_PAYER_MAX si lo ya comprometido con la obligación más este débito supera el máximo (acumulado).
 */
export function tuitionDebitReasons(input: {
  readonly debit: Money;
  readonly funds: FundsSnapshot;
  readonly reserve: Money;
  readonly maxTuitionDebit: Money;
  readonly committedToObligation: Money;
}): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const canLeave = spendable(input.funds);
  if (input.debit.greaterThan(canLeave)) {
    reasons.push("INSUFFICIENT_FUNDS");
  } else if (input.debit.greaterThan(availableForTuition(input.funds)) || canLeave.subtract(input.debit).lessThan(input.reserve)) {
    reasons.push("BREAKS_RESERVE");
  }
  if (input.committedToObligation.add(input.debit).greaterThan(input.maxTuitionDebit)) reasons.push("EXCEEDS_PAYER_MAX");
  return reasons;
}
