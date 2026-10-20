import { canonicalJson } from "@/domain/consent/canonicalJson";
import { checkRequoteWithinApproval } from "@/domain/consent/RequoteScope";
import { PolicyViolationError } from "@/domain/errors/DomainError";
import type { DomainEventDraft } from "@/domain/events/DomainEvent";
import { checkTuitionExecution } from "@/domain/payment/ExecutionGuard";
import { ACTIVE_ATTEMPT_STATUSES, PaymentAttempt, type AttemptStatus } from "@/domain/payment/PaymentAttempt";
import type { ReasonCode } from "@/domain/policy/ReasonCode";
import { isQuoteExpired, type RouteQuote } from "@/domain/policy/RouteQuote";
import { DuplicateRecordError, type AttemptRecord } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { ActiveAttemptExistsError, IdempotencyConflictError, NotFoundError } from "../errors/ApplicationError";
import { event } from "../services/events";
import { committedToObligation, loadTuitionContext, obligationFacts } from "../services/TuitionContext";
import type { TuitionPaymentProcessor } from "../services/TuitionPaymentProcessor";

export interface ExecuteTuitionCommand {
  readonly planId: string;
  /** Del encabezado Idempotency-Key. Si falta (agente), el servidor la deriva: tuition:{planId}:v{version}:{approvalId}. */
  readonly idempotencyKey?: string;
}

export interface ExecuteTuitionResult {
  readonly attempt: AttemptRecord;
  /** true si la misma clave y el mismo contenido devolvieron un intento existente. */
  readonly replayed: boolean;
}

/**
 * Ejecutor transaccional e idempotente de la matrícula (BUILD_PROMPT 8.3, 10 y 11):
 * 1. Persiste el intento (SUBMITTING), la retención y el consumo de la aprobación ANTES de enviar.
 * 2. Envía al proveedor fuera de la transacción.
 * 3. Aplica el resultado; si la respuesta se pierde, el intento queda UNKNOWN y se concilia, nunca se repite.
 * Misma clave y mismo contenido devuelve lo existente; contenido distinto, 409. Otro intento activo, 409.
 */
export class ExecuteTuitionPaymentUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow" | "provider" | "hasher" | "ids" | "scenarios">,
    private readonly processor: TuitionPaymentProcessor,
  ) {}

  async execute(actor: ActorContext, command: ExecuteTuitionCommand): Promise<ExecuteTuitionResult> {
    requireRole(actor, "student", "payer");
    const ws = actor.workspaceId;
    const workspace = await this.deps.uow.read.workspaces.get(ws);
    if (!workspace) throw new NotFoundError();
    const channels = this.deps.scenarios.acceptedTuitionChannels(workspace.scenario);
    const requestHash = this.deps.hasher.sha256Hex(canonicalJson({ kind: "TUITION_PAYMENT", planId: command.planId }));

    const peek = await this.deps.uow.read.plans.getCurrent(ws, command.planId);
    if (!peek) throw new NotFoundError();
    const peekApproval = await this.deps.uow.read.approvals.findActive(ws, peek.plan.id, peek.plan.version);
    const key = command.idempotencyKey ?? `tuition:${peek.plan.id}:v${peek.plan.version}:${peekApproval?.id ?? "none"}`;

    const existing = await this.deps.uow.read.attempts.findByKey(ws, key);
    if (existing) return this.replay(existing, requestHash);

    // A3: si la cotización aprobada venció, se recotiza la misma ruta antes de abrir la transacción.
    let requoted: RouteQuote | null = null;
    if (peek.plan.status === "APPROVED" && peek.quote && isQuoteExpired(peek.quote, workspace.virtualNow)) {
      requoted = await this.deps.provider.requote({ workspaceId: ws, now: workspace.virtualNow }, peek.quote);
    }

    let outcome: { kind: "CREATED" | "REPLAYED"; record: AttemptRecord } | { kind: "BLOCKED"; reasons: ReasonCode[] };
    try {
      outcome = await this.deps.uow.transaction(async (r) => {
        const ctx = await loadTuitionContext(r, ws, channels, { lock: true });
        const record = await r.plans.getCurrent(ws, command.planId, { forUpdate: true });
        if (!record) throw new NotFoundError();
        const again = await r.attempts.findByKey(ws, key);
        if (again) return { kind: "REPLAYED" as const, record: again };
        const active = ctx.attempts.find((a) => (ACTIVE_ATTEMPT_STATUSES as readonly AttemptStatus[]).includes(a.attempt.status));
        if (active) throw new ActiveAttemptExistsError(active.attempt.id);

        const approval = record.plan.status === "APPROVED" ? await r.approvals.findActive(ws, record.plan.id, record.plan.version, { forUpdate: true }) : null;
        const committed = committedToObligation(ctx.attempts, ctx.account.currency);
        const events: DomainEventDraft[] = [];
        const planSubject = { type: "PaymentPlan", id: record.plan.id };
        let quote = record.quote;
        if (!quote) return { kind: "BLOCKED" as const, reasons: ["APPROVAL_MISSING"] as ReasonCode[] };

        if (approval && isQuoteExpired(quote, ctx.now) && requoted) {
          const decision = checkRequoteWithinApproval({
            approval,
            hasher: this.deps.hasher,
            newQuote: requoted,
            funds: ctx.account.funds(),
            currentPolicy: { maxTuitionDebit: ctx.policy.maxTuitionDebit, reserve: ctx.policy.reserve },
            committedToObligation: committed,
            now: ctx.now,
            targetArrivalAt: record.plan.targetArrivalAt,
          });
          if (!decision.allowed) {
            // Fuera de los límites aprobados: bloqueo, el plan vuelve a pedir aprobación (O02b).
            record.plan.transitionTo("READY_FOR_APPROVAL");
            await r.plans.saveVersion(record);
            approval.invalidate(`REQUOTE_OUTSIDE_APPROVAL: ${decision.reasons.join(", ")}`);
            await r.approvals.save(approval);
            await r.events.append(ws, [
              event("EXECUTION_BLOCKED", actor.role, planSubject, ctx.now, {
                planId: record.plan.id,
                version: record.plan.version,
                reasons: decision.reasons,
                previousDebit: quote.debit.toJSON(),
                requotedDebit: requoted.debit.toJSON(),
                stage: "REQUOTE",
              }),
              event("APPROVAL_INVALIDATED", "system", { type: "Approval", id: approval.id }, ctx.now, {
                planId: record.plan.id,
                version: record.plan.version,
                reason: "REQUOTE_OUTSIDE_APPROVAL",
              }),
            ]);
            return { kind: "BLOCKED" as const, reasons: [...decision.reasons] };
          }
          events.push(
            event("AUTO_REQUOTE_WITHIN_APPROVAL", "system", planSubject, ctx.now, {
              planId: record.plan.id,
              routeId: requoted.routeId,
              previousQuoteId: quote.quoteId,
              newQuoteId: requoted.quoteId,
              previousDebit: decision.previousDebit.toJSON(),
              newDebit: decision.newDebit.toJSON(),
            }),
          );
          quote = requoted;
        }

        const reasons = checkTuitionExecution({
          now: ctx.now,
          obligation: obligationFacts(ctx.obligation),
          plan: record.plan,
          approval,
          hasher: this.deps.hasher,
          sourceAccountId: ctx.account.id,
          quote,
          funds: ctx.account.funds(),
          policy: { maxTuitionDebit: ctx.policy.maxTuitionDebit, reserve: ctx.policy.reserve },
          committedToObligation: committed,
          acceptedChannels: ctx.acceptedChannels,
          existingAttemptStatuses: ctx.attempts.map((a) => a.attempt.status),
        });
        if (reasons.length > 0) {
          await r.events.append(ws, [
            event("EXECUTION_BLOCKED", actor.role, planSubject, ctx.now, { planId: record.plan.id, version: record.plan.version, reasons, stage: "PRE_EXECUTION" }),
          ]);
          return { kind: "BLOCKED" as const, reasons };
        }

        const attemptId = this.deps.ids.newId();
        const attemptRecord: AttemptRecord = {
          attempt: PaymentAttempt.rehydrate({
            id: attemptId,
            workspaceId: ws,
            kind: "TUITION",
            subjectId: record.plan.id,
            obligationId: ctx.obligation.id,
            idempotencyKey: key,
            requestHash,
            approvalId: approval!.id,
            mandateId: null,
            status: "SUBMITTING",
            providerTransferId: null,
            debit: quote.debit,
            quoteId: quote.quoteId,
            createdAt: ctx.now,
          }),
          subjectVersion: record.plan.version,
          quote,
          statusChangedAt: ctx.now,
        };
        await r.attempts.insert(attemptRecord);
        ctx.account.placeHold(this.deps.ids.newId(), attemptId, quote.debit);
        await r.accounts.save(ctx.account);
        approval!.consume();
        await r.approvals.save(approval!);
        record.plan.transitionTo("EXECUTING");
        await r.plans.saveVersion(record);
        const attemptSubject = { type: "PaymentAttempt", id: attemptId };
        events.push(
          event("ATTEMPT_CREATED", actor.role, attemptSubject, ctx.now, {
            attemptId,
            planId: record.plan.id,
            version: record.plan.version,
            approvalId: approval!.id,
            idempotencyKey: key,
            routeId: quote.routeId,
            debit: quote.debit.toJSON(),
          }),
          event("HOLD_PLACED", "system", attemptSubject, ctx.now, { attemptId, amount: quote.debit.toJSON() }),
        );
        await r.events.append(ws, events);
        return { kind: "CREATED" as const, record: attemptRecord };
      });
    } catch (error) {
      // Carrera con la misma clave o con otro intento activo: el índice único es la red de seguridad.
      if (error instanceof DuplicateRecordError) {
        const byKey = await this.deps.uow.read.attempts.findByKey(ws, key);
        if (byKey) return this.replay(byKey, requestHash);
        const active = (await this.deps.uow.read.attempts.listActive(ws))[0];
        if (active) throw new ActiveAttemptExistsError(active.attempt.id);
      }
      throw error;
    }

    if (outcome.kind === "BLOCKED") throw new PolicyViolationError(outcome.reasons);
    if (outcome.kind === "REPLAYED") return this.replay(outcome.record, requestHash);
    await this.processor.submit(ws, outcome.record.attempt.id, actor.role);
    const latest = await this.deps.uow.read.attempts.get(ws, outcome.record.attempt.id);
    return { attempt: latest ?? outcome.record, replayed: false };
  }

  private replay(existing: AttemptRecord, requestHash: string): ExecuteTuitionResult {
    if (existing.attempt.toProps().requestHash !== requestHash) throw new IdempotencyConflictError();
    return { attempt: existing, replayed: true };
  }
}
