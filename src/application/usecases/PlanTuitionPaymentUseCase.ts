import { PolicyViolationError } from "@/domain/errors/DomainError";
import { ACTIVE_ATTEMPT_STATUSES, type AttemptStatus } from "@/domain/payment/PaymentAttempt";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { ActiveAttemptExistsError, ValidationError } from "../errors/ApplicationError";
import { loadTuitionContext } from "../services/TuitionContext";
import { applyTuitionPlan, type PlanChange } from "../services/TuitionPlanner";

export interface PlanTuitionCommand {
  readonly targetArrivalHours: number;
}

/**
 * T1, primer paso: arma o corrige el plan de matrícula con cotizaciones nuevas y el motor de políticas.
 * Un cambio material crea una versión nueva e invalida la aprobación anterior; cambiar solo el objetivo, no.
 */
export class PlanTuitionPaymentUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "provider" | "ids" | "scenarios">) {}

  async execute(actor: ActorContext, command: PlanTuitionCommand): Promise<PlanChange> {
    requireRole(actor, "student");
    if (!Number.isInteger(command.targetArrivalHours) || command.targetArrivalHours < 1 || command.targetArrivalHours > 720) {
      throw new ValidationError("targetArrivalHours must be a whole number of hours between 1 and 720");
    }
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    const channels = this.deps.scenarios.acceptedTuitionChannels(workspace?.scenario ?? "base");
    const pre = await loadTuitionContext(this.deps.uow.read, actor.workspaceId, channels);
    const quotes = await this.deps.provider.quoteTuition(
      { workspaceId: actor.workspaceId, now: pre.now },
      { universityRecipientId: pre.university.id, unverifiedRecipientId: pre.unverifiedAgent?.id ?? "rcp-none" },
    );

    return this.deps.uow.transaction(async (r) => {
      const ctx = await loadTuitionContext(r, actor.workspaceId, channels, { lock: true });
      const latest = await r.plans.latestForObligation(actor.workspaceId, ctx.obligation.id);
      const current = latest ? await r.plans.getCurrent(actor.workspaceId, latest.plan.id, { forUpdate: true }) : null;
      const active = ctx.attempts.find((a) => (ACTIVE_ATTEMPT_STATUSES as readonly AttemptStatus[]).includes(a.attempt.status));
      if (active) throw new ActiveAttemptExistsError(active.attempt.id);
      // Una matrícula ya acreditada no se vuelve a planificar: no se crea un plan que reemplace al que la pagó (VC7).
      if (ctx.obligation.status !== "PENDING") throw new PolicyViolationError(["OBLIGATION_NOT_PENDING"]);
      return applyTuitionPlan(this.deps, r, ctx, actor, {
        quotes,
        targetArrivalAt: ctx.now.plusHours(command.targetArrivalHours),
        current,
        mode: "PLAN",
      });
    });
  }
}
