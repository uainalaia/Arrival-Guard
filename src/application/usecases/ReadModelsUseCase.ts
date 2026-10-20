import type { PendingChangeRecord, StoredEvent, WorkspaceRecord } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError } from "../errors/ApplicationError";

/** Lecturas simples sin efectos: sesión actual, bitácora del evaluador y cambio pendiente del pagador. */
export class ReadModelsUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow">) {}

  async session(actor: ActorContext): Promise<{ workspace: WorkspaceRecord; displayName: string; people: { student: string; payer: string } }> {
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    const actors = await this.deps.uow.read.actors.list(actor.workspaceId);
    return {
      workspace,
      displayName: actors.find((a) => a.id === actor.actorId)?.displayName ?? actor.role,
      // Nombres sintéticos de los dos personajes, para el selector de rol (incluida la consola).
      people: {
        student: actors.find((a) => a.role === "student")?.displayName ?? "Student",
        payer: actors.find((a) => a.role === "payer")?.displayName ?? "Payer",
      },
    };
  }

  /** Bitácora completa redactada (solo la consola del evaluador). */
  async events(actor: ActorContext, afterSeq = 0): Promise<StoredEvent[]> {
    requireRole(actor, "evaluator");
    return this.deps.uow.read.events.list(actor.workspaceId, { afterSeq, limit: 1000 });
  }

  async pendingChange(actor: ActorContext, changeId: string): Promise<PendingChangeRecord> {
    requireRole(actor, "payer");
    const change = await this.deps.uow.read.pendingChanges.get(actor.workspaceId, changeId);
    if (!change) throw new NotFoundError();
    return change;
  }
}
