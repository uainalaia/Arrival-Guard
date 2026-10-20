import { canonicalJson } from "@/domain/consent/canonicalJson";
import { policyChangeReasons } from "@/domain/consent/MaterialChange";
import type { DomainEventDraft } from "@/domain/events/DomainEvent";
import type { Money } from "@/domain/money/Money";
import type { RouteQuote } from "@/domain/policy/RouteQuote";
import type { HasherPort } from "@/domain/ports/HasherPort";
import type { PayerPolicyRecord, Repositories } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import type { ActorContext } from "../ActorContext";
import { ValidationError } from "../errors/ApplicationError";
import { event } from "./events";
import { approvalPayloadFor, committedToObligation, type TuitionContext } from "./TuitionContext";
import { applyTuitionPlan, type PlanChange } from "./TuitionPlanner";

/** Huella de la política vigente: el panel la reenvía para que un cambio nunca se aplique sobre datos viejos. */
export function policyFingerprint(policy: PayerPolicyRecord, hasher: HasherPort): string {
  return hasher.sha256Hex(
    canonicalJson({
      policyId: policy.id,
      version: policy.version,
      maxTuitionDebit: policy.maxTuitionDebit.toJSON(),
      reserve: policy.reserve.toJSON(),
    }),
  );
}

export interface PolicyChangeResult {
  readonly policy: PayerPolicyRecord;
  readonly invalidatedApprovalIds: readonly string[];
  readonly plan: PlanChange | null;
}

/**
 * Aplica un cambio de política del pagador dentro de una transacción con cuenta y obligación bloqueadas.
 * Si el plan vigente ya no cumple (N11): la aprobación se invalida y el plan se reevalúa con sus mismas
 * cotizaciones en una versión nueva (NOT_VIABLE con la razón), conservando el historial.
 */
export async function applyPolicyChange(
  deps: Pick<AppDeps, "ids">,
  repos: Repositories,
  ctx: TuitionContext,
  actor: ActorContext,
  change: { readonly maxTuitionDebit?: Money; readonly reserve?: Money },
): Promise<PolicyChangeResult> {
  const before = ctx.policy;
  const maxTuitionDebit = change.maxTuitionDebit ?? before.maxTuitionDebit;
  const reserve = change.reserve ?? before.reserve;
  if (maxTuitionDebit.currency !== "USD" || reserve.currency !== "USD") throw new ValidationError("Limits are in USD");
  if (!maxTuitionDebit.isPositive() || reserve.isNegative()) throw new ValidationError("The tuition limit must be positive and the reserve cannot be negative");
  const policy: PayerPolicyRecord = { ...before, maxTuitionDebit, reserve, version: before.version + 1 };
  await repos.policies.save(policy);
  const events: DomainEventDraft[] = [
    event("POLICY_CHANGED", actor.role, { type: "PayerPolicy", id: policy.id }, ctx.now, {
      version: policy.version,
      before: { maxTuitionDebit: before.maxTuitionDebit.toJSON(), reserve: before.reserve.toJSON() },
      after: { maxTuitionDebit: maxTuitionDebit.toJSON(), reserve: reserve.toJSON() },
    }),
  ];
  await repos.events.append(ctx.workspace.id, events);

  const latest = await repos.plans.latestForObligation(ctx.workspace.id, ctx.obligation.id);
  const current = latest ? await repos.plans.getCurrent(ctx.workspace.id, latest.plan.id, { forUpdate: true }) : null;
  if (!current || !current.quote || !current.plan.isBeforeExecution() || current.plan.status === "NOT_VIABLE") {
    return { policy, invalidatedApprovalIds: [], plan: null };
  }
  const payload =
    approvalPayloadFor(ctx, current, { maxDebit: before.maxTuitionDebit, reserve: before.reserve }) ??
    ({ proposedDebit: current.quote.debit.toJSON() } as Parameters<typeof policyChangeReasons>[0]);
  const reasons = policyChangeReasons(payload, { maxTuitionDebit, reserve }, ctx.account.funds(), committedToObligation(ctx.attempts, ctx.account.currency));
  if (reasons.length === 0) return { policy, invalidatedApprovalIds: [], plan: null };

  // El plan ya no cumple: se reevalúa con sus mismas cotizaciones bajo la política nueva.
  const quotes: RouteQuote[] = [...current.evaluation.viable, ...current.evaluation.discarded].map((e) => ({
    quoteId: e.quoteId,
    routeId: e.routeId,
    channel: e.channel,
    receiverId: e.receiverId,
    debit: e.debit,
    net: e.net,
    arrivalMinutes: e.arrivalMinutes,
    quotedAt: ctx.now,
    expiresAt: e.expiresAt,
    providerMessage: null,
  }));
  const plan = await applyTuitionPlan(deps, repos, { ...ctx, policy }, actor, {
    quotes,
    targetArrivalAt: current.plan.targetArrivalAt,
    current,
    mode: "REFRESH",
    reason: "POLICY_CHANGED",
  });
  return { policy, invalidatedApprovalIds: plan.invalidatedApprovalIds, plan };
}
