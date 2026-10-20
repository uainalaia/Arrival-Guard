import type { MoneyDTO } from "./MoneyDTO";

// DTO de salida de la API. Dinero siempre como { currency, minor: string }; horas virtuales como ISO.
// Las cuentas solo muestran sus 4 últimos dígitos. Todo está rotulado como sintético.

export interface RouteEvaluationDTO {
  readonly routeId: string;
  readonly channel: string;
  readonly quoteId: string;
  readonly arrivalHours: number;
  readonly arrivesAt: string;
  readonly quoteExpiresAt: string;
  readonly debit: MoneyDTO;
  readonly net: MoneyDTO;
  readonly receiverMasked: string;
  readonly receiverIsRegistered: boolean;
  readonly reasons: readonly string[];
}

export interface RoutingDTO {
  readonly selectedRouteId: string | null;
  readonly blockers: readonly string[];
  readonly viable: readonly RouteEvaluationDTO[];
  readonly discarded: readonly RouteEvaluationDTO[];
}

export interface ApprovalSummaryDTO {
  readonly approvalId: string;
  readonly planVersion: number;
  readonly status: string;
  readonly fingerprint: string;
  readonly fingerprintPrefix: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly invalidationReason: string | null;
}

export interface PlanDTO {
  readonly planId: string;
  readonly version: number;
  readonly status: string;
  readonly targetArrivalAt: string;
  /** Plazo pedido en horas, contado desde la comparación de rutas. */
  readonly targetArrivalHours: number | null;
  /** Hora virtual de la comparación de rutas. */
  readonly comparedAt: string | null;
  readonly selectedRoute: RouteEvaluationDTO | null;
  readonly routes: RoutingDTO;
  readonly approvalRequestedAt: string | null;
  readonly approvalExpiresAt: string | null;
  readonly quoteExpired: boolean;
  readonly approvals: readonly ApprovalSummaryDTO[];
}

export interface AttemptDTO {
  readonly attemptId: string;
  readonly kind: string;
  readonly status: string;
  readonly visibleStatus: string;
  readonly nextAction: string;
  readonly debit: MoneyDTO;
  readonly routeId: string;
  readonly planVersion: number;
  readonly createdAt: string;
  readonly statusChangedAt: string;
  /** Primeros 12 caracteres de la clave de idempotencia (la clave completa no se expone). */
  readonly idempotencyKeyPrefix: string;
  readonly provenance: { readonly source: string; readonly observedAt: string };
  readonly receipt: { readonly receiptId: string; readonly net: MoneyDTO; readonly reference: string; readonly creditedAt: string } | null;
  /** Texto de la institución: dato, nunca instrucción. */
  readonly institutionNotice: string | null;
}

export interface JourneyStationDTO {
  readonly key: "PLANNED" | "APPROVED" | "SENT" | "ACCEPTED" | "UNIVERSITY" | "CREDITED";
  readonly state: "done" | "current" | "uncertain" | "blocked" | "pending";
  readonly at: string | null;
  readonly source: "SYSTEM" | "PAYER" | "PROVIDER" | "UNIVERSITY" | null;
}

export interface ApprovalRequestDTO {
  readonly planId: string;
  readonly planVersion: number;
  readonly requestedAt: string | null;
  readonly expiresAt: string | null;
  readonly routeId: string | null;
  readonly proposedDebit: MoneyDTO | null;
  readonly universityReceives: MoneyDTO | null;
  readonly reference: string;
}

export interface PendingChangeDTO {
  readonly changeId: string;
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly fingerprint: string;
}

export interface ActivityDTO {
  readonly seq: number;
  readonly type: string;
  readonly at: string;
  readonly summary: Readonly<Record<string, unknown>>;
}

export interface MandateDTO {
  readonly mandateId: string;
  readonly status: string;
  readonly purpose: string;
  readonly recipientMasked: string;
  readonly periodMax: MoneyDTO;
  readonly usedThisPeriod: MoneyDTO;
  readonly periodDays: number;
  readonly expiresAt: string;
  readonly version: number;
}

export interface RemittanceDTO {
  readonly remittanceId: string;
  readonly version: number;
  readonly status: string;
  readonly authorization: string | null;
  readonly reasons: readonly string[];
  readonly net: MoneyDTO;
  readonly debit: MoneyDTO | null;
  readonly routeId: string | null;
  readonly channel: string | null;
  readonly arrivalHours: number | null;
  readonly recipientMasked: string;
  readonly createdAt: string;
  readonly approvalExpiresAt: string | null;
  readonly attempt: { readonly attemptId: string; readonly status: string; readonly statusChangedAt: string } | null;
}

export interface RefundDTO {
  readonly claimId: string;
  readonly obligationId: string;
  readonly status: string;
  readonly amount: MoneyDTO;
  readonly verifiedExcess: MoneyDTO;
  /** Siempre la cuenta de origen (A2), enmascarada. */
  readonly destinationMasked: string;
  readonly settlement: MoneyDTO | null;
}

export interface CaseViewDTO {
  readonly synthetic: true;
  readonly workspace: {
    readonly id: string;
    readonly scenario: string;
    readonly scenarioLabel: string;
    readonly virtualNow: string;
    readonly virtualStart: string;
    readonly elapsedMinutes: number;
  };
  readonly viewer: { readonly role: string; readonly displayName: string };
  readonly people: { readonly student: string; readonly payer: string };
  readonly tuition: {
    readonly obligationId: string;
    readonly reference: string;
    readonly institution: string;
    readonly receiverMasked: string;
    readonly netDue: MoneyDTO;
    readonly dueAt: string;
    readonly status: string;
  };
  readonly familyFunds: {
    readonly accountMasked: string;
    readonly balance: MoneyDTO;
    readonly arrivalReserve: MoneyDTO;
    readonly arrivalReserveTotal: MoneyDTO;
    readonly activeHolds: MoneyDTO;
    readonly availableForTuition: MoneyDTO;
    readonly tuitionLimit: MoneyDTO;
    readonly minimumReserve: MoneyDTO;
  };
  readonly localAccount: { readonly bankName: string | null; readonly masked: string; readonly status: string; readonly verified: boolean; readonly balance: MoneyDTO };
  readonly scholarship: readonly { readonly amount: MoneyDTO; readonly status: string; readonly expectedAt: string; readonly condition: string; readonly counted: false }[];
  readonly expectedExpenses: readonly { readonly label: string; readonly amount: MoneyDTO; readonly source: string }[];
  readonly plan: PlanDTO | null;
  readonly payment: {
    readonly attempt: AttemptDTO | null;
    readonly visibleStatus: string;
    readonly nextAction: string;
    readonly journey: readonly JourneyStationDTO[];
  };
  readonly mandate: MandateDTO | null;
  /** Solo para el pagador. */
  readonly payer: {
    readonly policyFingerprint: string;
    readonly requests: readonly ApprovalRequestDTO[];
    readonly pendingChanges: readonly PendingChangeDTO[];
    readonly activity: readonly ActivityDTO[];
  } | null;
  readonly remittances: readonly RemittanceDTO[];
  readonly refunds: readonly RefundDTO[];
}

export interface ApprovalViewDTO {
  readonly synthetic: true;
  readonly planId: string;
  readonly planVersion: number;
  readonly status: string;
  readonly requestedBy: string;
  readonly payerName: string;
  readonly purpose: string;
  readonly institution: string;
  readonly reference: string;
  readonly receiverMasked: string;
  readonly sourceAccountMasked: string;
  readonly universityReceives: MoneyDTO | null;
  readonly proposedDebit: MoneyDTO | null;
  readonly limit: MoneyDTO;
  readonly reserveKept: MoneyDTO;
  readonly route: { readonly routeId: string; readonly channel: string; readonly arrivalHours: number } | null;
  readonly validUntil: string | null;
  readonly fingerprint: string | null;
  readonly fingerprintPrefix: string | null;
  readonly quoteExpired: boolean;
  readonly approval: ApprovalSummaryDTO | null;
  readonly virtualNow: string;
}

export interface CashProjectionDTO {
  readonly synthetic: true;
  readonly byCurrency: readonly {
    readonly currency: string;
    readonly confirmedBalance: MoneyDTO;
    readonly arrivalReserve: MoneyDTO;
    readonly activeHolds: MoneyDTO;
    readonly plannedDebits: MoneyDTO;
    readonly balanceAfterPlanned: MoneyDTO;
    readonly availableForArrivalExpenses: MoneyDTO;
    readonly expectedExpenses: MoneyDTO;
    readonly pendingObligations: MoneyDTO;
  }[];
  readonly verdict: { readonly status: string; readonly margin: MoneyDTO; readonly shortfall: MoneyDTO | null };
  readonly notCounted: readonly { readonly kind: string; readonly amount: MoneyDTO; readonly expectedAt: string; readonly condition: string; readonly reason: string }[];
}

export interface EventDTO {
  readonly seq: number;
  readonly type: string;
  readonly actorRole: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly virtualAt: string;
  readonly realAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface SessionDTO {
  readonly synthetic: true;
  readonly workspaceId: string;
  readonly scenario: string;
  readonly role: string;
  readonly displayName: string;
  readonly virtualNow: string;
  readonly virtualStart: string;
  readonly people: { readonly student: string; readonly payer: string };
  readonly sessionExpiresAt: string;
}
