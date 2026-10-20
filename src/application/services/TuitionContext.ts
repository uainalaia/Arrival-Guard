import type { Account } from "@/domain/account/Account";
import { buildTuitionApprovalPayload, type TuitionApprovalPayload } from "@/domain/consent/ApprovalPayload";
import { Money } from "@/domain/money/Money";
import type { AttemptStatus } from "@/domain/payment/PaymentAttempt";
import type { ObligationFacts, TuitionRoutingFacts } from "@/domain/policy/PolicyEngine";
import type { RouteQuote } from "@/domain/policy/RouteQuote";
import type {
  AttemptRecord,
  ObligationRecord,
  PayerPolicyRecord,
  PlanVersionRecord,
  RecipientRecord,
  Repositories,
  WorkspaceRecord,
} from "@/domain/ports/Repositories";
import type { VirtualInstant } from "@/domain/time/Instant";
import { NotFoundError } from "../errors/ApplicationError";

/** Estados cuyo débito cuenta para el máximo acumulado por obligación (confirmado o posible). */
const COMMITTED_STATUSES: readonly AttemptStatus[] = ["SUBMITTING", "UNKNOWN", "PROVIDER_ACCEPTED", "PENDING_UNIVERSITY", "CREDITED"];

export interface TuitionContext {
  readonly workspace: WorkspaceRecord;
  readonly now: VirtualInstant;
  readonly obligation: ObligationRecord;
  readonly account: Account;
  readonly policy: PayerPolicyRecord;
  readonly university: RecipientRecord;
  readonly unverifiedAgent: RecipientRecord | null;
  readonly attempts: readonly AttemptRecord[];
  readonly acceptedChannels: readonly string[];
}

/**
 * Carga lo que necesita cualquier operación de matrícula. Con `lock`, bloquea en el orden fijo de
 * BUILD_PROMPT 10: cuenta, después obligación (el plan se bloquea después, en cada caso de uso).
 */
export async function loadTuitionContext(
  repos: Repositories,
  workspaceId: string,
  acceptedChannels: readonly string[],
  options: { readonly lock: boolean } = { lock: false },
): Promise<TuitionContext> {
  const workspace = await repos.workspaces.get(workspaceId);
  if (!workspace) throw new NotFoundError();
  const account = await repos.accounts.getByKind(workspaceId, "PAYER_USD", { forUpdate: options.lock });
  const recipients = await repos.recipients.list(workspaceId);
  const university = recipients.find((r) => r.kind === "INSTITUTION");
  if (!account || !university) throw new NotFoundError();
  const tuition = (await repos.obligations.list(workspaceId)).find((o) => o.recipientId === university.id);
  if (!tuition) throw new NotFoundError();
  const obligation = options.lock ? await repos.obligations.get(workspaceId, tuition.id, { forUpdate: true }) : tuition;
  const policy = await repos.policies.getForAccount(workspaceId, account.id);
  if (!obligation || !policy) throw new NotFoundError();
  const attempts = await repos.attempts.listForObligation(workspaceId, obligation.id);
  return {
    workspace,
    now: workspace.virtualNow,
    obligation,
    account,
    policy,
    university,
    unverifiedAgent: recipients.find((r) => r.kind === "EXTERNAL") ?? null,
    attempts,
    acceptedChannels,
  };
}

export function committedToObligation(attempts: readonly AttemptRecord[], currency: Money["currency"]): Money {
  return Money.sum(
    currency,
    attempts.filter((a) => COMMITTED_STATUSES.includes(a.attempt.status)).map((a) => a.attempt.debit),
  );
}

export function obligationFacts(obligation: ObligationRecord): ObligationFacts {
  return {
    id: obligation.id,
    version: obligation.version,
    status: obligation.status,
    netDue: obligation.netDue,
    recipientId: obligation.recipientId,
    dueAt: obligation.dueAt,
    reference: obligation.reference,
  };
}

export function routingFacts(ctx: TuitionContext, quotes: readonly RouteQuote[], targetArrivalAt: VirtualInstant): TuitionRoutingFacts {
  return {
    now: ctx.now,
    obligation: obligationFacts(ctx.obligation),
    funds: ctx.account.funds(),
    policy: { maxTuitionDebit: ctx.policy.maxTuitionDebit, reserve: ctx.policy.reserve },
    committedToObligation: committedToObligation(ctx.attempts, ctx.account.currency),
    acceptedChannels: ctx.acceptedChannels,
    targetArrivalAt,
    quotes,
  };
}

/** Payload canónico de la aprobación, armado SOLO con estado del servidor (BUILD_PROMPT 8.4). */
export function approvalPayloadFor(
  ctx: TuitionContext,
  record: PlanVersionRecord,
  limits: { readonly maxDebit: Money; readonly reserve: Money },
): TuitionApprovalPayload | null {
  const { plan, quote } = record;
  if (!quote || !plan.approvalExpiresAt) return null;
  return buildTuitionApprovalPayload({
    workspaceId: ctx.workspace.id,
    obligationId: ctx.obligation.id,
    obligationVersion: ctx.obligation.version,
    planId: plan.id,
    planVersion: plan.version,
    routeId: quote.routeId,
    channel: quote.channel,
    receiverId: quote.receiverId,
    reference: ctx.obligation.reference,
    sourceAccountId: ctx.account.id,
    proposedDebit: quote.debit,
    netAmount: quote.net,
    maxDebit: limits.maxDebit,
    reserve: limits.reserve,
    quoteId: quote.quoteId,
    approvalExpiresAt: plan.approvalExpiresAt,
  });
}
