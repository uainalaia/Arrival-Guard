import type { AttemptDTO, CashProjectionDTO, CaseViewDTO, PlanDTO, RouteEvaluationDTO, RoutingDTO } from "../dto/CaseDTO";
import type { MoneyDTO } from "../dto/MoneyDTO";

// <case_state> del turno (BUILD_PROMPT 13.2): JSON compacto, enmascarado y filtrado por rol, con hora virtual. Sale
// del CaseViewDTO, que ya enmascara cuentas (4 dígitos) y filtra la bandeja del pagador. No incluye claves de
// idempotencia, huellas completas ni nada que no sea del caso.

/** "USD 2,860.00" sin punto flotante: el modelo cita los montos tal como los recibe. */
export function moneyText(dto: MoneyDTO): string {
  const minor = BigInt(dto.minor);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const units = (abs / 100n).toLocaleString("en-US");
  const cents = (abs % 100n).toString().padStart(2, "0");
  return `${dto.currency} ${negative ? "-" : ""}${units}.${cents}`;
}

const last4 = (masked: string) => `ending ${masked.replace(/\D/g, "").slice(-4)}`;

const ACRONYMS = new Set(["FX", "ACH", "SWIFT"]);

/** "EDU_PAY_PARTNER" a "Edu Pay Partner": el nombre que el modelo puede decir. */
function providerName(channel: string): string {
  return channel
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

function routeState(r: RouteEvaluationDTO) {
  return {
    route: r.routeId,
    provider: providerName(r.channel),
    arrives_in_hours: r.arrivalHours,
    university_receives: moneyText(r.net),
    debit: moneyText(r.debit),
    receiver: r.receiverIsRegistered ? "university registered account" : `unregistered account ${last4(r.receiverMasked)}`,
    reasons: r.reasons,
  };
}

function planState(plan: PlanDTO) {
  return {
    plan_id: plan.planId,
    version: plan.version,
    status: plan.status,
    target_arrival_hours: plan.targetArrivalHours,
    selected_route: plan.selectedRoute ? routeState(plan.selectedRoute) : null,
    other_viable_routes: plan.routes.viable.filter((r) => r.routeId !== plan.selectedRoute?.routeId).map(routeState),
    discarded_routes: plan.routes.discarded.map((r) => ({ route: r.routeId, arrives_in_hours: r.arrivalHours, university_receives: moneyText(r.net), reasons: r.reasons })),
    plan_blockers: plan.routes.blockers,
    quote_expired: plan.quoteExpired,
    approvals: plan.approvals.map((a) => ({ plan_version: a.planVersion, status: a.status, seal: a.fingerprintPrefix.toUpperCase(), invalidation_reason: a.invalidationReason })),
  };
}

function attemptState(attempt: AttemptDTO) {
  return {
    attempt_id: attempt.attemptId,
    status: attempt.status,
    visible_status: attempt.visibleStatus,
    next_action: attempt.nextAction,
    debit: moneyText(attempt.debit),
    route: attempt.routeId,
    plan_version: attempt.planVersion,
    source_of_status: attempt.provenance.source,
    observed_at: attempt.provenance.observedAt,
    receipt: attempt.receipt ? { receipt_id: attempt.receipt.receiptId, net: moneyText(attempt.receipt.net), reference: attempt.receipt.reference, credited_at: attempt.receipt.creditedAt } : null,
    institution_notice_as_data: attempt.institutionNotice,
  };
}

export class CaseStateMapper {
  static plan(plan: PlanDTO) {
    return planState(plan);
  }

  static attempt(attempt: AttemptDTO) {
    return attemptState(attempt);
  }

  static routing(routing: RoutingDTO) {
    return {
      selected_route: routing.selectedRouteId,
      plan_blockers: routing.blockers,
      viable: routing.viable.map(routeState),
      discarded: routing.discarded.map((r) => ({ route: r.routeId, arrives_in_hours: r.arrivalHours, university_receives: moneyText(r.net), reasons: r.reasons })),
    };
  }

  static cash(projection: CashProjectionDTO) {
    return projection.byCurrency.map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === "object" && v !== null && "minor" in v ? moneyText(v as MoneyDTO) : v])));
  }

  static toCaseState(view: CaseViewDTO): Record<string, unknown> {
    const attempt = view.payment.attempt;
    return {
      synthetic: true,
      you_are_talking_to: { role: view.viewer.role, name: view.viewer.displayName },
      people: view.people,
      scenario: view.workspace.scenarioLabel,
      virtual_now: view.workspace.virtualNow,
      tuition: {
        obligation_id: view.tuition.obligationId,
        institution: view.tuition.institution,
        reference: view.tuition.reference,
        receiver: `registered account ${last4(view.tuition.receiverMasked)}`,
        amount_due: moneyText(view.tuition.netDue),
        due_at: view.tuition.dueAt,
        status: view.tuition.status,
      },
      family_funds: {
        account: last4(view.familyFunds.accountMasked),
        balance: moneyText(view.familyFunds.balance),
        available_for_tuition: moneyText(view.familyFunds.availableForTuition),
        arrival_reserve: moneyText(view.familyFunds.arrivalReserve),
        held_for_payments: moneyText(view.familyFunds.activeHolds),
        tuition_limit: moneyText(view.familyFunds.tuitionLimit),
      },
      local_account: { bank: view.localAccount.bankName, account: last4(view.localAccount.masked), status: view.localAccount.status, verified: view.localAccount.verified },
      scholarship: view.scholarship.map((s) => ({ amount: moneyText(s.amount), status: s.status, expected_at: s.expectedAt, counted_as_available: false })),
      expected_expenses: view.expectedExpenses.map((e) => ({ label: e.label, amount: moneyText(e.amount) })),
      plan: view.plan ? planState(view.plan) : null,
      payment: {
        visible_status: view.payment.visibleStatus,
        next_action: view.payment.nextAction,
        attempt: attempt ? attemptState(attempt) : null,
      },
      standing_permission: view.mandate
        ? {
            mandate_id: view.mandate.mandateId,
            status: view.mandate.status,
            recipient: last4(view.mandate.recipientMasked),
            period_limit: moneyText(view.mandate.periodMax),
            used_this_period: moneyText(view.mandate.usedThisPeriod),
            period_days: view.mandate.periodDays,
          }
        : null,
      arrival_transfers: view.remittances.map((r) => ({
        remittance_id: r.remittanceId,
        status: r.status,
        authorization: r.authorization,
        reasons: r.reasons,
        net: moneyText(r.net),
        debit: r.debit ? moneyText(r.debit) : null,
        route: r.routeId,
        payment_status: r.attempt?.status ?? null,
      })),
      refund_requests: view.refunds.map((c) => ({ claim_id: c.claimId, status: c.status, amount: moneyText(c.amount), destination: `paying account ${last4(c.destinationMasked)}`, settlement: c.settlement ? moneyText(c.settlement) : null })),
      payer_inbox: view.payer
        ? {
            approval_requests: view.payer.requests.map((r) => ({ plan_id: r.planId, plan_version: r.planVersion, proposed_debit: r.proposedDebit ? moneyText(r.proposedDebit) : null, route: r.routeId })),
            pending_changes: view.payer.pendingChanges.map((c) => ({ change_id: c.changeId, kind: c.kind })),
            note: "Approvals and limit changes are confirmed only on the payer's fixed screen, never in the chat.",
          }
        : null,
    };
  }
}
