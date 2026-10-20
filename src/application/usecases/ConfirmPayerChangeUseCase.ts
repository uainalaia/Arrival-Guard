import { Money, type MoneyJSON } from "@/domain/money/Money";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, VersionConflictError } from "../errors/ApplicationError";
import { event } from "../services/events";
import { applyPolicyChange } from "../services/PayerPolicyService";
import { loadTuitionContext } from "../services/TuitionContext";

const moneyOrUndefined = (json: unknown): Money | undefined => (json ? Money.fromJSON(json as MoneyJSON) : undefined);

/** Confirmación fija de un cambio preparado por chat. Solo el pagador, con la huella del cambio que ve. */
export class ConfirmPayerChangeUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "hasher" | "ids" | "scenarios">) {}

  async execute(actor: ActorContext, command: { readonly changeId: string; readonly fingerprint: string }) {
    requireRole(actor, "payer");
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    const channels = this.deps.scenarios.acceptedTuitionChannels(workspace.scenario);
    return this.deps.uow.transaction(async (r) => {
      const ctx = await loadTuitionContext(r, actor.workspaceId, channels, { lock: true });
      const change = await r.pendingChanges.get(actor.workspaceId, command.changeId, { forUpdate: true });
      if (!change) throw new NotFoundError();
      if (change.status !== "PENDING") throw new VersionConflictError("This change was already resolved.");
      if (change.fingerprint !== command.fingerprint) throw new VersionConflictError("This change does not match what you reviewed.");

      if (change.kind === "POLICY_CHANGE") {
        const policy = await r.policies.getForAccount(actor.workspaceId, ctx.account.id, { forUpdate: true });
        if (!policy) throw new NotFoundError();
        if (policy.version !== change.payload.basePolicyVersion) throw new VersionConflictError("The limits changed since this was prepared. Prepare it again.");
        const result = await applyPolicyChange(this.deps, r, { ...ctx, policy }, actor, {
          maxTuitionDebit: moneyOrUndefined(change.payload.maxTuitionDebit),
          reserve: moneyOrUndefined(change.payload.reserve),
        });
        await r.pendingChanges.setStatus(actor.workspaceId, change.id, "CONFIRMED");
        return { kind: change.kind, policy: result.policy, invalidatedApprovalIds: result.invalidatedApprovalIds, mandate: null };
      }

      const mandate = await r.mandates.get(actor.workspaceId, String(change.payload.mandateId), { forUpdate: true });
      if (!mandate) throw new NotFoundError();
      if (mandate.version !== change.payload.baseMandateVersion) throw new VersionConflictError("The permission changed since this was prepared. Prepare it again.");
      const subject = { type: "StandingMandate", id: mandate.id };
      if (change.payload.revoke === true) {
        mandate.revoke();
        await r.mandates.save(mandate);
        await r.events.append(actor.workspaceId, [event("MANDATE_REVOKED", actor.role, subject, ctx.now, { mandateId: mandate.id, version: mandate.version })]);
      } else {
        const before = mandate.periodMax;
        mandate.changePeriodMax(Money.fromJSON(change.payload.newPeriodMax as MoneyJSON));
        await r.mandates.save(mandate);
        await r.events.append(actor.workspaceId, [
          event("MANDATE_CHANGED", actor.role, subject, ctx.now, { mandateId: mandate.id, version: mandate.version, before: before.toJSON(), after: mandate.periodMax.toJSON() }),
        ]);
      }
      await r.pendingChanges.setStatus(actor.workspaceId, change.id, "CONFIRMED");
      return { kind: change.kind, policy: null, invalidatedApprovalIds: [], mandate };
    });
  }
}
