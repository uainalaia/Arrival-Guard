import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as refundClaims from "@/app/api/refund-claims/route";
import * as refundSubmit from "@/app/api/refund-claims/[id]/submit/route";
import { IdempotencyConflictError } from "@/application/errors/ApplicationError";
import { PolicyViolationError } from "@/domain/errors/DomainError";
import { Money } from "@/domain/money/Money";
import { closeDb, getDb } from "@/infrastructure/db/client";
import { simInstitutionRefunds } from "@/infrastructure/db/schema";
import { openWorkspace } from "../support/apiFlow";
import { app, newWorkspace, payerBalance } from "../support/integration";

// Regresiones de la revisión VC9 (docs/reviews/VC9.md). Cada prueba se escribió antes de su corrección.

afterAll(async () => {
  await closeDb();
});

const simRefunds = async (workspaceId: string) => getDb().select().from(simInstitutionRefunds).where(eq(simInstitutionRefunds.workspaceId, workspaceId));

describe("VC9-1 (crítico): carreras en las devoluciones (T7, A2)", () => {
  it("T7 carrera: cuatro preparaciones en paralelo dejan un solo reclamo abierto", async () => {
    const t = await newWorkspace("overpayment_refund");
    const [obligation] = await app().deps.uow.read.obligations.list(t.workspaceId);
    const claims = await Promise.all(Array.from({ length: 4 }, () => app().prepareRefund.execute(t.student, { obligationId: obligation!.id })));
    expect(new Set(claims.map((c) => c.id)).size).toBe(1);
    expect(await app().deps.uow.read.refunds.list(t.workspaceId)).toHaveLength(1);
  });

  it("T7 carrera por HTTP: cuatro POST /api/refund-claims en paralelo devuelven el mismo reclamo", async () => {
    const ws = await openWorkspace("overpayment_refund");
    const [obligation] = await app().deps.uow.read.obligations.list(ws.workspaceId);
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => ws.browser.call<{ claim: { claimId: string } }>(refundClaims.POST, "POST", "/api/refund-claims", { role: "student", body: { obligationId: obligation!.id } })),
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(new Set(responses.map((r) => r.json.claim.claimId)).size).toBe(1);
    expect(await app().deps.uow.read.refunds.list(ws.workspaceId)).toHaveLength(1);
  });

  it("T7 carrera: la institución no acepta en paralelo reclamos distintos que superen el exceso verificado", async () => {
    const t = await newWorkspace("overpayment_refund");
    const [obligation] = await app().deps.uow.read.obligations.list(t.workspaceId);
    const workspace = (await app().deps.uow.read.workspaces.get(t.workspaceId))!;
    const ctx = { workspaceId: t.workspaceId, now: workspace.virtualNow };
    const results = await Promise.allSettled(
      ["claim-race-a", "claim-race-b", "claim-race-c"].map((claimRef) =>
        app().deps.institution.submitRefundClaim(ctx, { claimRef, reference: obligation!.reference, amount: Money.fromDecimal("CNY", "500.00"), destinationAccountRef: "4821" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(PolicyViolationError);
      expect(((r as PromiseRejectedResult).reason as PolicyViolationError).reasons).toEqual(["REFUND_EXCEEDS_VERIFIED_EXCESS"]);
    }
    const rows = await simRefunds(t.workspaceId);
    expect(rows.reduce((n, r) => n + r.amountMinor, 0n)).toBe(50000n);
  });

  it("T7 de punta a punta con carreras: preparar y enviar en paralelo liquida una sola vez USD 70.00", async () => {
    const t = await newWorkspace("overpayment_refund");
    const [obligation] = await app().deps.uow.read.obligations.list(t.workspaceId);
    const before = await payerBalance(t.workspaceId);
    const claims = await Promise.all(Array.from({ length: 3 }, () => app().prepareRefund.execute(t.student, { obligationId: obligation!.id })));
    await Promise.allSettled(claims.map((c, i) => app().submitRefund.execute(t.student, { claimId: c.id, idempotencyKey: `vc9-race-e2e-${i}` })));
    await app().advanceClock.execute(t.evaluator, { minutes: 1500 });
    const after = await app().deps.uow.read.refunds.list(t.workspaceId);
    expect(after.filter((c) => c.status === "REFUNDED")).toHaveLength(1);
    expect(Money.fromDecimal("USD", await payerBalance(t.workspaceId)).subtract(Money.fromDecimal("USD", before)).toDecimalString()).toBe("70.00");
    expect(await simRefunds(t.workspaceId)).toHaveLength(1);
  });
});

describe("VC9-2 (bajo): el mismo reclamo enviado en paralelo con claves distintas", () => {
  it("T7: un envío a la institución y ningún error inesperado (repetición o 409)", async () => {
    const t = await newWorkspace("overpayment_refund");
    const [obligation] = await app().deps.uow.read.obligations.list(t.workspaceId);
    const claim = await app().prepareRefund.execute(t.student, { obligationId: obligation!.id });
    const results = await Promise.allSettled(["a", "b", "c"].map((k) => app().submitRefund.execute(t.student, { claimId: claim.id, idempotencyKey: `vc9-same-claim-${k}` })));
    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ replayed: boolean }>[];
    expect(fulfilled.filter((r) => !r.value.replayed)).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(IdempotencyConflictError);
    const rows = await getDb()
      .select()
      .from(simInstitutionRefunds)
      .where(and(eq(simInstitutionRefunds.workspaceId, t.workspaceId), eq(simInstitutionRefunds.claimRef, claim.id)));
    expect(rows).toHaveLength(1);
  });

  it("T7 por HTTP: tres envíos en paralelo con claves distintas responden 200, 201 o 409, nunca 500", async () => {
    const ws = await openWorkspace("overpayment_refund");
    const [obligation] = await app().deps.uow.read.obligations.list(ws.workspaceId);
    const prepared = await ws.browser.call<{ claim: { claimId: string } }>(refundClaims.POST, "POST", "/api/refund-claims", { role: "student", body: { obligationId: obligation!.id } });
    const id = prepared.json.claim.claimId;
    const responses = await Promise.all(
      ["x", "y", "z"].map((k) => ws.browser.call(refundSubmit.POST, "POST", `/api/refund-claims/${id}/submit`, { role: "student", params: { id }, headers: { "idempotency-key": `vc9-http-same-${k}-0001` } })),
    );
    for (const r of responses) expect([200, 201, 409]).toContain(r.status);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await simRefunds(ws.workspaceId)).toHaveLength(1);
  });
});
