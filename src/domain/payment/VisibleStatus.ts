import type { ObligationStatus } from "../policy/PolicyEngine";
import type { AttemptStatus } from "./PaymentAttempt";
import type { PlanStatus } from "./PaymentPlan";

/** Estados visibles (BUILD_PROMPT 8.5, UI_UX 9.4). Los textos viven en la interfaz. */
export type VisibleStatus =
  | "DETAILS_NEEDED"
  | "PLAN_READY"
  | "WAITING_FOR_PAYER"
  | "APPROVED"
  | "SENDING"
  | "UNCERTAIN"
  | "PROVIDER_ACCEPTED"
  | "WAITING_FOR_UNIVERSITY"
  | "CREDITED"
  | "DELIVERED"
  | "BLOCKED"
  | "FAILED_NO_DEBIT";

export type NextAction =
  | "PLAN_PAYMENT"
  | "REQUEST_APPROVAL"
  | "WAIT_FOR_PAYER"
  | "SEND_PAYMENT"
  | "CHECK_PAYMENT"
  | "REPLAN"
  | "REVIEW_INCIDENT"
  | "NONE";

export interface VisibleState {
  readonly status: VisibleStatus;
  readonly nextAction: NextAction;
}

const BY_ATTEMPT: Partial<Record<AttemptStatus, VisibleState>> = {
  SUBMITTING: { status: "SENDING", nextAction: "CHECK_PAYMENT" },
  UNKNOWN: { status: "UNCERTAIN", nextAction: "CHECK_PAYMENT" },
  PROVIDER_ACCEPTED: { status: "PROVIDER_ACCEPTED", nextAction: "CHECK_PAYMENT" },
  PENDING_UNIVERSITY: { status: "WAITING_FOR_UNIVERSITY", nextAction: "CHECK_PAYMENT" },
  CREDITED: { status: "CREDITED", nextAction: "NONE" },
  DELIVERED: { status: "DELIVERED", nextAction: "NONE" },
};

const BY_PLAN: Record<PlanStatus, VisibleState> = {
  DRAFT: { status: "DETAILS_NEEDED", nextAction: "PLAN_PAYMENT" },
  NOT_VIABLE: { status: "BLOCKED", nextAction: "REPLAN" },
  READY_FOR_APPROVAL: { status: "PLAN_READY", nextAction: "REQUEST_APPROVAL" },
  APPROVAL_REQUESTED: { status: "WAITING_FOR_PAYER", nextAction: "WAIT_FOR_PAYER" },
  APPROVED: { status: "APPROVED", nextAction: "SEND_PAYMENT" },
  EXECUTING: { status: "SENDING", nextAction: "CHECK_PAYMENT" },
  // Un plan COMPLETED sin intento CREDITED no puede mostrarse como acreditado: se pide comprobar.
  COMPLETED: { status: "WAITING_FOR_UNIVERSITY", nextAction: "CHECK_PAYMENT" },
  INCIDENT_OPEN: { status: "BLOCKED", nextAction: "REVIEW_INCIDENT" },
  INVALIDATED: { status: "DETAILS_NEEDED", nextAction: "PLAN_PAYMENT" },
  SUPERSEDED: { status: "DETAILS_NEEDED", nextAction: "PLAN_PAYMENT" },
};

/**
 * Proyecta plan e intento a un estado visible con su siguiente acción. El intento manda cuando existe.
 * "Credited" solo aparece con un intento CREDITED (respaldado por recibo de la institución) o con la obligación que
 * la institución ya acreditó antes de este espacio.
 */
export function visibleTuitionStatus(
  plan: { status: PlanStatus } | null,
  attempt: { status: AttemptStatus } | null,
  obligation: { status: ObligationStatus } | null = null,
): VisibleState {
  if (attempt) {
    const fromAttempt = BY_ATTEMPT[attempt.status];
    if (fromAttempt) return fromAttempt;
    if (attempt.status === "FAILED_CONFIRMED") {
      return { status: "FAILED_NO_DEBIT", nextAction: plan?.status === "APPROVED" ? "SEND_PAYMENT" : "REQUEST_APPROVAL" };
    }
  }
  // La institución ya la acreditó (con recibo en su libro) antes de este espacio: no hay nada que planificar (VC9-6).
  if (!plan && obligation?.status === "CREDITED") return { status: "CREDITED", nextAction: "NONE" };
  if (!plan) return { status: "DETAILS_NEEDED", nextAction: "PLAN_PAYMENT" };
  return BY_PLAN[plan.status];
}
