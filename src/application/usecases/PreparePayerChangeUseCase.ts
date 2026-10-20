import { canonicalJson } from "@/domain/consent/canonicalJson";
import type { Money } from "@/domain/money/Money";
import type { PendingChangeRecord } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, ValidationError } from "../errors/ApplicationError";
import { loadTuitionContext } from "../services/TuitionContext";

export type PayerChangeRequest =
  | { readonly kind: "POLICY_CHANGE"; readonly maxTuitionDebit?: Money; readonly reserve?: Money }
  | { readonly kind: "MANDATE_CHANGE"; readonly mandateId: string; readonly newPeriodMax?: Money; readonly revoke?: boolean };

/**
 * T6 iniciado por chat (herramientas prepare_policy_change y prepare_mandate_change): solo PREPARA el cambio.
 * Se aplica únicamente cuando el pagador lo confirma en la pantalla fija /w/[id]/payer/changes/[changeId].
 */
export class PreparePayerChangeUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "hasher" | "ids" | "scenarios">) {}

  async execute(actor: ActorContext, request: PayerChangeRequest): Promise<PendingChangeRecord> {
    requireRole(actor, "payer");
    const repos = this.deps.uow.read;
    const workspace = await repos.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    const id = this.deps.ids.newId();
    let payload: Record<string, unknown>;
    if (request.kind === "POLICY_CHANGE") {
      if (!request.maxTuitionDebit && !request.reserve) throw new ValidationError("Say what should change: the tuition limit, the reserve or both");
      const ctx = await loadTuitionContext(repos, actor.workspaceId, this.deps.scenarios.acceptedTuitionChannels(workspace.scenario));
      payload = {
        basePolicyVersion: ctx.policy.version,
        maxTuitionDebit: request.maxTuitionDebit?.toJSON() ?? null,
        reserve: request.reserve?.toJSON() ?? null,
      };
    } else {
      const mandate = await repos.mandates.get(actor.workspaceId, request.mandateId);
      if (!mandate) throw new NotFoundError();
      if (!request.revoke && !request.newPeriodMax) throw new ValidationError("Say whether to change the period limit or revoke the permission");
      payload = {
        mandateId: mandate.id,
        baseMandateVersion: mandate.version,
        newPeriodMax: request.newPeriodMax?.toJSON() ?? null,
        revoke: request.revoke === true,
      };
    }
    const fingerprint = this.deps.hasher.sha256Hex(canonicalJson({ changeId: id, workspaceId: actor.workspaceId, kind: request.kind, payload }));
    const record: PendingChangeRecord = { id, workspaceId: actor.workspaceId, kind: request.kind, payload, fingerprint, status: "PENDING", createdByActorId: actor.actorId };
    await this.deps.uow.transaction((r) => r.pendingChanges.insert(record));
    return record;
  }
}
