import type { Approval } from "@/domain/consent/Approval";
import { fingerprintPrefix } from "@/domain/consent/ApprovalPayload";
import type { CashProjection } from "@/domain/cash/CashProjection";
import { isQuoteExpired, type RouteEvaluation } from "@/domain/policy/RouteQuote";
import type { TuitionRoutingResult } from "@/domain/policy/PolicyEngine";
import type { AttemptRecord, PlanVersionRecord, RecipientRecord, RemittanceRecord, StoredEvent } from "@/domain/ports/Repositories";
import type { RefundClaim } from "@/domain/refund/RefundClaim";
import type { VirtualInstant } from "@/domain/time/Instant";
import type {
  ActivityDTO,
  ApprovalSummaryDTO,
  ApprovalViewDTO,
  AttemptDTO,
  CashProjectionDTO,
  CaseViewDTO,
  EventDTO,
  JourneyStationDTO,
  PlanDTO,
  RouteEvaluationDTO,
  RefundDTO,
  RemittanceDTO,
  RoutingDTO,
} from "../dto/CaseDTO";
import type { Observation } from "../services/TuitionPaymentProcessor";
import type { CaseSnapshot } from "../usecases/GetCaseViewUseCase";
import type { ApprovalView } from "../usecases/GetApprovalViewUseCase";
import { MoneyMapper } from "./MoneyMapper";

const MINUTES_PER_HOUR = 60;
const MS_PER_HOUR = 3_600_000;

/** "Arrival University, tuition account ending 0098" -> "Arrival University". */
function institutionName(displayName: string): string {
  return displayName.split(",")[0]?.trim() || displayName;
}

/** Convierte evaluaciones de rutas a DTO, con el receptor enmascarado. */
export class RouteMapper {
  static toDTO(evaluation: RouteEvaluation, recipients: readonly RecipientRecord[], registeredReceiverId: string): RouteEvaluationDTO {
    const receiver = recipients.find((r) => r.id === evaluation.receiverId);
    return {
      routeId: evaluation.routeId,
      channel: evaluation.channel,
      quoteId: evaluation.quoteId,
      arrivalHours: Math.round(evaluation.arrivalMinutes / MINUTES_PER_HOUR),
      arrivesAt: evaluation.arrivesAt.toISOString(),
      quoteExpiresAt: evaluation.expiresAt.toISOString(),
      debit: MoneyMapper.toDTO(evaluation.debit),
      net: MoneyMapper.toDTO(evaluation.net),
      receiverMasked: receiver?.maskedAccount ?? "••••",
      receiverIsRegistered: evaluation.receiverId === registeredReceiverId,
      reasons: [...evaluation.reasons],
    };
  }

  static routingToDTO(result: TuitionRoutingResult, recipients: readonly RecipientRecord[], registeredReceiverId: string): RoutingDTO {
    return {
      selectedRouteId: result.selected?.routeId ?? null,
      blockers: [...result.blockers],
      viable: result.viable.map((v) => RouteMapper.toDTO(v, recipients, registeredReceiverId)),
      discarded: result.discarded.map((d) => RouteMapper.toDTO(d, recipients, registeredReceiverId)),
    };
  }
}

export class ApprovalMapper {
  static summary(approval: Approval): ApprovalSummaryDTO {
    const p = approval.toProps();
    return {
      approvalId: p.id,
      planVersion: p.subjectVersion,
      status: p.status,
      fingerprint: p.fingerprint,
      fingerprintPrefix: fingerprintPrefix(p.fingerprint),
      grantedAt: p.grantedAt.toISOString(),
      expiresAt: p.expiresAt.toISOString(),
      invalidationReason: p.invalidationReason,
    };
  }

  static viewToDTO(view: ApprovalView): ApprovalViewDTO {
    const { record, context, payload } = view;
    const quote = record.quote;
    return {
      synthetic: true,
      planId: record.plan.id,
      planVersion: record.plan.version,
      status: record.plan.status,
      requestedBy: view.studentName,
      payerName: view.payerName,
      purpose: `Tuition, reference ${context.obligation.reference}`,
      institution: institutionName(context.university.displayName),
      reference: context.obligation.reference,
      receiverMasked: view.receiver?.maskedAccount ?? context.university.maskedAccount,
      sourceAccountMasked: context.account.toProps().maskedNumber,
      universityReceives: quote ? MoneyMapper.toDTO(quote.net) : null,
      proposedDebit: quote ? MoneyMapper.toDTO(quote.debit) : null,
      limit: payload ? payload.maxDebit : MoneyMapper.toDTO(context.policy.maxTuitionDebit),
      reserveKept: payload ? payload.reserve : MoneyMapper.toDTO(context.policy.reserve),
      route: quote ? { routeId: quote.routeId, channel: quote.channel, arrivalHours: Math.round(quote.arrivalMinutes / MINUTES_PER_HOUR) } : null,
      validUntil: payload?.approvalExpiresAt ?? null,
      fingerprint: view.fingerprint,
      fingerprintPrefix: view.fingerprint ? fingerprintPrefix(view.fingerprint) : null,
      quoteExpired: view.quoteExpired,
      approval: view.approval ? ApprovalMapper.summary(view.approval) : null,
      virtualNow: view.now.toISOString(),
    };
  }
}

export class PlanMapper {
  static toDTO(record: PlanVersionRecord, approvals: readonly Approval[], recipients: readonly RecipientRecord[], registeredReceiverId: string, now: VirtualInstant): PlanDTO {
    const p = record.plan.toProps();
    const routes = RouteMapper.routingToDTO(record.evaluation, recipients, registeredReceiverId);
    const selected = record.quote ? routes.viable.find((r) => r.quoteId === record.quote!.quoteId) ?? null : null;
    // Hora de la comparación: la de las cotizaciones evaluadas (llegada menos duración). De ahí sale el plazo pedido.
    const sample = record.evaluation.viable[0] ?? record.evaluation.discarded[0] ?? null;
    const comparedAt = sample ? sample.arrivesAt.plusMinutes(-sample.arrivalMinutes) : null;
    return {
      planId: p.id,
      version: p.version,
      status: p.status,
      targetArrivalAt: p.targetArrivalAt.toISOString(),
      targetArrivalHours: comparedAt ? Math.round((p.targetArrivalAt.epochMs - comparedAt.epochMs) / MS_PER_HOUR) : null,
      comparedAt: comparedAt?.toISOString() ?? null,
      selectedRoute:
        selected ??
        (record.quote
          ? {
              routeId: record.quote.routeId,
              channel: record.quote.channel,
              quoteId: record.quote.quoteId,
              arrivalHours: Math.round(record.quote.arrivalMinutes / MINUTES_PER_HOUR),
              arrivesAt: now.plusMinutes(record.quote.arrivalMinutes).toISOString(),
              quoteExpiresAt: record.quote.expiresAt.toISOString(),
              debit: MoneyMapper.toDTO(record.quote.debit),
              net: MoneyMapper.toDTO(record.quote.net),
              receiverMasked: recipients.find((r) => r.id === record.quote!.receiverId)?.maskedAccount ?? "••••",
              receiverIsRegistered: record.quote.receiverId === registeredReceiverId,
              reasons: [],
            }
          : null),
      routes,
      approvalRequestedAt: p.approvalRequestedAt?.toISOString() ?? null,
      approvalExpiresAt: p.approvalExpiresAt?.toISOString() ?? null,
      quoteExpired: record.quote ? isQuoteExpired(record.quote, now) : false,
      approvals: approvals.map(ApprovalMapper.summary),
    };
  }
}

export class AttemptMapper {
  static toDTO(record: AttemptRecord, visible: { status: string; nextAction: string }, observation: Observation | null): AttemptDTO {
    const p = record.attempt.toProps();
    return {
      attemptId: p.id,
      kind: p.kind,
      status: p.status,
      visibleStatus: visible.status,
      nextAction: visible.nextAction,
      debit: MoneyMapper.toDTO(p.debit),
      routeId: record.quote.routeId,
      planVersion: record.subjectVersion,
      createdAt: p.createdAt.toISOString(),
      statusChangedAt: record.statusChangedAt.toISOString(),
      idempotencyKeyPrefix: p.idempotencyKey.slice(0, 12),
      provenance: { source: observation?.source ?? "SYSTEM", observedAt: (observation?.observedAt ?? record.statusChangedAt).toISOString() },
      receipt: observation?.receipt
        ? {
            receiptId: observation.receipt.receiptId,
            net: MoneyMapper.toDTO(observation.receipt.net),
            reference: observation.receipt.reference,
            creditedAt: observation.receipt.creditedAt.toISOString(),
          }
        : null,
      institutionNotice: observation?.institutionNotice ?? null,
    };
  }
}

export class EventMapper {
  static toDTO(event: StoredEvent): EventDTO {
    return {
      seq: event.seq,
      type: event.type,
      actorRole: event.actorRole,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      virtualAt: event.virtualAt.toISOString(),
      realAt: event.realAt.toISOString(),
      payload: event.payload,
    };
  }
}

export class CashProjectionMapper {
  static toDTO(projection: CashProjection): CashProjectionDTO {
    return {
      synthetic: true,
      byCurrency: projection.byCurrency.map((c) => ({
        currency: c.currency,
        confirmedBalance: MoneyMapper.toDTO(c.confirmedBalance),
        arrivalReserve: MoneyMapper.toDTO(c.arrivalReserve),
        activeHolds: MoneyMapper.toDTO(c.activeHolds),
        plannedDebits: MoneyMapper.toDTO(c.plannedDebits),
        balanceAfterPlanned: MoneyMapper.toDTO(c.balanceAfterPlanned),
        availableForArrivalExpenses: MoneyMapper.toDTO(c.availableForArrivalExpenses),
        expectedExpenses: MoneyMapper.toDTO(c.expectedExpenses),
        pendingObligations: MoneyMapper.toDTO(c.pendingObligations),
      })),
      verdict: {
        status: projection.verdict.status,
        margin: MoneyMapper.toDTO(projection.verdict.margin),
        shortfall: MoneyMapper.toDTOOrNull(projection.verdict.shortfall),
      },
      notCounted: projection.notCounted.map((n) => ({
        kind: n.kind,
        amount: MoneyMapper.toDTO(n.amount),
        expectedAt: n.expectedAt.toISOString(),
        condition: n.condition,
        reason: n.reason,
      })),
    };
  }
}

const ACTIVITY_TYPES = new Set([
  "APPROVAL_REQUESTED",
  "APPROVAL_GRANTED",
  "APPROVAL_INVALIDATED",
  "APPROVAL_REVOKED",
  "POLICY_CHANGED",
  "MANDATE_CHANGED",
  "MANDATE_REVOKED",
  "REMITTANCE_EXECUTED_UNDER_MANDATE",
  "REMITTANCE_ESCALATED",
  "REMITTANCE_DELIVERED",
  "SECURITY_BLOCK",
  "INSTITUTION_CREDITED",
  "REFUND_CLAIM_SUBMITTED",
  "REFUND_CLAIM_UPDATED",
]);

/** Vista del caso por rol: el pagador ve además su bandeja, cambios pendientes y actividad. */
export class CaseViewMapper {
  static toDTO(s: CaseSnapshot): CaseViewDTO {
    const student = s.actors.find((a) => a.role === "student")?.displayName ?? "Student";
    const payer = s.actors.find((a) => a.role === "payer")?.displayName ?? "Payer";
    const viewer = s.actors.find((a) => a.role === s.role)?.displayName ?? s.role;
    const funds = s.payerAccount.funds();
    const reserveTotal = s.payerAccount.earmarks.filter((e) => e.purpose === "ARRIVAL_EXPENSES").reduce((sum, e) => sum.add(e.amount), funds.balance.subtract(funds.balance));
    const now = s.workspace.virtualNow;
    const visible = s.visible;
    return {
      synthetic: true,
      workspace: {
        id: s.workspace.id,
        scenario: s.workspace.scenario,
        scenarioLabel: s.scenarioLabel,
        virtualNow: now.toISOString(),
        virtualStart: s.workspace.virtualStart.toISOString(),
        elapsedMinutes: s.workspace.virtualStart.minutesUntil(now),
      },
      viewer: { role: s.role, displayName: viewer },
      people: { student, payer },
      tuition: {
        obligationId: s.obligation.id,
        reference: s.obligation.reference,
        institution: institutionName(s.university.displayName),
        receiverMasked: s.university.maskedAccount,
        netDue: MoneyMapper.toDTO(s.obligation.netDue),
        dueAt: s.obligation.dueAt.toISOString(),
        status: s.obligation.status,
      },
      familyFunds: {
        accountMasked: s.payerAccount.toProps().maskedNumber,
        balance: MoneyMapper.toDTO(funds.balance),
        arrivalReserve: MoneyMapper.toDTO(s.payerAccount.earmarkRemaining("ARRIVAL_EXPENSES")),
        arrivalReserveTotal: MoneyMapper.toDTO(reserveTotal),
        activeHolds: MoneyMapper.toDTO(funds.activeHolds),
        availableForTuition: MoneyMapper.toDTO(funds.balance.subtract(funds.earmarkedRemaining).subtract(funds.activeHolds)),
        tuitionLimit: MoneyMapper.toDTO(s.policy.maxTuitionDebit),
        minimumReserve: MoneyMapper.toDTO(s.policy.reserve),
      },
      localAccount: {
        bankName: s.localBankName,
        masked: s.localAccount.toProps().maskedNumber,
        status: s.localAccount.toProps().status,
        verified: s.localRecipient?.verified ?? false,
        balance: MoneyMapper.toDTO(s.localAccount.balance),
      },
      scholarship: s.conditionalIncomes.map((c) => ({
        amount: MoneyMapper.toDTO(c.amount),
        status: c.status,
        expectedAt: c.expectedAt.toISOString(),
        condition: c.condition,
        counted: false as const,
      })),
      expectedExpenses: s.expectedExpenses.map((e) => ({ label: e.label, amount: MoneyMapper.toDTO(e.amount), source: e.source })),
      plan: s.plan ? PlanMapper.toDTO(s.plan, s.planApprovals, s.recipients, s.university.id, now) : null,
      payment: {
        attempt: s.attempt ? AttemptMapper.toDTO(s.attempt, visible, s.observation) : null,
        visibleStatus: visible.status,
        nextAction: visible.nextAction,
        journey: CaseViewMapper.journey(s),
      },
      mandate:
        s.mandate && s.mandateUsed
          ? {
              mandateId: s.mandate.id,
              status: s.mandate.status,
              purpose: "ARRIVAL_EXPENSES",
              recipientMasked: s.localRecipient?.maskedAccount ?? "••••",
              periodMax: MoneyMapper.toDTO(s.mandate.periodMax),
              usedThisPeriod: MoneyMapper.toDTO(s.mandateUsed),
              periodDays: s.mandate.periodDays,
              expiresAt: s.mandate.expiresAt.toISOString(),
              version: s.mandate.version,
            }
          : null,
      payer:
        s.role === "payer"
          ? {
              policyFingerprint: s.policyFingerprint,
              requests: s.approvalRequests.map((r) => ({
                planId: r.plan.id,
                planVersion: r.plan.version,
                requestedAt: r.plan.approvalRequestedAt?.toISOString() ?? null,
                expiresAt: r.plan.approvalExpiresAt?.toISOString() ?? null,
                routeId: r.quote?.routeId ?? null,
                proposedDebit: r.quote ? MoneyMapper.toDTO(r.quote.debit) : null,
                universityReceives: r.quote ? MoneyMapper.toDTO(r.quote.net) : null,
                reference: s.obligation.reference,
              })),
              pendingChanges: s.pendingChanges.map((c) => ({ changeId: c.id, kind: c.kind, payload: c.payload, fingerprint: c.fingerprint })),
              activity: s.events
                .filter((e) => ACTIVITY_TYPES.has(e.type))
                .slice(-30)
                .reverse()
                .map((e): ActivityDTO => ({ seq: e.seq, type: e.type, at: e.virtualAt.toISOString(), summary: e.payload })),
            }
          : null,
      remittances: s.remittances.map((x) => RemittanceMapper.toDTO(x.record, x.attempt, s.localRecipient?.maskedAccount ?? "••••")),
      refunds: s.refunds.map((c) => RefundMapper.toDTO(c, s.payerAccount.toProps().maskedNumber)),
    };
  }

  /** Línea del pago: estaciones con estado, hora virtual y procedencia, desde los eventos del servidor. */
  static journey(s: CaseSnapshot): JourneyStationDTO[] {
    const plan = s.plan;
    const attempt = s.attempt && plan && s.attempt.subjectVersion === plan.plan.version ? s.attempt : null;
    const lastAt = (type: string, subjectId?: string) =>
      [...s.events].reverse().find((e) => e.type === type && (!subjectId || e.subjectId === subjectId || e.payload.attemptId === subjectId))?.virtualAt.toISOString() ?? null;
    const status = attempt?.attempt.status;
    const planned = plan && !["DRAFT", "NOT_VIABLE"].includes(plan.plan.status);
    const approved = Boolean(attempt) || plan?.plan.status === "APPROVED";
    const stations: JourneyStationDTO[] = [
      { key: "PLANNED", state: planned ? "done" : plan?.plan.status === "NOT_VIABLE" ? "blocked" : "current", at: planned ? lastAt("PLAN_CREATED") : null, source: planned ? "SYSTEM" : null },
      { key: "APPROVED", state: approved ? "done" : planned ? "current" : "pending", at: approved ? lastAt("APPROVAL_GRANTED") : null, source: approved ? "PAYER" : null },
      { key: "SENT", state: attempt ? "done" : approved ? "current" : "pending", at: attempt ? attempt.attempt.toProps().createdAt.toISOString() : null, source: attempt ? "SYSTEM" : null },
      {
        key: "ACCEPTED",
        state: !attempt ? "pending" : status === "UNKNOWN" ? "uncertain" : status === "FAILED_CONFIRMED" ? "blocked" : status === "SUBMITTING" ? "current" : "done",
        at: attempt && !["SUBMITTING", "UNKNOWN", "FAILED_CONFIRMED"].includes(status!) ? lastAt("PROVIDER_ACCEPTED", attempt.attempt.id) : null,
        source: attempt && !["SUBMITTING", "UNKNOWN", "FAILED_CONFIRMED"].includes(status!) ? "PROVIDER" : null,
      },
      {
        key: "UNIVERSITY",
        state: status === "PENDING_UNIVERSITY" ? "current" : status === "CREDITED" ? "done" : "pending",
        at: status === "PENDING_UNIVERSITY" || status === "CREDITED" ? lastAt("INSTITUTION_PENDING", attempt!.attempt.id) : null,
        source: status === "PENDING_UNIVERSITY" || status === "CREDITED" ? "UNIVERSITY" : null,
      },
      {
        key: "CREDITED",
        state: status === "CREDITED" ? "done" : "pending",
        at: status === "CREDITED" ? (s.observation?.receipt?.creditedAt.toISOString() ?? lastAt("INSTITUTION_CREDITED")) : null,
        source: status === "CREDITED" ? "UNIVERSITY" : null,
      },
    ];
    return stations;
  }
}

export class RemittanceMapper {
  static toDTO(r: RemittanceRecord, attempt: AttemptRecord | null, recipientMasked: string): RemittanceDTO {
    return {
      remittanceId: r.id,
      version: r.version,
      status: r.status,
      authorization: r.authorization,
      reasons: [...r.reasons],
      net: MoneyMapper.toDTO(r.net),
      debit: r.quote ? MoneyMapper.toDTO(r.quote.debit) : null,
      routeId: r.quote?.routeId ?? null,
      channel: r.quote?.channel ?? null,
      arrivalHours: r.quote ? Math.round(r.quote.arrivalMinutes / MINUTES_PER_HOUR) : null,
      recipientMasked,
      createdAt: r.createdAt.toISOString(),
      approvalExpiresAt: r.approvalExpiresAt?.toISOString() ?? null,
      attempt: attempt ? { attemptId: attempt.attempt.id, status: attempt.attempt.status, statusChangedAt: attempt.statusChangedAt.toISOString() } : null,
    };
  }
}

export class RefundMapper {
  static toDTO(c: RefundClaim, destinationMasked: string): RefundDTO {
    const p = c.toProps();
    return {
      claimId: p.id,
      obligationId: p.obligationId,
      status: p.status,
      amount: MoneyMapper.toDTO(p.amount),
      verifiedExcess: MoneyMapper.toDTO(p.verifiedExcess),
      destinationMasked,
      settlement: MoneyMapper.toDTOOrNull(p.settlement),
    };
  }
}
