import { RefundClaim } from "@/domain/refund/RefundClaim";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { IdempotencyConflictError, NotFoundError } from "../errors/ApplicationError";
import { event } from "../services/events";
import type { RefundProcessor } from "../services/RefundProcessor";

/**
 * T7, preparar un reclamo de devolución (enmienda A2): el monto es el exceso verificado contra el libro de la
 * institución y el destino es siempre la cuenta que pagó. Sin exceso verificado no hay reclamo
 * (REFUND_EXCEEDS_VERIFIED_EXCESS, N14). Si ya hay un reclamo abierto para la obligación, se devuelve ese: la búsqueda y
 * el alta van bajo el bloqueo de la obligación, así que preparaciones en paralelo dejan un solo reclamo (VC9-1).
 */
export class PrepareRefundClaimUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "institution" | "ids">) {}

  async execute(actor: ActorContext, command: { readonly obligationId: string }): Promise<RefundClaim> {
    requireRole(actor, "student");
    const repos = this.deps.uow.read;
    const workspace = await repos.workspaces.get(actor.workspaceId);
    const obligation = await repos.obligations.get(actor.workspaceId, command.obligationId);
    if (!workspace || !obligation) throw new NotFoundError();
    const ledger = await this.deps.institution.getLedger({ workspaceId: actor.workspaceId, now: workspace.virtualNow }, obligation.reference);
    const account = await repos.accounts.getByKind(actor.workspaceId, "PAYER_USD");
    if (!account) throw new NotFoundError();
    return this.deps.uow.transaction(async (r) => {
      if (!(await r.obligations.get(actor.workspaceId, obligation.id, { forUpdate: true }))) throw new NotFoundError();
      const open = (await r.refunds.list(actor.workspaceId)).find((c) => c.toProps().obligationId === obligation.id && c.status !== "REJECTED" && c.status !== "REFUNDED");
      if (open) return open;
      const claim = RefundClaim.prepare({
        id: this.deps.ids.newId(),
        workspaceId: actor.workspaceId,
        obligationId: obligation.id,
        verifiedExcess: ledger.verifiedExcess,
        sourceAccountId: account.id,
      });
      await r.refunds.insert(claim, actor.actorId, null);
      return claim;
    });
  }
}

/**
 * T7, enviar el reclamo con Idempotency-Key. La institución recibe el monto y el destino fijo; el seguimiento hasta
 * REFUNDED lo hace RefundProcessor al avanzar la hora virtual.
 */
export class SubmitRefundClaimUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow" | "institution">,
    private readonly processor: RefundProcessor,
  ) {}

  async execute(actor: ActorContext, command: { readonly claimId: string; readonly idempotencyKey: string }): Promise<{ claim: RefundClaim; replayed: boolean }> {
    requireRole(actor, "student");
    const repos = this.deps.uow.read;
    const claim = await repos.refunds.get(actor.workspaceId, command.claimId);
    if (!claim) throw new NotFoundError();
    const storedKey = await repos.refunds.idempotencyKey(actor.workspaceId, claim.id);
    if (claim.status !== "DRAFT") {
      // Ya enviado: la misma clave repite el resultado; otra clave no crea un segundo reclamo.
      if (storedKey && storedKey !== command.idempotencyKey) throw new IdempotencyConflictError("This refund request was already submitted.");
      return { claim, replayed: true };
    }
    const workspace = await repos.workspaces.get(actor.workspaceId);
    const obligation = await repos.obligations.get(actor.workspaceId, claim.toProps().obligationId);
    const account = await repos.accounts.getByKind(actor.workspaceId, "PAYER_USD");
    if (!workspace || !obligation || !account) throw new NotFoundError();
    // La institución es idempotente por la referencia del reclamo: un reintento no duplica.
    const submitted = await this.deps.institution.submitRefundClaim(
      { workspaceId: actor.workspaceId, now: workspace.virtualNow },
      { claimRef: claim.id, reference: obligation.reference, amount: claim.amount, destinationAccountRef: account.toProps().maskedNumber },
    );
    const result = await this.deps.uow.transaction(async (r) => {
      const locked = await r.refunds.get(actor.workspaceId, claim.id, { forUpdate: true });
      if (!locked) throw new NotFoundError();
      if (locked.status !== "DRAFT") {
        // Otro envío del mismo reclamo ganó la carrera (VC9-2): con otra clave es un conflicto, no un segundo envío.
        if ((await r.refunds.idempotencyKey(actor.workspaceId, claim.id)) !== command.idempotencyKey) throw new IdempotencyConflictError("This refund request was already submitted.");
        return { claim: locked, replayed: true };
      }
      locked.submit(submitted.institutionClaimId);
      await r.refunds.save(locked, command.idempotencyKey);
      await r.events.append(actor.workspaceId, [
        event("REFUND_CLAIM_SUBMITTED", actor.role, { type: "RefundClaim", id: locked.id }, workspace.virtualNow, {
          claimId: locked.id,
          amount: locked.amount.toJSON(),
          destination: "SOURCE_ACCOUNT",
          institutionClaimId: submitted.institutionClaimId,
        }),
      ]);
      return { claim: locked, replayed: false };
    });
    await this.processor.reconcile(actor.workspaceId, claim.id);
    return { claim: (await repos.refunds.get(actor.workspaceId, claim.id)) ?? result.claim, replayed: result.replayed };
  }
}
