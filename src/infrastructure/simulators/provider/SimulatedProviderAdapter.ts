import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { canonicalJson } from "@/domain/consent/canonicalJson";
import { Money, type Currency } from "@/domain/money/Money";
import type { RouteQuote } from "@/domain/policy/RouteQuote";
import type { HasherPort } from "@/domain/ports/HasherPort";
import {
  ProviderIdempotencyConflictError,
  ProviderTimeoutError,
  type PaymentProviderPort,
  type ProviderEvent,
  type ProviderTransfer,
  type SimulationContext,
  type SubmitResult,
  type TransferPayload,
} from "@/domain/ports/PaymentProviderPort";
import { VirtualInstant } from "@/domain/time/Instant";
import type { Db } from "../../db/client";
import type { DbExecutor } from "../../db/executor";
import { simProviderEvents, simProviderQuotes, simProviderTransfers, workspaces } from "../../db/schema";
import { getScenario } from "../../scenarios/definitions";
import { remittanceQuotes, tuitionQuote, tuitionQuotes } from "../../scenarios/scenarioQuotes";
import type { ScenarioDefinition, ScenarioId } from "../../scenarios/types";
import { PROVIDER_INJECTION_TEXT } from "../injectionTexts";
import type { SimulatedInstitutionAdapter } from "../institution/SimulatedInstitutionAdapter";

const money = (currency: string, minor: bigint) => Money.of(currency as Currency, minor);
const newQuotePrefix = () => `q_${randomUUID().replace(/-/g, "").slice(0, 10)}`;

/**
 * Proveedor de pagos simulado con tablas propias (BUILD_PROMPT 12). Acepta un envío una sola vez por clave de
 * idempotencia; si se repite con el mismo contenido devuelve lo existente y con otro contenido da conflicto.
 * Con LOSE_NEXT_PROVIDER_RESPONSE persiste la aceptación ANTES de lanzar el timeout, para que la conciliación
 * tenga un hecho que recuperar.
 */
export class SimulatedProviderAdapter implements PaymentProviderPort {
  constructor(
    private readonly db: Db,
    private readonly institution: SimulatedInstitutionAdapter,
    private readonly hasher: HasherPort,
  ) {}

  async quoteTuition(ctx: SimulationContext, request: { readonly universityRecipientId: string; readonly unverifiedRecipientId: string }): Promise<RouteQuote[]> {
    const scenario = await this.scenarioOf(ctx);
    const injected = await consumeFault(this.db, ctx.workspaceId, "PROVIDER_INJECTION_TEXT");
    const quotes = tuitionQuotes(scenario, { university: request.universityRecipientId, unverifiedAgent: request.unverifiedRecipientId }, ctx.now, newQuotePrefix()).map(
      (quote) => (injected ? { ...quote, providerMessage: PROVIDER_INJECTION_TEXT } : quote),
    );
    await this.storeQuotes(ctx, "TUITION", quotes, null);
    return quotes;
  }

  async quoteRemittance(ctx: SimulationContext, request: { readonly net: Money; readonly recipientId: string }): Promise<RouteQuote[]> {
    const scenario = await this.scenarioOf(ctx);
    const injected = await consumeFault(this.db, ctx.workspaceId, "PROVIDER_INJECTION_TEXT");
    const quotes = remittanceQuotes(scenario, request.net, request.recipientId, ctx.now, newQuotePrefix()).map((quote) =>
      injected ? { ...quote, providerMessage: PROVIDER_INJECTION_TEXT } : quote,
    );
    await this.storeQuotes(ctx, "REMITTANCE", quotes, null);
    return quotes;
  }

  async requote(ctx: SimulationContext, previous: RouteQuote): Promise<RouteQuote> {
    const scenario = await this.scenarioOf(ctx);
    const route = scenario.tuitionRoutes.find((r) => r.routeId === previous.routeId);
    let quote: RouteQuote;
    if (route) {
      const aboveMax = await consumeFault(this.db, ctx.workspaceId, "REQUOTE_ABOVE_MAX");
      const base = tuitionQuote(scenario, route, { university: previous.receiverId, unverifiedAgent: previous.receiverId }, ctx.now, {
        quoteId: `${newQuotePrefix()}-${route.routeId}`,
        debitUsd: aboveMax ? scenario.requote.aboveMaxDebitUsd : route.requoteDebitUsd,
      });
      quote = { ...base, receiverId: previous.receiverId };
    } else {
      // Remesa: misma ruta y mismo neto, débito sin cambios.
      quote = { ...previous, quoteId: `${newQuotePrefix()}-${previous.routeId}`, quotedAt: ctx.now, expiresAt: ctx.now.plusMinutes(scenario.quoteValidityMinutes), providerMessage: null };
    }
    await this.storeQuotes(ctx, route ? "TUITION" : "REMITTANCE", [quote], previous.quoteId);
    return quote;
  }

  async submitTransfer(ctx: SimulationContext, idempotencyKey: string, payload: TransferPayload): Promise<SubmitResult> {
    const payloadHash = this.hasher.sha256Hex(canonicalJson(payload));
    const debit = Money.fromJSON(payload.debit);
    const outcome = await this.db.transaction(async (tx) => {
      // Acepta una sola vez por clave, también bajo concurrencia: el primero inserta; un envío repetido o
      // simultáneo choca con el índice único, espera, relee la fila y devuelve lo existente sin efectos nuevos.
      const transferId = `tr_${randomUUID()}`;
      const inserted = await tx
        .insert(simProviderTransfers)
        .values({
          id: transferId,
          workspaceId: ctx.workspaceId,
          idempotencyKey,
          payloadHash,
          payload,
          status: "PROCESSING",
          debitCurrency: debit.currency,
          debitMinor: debit.minor,
        })
        .onConflictDoNothing()
        .returning({ id: simProviderTransfers.id });
      if (inserted.length === 0) {
        const [existing] = await tx
          .select()
          .from(simProviderTransfers)
          .where(and(eq(simProviderTransfers.workspaceId, ctx.workspaceId), eq(simProviderTransfers.idempotencyKey, idempotencyKey)));
        if (!existing) throw new ProviderIdempotencyConflictError("Transferencia no encontrada tras el conflicto");
        if (existing.payloadHash !== payloadHash) throw new ProviderIdempotencyConflictError("Misma clave de idempotencia con otro contenido");
        return { result: toSubmitResult(existing), created: false, lose: false };
      }
      const where = and(eq(simProviderTransfers.workspaceId, ctx.workspaceId), eq(simProviderTransfers.id, transferId));
      if (await consumeFault(tx, ctx.workspaceId, "FAIL_NEXT_TRANSFER")) {
        await tx.update(simProviderTransfers).set({ status: "FAILED", failureCode: "REJECTED_BY_PROVIDER" }).where(where);
        return { result: { status: "FAILED", transferId, code: "REJECTED_BY_PROVIDER" } as SubmitResult, created: true, lose: false };
      }
      const expectedArrivalAt = ctx.now.plusMinutes(payload.arrivalMinutes);
      await tx
        .update(simProviderTransfers)
        .set({ status: "ACCEPTED", acceptedAtVirtual: ctx.now.toDate(), expectedArrivalAtVirtual: expectedArrivalAt.toDate() })
        .where(where);
      // El proveedor acepta y debita: emite el evento de débito (dos veces con DUPLICATE_NEXT_EVENT).
      const duplicate = await consumeFault(tx, ctx.workspaceId, "DUPLICATE_NEXT_EVENT");
      const providerEventId = `ev_${transferId}_debit`;
      for (let i = 0; i < (duplicate ? 2 : 1); i++) {
        await tx.insert(simProviderEvents).values({
          id: randomUUID(),
          workspaceId: ctx.workspaceId,
          providerEventId,
          transferId,
          type: "DEBIT_CONFIRMED",
          debitCurrency: debit.currency,
          debitMinor: debit.minor,
          emittedAtVirtual: ctx.now.toDate(),
        });
      }
      const lose = await consumeFault(tx, ctx.workspaceId, "LOSE_NEXT_PROVIDER_RESPONSE");
      return { result: { status: "ACCEPTED", transferId, acceptedAt: ctx.now, expectedArrivalAt } as SubmitResult, created: true, lose };
    });

    // Solo la transferencia recién aceptada se entrega a la universidad: una repetición no duplica el libro (VC4-1).
    if (outcome.created && outcome.result.status === "ACCEPTED" && payload.kind === "TUITION") {
      await this.deliverToInstitution(ctx, outcome.result.transferId, payload, outcome.result.expectedArrivalAt);
    }
    if (outcome.lose) throw new ProviderTimeoutError("El proveedor no respondió a tiempo");
    return outcome.result;
  }

  async getTransfer(ctx: SimulationContext, idempotencyKey: string): Promise<ProviderTransfer | null> {
    const [row] = await this.db
      .select()
      .from(simProviderTransfers)
      .where(and(eq(simProviderTransfers.workspaceId, ctx.workspaceId), eq(simProviderTransfers.idempotencyKey, idempotencyKey)));
    if (!row || row.status === "PROCESSING") return null;
    return {
      transferId: row.id,
      idempotencyKey: row.idempotencyKey,
      status: row.status as "ACCEPTED" | "FAILED",
      debit: money(row.debitCurrency, row.debitMinor),
      acceptedAt: row.acceptedAtVirtual ? VirtualInstant.fromDate(row.acceptedAtVirtual) : null,
      expectedArrivalAt: row.expectedArrivalAtVirtual ? VirtualInstant.fromDate(row.expectedArrivalAtVirtual) : null,
    };
  }

  async events(ctx: SimulationContext, transferId: string): Promise<ProviderEvent[]> {
    const rows = await this.db
      .select()
      .from(simProviderEvents)
      .where(and(eq(simProviderEvents.workspaceId, ctx.workspaceId), eq(simProviderEvents.transferId, transferId)))
      .orderBy(asc(simProviderEvents.createdAt));
    return rows.map((row) => ({
      deliveryId: row.id,
      providerEventId: row.providerEventId,
      transferId: row.transferId,
      type: "DEBIT_CONFIRMED" as const,
      debit: money(row.debitCurrency, row.debitMinor),
      emittedAt: VirtualInstant.fromDate(row.emittedAtVirtual),
    }));
  }

  private async deliverToInstitution(ctx: SimulationContext, transferId: string, payload: TransferPayload, expectedArrivalAt: VirtualInstant): Promise<void> {
    const scenario = await this.scenarioOf(ctx);
    const delay = await this.institution.delayActive(ctx);
    await this.institution.receiveTransfer(ctx, {
      reference: payload.reference,
      transferId,
      net: Money.fromJSON(payload.net),
      owed: Money.fromDecimal("CNY", scenario.obligation.netDueCny),
      expectedCreditAt: delay ? expectedArrivalAt.plusHours(scenario.delayedCreditExtraHours) : expectedArrivalAt,
    });
  }

  private async storeQuotes(ctx: SimulationContext, purpose: "TUITION" | "REMITTANCE", quotes: readonly RouteQuote[], requoteOf: string | null): Promise<void> {
    if (quotes.length === 0) return;
    await this.db.insert(simProviderQuotes).values(
      quotes.map((q) => ({
        id: q.quoteId,
        workspaceId: ctx.workspaceId,
        purpose,
        routeId: q.routeId,
        channel: q.channel,
        receiverId: q.receiverId,
        debitCurrency: q.debit.currency,
        debitMinor: q.debit.minor,
        netCurrency: q.net.currency,
        netMinor: q.net.minor,
        arrivalMinutes: q.arrivalMinutes,
        quotedAtVirtual: q.quotedAt.toDate(),
        expiresAtVirtual: q.expiresAt.toDate(),
        providerMessage: q.providerMessage,
        requoteOf,
      })),
    );
  }

  private async scenarioOf(ctx: SimulationContext): Promise<ScenarioDefinition> {
    const [row] = await this.db.select({ scenario: workspaces.scenario }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
    return getScenario((row?.scenario ?? "base") as ScenarioId);
  }
}

/** Apaga una falla de un solo uso y dice si estaba activa (atómico en la fila del espacio). */
async function consumeFault(db: DbExecutor, workspaceId: string, fault: string): Promise<boolean> {
  const rows = await db
    .update(workspaces)
    .set({ faults: sql`jsonb_set(${workspaces.faults}, ${`{${fault}}`}::text[], 'false'::jsonb, true)` })
    .where(and(eq(workspaces.id, workspaceId), sql`(${workspaces.faults} ->> ${fault}) = 'true'`))
    .returning({ id: workspaces.id });
  return rows.length > 0;
}

function toSubmitResult(row: typeof simProviderTransfers.$inferSelect): SubmitResult {
  if (row.status === "PROCESSING") throw new ProviderTimeoutError("La transferencia sigue en proceso");
  if (row.status === "FAILED") return { status: "FAILED", transferId: row.id, code: row.failureCode ?? "REJECTED_BY_PROVIDER" };
  return {
    status: "ACCEPTED",
    transferId: row.id,
    acceptedAt: VirtualInstant.fromDate(row.acceptedAtVirtual ?? row.createdAt),
    expectedArrivalAt: VirtualInstant.fromDate(row.expectedArrivalAtVirtual ?? row.createdAt),
  };
}
