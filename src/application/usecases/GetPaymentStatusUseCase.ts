import { visibleTuitionStatus, type VisibleState } from "@/domain/payment/VisibleStatus";
import type { AttemptRecord, PlanVersionRecord } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError } from "../errors/ApplicationError";
import type { Observation, TuitionPaymentProcessor } from "../services/TuitionPaymentProcessor";

export interface PaymentStatus {
  readonly attempt: AttemptRecord | null;
  readonly plan: PlanVersionRecord | null;
  readonly visible: VisibleState;
  readonly observation: Observation | null;
}

/**
 * T2: estado observado con su origen (proveedor o institución, hora virtual) y siguiente paso.
 * Nunca afirma acreditación sin recibo: "Credited" solo con un intento CREDITED y su recibo.
 */
export class GetPaymentStatusUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow">,
    private readonly processor: TuitionPaymentProcessor,
  ) {}

  async execute(actor: ActorContext, command: { readonly attemptId?: string } = {}): Promise<PaymentStatus> {
    requireRole(actor, "student", "payer");
    const repos = this.deps.uow.read;
    let attempt: AttemptRecord | null = null;
    if (command.attemptId) {
      attempt = await repos.attempts.get(actor.workspaceId, command.attemptId);
      if (!attempt) throw new NotFoundError();
    }
    const university = (await repos.recipients.list(actor.workspaceId)).find((r) => r.kind === "INSTITUTION");
    const obligation = (await repos.obligations.list(actor.workspaceId)).find((o) => o.recipientId === university?.id) ?? null;
    if (!attempt && obligation) {
      const attempts = (await repos.attempts.listForObligation(actor.workspaceId, obligation.id)).filter((a) => a.attempt.kind === "TUITION");
      attempt = attempts.at(-1) ?? null;
    }
    const plan = attempt
      ? await repos.plans.getVersion(actor.workspaceId, attempt.attempt.toProps().subjectId, attempt.subjectVersion)
      : obligation
        ? await repos.plans.latestForObligation(actor.workspaceId, obligation.id)
        : null;
    // Si el plan vigente es más nuevo que el del último intento fallido, manda el plan vigente.
    const currentPlan = plan ? ((await repos.plans.getCurrent(actor.workspaceId, plan.plan.id)) ?? plan) : null;
    const attemptForView = attempt && currentPlan && attempt.subjectVersion !== currentPlan.plan.version && attempt.attempt.status === "FAILED_CONFIRMED" ? null : attempt;
    return {
      attempt,
      plan: currentPlan,
      visible: visibleTuitionStatus(currentPlan?.plan ?? null, attemptForView?.attempt ?? null, obligation),
      observation: attempt ? await this.processor.observe(actor.workspaceId, attempt.attempt.id) : null,
    };
  }
}
