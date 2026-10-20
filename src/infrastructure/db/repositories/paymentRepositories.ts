import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { Approval, type ApprovalStatus, type ApprovalSubjectType } from "@/domain/consent/Approval";
import { StandingMandate, type MandatePurpose, type MandateStatus } from "@/domain/consent/StandingMandate";
import { Money, type Currency } from "@/domain/money/Money";
import { ACTIVE_ATTEMPT_STATUSES, PaymentAttempt, type AttemptKind, type AttemptStatus } from "@/domain/payment/PaymentAttempt";
import { PaymentPlan, type PlanStatus } from "@/domain/payment/PaymentPlan";
import { DuplicateRecordError, isUniqueViolation } from "@/domain/ports/Repositories";
import type {
  RemittanceRecord,
  RemittanceRepository,
  RemittanceStatus,
  ApprovalRepository,
  AttemptRecord,
  AttemptRepository,
  LockOptions,
  MandateRepository,
  PlanRepository,
  PlanVersionRecord,
  RefundRepository,
} from "@/domain/ports/Repositories";
import { RefundClaim, type RefundStatus } from "@/domain/refund/RefundClaim";
import { VirtualInstant } from "@/domain/time/Instant";
import type { DbExecutor } from "../executor";
import { RouteJsonMapper, type RouteQuoteJSON, type RoutingResultJSON } from "../mappers/RouteJsonMapper";
import { approvals, paymentAttempts, paymentPlans, refundClaims, remittances, standingMandates } from "../schema";

const money = (currency: string, minor: bigint) => Money.of(currency as Currency, minor);
const virtual = (date: Date | null) => (date ? VirtualInstant.fromDate(date) : null);

export class DrizzlePlanRepository implements PlanRepository {
  constructor(private readonly db: DbExecutor) {}

  async getCurrent(workspaceId: string, planId: string, options?: LockOptions): Promise<PlanVersionRecord | null> {
    const query = this.db
      .select()
      .from(paymentPlans)
      .where(and(eq(paymentPlans.workspaceId, workspaceId), eq(paymentPlans.id, planId)))
      .orderBy(desc(paymentPlans.version))
      .limit(1);
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? toPlanRecord(row) : null;
  }

  async getVersion(workspaceId: string, planId: string, version: number): Promise<PlanVersionRecord | null> {
    const [row] = await this.db
      .select()
      .from(paymentPlans)
      .where(and(eq(paymentPlans.workspaceId, workspaceId), eq(paymentPlans.id, planId), eq(paymentPlans.version, version)));
    return row ? toPlanRecord(row) : null;
  }

  async latestForObligation(workspaceId: string, obligationId: string): Promise<PlanVersionRecord | null> {
    const [row] = await this.db
      .select()
      .from(paymentPlans)
      .where(and(eq(paymentPlans.workspaceId, workspaceId), eq(paymentPlans.obligationId, obligationId)))
      .orderBy(desc(paymentPlans.createdAt), desc(paymentPlans.version))
      .limit(1);
    return row ? toPlanRecord(row) : null;
  }

  async listForObligation(workspaceId: string, obligationId: string): Promise<PlanVersionRecord[]> {
    const rows = await this.db
      .select()
      .from(paymentPlans)
      .where(and(eq(paymentPlans.workspaceId, workspaceId), eq(paymentPlans.obligationId, obligationId)))
      .orderBy(paymentPlans.createdAt, paymentPlans.version);
    return rows.map(toPlanRecord);
  }

  async insertVersion(record: PlanVersionRecord): Promise<void> {
    await this.db.insert(paymentPlans).values(toPlanRow(record));
  }

  async saveVersion(record: PlanVersionRecord): Promise<void> {
    const row = toPlanRow(record);
    await this.db
      .update(paymentPlans)
      .set({
        status: row.status,
        targetArrivalAtVirtual: row.targetArrivalAtVirtual,
        selectedRouteId: row.selectedRouteId,
        quoteSnapshot: row.quoteSnapshot,
        evaluation: row.evaluation,
        approvalRequestedAtVirtual: row.approvalRequestedAtVirtual,
        approvalExpiresAtVirtual: row.approvalExpiresAtVirtual,
        updatedAt: new Date(),
      })
      .where(and(eq(paymentPlans.workspaceId, row.workspaceId), eq(paymentPlans.id, row.id), eq(paymentPlans.version, row.version)));
  }
}

function toPlanRow(record: PlanVersionRecord) {
  const p = record.plan.toProps();
  return {
    id: p.id,
    version: p.version,
    workspaceId: p.workspaceId,
    obligationId: p.obligationId,
    obligationVersion: p.obligationVersion,
    status: p.status,
    targetArrivalAtVirtual: p.targetArrivalAt.toDate(),
    selectedRouteId: p.selectedRouteId,
    quoteSnapshot: record.quote ? RouteJsonMapper.quoteToJSON(record.quote) : null,
    evaluation: RouteJsonMapper.resultToJSON(record.evaluation),
    createdByActorId: p.createdByActorId,
    approvalRequestedAtVirtual: p.approvalRequestedAt?.toDate() ?? null,
    approvalExpiresAtVirtual: p.approvalExpiresAt?.toDate() ?? null,
  };
}

function toPlanRecord(row: typeof paymentPlans.$inferSelect): PlanVersionRecord {
  return {
    plan: PaymentPlan.rehydrate({
      id: row.id,
      workspaceId: row.workspaceId,
      obligationId: row.obligationId,
      obligationVersion: row.obligationVersion,
      version: row.version,
      status: row.status as PlanStatus,
      targetArrivalAt: VirtualInstant.fromDate(row.targetArrivalAtVirtual),
      selectedRouteId: row.selectedRouteId,
      createdByActorId: row.createdByActorId,
      approvalRequestedAt: virtual(row.approvalRequestedAtVirtual),
      approvalExpiresAt: virtual(row.approvalExpiresAtVirtual),
    }),
    quote: row.quoteSnapshot ? RouteJsonMapper.quoteFromJSON(row.quoteSnapshot as RouteQuoteJSON) : null,
    evaluation: RouteJsonMapper.resultFromJSON(row.evaluation as RoutingResultJSON),
  };
}

export class DrizzleApprovalRepository implements ApprovalRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(workspaceId: string, id: string, options?: LockOptions): Promise<Approval | null> {
    const query = this.db.select().from(approvals).where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.id, id)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? toApproval(row) : null;
  }

  async findActive(workspaceId: string, subjectId: string, subjectVersion: number, options?: LockOptions): Promise<Approval | null> {
    const query = this.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, workspaceId),
          eq(approvals.subjectId, subjectId),
          eq(approvals.subjectVersion, subjectVersion),
          eq(approvals.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(approvals.createdAt))
      .limit(1);
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? toApproval(row) : null;
  }

  async listForSubject(workspaceId: string, subjectId: string): Promise<Approval[]> {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.subjectId, subjectId)))
      .orderBy(approvals.createdAt);
    return rows.map(toApproval);
  }

  async listActive(workspaceId: string): Promise<Approval[]> {
    const rows = await this.db.select().from(approvals).where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "ACTIVE")));
    return rows.map(toApproval);
  }

  async insert(approval: Approval): Promise<void> {
    const p = approval.toProps();
    await this.db.insert(approvals).values({
      id: p.id,
      workspaceId: p.workspaceId,
      subjectType: p.subjectType,
      subjectId: p.subjectId,
      subjectVersion: p.subjectVersion,
      payerActorId: p.payerActorId,
      fingerprint: p.fingerprint,
      canonicalPayload: p.canonicalPayload,
      currency: p.maxDebit.currency,
      maxDebitMinor: p.maxDebit.minor,
      reserveMinor: p.reserve.minor,
      grantedAtVirtual: p.grantedAt.toDate(),
      expiresAtVirtual: p.expiresAt.toDate(),
      status: p.status,
      invalidationReason: p.invalidationReason,
    });
  }

  async save(approval: Approval): Promise<void> {
    const p = approval.toProps();
    await this.db
      .update(approvals)
      .set({ status: p.status, invalidationReason: p.invalidationReason })
      .where(and(eq(approvals.workspaceId, p.workspaceId), eq(approvals.id, p.id)));
  }
}

function toApproval(row: typeof approvals.$inferSelect): Approval {
  return Approval.rehydrate({
    id: row.id,
    workspaceId: row.workspaceId,
    subjectType: row.subjectType as ApprovalSubjectType,
    subjectId: row.subjectId,
    subjectVersion: row.subjectVersion,
    payerActorId: row.payerActorId,
    fingerprint: row.fingerprint,
    canonicalPayload: row.canonicalPayload as Record<string, unknown>,
    maxDebit: money(row.currency, row.maxDebitMinor),
    reserve: money(row.currency, row.reserveMinor),
    grantedAt: VirtualInstant.fromDate(row.grantedAtVirtual),
    expiresAt: VirtualInstant.fromDate(row.expiresAtVirtual),
    status: row.status as ApprovalStatus,
    invalidationReason: row.invalidationReason,
  });
}

export class DrizzleAttemptRepository implements AttemptRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(workspaceId: string, id: string, options?: LockOptions): Promise<AttemptRecord | null> {
    const query = this.db.select().from(paymentAttempts).where(and(eq(paymentAttempts.workspaceId, workspaceId), eq(paymentAttempts.id, id)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? toAttempt(row) : null;
  }

  async findByKey(workspaceId: string, idempotencyKey: string): Promise<AttemptRecord | null> {
    const [row] = await this.db
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.workspaceId, workspaceId), eq(paymentAttempts.idempotencyKey, idempotencyKey)));
    return row ? toAttempt(row) : null;
  }

  async listForObligation(workspaceId: string, obligationId: string): Promise<AttemptRecord[]> {
    const rows = await this.db
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.workspaceId, workspaceId), eq(paymentAttempts.obligationId, obligationId)))
      .orderBy(paymentAttempts.createdAt);
    return rows.map(toAttempt);
  }

  async listForSubject(workspaceId: string, subjectId: string): Promise<AttemptRecord[]> {
    const rows = await this.db
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.workspaceId, workspaceId), eq(paymentAttempts.subjectId, subjectId)))
      .orderBy(paymentAttempts.createdAt);
    return rows.map(toAttempt);
  }

  async listActive(workspaceId: string): Promise<AttemptRecord[]> {
    const rows = await this.db
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.workspaceId, workspaceId), inArray(paymentAttempts.status, [...ACTIVE_ATTEMPT_STATUSES])))
      .orderBy(paymentAttempts.createdAt);
    return rows.map(toAttempt);
  }

  async listAll(workspaceId: string): Promise<AttemptRecord[]> {
    const rows = await this.db.select().from(paymentAttempts).where(eq(paymentAttempts.workspaceId, workspaceId)).orderBy(paymentAttempts.createdAt);
    return rows.map(toAttempt);
  }

  async insert(record: AttemptRecord): Promise<void> {
    try {
      await this.db.insert(paymentAttempts).values(toAttemptRow(record));
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateRecordError("Intento duplicado (clave de idempotencia o intento activo)");
      throw error;
    }
  }

  async acquireSubmitLease(workspaceId: string, id: string, seconds: number): Promise<boolean> {
    const rows = await this.db
      .update(paymentAttempts)
      .set({ submitLeaseUntil: sql`now() + make_interval(secs => ${seconds})` })
      .where(
        and(
          eq(paymentAttempts.workspaceId, workspaceId),
          eq(paymentAttempts.id, id),
          inArray(paymentAttempts.status, ["SUBMITTING", "UNKNOWN"]),
          or(isNull(paymentAttempts.submitLeaseUntil), lt(paymentAttempts.submitLeaseUntil, sql`now()`)),
        ),
      )
      .returning({ id: paymentAttempts.id });
    return rows.length > 0;
  }

  async releaseSubmitLease(workspaceId: string, id: string): Promise<void> {
    await this.db
      .update(paymentAttempts)
      .set({ submitLeaseUntil: null })
      .where(and(eq(paymentAttempts.workspaceId, workspaceId), eq(paymentAttempts.id, id)));
  }

  async save(record: AttemptRecord): Promise<void> {
    const row = toAttemptRow(record);
    await this.db
      .update(paymentAttempts)
      .set({ status: row.status, providerTransferId: row.providerTransferId, statusChangedAtVirtual: row.statusChangedAtVirtual, updatedAt: new Date() })
      .where(and(eq(paymentAttempts.workspaceId, row.workspaceId), eq(paymentAttempts.id, row.id)));
  }
}

function toAttemptRow(record: AttemptRecord) {
  const p = record.attempt.toProps();
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    kind: p.kind,
    subjectId: p.subjectId,
    subjectVersion: record.subjectVersion,
    obligationId: p.obligationId,
    idempotencyKey: p.idempotencyKey,
    requestHash: p.requestHash,
    approvalId: p.approvalId,
    mandateId: p.mandateId,
    status: p.status,
    providerTransferId: p.providerTransferId,
    currency: p.debit.currency,
    debitMinor: p.debit.minor,
    quoteId: p.quoteId,
    quoteSnapshot: RouteJsonMapper.quoteToJSON(record.quote),
    createdAtVirtual: p.createdAt.toDate(),
    statusChangedAtVirtual: record.statusChangedAt.toDate(),
  };
}

function toAttempt(row: typeof paymentAttempts.$inferSelect): AttemptRecord {
  return {
    attempt: PaymentAttempt.rehydrate({
      id: row.id,
      workspaceId: row.workspaceId,
      kind: row.kind as AttemptKind,
      subjectId: row.subjectId,
      obligationId: row.obligationId,
      idempotencyKey: row.idempotencyKey,
      requestHash: row.requestHash,
      approvalId: row.approvalId,
      mandateId: row.mandateId,
      status: row.status as AttemptStatus,
      providerTransferId: row.providerTransferId,
      debit: money(row.currency, row.debitMinor),
      quoteId: row.quoteId,
      createdAt: VirtualInstant.fromDate(row.createdAtVirtual),
    }),
    subjectVersion: row.subjectVersion,
    quote: RouteJsonMapper.quoteFromJSON(row.quoteSnapshot as RouteQuoteJSON),
    statusChangedAt: VirtualInstant.fromDate(row.statusChangedAtVirtual),
  };
}

export class DrizzleMandateRepository implements MandateRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(workspaceId: string, id: string, options?: LockOptions): Promise<StandingMandate | null> {
    const query = this.db.select().from(standingMandates).where(and(eq(standingMandates.workspaceId, workspaceId), eq(standingMandates.id, id)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? toMandate(row) : null;
  }

  async list(workspaceId: string): Promise<StandingMandate[]> {
    const rows = await this.db.select().from(standingMandates).where(eq(standingMandates.workspaceId, workspaceId));
    return rows.map(toMandate);
  }

  async insert(mandate: StandingMandate): Promise<void> {
    const p = mandate.toProps();
    await this.db.insert(standingMandates).values({
      id: p.id,
      workspaceId: p.workspaceId,
      payerActorId: p.payerActorId,
      purpose: p.purpose,
      recipientId: p.recipientId,
      currency: p.periodMax.currency,
      periodMaxMinor: p.periodMax.minor,
      periodDays: p.periodDays,
      expiresAtVirtual: p.expiresAt.toDate(),
      status: p.status,
      version: p.version,
    });
  }

  async save(mandate: StandingMandate): Promise<void> {
    const p = mandate.toProps();
    await this.db
      .update(standingMandates)
      .set({ periodMaxMinor: p.periodMax.minor, status: p.status, version: p.version, expiresAtVirtual: p.expiresAt.toDate() })
      .where(and(eq(standingMandates.workspaceId, p.workspaceId), eq(standingMandates.id, p.id)));
  }
}

function toMandate(row: typeof standingMandates.$inferSelect): StandingMandate {
  return StandingMandate.rehydrate({
    id: row.id,
    workspaceId: row.workspaceId,
    payerActorId: row.payerActorId,
    purpose: row.purpose as MandatePurpose,
    recipientId: row.recipientId,
    periodMax: money(row.currency, row.periodMaxMinor),
    periodDays: row.periodDays,
    expiresAt: VirtualInstant.fromDate(row.expiresAtVirtual),
    status: row.status as MandateStatus,
    version: row.version,
  });
}

export class DrizzleRefundRepository implements RefundRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(workspaceId: string, id: string, options?: LockOptions): Promise<RefundClaim | null> {
    const query = this.db.select().from(refundClaims).where(and(eq(refundClaims.workspaceId, workspaceId), eq(refundClaims.id, id)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? toRefund(row) : null;
  }

  async list(workspaceId: string): Promise<RefundClaim[]> {
    const rows = await this.db.select().from(refundClaims).where(eq(refundClaims.workspaceId, workspaceId)).orderBy(refundClaims.createdAt);
    return rows.map(toRefund);
  }

  async idempotencyKey(workspaceId: string, id: string): Promise<string | null> {
    const [row] = await this.db
      .select({ key: refundClaims.idempotencyKey })
      .from(refundClaims)
      .where(and(eq(refundClaims.workspaceId, workspaceId), eq(refundClaims.id, id)));
    return row?.key ?? null;
  }

  async insert(claim: RefundClaim, createdByActorId: string, idempotencyKey: string | null): Promise<void> {
    const p = claim.toProps();
    await this.db.insert(refundClaims).values({
      id: p.id,
      workspaceId: p.workspaceId,
      obligationId: p.obligationId,
      currency: p.amount.currency,
      excessMinor: p.verifiedExcess.minor,
      amountMinor: p.amount.minor,
      destinationAccountId: p.destinationAccountId,
      status: p.status,
      institutionClaimId: p.institutionClaimId,
      idempotencyKey,
      settlementCurrency: p.settlement?.currency ?? null,
      settlementMinor: p.settlement?.minor ?? null,
      version: p.version,
      createdByActorId,
    });
  }

  async save(claim: RefundClaim, idempotencyKey?: string | null): Promise<void> {
    const p = claim.toProps();
    await this.db
      .update(refundClaims)
      .set({
        status: p.status,
        institutionClaimId: p.institutionClaimId,
        settlementCurrency: p.settlement?.currency ?? null,
        settlementMinor: p.settlement?.minor ?? null,
        version: p.version,
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      })
      .where(and(eq(refundClaims.workspaceId, p.workspaceId), eq(refundClaims.id, p.id)));
  }
}

function toRefund(row: typeof refundClaims.$inferSelect): RefundClaim {
  return RefundClaim.rehydrate({
    id: row.id,
    workspaceId: row.workspaceId,
    obligationId: row.obligationId,
    verifiedExcess: money(row.currency, row.excessMinor),
    amount: money(row.currency, row.amountMinor),
    destinationAccountId: row.destinationAccountId,
    status: row.status as RefundStatus,
    institutionClaimId: row.institutionClaimId,
    settlement: row.settlementCurrency && row.settlementMinor !== null ? money(row.settlementCurrency, row.settlementMinor) : null,
    version: row.version,
  });
}

export class DrizzleRemittanceRepository implements RemittanceRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(workspaceId: string, id: string, options?: LockOptions): Promise<RemittanceRecord | null> {
    const query = this.db.select().from(remittances).where(and(eq(remittances.workspaceId, workspaceId), eq(remittances.id, id)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? toRemittance(row) : null;
  }

  async list(workspaceId: string): Promise<RemittanceRecord[]> {
    const rows = await this.db.select().from(remittances).where(eq(remittances.workspaceId, workspaceId)).orderBy(remittances.createdAt);
    return rows.map(toRemittance);
  }

  async insert(record: RemittanceRecord): Promise<void> {
    await this.db.insert(remittances).values(remittanceRow(record));
  }

  async save(record: RemittanceRecord): Promise<void> {
    const { id: _id, workspaceId: _ws, createdByActorId: _by, ...rest } = remittanceRow(record);
    await this.db.update(remittances).set(rest).where(and(eq(remittances.workspaceId, record.workspaceId), eq(remittances.id, record.id)));
  }
}

function remittanceRow(r: RemittanceRecord) {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    mandateId: r.mandateId,
    recipientId: r.recipientId,
    sourceAccountId: r.sourceAccountId,
    purpose: r.purpose,
    netCurrency: r.net.currency,
    netMinor: r.net.minor,
    routeId: r.quote?.routeId ?? null,
    quoteSnapshot: r.quote ? RouteJsonMapper.quoteToJSON(r.quote) : null,
    evaluation: { result: RouteJsonMapper.resultToJSON(r.evaluation), reasons: [...r.reasons] },
    debitCurrency: r.quote?.debit.currency ?? "USD",
    debitMinor: r.quote?.debit.minor ?? null,
    targetArrivalAtVirtual: r.targetArrivalAt.toDate(),
    status: r.status,
    authorization: r.authorization,
    approvalId: r.approvalId,
    approvalExpiresAtVirtual: r.approvalExpiresAt?.toDate() ?? null,
    createdByActorId: r.createdByActorId,
    version: r.version,
    createdAtVirtual: r.createdAt.toDate(),
  };
}

function toRemittance(row: typeof remittances.$inferSelect): RemittanceRecord {
  const stored = row.evaluation as { result: RoutingResultJSON; reasons: string[] };
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    mandateId: row.mandateId,
    recipientId: row.recipientId,
    sourceAccountId: row.sourceAccountId,
    purpose: "ARRIVAL_EXPENSES",
    net: money(row.netCurrency, row.netMinor),
    targetArrivalAt: VirtualInstant.fromDate(row.targetArrivalAtVirtual),
    status: row.status as RemittanceStatus,
    authorization: row.authorization as RemittanceRecord["authorization"],
    reasons: stored.reasons as RemittanceRecord["reasons"],
    quote: row.quoteSnapshot ? RouteJsonMapper.quoteFromJSON(row.quoteSnapshot as RouteQuoteJSON) : null,
    evaluation: RouteJsonMapper.resultFromJSON(stored.result),
    approvalId: row.approvalId,
    approvalExpiresAt: row.approvalExpiresAtVirtual ? VirtualInstant.fromDate(row.approvalExpiresAtVirtual) : null,
    createdByActorId: row.createdByActorId,
    version: row.version,
    createdAt: VirtualInstant.fromDate(row.createdAtVirtual),
  };
}
