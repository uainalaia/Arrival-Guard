import { decisionWithoutMandate } from "@/domain/consent/StandingMandate";
import type { DomainEventDraft } from "@/domain/events/DomainEvent";
import { DomainValidationError } from "@/domain/errors/DomainError";
import type { Money } from "@/domain/money/Money";
import { sortReasons, type ReasonCode } from "@/domain/policy/ReasonCode";
import { evaluateRemittanceRoutes } from "@/domain/policy/RemittancePolicy";
import type { RemittanceRecord } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { ValidationError } from "../errors/ApplicationError";
import { event } from "../services/events";
import { loadRemittanceContext } from "../services/RemittanceContext";

const APPROVAL_VALIDITY_HOURS = 24;

export interface PrepareRemittanceCommand {
  readonly net: Money;
  readonly targetArrivalHours: number;
}

/**
 * T3, preparar una remesa para gastos de llegada (enmienda A1). Compara rutas hacia la cuenta local verificada de la
 * estudiante y decide la autorización: dentro del tope del mandato queda lista para ejecutarse; fuera del tope o sin
 * mandato escala al pagador, que aprueba una vez en su pantalla fija. Un destinatario no abierto o no verificado
 * bloquea (N18, S15). No mueve dinero.
 */
export class PrepareRemittanceUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "provider" | "ids">) {}

  async execute(actor: ActorContext, command: PrepareRemittanceCommand): Promise<RemittanceRecord> {
    requireRole(actor, "student");
    if (!Number.isInteger(command.targetArrivalHours) || command.targetArrivalHours < 1 || command.targetArrivalHours > 720) {
      throw new ValidationError("targetArrivalHours must be a whole number of hours between 1 and 720");
    }
    if (command.net.currency !== "CNY" || !command.net.isPositive()) throw new DomainValidationError("Arrival transfers are in CNY and must be positive");
    const pre = await loadRemittanceContext(this.deps.uow.read, actor.workspaceId);
    const quotes = await this.deps.provider.quoteRemittance({ workspaceId: actor.workspaceId, now: pre.now }, { net: command.net, recipientId: pre.recipient.id });

    return this.deps.uow.transaction(async (r) => {
      const ctx = await loadRemittanceContext(r, actor.workspaceId, { lock: true });
      const targetArrivalAt = ctx.now.plusHours(command.targetArrivalHours);
      const evaluation = evaluateRemittanceRoutes({
        now: ctx.now,
        recipient: { id: ctx.recipient.id, verified: ctx.recipient.verified, accountStatus: ctx.recipient.accountStatus, currency: ctx.recipient.currency },
        requestedNet: command.net,
        targetArrivalAt,
        funds: ctx.account.funds(),
        arrivalEarmarkRemaining: ctx.account.earmarkRemaining("ARRIVAL_EXPENSES"),
        quotes,
      });
      const id = this.deps.ids.newId();
      const subject = { type: "Remittance", id };
      const events: DomainEventDraft[] = [];
      const base = {
        id,
        workspaceId: actor.workspaceId,
        recipientId: ctx.recipient.id,
        sourceAccountId: ctx.account.id,
        purpose: "ARRIVAL_EXPENSES" as const,
        net: command.net,
        targetArrivalAt,
        evaluation,
        createdByActorId: actor.actorId,
        version: 1,
        createdAt: ctx.now,
      };
      let record: RemittanceRecord;
      const selected = evaluation.selected;
      if (!selected) {
        const reasons: ReasonCode[] =
          evaluation.blockers.length > 0 ? [...evaluation.blockers] : sortReasons([...new Set(evaluation.discarded.flatMap((d) => d.reasons))]);
        record = { ...base, mandateId: ctx.mandate?.id ?? null, status: "BLOCKED", authorization: null, reasons, quote: null, approvalId: null, approvalExpiresAt: null };
        events.push(event("EXECUTION_BLOCKED", actor.role, subject, ctx.now, { remittanceId: id, reasons, stage: "PREPARE", net: command.net.toJSON() }));
      } else {
        const quote = quotes.find((q) => q.quoteId === selected.quoteId) ?? null;
        const decision = ctx.mandate
          ? ctx.mandate.authorize({ purpose: "ARRIVAL_EXPENSES", recipientId: ctx.recipient.id, debit: selected.debit, now: ctx.now, usages: ctx.usages })
          : decisionWithoutMandate();
        if (decision.mode === "WITHIN_MANDATE") {
          record = { ...base, mandateId: ctx.mandate!.id, status: "READY", authorization: "MANDATE", reasons: [], quote, approvalId: null, approvalExpiresAt: null };
        } else {
          record = {
            ...base,
            mandateId: ctx.mandate?.id ?? null,
            status: "APPROVAL_REQUESTED",
            authorization: "PAYER_APPROVAL",
            reasons: [...decision.reasons],
            quote,
            approvalId: null,
            approvalExpiresAt: ctx.now.plusHours(APPROVAL_VALIDITY_HOURS),
          };
          // Escala al pagador: aparece en su bandeja y en su actividad (N17).
          events.push(
            event("REMITTANCE_ESCALATED", actor.role, subject, ctx.now, {
              remittanceId: id,
              reasons: decision.reasons,
              debit: selected.debit.toJSON(),
              net: command.net.toJSON(),
              routeId: selected.routeId,
            }),
          );
        }
      }
      await r.remittances.insert(record);
      if (events.length > 0) await r.events.append(actor.workspaceId, events);
      return record;
    });
  }
}
