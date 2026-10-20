import { tuitionDebitReasons } from "@/domain/cash/CashInvariants";
import { Approval } from "@/domain/consent/Approval";
import { fingerprintPrefix } from "@/domain/consent/ApprovalPayload";
import { PolicyViolationError } from "@/domain/errors/DomainError";
import { isQuoteExpired, type RouteQuote } from "@/domain/policy/RouteQuote";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, VersionConflictError } from "../errors/ApplicationError";
import { event } from "../services/events";
import { approvalPayloadFor, committedToObligation, loadTuitionContext } from "../services/TuitionContext";
import { applyTuitionPlan } from "../services/TuitionPlanner";

export interface GrantApprovalCommand {
  readonly planId: string;
  readonly planVersion: number;
  /** Huella que el pagador vio en la pantalla fija y reenvía al confirmar. */
  readonly fingerprint: string;
}

/**
 * Solo el pagador aprueba, desde su sesión (BUILD_PROMPT 8.4 y 11). Se comprueba versión y huella contra el
 * estado del servidor; con la cotización vencida no se aprueba sobre valores vencidos: se recalcula y se pide
 * revisar de nuevo (O01).
 */
export class GrantApprovalUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "provider" | "hasher" | "ids" | "scenarios">) {}

  async execute(actor: ActorContext, command: GrantApprovalCommand): Promise<Approval> {
    requireRole(actor, "payer");
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    const channels = this.deps.scenarios.acceptedTuitionChannels(workspace.scenario);
    const peek = await this.deps.uow.read.plans.getCurrent(actor.workspaceId, command.planId);
    if (!peek) throw new NotFoundError();
    let fresh: RouteQuote[] | null = null;
    if (peek.plan.status === "APPROVAL_REQUESTED" && peek.quote && isQuoteExpired(peek.quote, workspace.virtualNow)) {
      const ctx = await loadTuitionContext(this.deps.uow.read, actor.workspaceId, channels);
      fresh = await this.deps.provider.quoteTuition(
        { workspaceId: actor.workspaceId, now: ctx.now },
        { universityRecipientId: ctx.university.id, unverifiedRecipientId: ctx.unverifiedAgent?.id ?? "rcp-none" },
      );
    }

    const result = await this.deps.uow.transaction(async (r) => {
      const ctx = await loadTuitionContext(r, actor.workspaceId, channels, { lock: true });
      const record = await r.plans.getCurrent(actor.workspaceId, command.planId, { forUpdate: true });
      if (!record) throw new NotFoundError();
      if (record.plan.version !== command.planVersion) {
        throw new VersionConflictError("This plan changed. Review the new version.", [], record.plan.version);
      }
      if (record.plan.status === "APPROVED") {
        const existing = await r.approvals.findActive(actor.workspaceId, record.plan.id, record.plan.version);
        if (existing && existing.fingerprint === command.fingerprint) return { kind: "APPROVED" as const, approval: existing };
        throw new VersionConflictError("This plan is already approved with a different fingerprint.", [], record.plan.version);
      }
      if (record.plan.status !== "APPROVAL_REQUESTED") {
        throw new VersionConflictError("This plan is not waiting for approval.", [], record.plan.version);
      }
      if (record.quote && isQuoteExpired(record.quote, ctx.now)) {
        if (fresh) {
          const change = await applyTuitionPlan(this.deps, r, ctx, actor, {
            quotes: fresh,
            targetArrivalAt: record.plan.targetArrivalAt,
            current: record,
            mode: "REFRESH",
            reason: "QUOTE_EXPIRED",
          });
          return { kind: "REFRESHED" as const, version: change.record.plan.version };
        }
        return { kind: "REFRESHED" as const, version: record.plan.version };
      }
      const reasons = record.quote
        ? tuitionDebitReasons({
            debit: record.quote.debit,
            funds: ctx.account.funds(),
            reserve: ctx.policy.reserve,
            maxTuitionDebit: ctx.policy.maxTuitionDebit,
            committedToObligation: committedToObligation(ctx.attempts, ctx.account.currency),
          })
        : ["APPROVAL_INVALID" as const];
      if (reasons.length > 0) throw new PolicyViolationError(reasons);

      const payload = approvalPayloadFor(ctx, record, { maxDebit: ctx.policy.maxTuitionDebit, reserve: ctx.policy.reserve });
      if (!payload) throw new VersionConflictError("This plan is not waiting for approval.", [], record.plan.version);
      const approval = Approval.grant({
        id: this.deps.ids.newId(),
        payerActorId: actor.actorId,
        signed: { subjectType: "TUITION_PLAN", payload },
        presentedFingerprint: command.fingerprint,
        hasher: this.deps.hasher,
        now: ctx.now,
      });
      await r.approvals.insert(approval);
      record.plan.transitionTo("APPROVED");
      await r.plans.saveVersion(record);
      await r.events.append(actor.workspaceId, [
        event("APPROVAL_GRANTED", actor.role, { type: "Approval", id: approval.id }, ctx.now, {
          approvalId: approval.id,
          planId: record.plan.id,
          version: record.plan.version,
          fingerprint: approval.fingerprint,
          fingerprintPrefix: fingerprintPrefix(approval.fingerprint),
          routeId: payload.routeId,
          proposedDebit: payload.proposedDebit,
          maxDebit: payload.maxDebit,
          reserve: payload.reserve,
          expiresAt: payload.approvalExpiresAt,
        }),
      ]);
      return { kind: "APPROVED" as const, approval };
    });

    if (result.kind === "REFRESHED") {
      throw new VersionConflictError("The price expired. Review the refreshed plan before approving.", ["QUOTE_EXPIRED"], result.version);
    }
    return result.approval;
  }
}
