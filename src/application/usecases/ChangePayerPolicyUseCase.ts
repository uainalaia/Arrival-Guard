import type { Money } from "@/domain/money/Money";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, VersionConflictError } from "../errors/ApplicationError";
import { applyPolicyChange, policyFingerprint, type PolicyChangeResult } from "../services/PayerPolicyService";
import { loadTuitionContext } from "../services/TuitionContext";

/**
 * T6 desde el panel del pagador: nuevo máximo de matrícula o nueva reserva. Solo el pagador. La huella de la
 * política vigente evita aplicar un cambio sobre datos viejos. Invalida lo que ya no cumple (N11).
 */
export class ChangePayerPolicyUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "hasher" | "ids" | "scenarios">) {}

  async execute(
    actor: ActorContext,
    command: { readonly maxTuitionDebit?: Money; readonly reserve?: Money; readonly expectedFingerprint: string },
  ): Promise<PolicyChangeResult> {
    requireRole(actor, "payer");
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    const channels = this.deps.scenarios.acceptedTuitionChannels(workspace.scenario);
    return this.deps.uow.transaction(async (r) => {
      const ctx = await loadTuitionContext(r, actor.workspaceId, channels, { lock: true });
      const locked = await r.policies.getForAccount(actor.workspaceId, ctx.account.id, { forUpdate: true });
      if (!locked) throw new NotFoundError();
      if (policyFingerprint(locked, this.deps.hasher) !== command.expectedFingerprint) {
        throw new VersionConflictError("The limits changed since you opened this screen. Review them again.");
      }
      return applyPolicyChange(this.deps, r, { ...ctx, policy: locked }, actor, { maxTuitionDebit: command.maxTuitionDebit, reserve: command.reserve });
    });
  }
}
