import { FAULT_NAMES, type FaultName } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, ValidationError } from "../errors/ApplicationError";
import { event } from "../services/events";

/** Consola del evaluador: activa o desactiva una falla inyectable (BUILD_PROMPT 6.5). Queda registrada. */
export class InjectFaultUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow">) {}

  async execute(actor: ActorContext, command: { readonly fault: string; readonly enabled: boolean }): Promise<{ readonly fault: FaultName; readonly enabled: boolean }> {
    requireRole(actor, "evaluator");
    if (!(FAULT_NAMES as readonly string[]).includes(command.fault)) throw new ValidationError(`Unknown fault: ${command.fault}`);
    const fault = command.fault as FaultName;
    await this.deps.uow.transaction(async (r) => {
      const workspace = await r.workspaces.get(actor.workspaceId, { forUpdate: true });
      if (!workspace) throw new NotFoundError();
      await r.workspaces.setFault(actor.workspaceId, fault, command.enabled);
      await r.events.append(actor.workspaceId, [
        event("FAULT_INJECTED", actor.role, { type: "Workspace", id: actor.workspaceId }, workspace.virtualNow, { fault, enabled: command.enabled }),
      ]);
    });
    return { fault, enabled: command.enabled };
  }
}
