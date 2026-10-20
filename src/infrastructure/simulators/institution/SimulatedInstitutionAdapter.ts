import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { PolicyViolationError } from "@/domain/errors/DomainError";
import { Money, type Currency } from "@/domain/money/Money";
import type {
  CreditStatus,
  InstitutionPort,
  InstitutionRefund,
  InstitutionRefundStatus,
  LedgerSummary,
} from "@/domain/ports/InstitutionPort";
import type { SimulationContext } from "@/domain/ports/PaymentProviderPort";
import { VirtualInstant } from "@/domain/time/Instant";
import type { Db } from "../../db/client";
import { simInstitutionLedger, simInstitutionRefunds, workspaces } from "../../db/schema";
import { getScenario } from "../../scenarios/definitions";
import type { ScenarioId } from "../../scenarios/types";
import { INSTITUTION_INJECTION_TEXT } from "../injectionTexts";

const money = (currency: string, minor: bigint) => Money.of(currency as Currency, minor);
/** La base o una transacción abierta: dentro de la sección crítica todo se lee con la misma conexión. */
type Exec = Pick<Db, "select" | "update">;
const shortId = () => randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

/**
 * Institución simulada con tablas propias. Acredita un envío cuando se cumple su llegada estimada en hora virtual.
 * Los estados se calculan de forma perezosa al consultarse, con la hora virtual del espacio.
 */
export class SimulatedInstitutionAdapter implements InstitutionPort {
  constructor(private readonly db: Db) {}

  /** API interna del mundo simulado: el proveedor entrega un envío a la universidad. */
  async receiveTransfer(
    ctx: SimulationContext,
    input: { readonly reference: string; readonly transferId: string; readonly net: Money; readonly owed: Money; readonly expectedCreditAt: VirtualInstant },
  ): Promise<void> {
    await this.db.insert(simInstitutionLedger).values({
      id: `led_${randomUUID()}`,
      workspaceId: ctx.workspaceId,
      reference: input.reference,
      transferId: input.transferId,
      currency: input.net.currency,
      netMinor: input.net.minor,
      owedMinor: input.owed.minor,
      status: "PENDING",
      expectedCreditAtVirtual: input.expectedCreditAt.toDate(),
    }).onConflictDoNothing();
  }

  /** Carga histórica al crear un espacio (matrícula ya acreditada o sobrepagada). */
  async seedCredited(ctx: SimulationContext, input: { readonly reference: string; readonly net: Money; readonly owed: Money; readonly creditedAt: VirtualInstant }): Promise<string> {
    const receiptId = `AU-RC-${shortId()}`;
    await this.db.insert(simInstitutionLedger).values({
      id: `led_${randomUUID()}`,
      workspaceId: ctx.workspaceId,
      reference: input.reference,
      transferId: null,
      currency: input.net.currency,
      netMinor: input.net.minor,
      owedMinor: input.owed.minor,
      status: "CREDITED",
      expectedCreditAtVirtual: input.creditedAt.toDate(),
      creditedAtVirtual: input.creditedAt.toDate(),
      receiptId,
    });
    return receiptId;
  }

  async getCreditStatus(ctx: SimulationContext, reference: string, transferId: string): Promise<CreditStatus | null> {
    await this.creditDue(this.db, ctx);
    const [row] = await this.db
      .select()
      .from(simInstitutionLedger)
      .where(and(eq(simInstitutionLedger.workspaceId, ctx.workspaceId), eq(simInstitutionLedger.reference, reference), eq(simInstitutionLedger.transferId, transferId)));
    if (!row) return null;
    const notice = (await this.injectionActive(ctx)) ? INSTITUTION_INJECTION_TEXT : null;
    return {
      reference: row.reference,
      transferId,
      status: row.status === "CREDITED" ? "CREDITED" : "PENDING",
      expectedCreditAt: VirtualInstant.fromDate(row.expectedCreditAtVirtual),
      receipt:
        row.status === "CREDITED" && row.receiptId && row.creditedAtVirtual
          ? { receiptId: row.receiptId, net: money(row.currency, row.netMinor), reference: row.reference, creditedAt: VirtualInstant.fromDate(row.creditedAtVirtual) }
          : null,
      notice,
    };
  }

  async getLedger(ctx: SimulationContext, reference: string): Promise<LedgerSummary> {
    return this.ledger(this.db, ctx, reference);
  }

  private async ledger(db: Exec, ctx: SimulationContext, reference: string): Promise<LedgerSummary> {
    await this.creditDue(db, ctx);
    const rows = await db
      .select()
      .from(simInstitutionLedger)
      .where(and(eq(simInstitutionLedger.workspaceId, ctx.workspaceId), eq(simInstitutionLedger.reference, reference)))
      .orderBy(asc(simInstitutionLedger.createdAt));
    const currency = (rows[0]?.currency ?? "CNY") as Currency;
    const owed = rows.length ? money(currency, rows[0]!.owedMinor) : Money.zero(currency);
    const credited = Money.sum(currency, rows.filter((r) => r.status === "CREDITED").map((r) => money(r.currency, r.netMinor)));
    const refunded = await this.refundedTotal(db, ctx, reference, currency);
    const excess = credited.subtract(owed).subtract(refunded);
    return { reference, owed, credited, verifiedExcess: excess.isNegative() ? Money.zero(currency) : excess };
  }

  async submitRefundClaim(
    ctx: SimulationContext,
    claim: { readonly claimRef: string; readonly reference: string; readonly amount: Money; readonly destinationAccountRef: string },
  ): Promise<{ readonly institutionClaimId: string }> {
    // Comprobar el exceso e insertar es una sola sección crítica por referencia (VC9-1): dos reclamos en paralelo nunca
    // suman más que el exceso verificado, y el mismo reclamo repetido devuelve el registro que ya existe.
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`institution-refund:${ctx.workspaceId}:${claim.reference}`}))`);
      const [existing] = await tx
        .select()
        .from(simInstitutionRefunds)
        .where(and(eq(simInstitutionRefunds.workspaceId, ctx.workspaceId), eq(simInstitutionRefunds.claimRef, claim.claimRef)));
      if (existing) return { institutionClaimId: existing.id };
      const ledger = await this.ledger(tx, ctx, claim.reference);
      if (claim.amount.greaterThan(ledger.verifiedExcess)) throw new PolicyViolationError(["REFUND_EXCEEDS_VERIFIED_EXCESS"]);
      const scenario = await this.scenarioOf(ctx, tx);
      const refundConfig = scenario.refund ?? { verifiedExcessCny: "500.00", settlementUsd: "70.00", settlesInHours: 24 };
      const configuredExcess = Money.fromDecimal("CNY", refundConfig.verifiedExcessCny);
      // Liquidación sintética en USD: proporcional a lo reclamado frente al exceso configurado, con redondeo bancario.
      const settlement = Money.fromDecimal("USD", refundConfig.settlementUsd).mulDiv(claim.amount.minor, configuredExcess.minor);
      const id = `AU-RF-${shortId()}`;
      await tx.insert(simInstitutionRefunds).values({
        id,
        workspaceId: ctx.workspaceId,
        claimRef: claim.claimRef,
        reference: claim.reference,
        currency: claim.amount.currency,
        amountMinor: claim.amount.minor,
        destinationAccountRef: claim.destinationAccountRef,
        status: "SUBMITTED",
        submittedAtVirtual: ctx.now.toDate(),
        reviewAtVirtual: ctx.now.plusHours(1).toDate(),
        settlesAtVirtual: ctx.now.plusHours(refundConfig.settlesInHours).toDate(),
        settlementCurrency: settlement.currency,
        settlementMinor: settlement.minor,
      });
      return { institutionClaimId: id };
    });
  }

  async getRefundStatus(ctx: SimulationContext, institutionClaimId: string): Promise<InstitutionRefund | null> {
    const [row] = await this.db
      .select()
      .from(simInstitutionRefunds)
      .where(and(eq(simInstitutionRefunds.workspaceId, ctx.workspaceId), eq(simInstitutionRefunds.id, institutionClaimId)));
    if (!row) return null;
    const review = VirtualInstant.fromDate(row.reviewAtVirtual);
    const settles = VirtualInstant.fromDate(row.settlesAtVirtual);
    const approvedAt = VirtualInstant.fromEpochMs(review.epochMs + Math.trunc((settles.epochMs - review.epochMs) / 2));
    let status: InstitutionRefundStatus = "SUBMITTED";
    if (!ctx.now.isBefore(settles)) status = "REFUNDED";
    else if (!ctx.now.isBefore(approvedAt)) status = "APPROVED";
    else if (!ctx.now.isBefore(review)) status = "UNDER_REVIEW";
    if (status !== row.status) {
      await this.db.update(simInstitutionRefunds).set({ status }).where(and(eq(simInstitutionRefunds.workspaceId, ctx.workspaceId), eq(simInstitutionRefunds.id, row.id)));
    }
    return {
      institutionClaimId: row.id,
      status,
      settlement: status === "REFUNDED" ? money(row.settlementCurrency, row.settlementMinor) : null,
      settledAt: status === "REFUNDED" ? settles : null,
    };
  }

  /** Acredita los envíos cuya llegada estimada ya pasó en hora virtual. */
  private async creditDue(db: Exec, ctx: SimulationContext): Promise<void> {
    const pending = await db
      .select()
      .from(simInstitutionLedger)
      .where(and(eq(simInstitutionLedger.workspaceId, ctx.workspaceId), eq(simInstitutionLedger.status, "PENDING")));
    for (const row of pending) {
      const expected = VirtualInstant.fromDate(row.expectedCreditAtVirtual);
      if (ctx.now.isBefore(expected)) continue;
      await db
        .update(simInstitutionLedger)
        .set({ status: "CREDITED", creditedAtVirtual: expected.toDate(), receiptId: `AU-RC-${shortId()}` })
        .where(and(eq(simInstitutionLedger.workspaceId, ctx.workspaceId), eq(simInstitutionLedger.id, row.id), eq(simInstitutionLedger.status, "PENDING")));
    }
  }

  private async refundedTotal(db: Exec, ctx: SimulationContext, reference: string, currency: Currency): Promise<Money> {
    const rows = await db
      .select()
      .from(simInstitutionRefunds)
      .where(and(eq(simInstitutionRefunds.workspaceId, ctx.workspaceId), eq(simInstitutionRefunds.reference, reference)));
    return Money.sum(currency, rows.filter((r) => r.status !== "REJECTED" && r.currency === currency).map((r) => money(r.currency, r.amountMinor)));
  }

  private async injectionActive(ctx: SimulationContext): Promise<boolean> {
    const [row] = await this.db.select({ faults: workspaces.faults }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
    return row?.faults?.INSTITUTION_INJECTION_TEXT === true;
  }

  async delayActive(ctx: SimulationContext): Promise<boolean> {
    const [row] = await this.db.select({ faults: workspaces.faults }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
    return row?.faults?.DELAY_INSTITUTION_CREDIT === true;
  }

  private async scenarioOf(ctx: SimulationContext, db: Exec = this.db) {
    const [row] = await db.select({ scenario: workspaces.scenario }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
    return getScenario((row?.scenario ?? "base") as ScenarioId);
  }
}
