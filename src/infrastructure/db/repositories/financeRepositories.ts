import { and, asc, eq } from "drizzle-orm";
import { Account, type AccountKind, type AccountStatus, type EarmarkPurpose, type HoldStatus } from "@/domain/account/Account";
import type { ConditionalIncome, ExpectedExpense } from "@/domain/cash/CashProjection";
import { Money, type Currency } from "@/domain/money/Money";
import type { ObligationStatus } from "@/domain/policy/PolicyEngine";
import type {
  AccountRepository,
  FinanceFactsRepository,
  LockOptions,
  ObligationRecord,
  ObligationRepository,
  PayerPolicyRecord,
  PolicyRepository,
  RecipientKind,
  RecipientRecord,
  RecipientRepository,
} from "@/domain/ports/Repositories";
import { VirtualInstant } from "@/domain/time/Instant";
import type { DbExecutor } from "../executor";
import { accounts, conditionalIncomes, earmarks, expectedExpenses, holds, obligations, payerPolicies, recipients } from "../schema";

const money = (currency: string, minor: bigint) => Money.of(currency as Currency, minor);

// Lo cargado de cada cuenta, para escribir solo las reservas y retenciones que cambiaron al guardar.
const loaded = new WeakMap<Account, Map<string, string>>();
const earmarkKey = (e: { id: string; used: Money }) => `e:${e.id}:${e.used.minor.toString()}`;
const holdKey = (h: { attemptId: string; status: string }) => `h:${h.attemptId}:${h.status}`;

export class DrizzleAccountRepository implements AccountRepository {
  constructor(private readonly db: DbExecutor) {}

  async getByKind(workspaceId: string, kind: AccountKind, options?: LockOptions): Promise<Account | null> {
    const query = this.db.select().from(accounts).where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.kind, kind)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? this.hydrate(row) : null;
  }

  async getById(workspaceId: string, id: string, options?: LockOptions): Promise<Account | null> {
    const query = this.db.select().from(accounts).where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, id)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? this.hydrate(row) : null;
  }

  async bankName(workspaceId: string, id: string): Promise<string | null> {
    const [row] = await this.db
      .select({ bankName: accounts.bankName })
      .from(accounts)
      .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, id)));
    return row?.bankName ?? null;
  }

  async insert(account: Account, options?: { readonly bankName?: string | null }): Promise<void> {
    const p = account.toProps();
    await this.db.insert(accounts).values({
      id: p.id,
      bankName: options?.bankName ?? null,
      workspaceId: p.workspaceId,
      ownerActorId: p.ownerActorId,
      kind: p.kind,
      currency: p.currency,
      balanceMinor: p.balance.minor,
      maskedNumber: p.maskedNumber,
      status: p.status,
      version: p.version,
    });
    for (const e of p.earmarks) {
      await this.db.insert(earmarks).values({
        id: e.id,
        workspaceId: p.workspaceId,
        accountId: p.id,
        purpose: e.purpose,
        currency: p.currency,
        amountMinor: e.amount.minor,
        usedMinor: e.used.minor,
      });
    }
  }

  async save(account: Account): Promise<void> {
    const p = account.toProps();
    await this.db
      .update(accounts)
      .set({ balanceMinor: p.balance.minor, version: p.version, status: p.status })
      .where(and(eq(accounts.workspaceId, p.workspaceId), eq(accounts.id, p.id)));
    const before = loaded.get(account) ?? new Map<string, string>();
    for (const e of p.earmarks) {
      if (before.has(earmarkKey(e))) continue;
      await this.db.update(earmarks).set({ usedMinor: e.used.minor }).where(and(eq(earmarks.workspaceId, p.workspaceId), eq(earmarks.id, e.id)));
    }
    for (const h of p.holds) {
      if (before.has(holdKey(h))) continue;
      await this.db
        .insert(holds)
        .values({
          id: h.id,
          workspaceId: p.workspaceId,
          accountId: p.id,
          attemptId: h.attemptId,
          currency: p.currency,
          amountMinor: h.amount.minor,
          status: h.status,
          resolvedAt: h.status === "ACTIVE" ? null : new Date(),
        })
        .onConflictDoUpdate({
          target: holds.attemptId,
          set: { status: h.status, resolvedAt: h.status === "ACTIVE" ? null : new Date() },
        });
    }
    remember(account);
  }

  private async hydrate(row: typeof accounts.$inferSelect): Promise<Account> {
    const [earmarkRows, holdRows] = await Promise.all([
      this.db.select().from(earmarks).where(and(eq(earmarks.workspaceId, row.workspaceId), eq(earmarks.accountId, row.id))).orderBy(asc(earmarks.id)),
      this.db.select().from(holds).where(and(eq(holds.workspaceId, row.workspaceId), eq(holds.accountId, row.id))).orderBy(asc(holds.createdAt)),
    ]);
    const account = Account.rehydrate({
      id: row.id,
      workspaceId: row.workspaceId,
      ownerActorId: row.ownerActorId,
      kind: row.kind as AccountKind,
      currency: row.currency as Currency,
      balance: money(row.currency, row.balanceMinor),
      maskedNumber: row.maskedNumber,
      status: row.status as AccountStatus,
      version: row.version,
      earmarks: earmarkRows.map((e) => ({ id: e.id, purpose: e.purpose as EarmarkPurpose, amount: money(e.currency, e.amountMinor), used: money(e.currency, e.usedMinor) })),
      holds: holdRows.map((h) => ({ id: h.id, attemptId: h.attemptId, amount: money(h.currency, h.amountMinor), status: h.status as HoldStatus })),
    });
    remember(account);
    return account;
  }
}

function remember(account: Account): void {
  const keys = new Map<string, string>();
  for (const e of account.earmarks) keys.set(earmarkKey(e), "");
  for (const h of account.holds) keys.set(holdKey(h), "");
  loaded.set(account, keys);
}

export class DrizzlePolicyRepository implements PolicyRepository {
  constructor(private readonly db: DbExecutor) {}

  async getForAccount(workspaceId: string, accountId: string, options?: LockOptions): Promise<PayerPolicyRecord | null> {
    const query = this.db.select().from(payerPolicies).where(and(eq(payerPolicies.workspaceId, workspaceId), eq(payerPolicies.accountId, accountId)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      accountId: row.accountId,
      maxTuitionDebit: money(row.currency, row.maxTuitionDebitMinor),
      reserve: money(row.currency, row.reserveMinor),
      version: row.version,
    };
  }

  async insert(record: PayerPolicyRecord): Promise<void> {
    await this.db.insert(payerPolicies).values({
      id: record.id,
      workspaceId: record.workspaceId,
      accountId: record.accountId,
      currency: record.maxTuitionDebit.currency,
      maxTuitionDebitMinor: record.maxTuitionDebit.minor,
      reserveMinor: record.reserve.minor,
      version: record.version,
    });
  }

  async save(record: PayerPolicyRecord): Promise<void> {
    await this.db
      .update(payerPolicies)
      .set({ maxTuitionDebitMinor: record.maxTuitionDebit.minor, reserveMinor: record.reserve.minor, version: record.version })
      .where(and(eq(payerPolicies.workspaceId, record.workspaceId), eq(payerPolicies.id, record.id)));
  }
}

export class DrizzleRecipientRepository implements RecipientRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(workspaceId: string, id: string): Promise<RecipientRecord | null> {
    const [row] = await this.db.select().from(recipients).where(and(eq(recipients.workspaceId, workspaceId), eq(recipients.id, id)));
    return row ? toRecipient(row) : null;
  }

  async list(workspaceId: string): Promise<RecipientRecord[]> {
    const rows = await this.db.select().from(recipients).where(eq(recipients.workspaceId, workspaceId));
    return rows.map(toRecipient);
  }

  async insert(record: RecipientRecord): Promise<void> {
    await this.db.insert(recipients).values({ ...record });
  }
}

function toRecipient(row: typeof recipients.$inferSelect): RecipientRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as RecipientKind,
    displayName: row.displayName,
    maskedAccount: row.maskedAccount,
    currency: row.currency as Currency,
    verified: row.verified,
    accountStatus: row.accountStatus as "OPEN" | "PENDING_OPENING",
    addedByActorId: row.addedByActorId,
  };
}

export class DrizzleObligationRepository implements ObligationRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(workspaceId: string, id: string, options?: LockOptions): Promise<ObligationRecord | null> {
    const query = this.db.select().from(obligations).where(and(eq(obligations.workspaceId, workspaceId), eq(obligations.id, id)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? toObligation(row) : null;
  }

  async list(workspaceId: string): Promise<ObligationRecord[]> {
    const rows = await this.db.select().from(obligations).where(eq(obligations.workspaceId, workspaceId));
    return rows.map(toObligation);
  }

  async insert(record: ObligationRecord): Promise<void> {
    await this.db.insert(obligations).values({
      id: record.id,
      workspaceId: record.workspaceId,
      recipientId: record.recipientId,
      studentActorId: record.studentActorId,
      sourceAccountId: record.sourceAccountId,
      currency: record.netDue.currency,
      netDueMinor: record.netDue.minor,
      reference: record.reference,
      dueAtVirtual: record.dueAt.toDate(),
      status: record.status,
      version: record.version,
    });
  }

  async saveStatus(workspaceId: string, id: string, status: ObligationStatus): Promise<void> {
    await this.db.update(obligations).set({ status }).where(and(eq(obligations.workspaceId, workspaceId), eq(obligations.id, id)));
  }
}

function toObligation(row: typeof obligations.$inferSelect): ObligationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    recipientId: row.recipientId,
    studentActorId: row.studentActorId,
    sourceAccountId: row.sourceAccountId,
    netDue: money(row.currency, row.netDueMinor),
    reference: row.reference,
    dueAt: VirtualInstant.fromDate(row.dueAtVirtual),
    status: row.status as ObligationStatus,
    version: row.version,
  };
}

export class DrizzleFinanceFactsRepository implements FinanceFactsRepository {
  constructor(private readonly db: DbExecutor) {}

  async conditionalIncomes(workspaceId: string): Promise<ConditionalIncome[]> {
    const rows = await this.db.select().from(conditionalIncomes).where(eq(conditionalIncomes.workspaceId, workspaceId));
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as ConditionalIncome["kind"],
      amount: money(row.currency, row.amountMinor),
      expectedAt: VirtualInstant.fromDate(row.expectedAtVirtual),
      condition: row.condition as ConditionalIncome["condition"],
      status: row.status as ConditionalIncome["status"],
    }));
  }

  async expectedExpenses(workspaceId: string): Promise<ExpectedExpense[]> {
    const rows = await this.db.select().from(expectedExpenses).where(eq(expectedExpenses.workspaceId, workspaceId));
    return rows.map((row) => ({ id: row.id, label: row.label, amount: money(row.currency, row.amountMinor), source: row.source as ExpectedExpense["source"] }));
  }

  async insertConditionalIncome(workspaceId: string, income: ConditionalIncome): Promise<void> {
    await this.db.insert(conditionalIncomes).values({
      id: income.id,
      workspaceId,
      kind: income.kind,
      currency: income.amount.currency,
      amountMinor: income.amount.minor,
      expectedAtVirtual: income.expectedAt.toDate(),
      status: income.status,
      condition: income.condition,
    });
  }

  async insertExpectedExpense(workspaceId: string, expense: ExpectedExpense): Promise<void> {
    await this.db.insert(expectedExpenses).values({
      id: expense.id,
      workspaceId,
      label: expense.label,
      currency: expense.amount.currency,
      amountMinor: expense.amount.minor,
      source: expense.source,
    });
  }
}
