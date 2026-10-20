import type { Account } from "@/domain/account/Account";
import type { Approval } from "@/domain/consent/Approval";
import type { StandingMandate } from "@/domain/consent/StandingMandate";
import type { ConditionalIncome, ExpectedExpense } from "@/domain/cash/CashProjection";
import type { ActorRole } from "@/domain/events/DomainEvent";
import { Money } from "@/domain/money/Money";
import { visibleTuitionStatus, type VisibleState } from "@/domain/payment/VisibleStatus";
import type {
  ActorRecord,
  AttemptRecord,
  ObligationRecord,
  PayerPolicyRecord,
  PendingChangeRecord,
  PlanVersionRecord,
  RecipientRecord,
  RemittanceRecord,
  StoredEvent,
  WorkspaceRecord,
} from "@/domain/ports/Repositories";
import type { RefundClaim } from "@/domain/refund/RefundClaim";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError } from "../errors/ApplicationError";
import { policyFingerprint } from "../services/PayerPolicyService";
import type { Observation, TuitionPaymentProcessor } from "../services/TuitionPaymentProcessor";

export interface CaseSnapshot {
  readonly role: ActorRole;
  readonly workspace: WorkspaceRecord;
  readonly scenarioLabel: string;
  readonly actors: readonly ActorRecord[];
  readonly obligation: ObligationRecord;
  readonly university: RecipientRecord;
  readonly recipients: readonly RecipientRecord[];
  readonly payerAccount: Account;
  readonly policy: PayerPolicyRecord;
  readonly policyFingerprint: string;
  readonly localAccount: Account;
  readonly localBankName: string | null;
  readonly localRecipient: RecipientRecord | null;
  readonly plan: PlanVersionRecord | null;
  readonly planApprovals: readonly Approval[];
  readonly attempt: AttemptRecord | null;
  readonly visible: VisibleState;
  readonly observation: Observation | null;
  readonly mandate: StandingMandate | null;
  readonly mandateUsed: Money | null;
  readonly conditionalIncomes: readonly ConditionalIncome[];
  readonly expectedExpenses: readonly ExpectedExpense[];
  readonly approvalRequests: readonly PlanVersionRecord[];
  readonly pendingChanges: readonly PendingChangeRecord[];
  readonly events: readonly StoredEvent[];
  readonly remittances: readonly { readonly record: RemittanceRecord; readonly attempt: AttemptRecord | null }[];
  readonly refunds: readonly RefundClaim[];
}

/** Estado verdadero del caso, desde el servidor, para la estudiante o el pagador (GET /api/case). */
export class GetCaseViewUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow" | "hasher" | "scenarios">,
    private readonly processor: TuitionPaymentProcessor,
  ) {}

  async execute(actor: ActorContext): Promise<CaseSnapshot> {
    requireRole(actor, "student", "payer");
    const repos = this.deps.uow.read;
    const ws = actor.workspaceId;
    const workspace = await repos.workspaces.get(ws);
    if (!workspace) throw new NotFoundError();
    const [actors, recipients, obligations, payerAccount, localAccount, conditionalIncomes, expectedExpenses, mandates, events, pendingChanges] = await Promise.all([
      repos.actors.list(ws),
      repos.recipients.list(ws),
      repos.obligations.list(ws),
      repos.accounts.getByKind(ws, "PAYER_USD"),
      repos.accounts.getByKind(ws, "STUDENT_LOCAL_CNY"),
      repos.finance.conditionalIncomes(ws),
      repos.finance.expectedExpenses(ws),
      repos.mandates.list(ws),
      repos.events.list(ws, { limit: 500 }),
      actor.role === "payer" ? repos.pendingChanges.listPending(ws) : Promise.resolve([]),
    ]);
    const university = recipients.find((r) => r.kind === "INSTITUTION");
    const obligation = obligations.find((o) => o.recipientId === university?.id);
    if (!university || !obligation || !payerAccount || !localAccount) throw new NotFoundError();
    const [policy, localBankName, plan, tuitionAttempts] = await Promise.all([
      repos.policies.getForAccount(ws, payerAccount.id),
      repos.accounts.bankName(ws, localAccount.id),
      repos.plans.latestForObligation(ws, obligation.id),
      repos.attempts.listForObligation(ws, obligation.id),
    ]);
    if (!policy) throw new NotFoundError();
    const current = plan ? ((await repos.plans.getCurrent(ws, plan.plan.id)) ?? plan) : null;
    const attempt = tuitionAttempts.filter((a) => a.attempt.kind === "TUITION").at(-1) ?? null;
    const attemptForView =
      attempt && current && attempt.subjectVersion !== current.plan.version && attempt.attempt.status === "FAILED_CONFIRMED" ? null : attempt;
    const planApprovals = current ? await repos.approvals.listForSubject(ws, current.plan.id) : [];
    const mandate = mandates.find((m) => m.status === "ACTIVE") ?? mandates.at(-1) ?? null;
    const remittanceAttempts = (await repos.attempts.listAll(ws)).filter((a) => a.attempt.kind === "REMITTANCE" && a.attempt.toProps().mandateId === mandate?.id);
    const mandateUsed = mandate
      ? mandate.usedInPeriod(
          remittanceAttempts.filter((a) => a.attempt.status !== "FAILED_CONFIRMED").map((a) => ({ debit: a.attempt.debit, at: a.attempt.toProps().createdAt })),
          workspace.virtualNow,
        )
      : null;
    const approvalRequests = current && current.plan.status === "APPROVAL_REQUESTED" ? [current] : [];
    const allAttempts = await repos.attempts.listAll(ws);
    const remittances = (await repos.remittances.list(ws)).map((record) => ({
      record,
      attempt: allAttempts.filter((a) => a.attempt.kind === "REMITTANCE" && a.attempt.toProps().subjectId === record.id).at(-1) ?? null,
    }));
    const refunds = await repos.refunds.list(ws);
    return {
      role: actor.role,
      workspace,
      scenarioLabel: this.deps.scenarios.scenarios().find((s) => s.id === workspace.scenario)?.label ?? workspace.scenario,
      actors,
      obligation,
      university,
      recipients,
      payerAccount,
      policy,
      policyFingerprint: policyFingerprint(policy, this.deps.hasher),
      localAccount,
      localBankName,
      localRecipient: recipients.find((r) => r.kind === "STUDENT_LOCAL") ?? null,
      plan: current,
      planApprovals,
      attempt,
      visible: visibleTuitionStatus(current?.plan ?? null, attemptForView?.attempt ?? null, obligation),
      observation: attempt ? await this.processor.observe(ws, attempt.attempt.id) : null,
      mandate,
      mandateUsed,
      conditionalIncomes,
      expectedExpenses,
      approvalRequests,
      pendingChanges,
      events,
      remittances,
      refunds,
    };
  }
}
