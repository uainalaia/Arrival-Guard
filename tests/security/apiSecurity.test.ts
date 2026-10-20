import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as approvals from "@/app/api/approvals/route";
import * as approvalView from "@/app/api/approvals/[planId]/view/route";
import * as caseRoute from "@/app/api/case/route";
import * as payment from "@/app/api/payments/[id]/route";
import * as payments from "@/app/api/payments/route";
import * as policy from "@/app/api/payer/policy/route";
import * as plans from "@/app/api/plans/route";
import { PaymentAttempt } from "@/domain/payment/PaymentAttempt";
import { Money } from "@/domain/money/Money";
import { getContainer } from "@/infrastructure/container";
import { closeDb, getDb } from "@/infrastructure/db/client";
import { approvals as approvalsTable, holds, payerPolicies, simProviderTransfers } from "@/infrastructure/db/schema";
import { approvePlanViaApi, openWorkspace, type PlannedDTO } from "../support/apiFlow";

afterAll(async () => {
  await closeDb();
});

async function providerTransfers(workspaceId: string): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(simProviderTransfers).where(eq(simProviderTransfers.workspaceId, workspaceId));
  return row?.n ?? 0;
}

interface ErrorBody {
  error: { code: string; reasons?: string[] };
}

describe("Seguridad a nivel de API (BUILD_PROMPT 14.2): efectos en la base, no solo en la respuesta", () => {
  it("S03 Induced transfer: con USD 1,500.00 ya debitados el nuevo cargo rompe el máximo acumulado", async () => {
    const ws = await openWorkspace("base");
    const { planId } = await approvePlanViaApi(ws, 48);
    // Pago parcial histórico ya acreditado contra la misma obligación (estado sintético preparado por la prueba).
    const repos = getContainer().deps.uow.read;
    const obligation = (await repos.obligations.list(ws.workspaceId)).find((o) => o.reference === "AG-STUDENT-01")!;
    const workspace = (await repos.workspaces.get(ws.workspaceId))!;
    const plan = (await repos.plans.getCurrent(ws.workspaceId, planId))!;
    await getContainer().deps.uow.transaction((r) =>
      r.attempts.insert({
        attempt: PaymentAttempt.rehydrate({
          id: randomUUID(),
          workspaceId: ws.workspaceId,
          kind: "TUITION",
          subjectId: randomUUID(),
          obligationId: obligation.id,
          idempotencyKey: `historic-${randomUUID()}`,
          requestHash: "historic",
          approvalId: null,
          mandateId: null,
          status: "CREDITED",
          providerTransferId: null,
          debit: Money.fromDecimal("USD", "1500.00"),
          quoteId: "historic",
          createdAt: workspace.virtualNow,
        }),
        subjectVersion: 1,
        quote: { ...plan.quote!, debit: Money.fromDecimal("USD", "1500.00") },
        statusChangedAt: workspace.virtualNow,
      }),
    );
    const res = await ws.browser.call<ErrorBody>(payments.POST, "POST", "/api/payments", { role: "student", body: { planId }, headers: { "idempotency-key": "s03-key-000001" } });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("POLICY_VIOLATION");
    expect(res.json.error.reasons).toEqual(["EXCEEDS_PAYER_MAX"]);
    expect(await providerTransfers(ws.workspaceId)).toBe(0);
    // Ningún intento ni retención nuevos: solo queda el pago histórico preparado arriba.
    expect(await repos.attempts.listAll(ws.workspaceId)).toHaveLength(1);
    const [held] = await getDb().select({ n: count() }).from(holds).where(eq(holds.workspaceId, ws.workspaceId));
    expect(held?.n).toBe(0);
  });

  it("S06 Data extraction: un recurso de otro espacio da 404 y ningún dato", async () => {
    const a = await openWorkspace("base");
    const b = await openWorkspace("base");
    const { planId } = await approvePlanViaApi(a, 48);
    const paid = await a.browser.call<{ attempt: { attemptId: string } }>(payments.POST, "POST", "/api/payments", { role: "student", body: { planId }, headers: { "idempotency-key": "s06-key-000001" } });
    const attemptId = paid.json.attempt.attemptId;
    const read = await b.browser.call<ErrorBody>(payment.GET, "GET", `/api/payments/${attemptId}`, { role: "student", params: { id: attemptId } });
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.json)).not.toContain("286000");
    expect((await b.browser.call(approvalView.GET, "GET", `/api/approvals/${planId}/view`, { role: "payer", params: { planId } })).status).toBe(404);
    const steal = await b.browser.call<ErrorBody>(payments.POST, "POST", "/api/payments", { role: "payer", body: { planId }, headers: { "idempotency-key": "s06-key-000002" } });
    expect(steal.status).toBe(404);
    expect((await b.browser.call(payment.GET, "GET", "/api/payments/not-a-uuid", { role: "student", params: { id: "not-a-uuid" } })).status).toBe(404);
    expect(await providerTransfers(b.workspaceId)).toBe(0);
  });

  it("S07 Privilege escalation: la sesión del estudiante en POST /api/approvals con id y huella correctos da 403 sin registro nuevo", async () => {
    const ws = await openWorkspace("base");
    const planned = await ws.browser.call<PlannedDTO>(plans.POST, "POST", "/api/plans", { role: "student", body: { targetArrivalHours: 48 } });
    const planId = planned.json.plan.planId;
    const { default: _ } = { default: null };
    void _;
    const requests = await import("@/app/api/approvals/requests/route");
    await ws.browser.call(requests.POST, "POST", "/api/approvals/requests", { role: "student", body: { planId } });
    const view = await ws.browser.call<{ planVersion: number; fingerprint: string }>(approvalView.GET, "GET", `/api/approvals/${planId}/view`, { role: "payer", params: { planId } });
    const res = await ws.browser.call<ErrorBody>(approvals.POST, "POST", "/api/approvals", {
      role: "student",
      body: { planId, planVersion: view.json.planVersion, fingerprint: view.json.fingerprint },
    });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("ROLE_NOT_ALLOWED");
    const [row] = await getDb().select({ n: count() }).from(approvalsTable).where(eq(approvalsTable.workspaceId, ws.workspaceId));
    expect(row?.n).toBe(0);
  });

  it("S08 Privilege escalation: el estudiante no cambia el máximo ni la reserva; los valores quedan intactos", async () => {
    const ws = await openWorkspace("base");
    const payerCase = await ws.browser.call<{ payer: { policyFingerprint: string } }>(caseRoute.GET, "GET", "/api/case", { role: "payer" });
    const fingerprint = payerCase.json.payer.policyFingerprint;
    const asStudent = await ws.browser.call<ErrorBody>(policy.POST, "POST", "/api/payer/policy", { role: "student", body: { maxDebitMinor: "1000000", fingerprint } });
    expect(asStudent.status).toBe(403);
    const studentCase = await ws.browser.call<{ payer: unknown }>(caseRoute.GET, "GET", "/api/case", { role: "student" });
    expect(studentCase.json.payer).toBeNull();
    // Un rol en el cuerpo no sirve de nada: el esquema estricto lo rechaza.
    const smuggled = await ws.browser.call<ErrorBody>(policy.POST, "POST", "/api/payer/policy", { role: "student", body: { maxDebitMinor: "1000000", fingerprint, role: "payer" } });
    expect(smuggled.status).toBe(403);
    const [row] = await getDb()
      .select()
      .from(payerPolicies)
      .where(and(eq(payerPolicies.workspaceId, ws.workspaceId)));
    expect(row?.maxTuitionDebitMinor).toBe(290000n);
    expect(row?.reserveMinor).toBe(180000n);
    expect(row?.version).toBe(1);
  });

  it("S09 Privilege escalation: ejecutar sin sesión da 401; sin permiso vigente, 422; en ningún caso se envía al proveedor", async () => {
    const ws = await openWorkspace("base");
    const planned = await ws.browser.call<PlannedDTO>(plans.POST, "POST", "/api/plans", { role: "student", body: { targetArrivalHours: 48 } });
    const planId = planned.json.plan.planId;
    const anonymous = await ws.browser.call<ErrorBody>(payments.POST, "POST", "/api/payments", { role: "student", body: { planId }, headers: { "idempotency-key": "s09-key-000001" }, withCookies: false });
    expect(anonymous.status).toBe(401);
    const noApproval = await ws.browser.call<ErrorBody>(payments.POST, "POST", "/api/payments", { role: "student", body: { planId }, headers: { "idempotency-key": "s09-key-000002" } });
    expect(noApproval.status).toBe(422);
    expect(noApproval.json.error.reasons).toEqual(["APPROVAL_MISSING"]);
    expect(await providerTransfers(ws.workspaceId)).toBe(0);
  });

  it("no existe ninguna ruta que acepte 'acreditado' o 'aprobado' enviado por el navegador", async () => {
    const ws = await openWorkspace("base");
    const planned = await ws.browser.call<PlannedDTO>(plans.POST, "POST", "/api/plans", { role: "student", body: { targetArrivalHours: 48, status: "CREDITED" } });
    expect(planned.status).toBe(422);
  });
});
