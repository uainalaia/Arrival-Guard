import { evaluateTuitionRoutes, type TuitionRoutingResult } from "@/domain/policy/PolicyEngine";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { ValidationError } from "../errors/ApplicationError";
import { loadTuitionContext, routingFacts } from "../services/TuitionContext";

export interface CompareTuitionRoutesCommand {
  readonly targetArrivalHours: number;
}

/** T5: compara rutas de matrícula. No crea plan, permiso, intento ni débito (N10). */
export class CompareRoutesUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "provider" | "scenarios">) {}

  async tuition(actor: ActorContext, command: CompareTuitionRoutesCommand): Promise<TuitionRoutingResult> {
    requireRole(actor, "student", "payer");
    if (!Number.isInteger(command.targetArrivalHours) || command.targetArrivalHours < 1 || command.targetArrivalHours > 720) {
      throw new ValidationError("targetArrivalHours must be a whole number of hours between 1 and 720");
    }
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    const channels = this.deps.scenarios.acceptedTuitionChannels(workspace?.scenario ?? "base");
    const ctx = await loadTuitionContext(this.deps.uow.read, actor.workspaceId, channels);
    const quotes = await this.deps.provider.quoteTuition(
      { workspaceId: actor.workspaceId, now: ctx.now },
      { universityRecipientId: ctx.university.id, unverifiedRecipientId: ctx.unverifiedAgent?.id ?? "rcp-none" },
    );
    return evaluateTuitionRoutes(routingFacts(ctx, quotes, ctx.now.plusHours(command.targetArrivalHours)));
  }
}
