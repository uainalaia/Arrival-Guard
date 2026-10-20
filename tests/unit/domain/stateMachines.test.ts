import { describe, expect, it } from "vitest";
import { InvalidTransitionError } from "@/domain/errors/DomainError";
import {
  ACTIVE_ATTEMPT_STATUSES,
  ATTEMPT_STATUSES,
  PaymentAttempt,
  newAttemptBlockers,
  type AttemptKind,
  type AttemptStatus,
} from "@/domain/payment/PaymentAttempt";
import { PLAN_STATUSES, PaymentPlan, type PlanStatus } from "@/domain/payment/PaymentPlan";
import { visibleTuitionStatus } from "@/domain/payment/VisibleStatus";
import { REFUND_STATUSES, RefundClaim, type RefundStatus } from "@/domain/refund/RefundClaim";
import { VirtualInstant } from "@/domain/time/Instant";
import { cny, usd } from "../../support/scenarioFacts";

const now = VirtualInstant.fromISO("2026-10-20T09:00:00.000Z");

// Copias independientes de BUILD_PROMPT 8.5: si alguien cambia una tabla del dominio, estas pruebas fallan.
const PLAN_ALLOWED: Record<PlanStatus, PlanStatus[]> = {
  DRAFT: ["NOT_VIABLE", "READY_FOR_APPROVAL", "INVALIDATED", "SUPERSEDED"],
  NOT_VIABLE: ["INVALIDATED", "SUPERSEDED"],
  READY_FOR_APPROVAL: ["APPROVAL_REQUESTED", "INVALIDATED", "SUPERSEDED"],
  APPROVAL_REQUESTED: ["APPROVED", "INVALIDATED", "SUPERSEDED"],
  APPROVED: ["EXECUTING", "READY_FOR_APPROVAL", "INVALIDATED", "SUPERSEDED"],
  EXECUTING: ["COMPLETED", "INCIDENT_OPEN", "READY_FOR_APPROVAL"],
  COMPLETED: [],
  INCIDENT_OPEN: [],
  INVALIDATED: [],
  SUPERSEDED: [],
};

const TUITION_ALLOWED: Record<AttemptStatus, AttemptStatus[]> = {
  SUBMITTING: ["PROVIDER_ACCEPTED", "UNKNOWN", "FAILED_CONFIRMED"],
  UNKNOWN: ["PROVIDER_ACCEPTED", "FAILED_CONFIRMED"],
  PROVIDER_ACCEPTED: ["PENDING_UNIVERSITY"],
  PENDING_UNIVERSITY: ["CREDITED"],
  CREDITED: [],
  FAILED_CONFIRMED: [],
  DELIVERED: [],
};

const REMITTANCE_ALLOWED: Record<AttemptStatus, AttemptStatus[]> = {
  SUBMITTING: ["PROVIDER_ACCEPTED", "UNKNOWN", "FAILED_CONFIRMED"],
  UNKNOWN: ["PROVIDER_ACCEPTED", "FAILED_CONFIRMED"],
  PROVIDER_ACCEPTED: ["DELIVERED"],
  PENDING_UNIVERSITY: [],
  CREDITED: [],
  FAILED_CONFIRMED: [],
  DELIVERED: [],
};

const REFUND_ALLOWED: Record<RefundStatus, RefundStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["REFUNDED"],
  REFUNDED: [],
  REJECTED: [],
};

function plan(status: PlanStatus): PaymentPlan {
  return PaymentPlan.rehydrate({
    id: "plan-1",
    workspaceId: "ws-1",
    obligationId: "obl-1",
    obligationVersion: 1,
    version: 1,
    status,
    targetArrivalAt: now.plusHours(48),
    selectedRouteId: "B",
    createdByActorId: "act-student",
    approvalRequestedAt: null,
    approvalExpiresAt: null,
  });
}

function attempt(kind: AttemptKind, status: AttemptStatus): PaymentAttempt {
  return PaymentAttempt.rehydrate({
    id: "att-1",
    workspaceId: "ws-1",
    kind,
    subjectId: "plan-1",
    obligationId: kind === "TUITION" ? "obl-1" : null,
    idempotencyKey: "tuition:plan-1:v1:apr-1",
    requestHash: "h",
    approvalId: "apr-1",
    mandateId: null,
    status,
    providerTransferId: null,
    debit: usd("2860.00"),
    quoteId: "q-B",
    createdAt: now,
  });
}

describe("PaymentPlan: transiciones (BUILD_PROMPT 8.5)", () => {
  for (const from of PLAN_STATUSES) {
    for (const to of PLAN_STATUSES) {
      const allowed = PLAN_ALLOWED[from].includes(to);
      it(`${from} -> ${to} ${allowed ? "permitida" : "lanza InvalidTransitionError"}`, () => {
        const p = plan(from);
        if (allowed) {
          p.transitionTo(to);
          expect(p.status).toBe(to);
        } else {
          expect(() => p.transitionTo(to)).toThrow(InvalidTransitionError);
          expect(p.status).toBe(from);
        }
      });
    }
  }
});

describe("PaymentAttempt: transiciones de matrícula y de remesa", () => {
  for (const [kind, table] of [["TUITION", TUITION_ALLOWED], ["REMITTANCE", REMITTANCE_ALLOWED]] as const) {
    for (const from of ATTEMPT_STATUSES) {
      for (const to of ATTEMPT_STATUSES) {
        const allowed = table[from].includes(to);
        const via = from === "UNKNOWN" ? "RECONCILIATION" : "PROVIDER";
        it(`${kind}: ${from} -> ${to} ${allowed ? "permitida" : "lanza"}`, () => {
          const a = attempt(kind, from);
          if (allowed) {
            a.transitionTo(to, via);
            expect(a.status).toBe(to);
          } else {
            expect(() => a.transitionTo(to, via)).toThrow(InvalidTransitionError);
          }
        });
      }
    }
  }

  it("UNKNOWN solo sale por conciliación", () => {
    expect(() => attempt("TUITION", "UNKNOWN").transitionTo("PROVIDER_ACCEPTED", "PROVIDER")).toThrow(InvalidTransitionError);
    expect(() => attempt("TUITION", "UNKNOWN").transitionTo("FAILED_CONFIRMED", "SUBMISSION")).toThrow(InvalidTransitionError);
    const a = attempt("TUITION", "UNKNOWN");
    a.transitionTo("PROVIDER_ACCEPTED", "RECONCILIATION");
    expect(a.status).toBe("PROVIDER_ACCEPTED");
  });

  it("UNKNOWN nunca habilita un intento nuevo, ni ningún otro estado activo", () => {
    expect(ACTIVE_ATTEMPT_STATUSES).toEqual(["SUBMITTING", "UNKNOWN", "PROVIDER_ACCEPTED", "PENDING_UNIVERSITY"]);
    for (const status of ACTIVE_ATTEMPT_STATUSES) expect(newAttemptBlockers([status])).toEqual(["ACTIVE_ATTEMPT_EXISTS"]);
    expect(newAttemptBlockers(["FAILED_CONFIRMED", "UNKNOWN"])).toEqual(["ACTIVE_ATTEMPT_EXISTS"]);
  });

  it("tras FAILED_CONFIRMED se puede intentar de nuevo (con revalidación y aprobación nueva)", () => {
    expect(newAttemptBlockers(["FAILED_CONFIRMED"])).toEqual([]);
    expect(newAttemptBlockers([])).toEqual([]);
  });

  it("un intento acreditado no decide solo: manda el estado de la obligación y el máximo acumulado (DEC-015)", () => {
    // Con la obligación acreditada el guard devuelve OBLIGATION_NOT_PENDING (executionGuard.test.ts);
    // con un pago parcial acreditado y la obligación pendiente, lo ya debitado cuenta para el máximo (S03).
    expect(newAttemptBlockers(["CREDITED"])).toEqual([]);
    expect(newAttemptBlockers(["CREDITED", "UNKNOWN"])).toEqual(["ACTIVE_ATTEMPT_EXISTS"]);
  });
});

describe("RefundClaim: transiciones", () => {
  for (const from of REFUND_STATUSES) {
    for (const to of REFUND_STATUSES) {
      const allowed = REFUND_ALLOWED[from].includes(to);
      it(`${from} -> ${to} ${allowed ? "permitida" : "lanza"}`, () => {
        const claim = RefundClaim.rehydrate({
          id: "rc-1",
          workspaceId: "ws-1",
          obligationId: "obl-1",
          verifiedExcess: cny("500.00"),
          amount: cny("500.00"),
          destinationAccountId: "acc-payer",
          status: from,
          institutionClaimId: null,
          settlement: null,
          version: 1,
        });
        if (allowed) {
          claim.transitionTo(to);
          expect(claim.status).toBe(to);
        } else {
          expect(() => claim.transitionTo(to)).toThrow(InvalidTransitionError);
        }
      });
    }
  }
});

describe("Estado visible para el usuario (BUILD_PROMPT 8.5, UI_UX 9.4)", () => {
  it("proyecta plan e intento a un estado con su siguiente acción", () => {
    expect(visibleTuitionStatus(null, null)).toEqual({ status: "DETAILS_NEEDED", nextAction: "PLAN_PAYMENT" });
    expect(visibleTuitionStatus(plan("READY_FOR_APPROVAL"), null)).toEqual({ status: "PLAN_READY", nextAction: "REQUEST_APPROVAL" });
    expect(visibleTuitionStatus(plan("APPROVAL_REQUESTED"), null)).toEqual({ status: "WAITING_FOR_PAYER", nextAction: "WAIT_FOR_PAYER" });
    expect(visibleTuitionStatus(plan("APPROVED"), null)).toEqual({ status: "APPROVED", nextAction: "SEND_PAYMENT" });
    expect(visibleTuitionStatus(plan("NOT_VIABLE"), null)).toEqual({ status: "BLOCKED", nextAction: "REPLAN" });
    expect(visibleTuitionStatus(plan("EXECUTING"), attempt("TUITION", "SUBMITTING"))).toEqual({ status: "SENDING", nextAction: "CHECK_PAYMENT" });
    expect(visibleTuitionStatus(plan("EXECUTING"), attempt("TUITION", "UNKNOWN"))).toEqual({ status: "UNCERTAIN", nextAction: "CHECK_PAYMENT" });
    expect(visibleTuitionStatus(plan("EXECUTING"), attempt("TUITION", "PROVIDER_ACCEPTED"))).toEqual({ status: "PROVIDER_ACCEPTED", nextAction: "CHECK_PAYMENT" });
    expect(visibleTuitionStatus(plan("EXECUTING"), attempt("TUITION", "PENDING_UNIVERSITY"))).toEqual({ status: "WAITING_FOR_UNIVERSITY", nextAction: "CHECK_PAYMENT" });
    expect(visibleTuitionStatus(plan("COMPLETED"), attempt("TUITION", "CREDITED"))).toEqual({ status: "CREDITED", nextAction: "NONE" });
    expect(visibleTuitionStatus(plan("READY_FOR_APPROVAL"), attempt("TUITION", "FAILED_CONFIRMED"))).toEqual({ status: "FAILED_NO_DEBIT", nextAction: "REQUEST_APPROVAL" });
  });

  it("nunca muestra acreditado sin un intento CREDITED", () => {
    for (const status of PLAN_STATUSES) {
      expect(visibleTuitionStatus(plan(status), null).status).not.toBe("CREDITED");
      expect(visibleTuitionStatus(plan(status), null, { status: "PENDING" }).status).not.toBe("CREDITED");
    }
  });

  it("VC9-6: una matrícula que la institución ya acreditó (sin plan ni intento aquí) se ve acreditada y sin acción", () => {
    expect(visibleTuitionStatus(null, null, { status: "CREDITED" })).toEqual({ status: "CREDITED", nextAction: "NONE" });
    expect(visibleTuitionStatus(null, null, { status: "PENDING" })).toEqual({ status: "DETAILS_NEEDED", nextAction: "PLAN_PAYMENT" });
    // Un intento en curso sigue mandando.
    expect(visibleTuitionStatus(plan("EXECUTING"), attempt("TUITION", "UNKNOWN"), { status: "CREDITED" })).toEqual({ status: "UNCERTAIN", nextAction: "CHECK_PAYMENT" });
  });
});
