import type { ActorRole, DomainEventDraft } from "@/domain/events/DomainEvent";
import { PaymentPlan } from "@/domain/payment/PaymentPlan";
import { evaluateTuitionRoutes, type TuitionRoutingResult } from "@/domain/policy/PolicyEngine";
import type { RouteQuote } from "@/domain/policy/RouteQuote";
import type { PlanVersionRecord, Repositories } from "@/domain/ports/Repositories";
import type { VirtualInstant } from "@/domain/time/Instant";
import type { AppDeps } from "../AppDeps";
import { event } from "./events";
import { routingFacts, type TuitionContext } from "./TuitionContext";

export type PlanOutcome = "NEW_PLAN" | "NEW_VERSION" | "RETARGETED" | "QUOTE_REFRESHED";

export interface PlanChange {
  readonly record: PlanVersionRecord;
  readonly outcome: PlanOutcome;
  readonly invalidatedApprovalIds: readonly string[];
  readonly materialFields: readonly string[];
}

/** Campos de la ruta elegida cuyo cambio es material (BUILD_PROMPT 8.4). */
function materialFieldsBetween(current: PlanVersionRecord, next: RouteQuote | null, obligationVersion: number): string[] {
  const fields: string[] = [];
  const q = current.quote;
  if (current.plan.obligationVersion !== obligationVersion) fields.push("obligationVersion");
  if (!q || !next) return q === next ? fields : [...fields, "routeId"];
  if (q.routeId !== next.routeId) fields.push("routeId");
  if (q.channel !== next.channel) fields.push("channel");
  if (q.receiverId !== next.receiverId) fields.push("receiverId");
  if (!q.net.equals(next.net)) fields.push("netAmount");
  return fields;
}

/**
 * Crea o actualiza el plan de matrícula con cotizaciones nuevas, dentro de una transacción ya abierta.
 * - Sin plan previo: plan nuevo (versión 1).
 * - Con plan previo y cambio material: la versión anterior pasa a SUPERSEDED, su aprobación activa queda
 *   INVALIDATED con los campos que cambiaron y se crea la versión siguiente del mismo plan.
 * - Sin cambio material: misma versión. En modo PLAN cambia el objetivo; si aún no hay consentimiento pedido,
 *   también refresca la cotización. En modo REFRESH (cotización vencida antes de aprobar) solo refresca precios.
 */
export async function applyTuitionPlan(
  deps: Pick<AppDeps, "ids">,
  repos: Repositories,
  ctx: TuitionContext,
  actor: { readonly role: ActorRole | "system"; readonly actorId: string },
  input: {
    readonly quotes: readonly RouteQuote[];
    readonly targetArrivalAt: VirtualInstant;
    readonly current: PlanVersionRecord | null;
    readonly mode: "PLAN" | "REFRESH";
    readonly reason?: string;
  },
): Promise<PlanChange> {
  const evaluation: TuitionRoutingResult = evaluateTuitionRoutes(routingFacts(ctx, input.quotes, input.targetArrivalAt));
  const selectedQuote = evaluation.selected ? (input.quotes.find((q) => q.quoteId === evaluation.selected!.quoteId) ?? null) : null;
  const events: DomainEventDraft[] = [];
  const current = input.current && input.current.plan.isBeforeExecution() ? input.current : null;
  const invalidated: string[] = [];

  if (current && selectedQuote) {
    const fields = materialFieldsBetween(current, selectedQuote, ctx.obligation.version);
    const status = current.plan.status;
    if (fields.length === 0 && ["READY_FOR_APPROVAL", "APPROVAL_REQUESTED", "APPROVED"].includes(status)) {
      const consentPending = status === "APPROVAL_REQUESTED" || status === "APPROVED";
      if (input.mode === "PLAN") current.plan.retarget(input.targetArrivalAt, ctx.obligation.dueAt);
      // Con consentimiento pedido o dado, la cotización firmada no se toca (A3 cubre su vencimiento).
      const keepQuote = input.mode === "PLAN" && consentPending;
      const record: PlanVersionRecord = { plan: current.plan, quote: keepQuote ? current.quote : selectedQuote, evaluation };
      await repos.plans.saveVersion(record);
      events.push(
        event("PLAN_CREATED", actor.role, { type: "PaymentPlan", id: current.plan.id }, ctx.now, {
          planId: current.plan.id,
          version: current.plan.version,
          kind: input.mode === "PLAN" ? "RETARGET" : "QUOTE_REFRESH",
          reason: input.reason ?? null,
          selectedRouteId: record.quote?.routeId ?? null,
          debit: record.quote?.debit.toJSON() ?? null,
        }),
      );
      await repos.events.append(ctx.workspace.id, events);
      return { record, outcome: input.mode === "PLAN" ? "RETARGETED" : "QUOTE_REFRESHED", invalidatedApprovalIds: [], materialFields: [] };
    }
  }

  let planId = deps.ids.newId();
  let version = 1;
  let materialFields: string[] = [];
  if (current) {
    materialFields = materialFieldsBetween(current, selectedQuote, ctx.obligation.version);
    current.plan.transitionTo("SUPERSEDED");
    await repos.plans.saveVersion(current);
    const active = await repos.approvals.findActive(ctx.workspace.id, current.plan.id, current.plan.version, { forUpdate: true });
    if (active) {
      active.invalidate(input.reason ? input.reason : `MATERIAL_CHANGE: ${materialFields.join(", ") || "plan"}`);
      await repos.approvals.save(active);
      invalidated.push(active.id);
      events.push(
        event("APPROVAL_INVALIDATED", actor.role, { type: "Approval", id: active.id }, ctx.now, {
          planId: current.plan.id,
          version: current.plan.version,
          reason: input.reason ?? "MATERIAL_CHANGE",
          changedFields: materialFields,
        }),
      );
    }
    planId = current.plan.id;
    version = current.plan.version + 1;
  }

  const plan = PaymentPlan.rehydrate({
    id: planId,
    workspaceId: ctx.workspace.id,
    obligationId: ctx.obligation.id,
    obligationVersion: ctx.obligation.version,
    version,
    status: "DRAFT",
    targetArrivalAt: input.targetArrivalAt,
    selectedRouteId: selectedQuote?.routeId ?? null,
    createdByActorId: actor.actorId,
    approvalRequestedAt: null,
    approvalExpiresAt: null,
  });
  plan.transitionTo(selectedQuote ? "READY_FOR_APPROVAL" : "NOT_VIABLE");
  const record: PlanVersionRecord = { plan, quote: selectedQuote, evaluation };
  await repos.plans.insertVersion(record);
  events.push(
    event("PLAN_CREATED", actor.role, { type: "PaymentPlan", id: plan.id }, ctx.now, {
      planId: plan.id,
      version,
      kind: current ? "NEW_VERSION" : "NEW_PLAN",
      reason: input.reason ?? null,
      targetArrivalAt: input.targetArrivalAt.toISOString(),
      selectedRouteId: selectedQuote?.routeId ?? null,
      debit: selectedQuote?.debit.toJSON() ?? null,
      discarded: evaluation.discarded.map((d) => ({ routeId: d.routeId, reasons: d.reasons })),
      changedFields: materialFields,
    }),
  );
  if (!selectedQuote) {
    const reasons = evaluation.blockers.length ? evaluation.blockers : [...new Set(evaluation.discarded.flatMap((d) => d.reasons))];
    events.push(event("PLAN_NOT_VIABLE", actor.role, { type: "PaymentPlan", id: plan.id }, ctx.now, { planId: plan.id, version, reasons }));
  }
  await repos.events.append(ctx.workspace.id, events);
  return { record, outcome: current ? "NEW_VERSION" : "NEW_PLAN", invalidatedApprovalIds: invalidated, materialFields };
}
