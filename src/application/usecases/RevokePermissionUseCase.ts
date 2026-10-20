import type { ApprovalStatus } from "@/domain/consent/Approval";
import { ACTIVE_ATTEMPT_STATUSES, type AttemptStatus } from "@/domain/payment/PaymentAttempt";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, ValidationError } from "../errors/ApplicationError";
import { event } from "../services/events";
import { loadTuitionContext } from "../services/TuitionContext";

export interface RevokeResult {
  readonly target: "APPROVAL" | "MANDATE";
  readonly id: string;
  /** true si la revocación impide ejecuciones futuras. */
  readonly revoked: boolean;
  /** Si el pago ya salió: revocar no garantiza detenerlo (BUILD_PROMPT 8.4). */
  readonly inFlightAttemptId: string | null;
  /** Estado de la aprobación ANTES de este pedido (null para el mandato). El mensaje se arma con el estado real. */
  readonly priorStatus: ApprovalStatus | null;
  readonly invalidationReason: string | null;
  /** Estado del intento que usó esta aprobación, si existe. */
  readonly attemptStatus: AttemptStatus | null;
}

/**
 * T6, revocar: si se confirma antes de que empiece la transacción de ejecución, no se envía nada. Si el intento
 * ya pasó a SUBMITTING o a un estado posterior, se informa que revocar no garantiza detenerlo; nunca se promete.
 */
export class RevokePermissionUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "scenarios">) {}

  async execute(actor: ActorContext, command: { readonly approvalId?: string; readonly mandateId?: string }): Promise<RevokeResult> {
    requireRole(actor, "payer");
    if (!command.approvalId === !command.mandateId) throw new ValidationError("Send exactly one of approvalId or mandateId");
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    const channels = this.deps.scenarios.acceptedTuitionChannels(workspace.scenario);

    return this.deps.uow.transaction(async (r) => {
      const ctx = await loadTuitionContext(r, actor.workspaceId, channels, { lock: true });
      if (command.mandateId) {
        const mandate = await r.mandates.get(actor.workspaceId, command.mandateId, { forUpdate: true });
        if (!mandate) throw new NotFoundError();
        const wasActive = mandate.status === "ACTIVE";
        mandate.revoke();
        await r.mandates.save(mandate);
        if (wasActive) {
          await r.events.append(actor.workspaceId, [
            event("MANDATE_REVOKED", actor.role, { type: "StandingMandate", id: mandate.id }, ctx.now, { mandateId: mandate.id, version: mandate.version }),
          ]);
        }
        return { target: "MANDATE" as const, id: mandate.id, revoked: true, inFlightAttemptId: null, priorStatus: null, invalidationReason: null, attemptStatus: null };
      }

      const approval = await r.approvals.get(actor.workspaceId, command.approvalId!, { forUpdate: true });
      if (!approval) throw new NotFoundError();
      if (approval.status === "ACTIVE") {
        const plan = approval.subjectType === "TUITION_PLAN" ? await r.plans.getCurrent(actor.workspaceId, approval.subjectId, { forUpdate: true }) : null;
        approval.revoke();
        await r.approvals.save(approval);
        if (plan && plan.plan.version === approval.subjectVersion && plan.plan.status === "APPROVED") {
          plan.plan.transitionTo("READY_FOR_APPROVAL");
          await r.plans.saveVersion(plan);
        }
        await r.events.append(actor.workspaceId, [
          event("APPROVAL_REVOKED", actor.role, { type: "Approval", id: approval.id }, ctx.now, {
            approvalId: approval.id,
            subjectId: approval.subjectId,
            version: approval.subjectVersion,
            effective: true,
          }),
        ]);
        return { target: "APPROVAL" as const, id: approval.id, revoked: true, inFlightAttemptId: null, priorStatus: "ACTIVE" as const, invalidationReason: null, attemptStatus: null };
      }
      const attempts = await r.attempts.listForSubject(actor.workspaceId, approval.subjectId);
      const used = attempts.find((a) => a.attempt.toProps().approvalId === approval.id) ?? null;
      const inFlight = used && (ACTIVE_ATTEMPT_STATUSES as readonly AttemptStatus[]).includes(used.attempt.status) ? used : null;
      return {
        target: "APPROVAL" as const,
        id: approval.id,
        revoked: false,
        inFlightAttemptId: inFlight?.attempt.id ?? null,
        priorStatus: approval.status,
        invalidationReason: approval.invalidationReason,
        attemptStatus: used?.attempt.status ?? null,
      };
    });
  }
}
