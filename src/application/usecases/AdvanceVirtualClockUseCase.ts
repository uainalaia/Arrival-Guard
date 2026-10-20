import type { VirtualInstant } from "@/domain/time/Instant";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, ValidationError } from "../errors/ApplicationError";
import { event } from "../services/events";
import type { RefundProcessor } from "../services/RefundProcessor";
import type { TuitionPaymentProcessor } from "../services/TuitionPaymentProcessor";

/**
 * Solo el evaluador avanza la hora virtual (BUILD_PROMPT 12). Después procesa lo programado en los simuladores:
 * concilia los intentos en curso del espacio y los reclamos de devolución en trámite. Avanzar la hora virtual nunca
 * extiende credenciales.
 */
export class AdvanceVirtualClockUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow">,
    private readonly processor: TuitionPaymentProcessor,
    private readonly refunds?: RefundProcessor,
  ) {}

  async execute(actor: ActorContext, command: { readonly minutes: number }): Promise<{ readonly virtualNow: VirtualInstant; readonly reconciled: number }> {
    requireRole(actor, "evaluator");
    if (!Number.isInteger(command.minutes) || command.minutes < 1 || command.minutes > 10_080) {
      throw new ValidationError("minutes must be a whole number between 1 and 10080");
    }
    const virtualNow = await this.deps.uow.transaction(async (r) => {
      const workspace = await r.workspaces.get(actor.workspaceId, { forUpdate: true });
      if (!workspace) throw new NotFoundError();
      const next = workspace.virtualNow.plusMinutes(command.minutes);
      await r.workspaces.setVirtualNow(actor.workspaceId, next);
      await r.events.append(actor.workspaceId, [
        event("CLOCK_ADVANCED", actor.role, { type: "Workspace", id: actor.workspaceId }, next, {
          from: workspace.virtualNow.toISOString(),
          to: next.toISOString(),
          minutes: command.minutes,
        }),
      ]);
      return next;
    });
    const active = await this.deps.uow.read.attempts.listActive(actor.workspaceId);
    for (const record of active) await this.processor.reconcile(actor.workspaceId, record.attempt.id, "system");
    // Reclamos de devolución en trámite: la institución puede haber avanzado con la hora virtual (T7).
    const open = this.refunds ? (await this.deps.uow.read.refunds.list(actor.workspaceId)).filter((c) => ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(c.status)) : [];
    for (const claim of open) await this.refunds!.reconcile(actor.workspaceId, claim.id);
    return { virtualNow, reconciled: active.length + open.length };
  }
}
