import { availableForArrivalExpenses } from "@/domain/cash/CashInvariants";
import { canonicalJson } from "@/domain/consent/canonicalJson";
import type { DomainEventDraft } from "@/domain/events/DomainEvent";
import { PolicyViolationError } from "@/domain/errors/DomainError";
import { ACTIVE_ATTEMPT_STATUSES, PaymentAttempt, type AttemptStatus } from "@/domain/payment/PaymentAttempt";
import { isQuoteExpired } from "@/domain/policy/RouteQuote";
import type { ReasonCode } from "@/domain/policy/ReasonCode";
import { DuplicateRecordError, type AttemptRecord, type RemittanceRecord } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { ActiveAttemptExistsError, IdempotencyConflictError, NotFoundError, VersionConflictError } from "../errors/ApplicationError";
import { event } from "../services/events";
import { loadRemittanceContext } from "../services/RemittanceContext";
import type { TuitionPaymentProcessor } from "../services/TuitionPaymentProcessor";

export type ExecuteRemittanceResult =
  | { readonly outcome: "SENT"; readonly attempt: AttemptRecord; readonly replayed: boolean; readonly remittance: RemittanceRecord }
  | { readonly outcome: "NEEDS_PAYER_APPROVAL"; readonly remittance: RemittanceRecord };

/**
 * T3, ejecutar una remesa con Idempotency-Key (BUILD_PROMPT 11). Dentro del mandato se vuelve a autorizar con el uso
 * del período al momento de ejecutar (bajo bloqueo: fraccionar o encadenar remesas no supera el tope); si ya no entra,
 * escala al pagador y devuelve NEEDS_PAYER_APPROVAL. Con aprobación puntual, se exige vigente e íntegra para esta
 * versión. Como la matrícula: intento persistido antes de enviar, retención, envío fuera de la transacción.
 */
export class ExecuteRemittanceUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow" | "hasher" | "ids">,
    private readonly processor: TuitionPaymentProcessor,
  ) {}

  async execute(actor: ActorContext, command: { readonly remittanceId: string; readonly idempotencyKey: string }): Promise<ExecuteRemittanceResult> {
    requireRole(actor, "student");
    const ws = actor.workspaceId;
    const key = command.idempotencyKey;
    const requestHash = this.deps.hasher.sha256Hex(canonicalJson({ kind: "REMITTANCE_PAYMENT", remittanceId: command.remittanceId }));
    const peek = await this.deps.uow.read.remittances.get(ws, command.remittanceId);
    if (!peek) throw new NotFoundError();
    const existing = await this.deps.uow.read.attempts.findByKey(ws, key);
    if (existing) return this.replay(existing, requestHash, peek);

    let outcome:
      | { kind: "CREATED"; record: AttemptRecord; remittance: RemittanceRecord }
      | { kind: "REPLAYED"; record: AttemptRecord }
      | { kind: "NEEDS"; remittance: RemittanceRecord }
      | { kind: "BLOCKED"; reasons: ReasonCode[] };
    try {
      outcome = await this.deps.uow.transaction(async (r) => {
        const ctx = await loadRemittanceContext(r, ws, { lock: true });
        const remittance = await r.remittances.get(ws, command.remittanceId, { forUpdate: true });
        if (!remittance) throw new NotFoundError();
        const again = await r.attempts.findByKey(ws, key);
        if (again) return { kind: "REPLAYED" as const, record: again };
        const active = ctx.attempts.find((a) => a.attempt.toProps().subjectId === remittance.id && (ACTIVE_ATTEMPT_STATUSES as readonly AttemptStatus[]).includes(a.attempt.status));
        if (active) throw new ActiveAttemptExistsError(active.attempt.id);
        if (remittance.status === "DELIVERED" || remittance.status === "EXECUTING") throw new VersionConflictError("This transfer was already sent.");
        if (remittance.status === "BLOCKED" || remittance.status === "FAILED" || !remittance.quote) {
          throw new PolicyViolationError(remittance.reasons.length > 0 ? [...remittance.reasons] : ["NET_INSUFFICIENT"]);
        }
        if (remittance.status === "APPROVAL_REQUESTED") return { kind: "NEEDS" as const, remittance };
        const quote = remittance.quote;
        const subject = { type: "Remittance", id: remittance.id };
        const reasons: ReasonCode[] = [];
        if (isQuoteExpired(quote, ctx.now)) reasons.push("QUOTE_EXPIRED");
        if (quote.debit.greaterThan(availableForArrivalExpenses(ctx.account.funds(), ctx.account.earmarkRemaining("ARRIVAL_EXPENSES")))) reasons.push("INSUFFICIENT_FUNDS");
        if (!ctx.recipient.verified || ctx.recipient.accountStatus !== "OPEN") reasons.push(ctx.recipient.accountStatus !== "OPEN" ? "RECIPIENT_ACCOUNT_NOT_OPEN" : "RECIPIENT_NOT_VERIFIED");
        if (quote.receiverId !== ctx.recipient.id) reasons.push("RECEIVER_NOT_ALLOWED");

        let approval = null;
        let mandateId: string | null = null;
        if (remittance.status === "READY") {
          // Se autoriza de nuevo con el uso al momento de ejecutar: dos remesas listas no superan juntas el tope.
          const decision = ctx.mandate
            ? ctx.mandate.authorize({ purpose: "ARRIVAL_EXPENSES", recipientId: ctx.recipient.id, debit: quote.debit, now: ctx.now, usages: ctx.usages })
            : ({ mode: "NEEDS_PAYER_APPROVAL", reasons: ["MANDATE_MISSING"] } as const);
          if (decision.mode === "NEEDS_PAYER_APPROVAL") {
            const escalated: RemittanceRecord = {
              ...remittance,
              status: "APPROVAL_REQUESTED",
              authorization: "PAYER_APPROVAL",
              reasons: [...decision.reasons],
              approvalExpiresAt: ctx.now.plusHours(24),
              version: remittance.version + 1,
            };
            await r.remittances.save(escalated);
            await r.events.append(ws, [
              event("REMITTANCE_ESCALATED", actor.role, subject, ctx.now, { remittanceId: remittance.id, reasons: decision.reasons, debit: quote.debit.toJSON(), stage: "EXECUTION" }),
            ]);
            return { kind: "NEEDS" as const, remittance: escalated };
          }
          mandateId = ctx.mandate!.id;
        } else if (remittance.status === "APPROVED") {
          approval = remittance.approvalId ? await r.approvals.get(ws, remittance.approvalId, { forUpdate: true }) : null;
          if (!approval) reasons.push("APPROVAL_MISSING");
          else {
            reasons.push(...approval.usableFor({ subjectType: "REMITTANCE", subjectId: remittance.id, subjectVersion: remittance.version, fingerprint: approval.fingerprint, now: ctx.now }));
            const signed = approval.signedRemittancePayload(this.deps.hasher);
            const matches =
              signed &&
              signed.quoteId === quote.quoteId &&
              signed.recipientId === remittance.recipientId &&
              signed.sourceAccountId === ctx.account.id &&
              signed.proposedDebit.minor === quote.debit.minor.toString() &&
              !quote.debit.greaterThan(ctx.account.funds().balance);
            if (!matches) reasons.push("APPROVAL_INVALID");
          }
        }
        if (reasons.length > 0) {
          const unique = [...new Set(reasons)];
          // El bloqueo queda en la bitácora: se confirma la transacción y se informa después.
          await r.events.append(ws, [event("EXECUTION_BLOCKED", actor.role, subject, ctx.now, { remittanceId: remittance.id, reasons: unique, stage: "PRE_EXECUTION" })]);
          return { kind: "BLOCKED" as const, reasons: unique };
        }

        const attemptId = this.deps.ids.newId();
        const attemptRecord: AttemptRecord = {
          attempt: PaymentAttempt.rehydrate({
            id: attemptId,
            workspaceId: ws,
            kind: "REMITTANCE",
            subjectId: remittance.id,
            obligationId: null,
            idempotencyKey: key,
            requestHash,
            approvalId: approval?.id ?? null,
            mandateId,
            status: "SUBMITTING",
            providerTransferId: null,
            debit: quote.debit,
            quoteId: quote.quoteId,
            createdAt: ctx.now,
          }),
          subjectVersion: remittance.version,
          quote,
          statusChangedAt: ctx.now,
        };
        await r.attempts.insert(attemptRecord);
        ctx.account.placeHold(this.deps.ids.newId(), attemptId, quote.debit);
        await r.accounts.save(ctx.account);
        if (approval) {
          approval.consume();
          await r.approvals.save(approval);
        }
        const sent: RemittanceRecord = { ...remittance, status: "EXECUTING" };
        await r.remittances.save(sent);
        const attemptSubject = { type: "PaymentAttempt", id: attemptId };
        const events: DomainEventDraft[] = [
          event("ATTEMPT_CREATED", actor.role, attemptSubject, ctx.now, { attemptId, remittanceId: remittance.id, idempotencyKey: key, routeId: quote.routeId, debit: quote.debit.toJSON() }),
          event("HOLD_PLACED", "system", attemptSubject, ctx.now, { attemptId, amount: quote.debit.toJSON() }),
        ];
        if (mandateId) {
          // Notificación al pagador (T3): ejecutada bajo su permiso permanente.
          events.push(
            event("REMITTANCE_EXECUTED_UNDER_MANDATE", actor.role, subject, ctx.now, {
              remittanceId: remittance.id,
              mandateId,
              debit: quote.debit.toJSON(),
              net: remittance.net.toJSON(),
              routeId: quote.routeId,
            }),
          );
        }
        await r.events.append(ws, events);
        return { kind: "CREATED" as const, record: attemptRecord, remittance: sent };
      });
    } catch (error) {
      if (error instanceof DuplicateRecordError) {
        const byKey = await this.deps.uow.read.attempts.findByKey(ws, key);
        if (byKey) return this.replay(byKey, requestHash, peek);
      }
      throw error;
    }

    if (outcome.kind === "BLOCKED") throw new PolicyViolationError(outcome.reasons);
    if (outcome.kind === "NEEDS") return { outcome: "NEEDS_PAYER_APPROVAL", remittance: outcome.remittance };
    if (outcome.kind === "REPLAYED") return this.replay(outcome.record, requestHash, peek);
    await this.processor.submit(ws, outcome.record.attempt.id, actor.role);
    const latest = await this.deps.uow.read.attempts.get(ws, outcome.record.attempt.id);
    const remittance = (await this.deps.uow.read.remittances.get(ws, command.remittanceId)) ?? outcome.remittance;
    return { outcome: "SENT", attempt: latest ?? outcome.record, replayed: false, remittance };
  }

  private replay(existing: AttemptRecord, requestHash: string, remittance: RemittanceRecord): ExecuteRemittanceResult {
    if (existing.attempt.toProps().requestHash !== requestHash) throw new IdempotencyConflictError();
    return { outcome: "SENT", attempt: existing, replayed: true, remittance };
  }
}
