import type { Account, AccountKind } from "../account/Account";
import type { Approval } from "../consent/Approval";
import type { StandingMandate } from "../consent/StandingMandate";
import type { ConditionalIncome, ExpectedExpense } from "../cash/CashProjection";
import type { ActorRole, DomainEventDraft } from "../events/DomainEvent";
import type { Money } from "../money/Money";
import type { PaymentAttempt } from "../payment/PaymentAttempt";
import type { PaymentPlan } from "../payment/PaymentPlan";
import type { ObligationStatus, TuitionRoutingResult } from "../policy/PolicyEngine";
import type { ReasonCode } from "../policy/ReasonCode";
import type { RemittanceRoutingResult } from "../policy/RemittancePolicy";
import type { RouteQuote } from "../policy/RouteQuote";
import type { RefundClaim } from "../refund/RefundClaim";
import type { RealInstant, VirtualInstant } from "../time/Instant";

// Puertos de persistencia. El dominio y la aplicación dependen de estas interfaces; Drizzle las implementa.
// Toda lectura y escritura lleva el id del espacio: un recurso de otro espacio simplemente no existe.

export type FaultName =
  | "LOSE_NEXT_PROVIDER_RESPONSE"
  | "FAIL_NEXT_TRANSFER"
  | "DELAY_INSTITUTION_CREDIT"
  | "REQUOTE_ABOVE_MAX"
  | "DUPLICATE_NEXT_EVENT"
  | "PROVIDER_INJECTION_TEXT"
  | "INSTITUTION_INJECTION_TEXT"
  | "AI_UNAVAILABLE";

export const FAULT_NAMES: readonly FaultName[] = [
  "LOSE_NEXT_PROVIDER_RESPONSE",
  "FAIL_NEXT_TRANSFER",
  "DELAY_INSTITUTION_CREDIT",
  "REQUOTE_ABOVE_MAX",
  "DUPLICATE_NEXT_EVENT",
  "PROVIDER_INJECTION_TEXT",
  "INSTITUTION_INJECTION_TEXT",
  "AI_UNAVAILABLE",
];

/** Un índice único rechazó la escritura (por ejemplo, la misma clave de idempotencia en una carrera). */
export class DuplicateRecordError extends Error {
  readonly code = "DUPLICATE_RECORD";
}

/** Lee el código de Postgres aunque el driver o el ORM lo envuelvan (Drizzle lo deja en `cause`). */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export interface LockOptions {
  readonly forUpdate?: boolean;
}

export interface WorkspaceRecord {
  readonly id: string;
  readonly scenario: string;
  readonly virtualNow: VirtualInstant;
  readonly virtualStart: VirtualInstant;
  readonly faults: Readonly<Partial<Record<FaultName, boolean>>>;
  readonly createdAt: RealInstant;
  readonly expiresAt: RealInstant;
}

export interface ActorRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly role: ActorRole;
  readonly displayName: string;
}

export type RecipientKind = "INSTITUTION" | "STUDENT_LOCAL" | "EXTERNAL";

export interface RecipientRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: RecipientKind;
  readonly displayName: string;
  readonly maskedAccount: string;
  readonly currency: Money["currency"];
  readonly verified: boolean;
  readonly accountStatus: "OPEN" | "PENDING_OPENING";
  readonly addedByActorId: string | null;
}

export interface ObligationRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly studentActorId: string;
  readonly sourceAccountId: string;
  readonly netDue: Money;
  readonly reference: string;
  readonly dueAt: VirtualInstant;
  readonly status: ObligationStatus;
  readonly version: number;
}

export interface PayerPolicyRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly accountId: string;
  readonly maxTuitionDebit: Money;
  readonly reserve: Money;
  readonly version: number;
}

export interface PlanVersionRecord {
  readonly plan: PaymentPlan;
  readonly quote: RouteQuote | null;
  readonly evaluation: TuitionRoutingResult;
}

export interface AttemptRecord {
  readonly attempt: PaymentAttempt;
  readonly subjectVersion: number;
  readonly quote: RouteQuote;
  readonly statusChangedAt: VirtualInstant;
}

export interface StoredEvent {
  readonly seq: number;
  readonly type: string;
  readonly actorRole: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly virtualAt: VirtualInstant;
  readonly realAt: RealInstant;
}

export interface WorkspaceRepository {
  get(id: string, options?: LockOptions): Promise<WorkspaceRecord | null>;
  insert(record: WorkspaceRecord & { readonly createdByIpHash: string | null }): Promise<void>;
  setVirtualNow(id: string, virtualNow: VirtualInstant): Promise<void>;
  setFault(id: string, fault: FaultName, enabled: boolean): Promise<void>;
  /** Apaga una falla de un solo uso y devuelve si estaba activa (atómico). */
  consumeFault(id: string, fault: FaultName): Promise<boolean>;
}

export interface ActorRepository {
  list(workspaceId: string): Promise<ActorRecord[]>;
  insert(record: ActorRecord): Promise<void>;
}

export interface AccountRepository {
  getByKind(workspaceId: string, kind: AccountKind, options?: LockOptions): Promise<Account | null>;
  getById(workspaceId: string, id: string, options?: LockOptions): Promise<Account | null>;
  insert(account: Account, options?: { readonly bankName?: string | null }): Promise<void>;
  /** Guarda saldo, versión, reservas y retenciones. */
  save(account: Account): Promise<void>;
  /** Datos de presentación que no forman parte del agregado. */
  bankName(workspaceId: string, id: string): Promise<string | null>;
}

export interface PolicyRepository {
  getForAccount(workspaceId: string, accountId: string, options?: LockOptions): Promise<PayerPolicyRecord | null>;
  insert(record: PayerPolicyRecord): Promise<void>;
  save(record: PayerPolicyRecord): Promise<void>;
}

export interface RecipientRepository {
  get(workspaceId: string, id: string): Promise<RecipientRecord | null>;
  list(workspaceId: string): Promise<RecipientRecord[]>;
  insert(record: RecipientRecord): Promise<void>;
}

export interface ObligationRepository {
  get(workspaceId: string, id: string, options?: LockOptions): Promise<ObligationRecord | null>;
  list(workspaceId: string): Promise<ObligationRecord[]>;
  insert(record: ObligationRecord): Promise<void>;
  saveStatus(workspaceId: string, id: string, status: ObligationStatus): Promise<void>;
}

export interface PlanRepository {
  /** Versión más alta del plan. */
  getCurrent(workspaceId: string, planId: string, options?: LockOptions): Promise<PlanVersionRecord | null>;
  getVersion(workspaceId: string, planId: string, version: number): Promise<PlanVersionRecord | null>;
  latestForObligation(workspaceId: string, obligationId: string): Promise<PlanVersionRecord | null>;
  listForObligation(workspaceId: string, obligationId: string): Promise<PlanVersionRecord[]>;
  insertVersion(record: PlanVersionRecord): Promise<void>;
  /** Actualiza estado y campos mutables de una versión existente. */
  saveVersion(record: PlanVersionRecord): Promise<void>;
}

export interface ApprovalRepository {
  get(workspaceId: string, id: string, options?: LockOptions): Promise<Approval | null>;
  /** La aprobación ACTIVE más reciente para el sujeto y versión, si existe. */
  findActive(workspaceId: string, subjectId: string, subjectVersion: number, options?: LockOptions): Promise<Approval | null>;
  listForSubject(workspaceId: string, subjectId: string): Promise<Approval[]>;
  listActive(workspaceId: string): Promise<Approval[]>;
  insert(approval: Approval): Promise<void>;
  save(approval: Approval): Promise<void>;
}

export interface AttemptRepository {
  get(workspaceId: string, id: string, options?: LockOptions): Promise<AttemptRecord | null>;
  findByKey(workspaceId: string, idempotencyKey: string): Promise<AttemptRecord | null>;
  listForObligation(workspaceId: string, obligationId: string): Promise<AttemptRecord[]>;
  listForSubject(workspaceId: string, subjectId: string): Promise<AttemptRecord[]>;
  listActive(workspaceId: string): Promise<AttemptRecord[]>;
  listAll(workspaceId: string): Promise<AttemptRecord[]>;
  /** Lanza DuplicateRecordError si un índice único lo rechaza. */
  insert(record: AttemptRecord): Promise<void>;
  save(record: AttemptRecord): Promise<void>;
  /** Toma el permiso de envío por `seconds` (hora real) si nadie lo tiene; false si otro envío está en curso. */
  acquireSubmitLease(workspaceId: string, id: string, seconds: number): Promise<boolean>;
  /** Suelta el permiso cuando la llamada al proveedor ya terminó sin dejar nada en vuelo. */
  releaseSubmitLease(workspaceId: string, id: string): Promise<void>;
}

export interface MandateRepository {
  get(workspaceId: string, id: string, options?: LockOptions): Promise<StandingMandate | null>;
  list(workspaceId: string): Promise<StandingMandate[]>;
  insert(mandate: StandingMandate): Promise<void>;
  save(mandate: StandingMandate): Promise<void>;
}

/**
 * Remesa para gastos de llegada (T3, enmienda A1). READY: viable y dentro del mandato. APPROVAL_REQUESTED: escaló al
 * pagador (fuera del tope o sin mandato). APPROVED: el pagador aprobó una vez. BLOCKED: sin ruta o destinatario no
 * admitido. EXECUTING, DELIVERED y FAILED siguen al intento.
 */
export type RemittanceStatus = "READY" | "APPROVAL_REQUESTED" | "APPROVED" | "BLOCKED" | "EXECUTING" | "DELIVERED" | "FAILED";

export interface RemittanceRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly mandateId: string | null;
  readonly recipientId: string;
  readonly sourceAccountId: string;
  readonly purpose: "ARRIVAL_EXPENSES";
  readonly net: Money;
  readonly targetArrivalAt: VirtualInstant;
  readonly status: RemittanceStatus;
  readonly authorization: "MANDATE" | "PAYER_APPROVAL" | null;
  /** Razones de bloqueo o de escalada (por ejemplo EXCEEDS_MANDATE_PERIOD_LIMIT). */
  readonly reasons: readonly ReasonCode[];
  readonly quote: RouteQuote | null;
  readonly evaluation: RemittanceRoutingResult;
  readonly approvalId: string | null;
  readonly approvalExpiresAt: VirtualInstant | null;
  readonly createdByActorId: string;
  readonly version: number;
  readonly createdAt: VirtualInstant;
}

export interface RemittanceRepository {
  get(workspaceId: string, id: string, options?: LockOptions): Promise<RemittanceRecord | null>;
  list(workspaceId: string): Promise<RemittanceRecord[]>;
  insert(record: RemittanceRecord): Promise<void>;
  save(record: RemittanceRecord): Promise<void>;
}

export interface RefundRepository {
  get(workspaceId: string, id: string, options?: LockOptions): Promise<RefundClaim | null>;
  list(workspaceId: string): Promise<RefundClaim[]>;
  insert(claim: RefundClaim, createdByActorId: string, idempotencyKey: string | null): Promise<void>;
  save(claim: RefundClaim, idempotencyKey?: string | null): Promise<void>;
  idempotencyKey(workspaceId: string, id: string): Promise<string | null>;
}

export interface FinanceFactsRepository {
  conditionalIncomes(workspaceId: string): Promise<ConditionalIncome[]>;
  expectedExpenses(workspaceId: string): Promise<ExpectedExpense[]>;
  insertConditionalIncome(workspaceId: string, income: ConditionalIncome): Promise<void>;
  insertExpectedExpense(workspaceId: string, expense: ExpectedExpense): Promise<void>;
}

export interface EventRepository {
  /** Agrega eventos con número de secuencia por espacio. El payload se redacta antes de guardarse. */
  append(workspaceId: string, drafts: readonly DomainEventDraft[]): Promise<void>;
  list(workspaceId: string, options?: { readonly afterSeq?: number; readonly limit?: number }): Promise<StoredEvent[]>;
}

export interface ProviderEventReceiptRepository {
  /** Registra un evento del proveedor como procesado. Devuelve false si ya estaba (duplicado). */
  markProcessed(workspaceId: string, providerEventId: string): Promise<boolean>;
}

export type PendingChangeKind = "POLICY_CHANGE" | "MANDATE_CHANGE";
export type PendingChangeStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

/** Cambio de política o de mandato preparado por chat, a la espera de confirmación en pantalla fija. */
export interface PendingChangeRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: PendingChangeKind;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly fingerprint: string;
  readonly status: PendingChangeStatus;
  readonly createdByActorId: string;
}

export interface PendingChangeRepository {
  get(workspaceId: string, id: string, options?: LockOptions): Promise<PendingChangeRecord | null>;
  listPending(workspaceId: string): Promise<PendingChangeRecord[]>;
  insert(record: PendingChangeRecord): Promise<void>;
  setStatus(workspaceId: string, id: string, status: PendingChangeStatus): Promise<void>;
}

export interface Repositories {
  readonly workspaces: WorkspaceRepository;
  readonly actors: ActorRepository;
  readonly accounts: AccountRepository;
  readonly policies: PolicyRepository;
  readonly recipients: RecipientRepository;
  readonly obligations: ObligationRepository;
  readonly plans: PlanRepository;
  readonly approvals: ApprovalRepository;
  readonly attempts: AttemptRepository;
  readonly mandates: MandateRepository;
  readonly refunds: RefundRepository;
  readonly remittances: RemittanceRepository;
  readonly finance: FinanceFactsRepository;
  readonly events: EventRepository;
  readonly providerReceipts: ProviderEventReceiptRepository;
  readonly pendingChanges: PendingChangeRepository;
}

/** Unidad de trabajo: una transacción de base de datos con repositorios ligados a ella. */
export interface UnitOfWork {
  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
  /** Repositorios fuera de transacción, para lecturas. */
  readonly read: Repositories;
}
