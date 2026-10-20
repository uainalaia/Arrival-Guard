import { Approval } from "@/domain/consent/Approval";
import { buildRemittanceApprovalPayload, fingerprintOf, type RemittanceApprovalPayload } from "@/domain/consent/ApprovalPayload";
import { isQuoteExpired } from "@/domain/policy/RouteQuote";
import type { RecipientRecord, RemittanceRecord } from "@/domain/ports/Repositories";
import type { VirtualInstant } from "@/domain/time/Instant";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, VersionConflictError } from "../errors/ApplicationError";
import { event } from "../services/events";
import { loadRemittanceContext } from "../services/RemittanceContext";

export interface RemittanceApprovalView {
  readonly remittance: RemittanceRecord;
  readonly recipient: RecipientRecord;
  readonly payload: RemittanceApprovalPayload | null;
  readonly fingerprint: string | null;
  readonly approval: Approval | null;
  readonly quoteExpired: boolean;
  readonly now: VirtualInstant;
  readonly sourceAccountMasked: string;
}

/**
 * Aprobación puntual de una remesa fuera del permiso permanente (T3, N17). Solo el pagador, en su pantalla fija, con la
 * huella del payload canónico de esta versión de la remesa (BUILD_PROMPT 8.4). Aprobar no ejecuta: la estudiante (o el
 * agente) envía después, y el servidor exige la aprobación vigente e íntegra.
 */
export class RemittanceApprovalUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "hasher" | "ids">) {}

  async view(actor: ActorContext, command: { readonly remittanceId: string }): Promise<RemittanceApprovalView> {
    requireRole(actor, "payer");
    const ctx = await loadRemittanceContext(this.deps.uow.read, actor.workspaceId);
    const remittance = await this.deps.uow.read.remittances.get(actor.workspaceId, command.remittanceId);
    if (!remittance) throw new NotFoundError();
    const approval = remittance.approvalId ? await this.deps.uow.read.approvals.get(actor.workspaceId, remittance.approvalId) : null;
    const payload = this.payloadFor(remittance, ctx.account.id, ctx.account.earmarkRemaining("ARRIVAL_EXPENSES"));
    return {
      remittance,
      recipient: ctx.recipient,
      payload,
      fingerprint: payload ? fingerprintOf(payload, this.deps.hasher) : null,
      approval,
      quoteExpired: remittance.quote ? isQuoteExpired(remittance.quote, ctx.now) : false,
      now: ctx.now,
      sourceAccountMasked: ctx.account.toProps().maskedNumber,
    };
  }

  async grant(actor: ActorContext, command: { readonly remittanceId: string; readonly version: number; readonly fingerprint: string }): Promise<Approval> {
    requireRole(actor, "payer");
    return this.deps.uow.transaction(async (r) => {
      const ctx = await loadRemittanceContext(r, actor.workspaceId, { lock: true });
      const remittance = await r.remittances.get(actor.workspaceId, command.remittanceId, { forUpdate: true });
      if (!remittance) throw new NotFoundError();
      if (remittance.version !== command.version) throw new VersionConflictError("This transfer changed. Review the new version.", [], remittance.version);
      if (remittance.status === "APPROVED" && remittance.approvalId) {
        const existing = await r.approvals.get(actor.workspaceId, remittance.approvalId);
        if (existing && existing.fingerprint === command.fingerprint) return existing;
      }
      if (remittance.status !== "APPROVAL_REQUESTED") throw new VersionConflictError("This transfer is not waiting for approval.", [], remittance.version);
      if (remittance.quote && isQuoteExpired(remittance.quote, ctx.now)) {
        throw new VersionConflictError("The price expired. Sofía needs to prepare the transfer again.", ["QUOTE_EXPIRED"], remittance.version);
      }
      const payload = this.payloadFor(remittance, ctx.account.id, ctx.account.earmarkRemaining("ARRIVAL_EXPENSES"));
      if (!payload) throw new VersionConflictError("This transfer has no route to approve.", [], remittance.version);
      const approval = Approval.grant({
        id: this.deps.ids.newId(),
        payerActorId: actor.actorId,
        signed: { subjectType: "REMITTANCE", payload },
        presentedFingerprint: command.fingerprint,
        hasher: this.deps.hasher,
        now: ctx.now,
      });
      await r.approvals.insert(approval);
      await r.remittances.save({ ...remittance, status: "APPROVED", approvalId: approval.id });
      await r.events.append(actor.workspaceId, [
        event("APPROVAL_GRANTED", actor.role, { type: "Approval", id: approval.id }, ctx.now, {
          remittanceId: remittance.id,
          version: remittance.version,
          fingerprint: approval.fingerprint,
          debit: remittance.quote!.debit.toJSON(),
        }),
      ]);
      return approval;
    });
  }

  private payloadFor(remittance: RemittanceRecord, sourceAccountId: string, reserve: RemittanceRecord["net"]): RemittanceApprovalPayload | null {
    const quote = remittance.quote;
    if (!quote || !remittance.approvalExpiresAt) return null;
    return buildRemittanceApprovalPayload({
      workspaceId: remittance.workspaceId,
      remittanceId: remittance.id,
      remittanceVersion: remittance.version,
      routeId: quote.routeId,
      channel: quote.channel,
      recipientId: remittance.recipientId,
      purpose: remittance.purpose,
      sourceAccountId,
      proposedDebit: quote.debit,
      netAmount: remittance.net,
      maxDebit: quote.debit,
      reserve,
      quoteId: quote.quoteId,
      approvalExpiresAt: remittance.approvalExpiresAt,
    });
  }
}
