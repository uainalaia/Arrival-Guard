import type { DomainEventDraft } from "@/domain/events/DomainEvent";
import type { RefundStatus } from "@/domain/refund/RefundClaim";
import type { AppDeps } from "../AppDeps";
import { NotFoundError } from "../errors/ApplicationError";
import { event } from "./events";

const ORDER: readonly RefundStatus[] = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REFUNDED"];

/**
 * Seguimiento de un reclamo de devolución (T7) contra la institución. Avanza por SUBMITTED, UNDER_REVIEW, APPROVED y
 * REFUNDED según lo que informa la institución; al llegar a REFUNDED abona la liquidación en la cuenta de origen una
 * sola vez (la transición solo ocurre una vez bajo bloqueo).
 */
export class RefundProcessor {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "institution">) {}

  async reconcile(workspaceId: string, claimId: string): Promise<void> {
    const peek = await this.deps.uow.read.refunds.get(workspaceId, claimId);
    if (!peek) throw new NotFoundError();
    const institutionClaimId = peek.institutionClaimId;
    if (!institutionClaimId || peek.status === "REFUNDED" || peek.status === "REJECTED" || peek.status === "DRAFT") return;
    const workspace = await this.deps.uow.read.workspaces.get(workspaceId);
    if (!workspace) throw new NotFoundError();
    const remote = await this.deps.institution.getRefundStatus({ workspaceId, now: workspace.virtualNow }, institutionClaimId);
    if (!remote) return;

    await this.deps.uow.transaction(async (r) => {
      const account = await r.accounts.getByKind(workspaceId, "PAYER_USD", { forUpdate: true });
      const claim = await r.refunds.get(workspaceId, claimId, { forUpdate: true });
      if (!claim || !account) throw new NotFoundError();
      const events: DomainEventDraft[] = [];
      const subject = { type: "RefundClaim", id: claim.id };
      if (remote.status === "REJECTED") {
        if (claim.status === "SUBMITTED" || claim.status === "UNDER_REVIEW") {
          claim.transitionTo("REJECTED");
          events.push(event("REFUND_CLAIM_UPDATED", "system", subject, workspace.virtualNow, { claimId: claim.id, status: "REJECTED" }));
        }
      } else {
        const target = ORDER.indexOf(remote.status);
        while (ORDER.indexOf(claim.status) < target) {
          const next = ORDER[ORDER.indexOf(claim.status) + 1]!;
          if (next === "REFUNDED") {
            if (!remote.settlement) break;
            claim.markRefunded(remote.settlement);
            if (claim.destinationAccountId === account.id) account.credit(remote.settlement);
            events.push(
              event("REFUND_CLAIM_UPDATED", "system", subject, workspace.virtualNow, {
                claimId: claim.id,
                status: "REFUNDED",
                settlement: remote.settlement.toJSON(),
                settledAt: remote.settledAt?.toISOString() ?? null,
              }),
            );
          } else {
            claim.transitionTo(next);
            events.push(event("REFUND_CLAIM_UPDATED", "system", subject, workspace.virtualNow, { claimId: claim.id, status: next }));
          }
        }
      }
      if (events.length === 0) return;
      await r.refunds.save(claim);
      await r.accounts.save(account);
      await r.events.append(workspaceId, events);
    });
  }
}
