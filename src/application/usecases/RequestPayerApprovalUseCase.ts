import { approvalExpiry } from "@/domain/consent/Approval";
import { PolicyViolationError } from "@/domain/errors/DomainError";
import { sortReasons } from "@/domain/policy/ReasonCode";
import { isQuoteExpired, type RouteQuote } from "@/domain/policy/RouteQuote";
import type { PlanVersionRecord } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, VersionConflictError } from "../errors/ApplicationError";
import { event } from "../services/events";
import { loadTuitionContext } from "../services/TuitionContext";
import { applyTuitionPlan } from "../services/TuitionPlanner";

/**
 * La estudiante pide la aprobación de Carlos para la versión vigente del plan. Fija la vigencia de la aprobación
 * (24 h virtuales o el vencimiento) que entra en la huella. Si la cotización venció, primero se recalcula: no se
 * pide aprobar sobre valores vencidos (O01).
 */
export class RequestPayerApprovalUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "provider" | "ids" | "scenarios">) {}

  async execute(actor: ActorContext, command: { readonly planId: string }): Promise<PlanVersionRecord> {
    requireRole(actor, "student");
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    const channels = this.deps.scenarios.acceptedTuitionChannels(workspace.scenario);
    const validity = this.deps.scenarios.approvalValidityHours(workspace.scenario);
    const peek = await this.deps.uow.read.plans.getCurrent(actor.workspaceId, command.planId);
    if (!peek) throw new NotFoundError();
    let fresh: RouteQuote[] | null = null;
    if (peek.quote && isQuoteExpired(peek.quote, workspace.virtualNow)) {
      const ctx = await loadTuitionContext(this.deps.uow.read, actor.workspaceId, channels);
      fresh = await this.deps.provider.quoteTuition(
        { workspaceId: actor.workspaceId, now: ctx.now },
        { universityRecipientId: ctx.university.id, unverifiedRecipientId: ctx.unverifiedAgent?.id ?? "rcp-none" },
      );
    }

    const outcome = await this.deps.uow.transaction(async (r) => {
      const ctx = await loadTuitionContext(r, actor.workspaceId, channels, { lock: true });
      let record = await r.plans.getCurrent(actor.workspaceId, command.planId, { forUpdate: true });
      if (!record) throw new NotFoundError();
      if (record.plan.status === "APPROVAL_REQUESTED" || record.plan.status === "APPROVED") return { record, refreshed: false };
      if (record.plan.status === "NOT_VIABLE") {
        const reasons = record.evaluation.blockers.length ? record.evaluation.blockers : record.evaluation.discarded.flatMap((d) => d.reasons);
        throw new PolicyViolationError(sortReasons(reasons));
      }
      if (record.plan.status !== "READY_FOR_APPROVAL") throw new VersionConflictError("This plan cannot ask for approval in its current state.");
      if (record.quote && isQuoteExpired(record.quote, ctx.now) && fresh) {
        const change = await applyTuitionPlan(this.deps, r, ctx, actor, {
          quotes: fresh,
          targetArrivalAt: record.plan.targetArrivalAt,
          current: record,
          mode: "REFRESH",
          reason: "QUOTE_EXPIRED",
        });
        record = change.record;
        // Si el precio nuevo cambió la ruta, la estudiante ve el plan nuevo antes de pedir la aprobación.
        if (change.outcome === "NEW_VERSION" || record.plan.status !== "READY_FOR_APPROVAL") return { record, refreshed: true };
      }
      const expiresAt = approvalExpiry(ctx.now, ctx.obligation.dueAt, validity);
      record.plan.requestApproval(ctx.now, expiresAt);
      await r.plans.saveVersion(record);
      await r.events.append(actor.workspaceId, [
        event("APPROVAL_REQUESTED", actor.role, { type: "PaymentPlan", id: record.plan.id }, ctx.now, {
          planId: record.plan.id,
          version: record.plan.version,
          routeId: record.quote?.routeId ?? null,
          proposedDebit: record.quote?.debit.toJSON() ?? null,
          approvalExpiresAt: expiresAt.toISOString(),
        }),
      ]);
      return { record, refreshed: false };
    });
    if (outcome.record.plan.status === "NOT_VIABLE") {
      throw new PolicyViolationError(sortReasons(outcome.record.evaluation.discarded.flatMap((d) => d.reasons)));
    }
    return outcome.record;
  }
}
