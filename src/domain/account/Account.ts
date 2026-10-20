import type { FundsSnapshot } from "../cash/CashInvariants";
import { InvariantViolationError, PolicyViolationError } from "../errors/DomainError";
import { Money, type Currency } from "../money/Money";

export type AccountKind = "PAYER_USD" | "STUDENT_LOCAL_CNY";
export type AccountStatus = "OPEN" | "PENDING_OPENING";
export type EarmarkPurpose = "ARRIVAL_EXPENSES";
export type HoldStatus = "ACTIVE" | "CAPTURED" | "RELEASED";

export interface Earmark {
  readonly id: string;
  readonly purpose: EarmarkPurpose;
  readonly amount: Money;
  readonly used: Money;
}

export interface Hold {
  readonly id: string;
  readonly attemptId: string;
  readonly amount: Money;
  readonly status: HoldStatus;
}

export interface AccountProps {
  readonly id: string;
  readonly workspaceId: string;
  readonly ownerActorId: string;
  readonly kind: AccountKind;
  readonly currency: Currency;
  readonly balance: Money;
  readonly maskedNumber: string;
  readonly status: AccountStatus;
  readonly version: number;
  readonly earmarks: readonly Earmark[];
  readonly holds: readonly Hold[];
}

/**
 * Cuenta con reservas (earmarks) y retenciones (holds). Una retención se resuelve una sola vez:
 * CAPTURED (débito) o RELEASED. Conciliar nunca descuenta dos veces (BUILD_PROMPT 8.3).
 */
export class Account {
  private constructor(private props: AccountProps) {}

  static rehydrate(props: AccountProps): Account {
    return new Account({ ...props, earmarks: [...props.earmarks], holds: [...props.holds] });
  }

  get id(): string {
    return this.props.id;
  }
  get balance(): Money {
    return this.props.balance;
  }
  get currency(): Currency {
    return this.props.currency;
  }
  get version(): number {
    return this.props.version;
  }
  get holds(): readonly Hold[] {
    return this.props.holds;
  }
  get earmarks(): readonly Earmark[] {
    return this.props.earmarks;
  }

  toProps(): AccountProps {
    return { ...this.props };
  }

  earmarkRemaining(purpose: EarmarkPurpose): Money {
    return Money.sum(
      this.props.currency,
      this.props.earmarks.filter((e) => e.purpose === purpose).map((e) => e.amount.subtract(e.used)),
    );
  }

  funds(): FundsSnapshot {
    const earmarkedRemaining = Money.sum(this.props.currency, this.props.earmarks.map((e) => e.amount.subtract(e.used)));
    const activeHolds = Money.sum(this.props.currency, this.props.holds.filter((h) => h.status === "ACTIVE").map((h) => h.amount));
    return { balance: this.props.balance, earmarkedRemaining, activeHolds };
  }

  holdFor(attemptId: string): Hold | undefined {
    return this.props.holds.find((h) => h.attemptId === attemptId);
  }

  placeHold(holdId: string, attemptId: string, amount: Money): Hold {
    if (this.holdFor(attemptId)) throw new InvariantViolationError(`Ya existe una retención para el intento ${attemptId}`);
    const funds = this.funds();
    if (amount.greaterThan(funds.balance.subtract(funds.activeHolds))) throw new PolicyViolationError(["INSUFFICIENT_FUNDS"]);
    const hold: Hold = { id: holdId, attemptId, amount, status: "ACTIVE" };
    this.props = { ...this.props, holds: [...this.props.holds, hold], version: this.props.version + 1 };
    return hold;
  }

  /** Débito confirmado: captura la retención. Idempotente; si ya estaba capturada no vuelve a debitar. */
  captureHold(attemptId: string, options: { readonly consumeArrivalReserve: boolean }): "CAPTURED" | "ALREADY_CAPTURED" {
    const hold = this.requireHold(attemptId);
    if (hold.status === "CAPTURED") return "ALREADY_CAPTURED";
    if (hold.status === "RELEASED") throw new InvariantViolationError(`La retención del intento ${attemptId} ya fue liberada`);
    let earmarks = this.props.earmarks;
    if (options.consumeArrivalReserve) {
      let pending = hold.amount;
      earmarks = earmarks.map((e) => {
        if (e.purpose !== "ARRIVAL_EXPENSES" || !pending.isPositive()) return e;
        const take = Money.min(pending, e.amount.subtract(e.used));
        pending = pending.subtract(take);
        return { ...e, used: e.used.add(take) };
      });
    }
    this.props = {
      ...this.props,
      balance: this.props.balance.subtract(hold.amount),
      earmarks,
      holds: this.props.holds.map((h) => (h.attemptId === attemptId ? { ...h, status: "CAPTURED" } : h)),
      version: this.props.version + 1,
    };
    return "CAPTURED";
  }

  /** Falla confirmada sin débito: libera la retención una sola vez. */
  releaseHold(attemptId: string): "RELEASED" | "ALREADY_RELEASED" {
    const hold = this.requireHold(attemptId);
    if (hold.status === "RELEASED") return "ALREADY_RELEASED";
    if (hold.status === "CAPTURED") throw new InvariantViolationError(`La retención del intento ${attemptId} ya fue capturada`);
    this.props = {
      ...this.props,
      holds: this.props.holds.map((h) => (h.attemptId === attemptId ? { ...h, status: "RELEASED" } : h)),
      version: this.props.version + 1,
    };
    return "RELEASED";
  }

  /** Abono (por ejemplo, una devolución liquidada en la cuenta de origen). */
  credit(amount: Money): void {
    if (!amount.isPositive()) throw new InvariantViolationError("Un abono debe ser positivo");
    this.props = { ...this.props, balance: this.props.balance.add(amount), version: this.props.version + 1 };
  }

  private requireHold(attemptId: string): Hold {
    const hold = this.holdFor(attemptId);
    if (!hold) throw new InvariantViolationError(`No hay retención para el intento ${attemptId}`);
    return hold;
  }
}
