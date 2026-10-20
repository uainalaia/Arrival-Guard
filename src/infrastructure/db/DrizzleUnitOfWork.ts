import type { Repositories, UnitOfWork } from "@/domain/ports/Repositories";
import { getDb, type Db } from "./client";
import type { DbExecutor } from "./executor";
import {
  DrizzleAccountRepository,
  DrizzleFinanceFactsRepository,
  DrizzleObligationRepository,
  DrizzlePolicyRepository,
  DrizzleRecipientRepository,
} from "./repositories/financeRepositories";
import {
  DrizzleApprovalRepository,
  DrizzleAttemptRepository,
  DrizzleMandateRepository,
  DrizzlePlanRepository,
  DrizzleRefundRepository,
  DrizzleRemittanceRepository,
} from "./repositories/paymentRepositories";
import {
  DrizzleActorRepository,
  DrizzleEventRepository,
  DrizzlePendingChangeRepository,
  DrizzleProviderEventReceiptRepository,
  DrizzleWorkspaceRepository,
} from "./repositories/workspaceRepositories";

export function repositoriesFor(db: DbExecutor): Repositories {
  return {
    workspaces: new DrizzleWorkspaceRepository(db),
    actors: new DrizzleActorRepository(db),
    accounts: new DrizzleAccountRepository(db),
    policies: new DrizzlePolicyRepository(db),
    recipients: new DrizzleRecipientRepository(db),
    obligations: new DrizzleObligationRepository(db),
    plans: new DrizzlePlanRepository(db),
    approvals: new DrizzleApprovalRepository(db),
    attempts: new DrizzleAttemptRepository(db),
    mandates: new DrizzleMandateRepository(db),
    refunds: new DrizzleRefundRepository(db),
    remittances: new DrizzleRemittanceRepository(db),
    finance: new DrizzleFinanceFactsRepository(db),
    events: new DrizzleEventRepository(db),
    providerReceipts: new DrizzleProviderEventReceiptRepository(db),
    pendingChanges: new DrizzlePendingChangeRepository(db),
  };
}

/** Unidad de trabajo sobre Postgres: cada `transaction` es una transacción real con repositorios ligados a ella. */
export class DrizzleUnitOfWork implements UnitOfWork {
  readonly read: Repositories;

  constructor(private readonly db: Db = getDb()) {
    this.read = repositoriesFor(db);
  }

  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(repositoriesFor(tx)));
  }
}
