import { afterAll, describe, expect, it } from "vitest";
import * as advance from "@/app/api/evaluation/advance-clock/route";
import * as caseRoute from "@/app/api/case/route";
import * as evidence from "@/app/api/evidence/route";
import * as payments from "@/app/api/payments/route";
import * as refundClaims from "@/app/api/refund-claims/route";
import * as refundSubmit from "@/app/api/refund-claims/[id]/submit/route";
import * as remittances from "@/app/api/remittances/route";
import * as remittanceApprove from "@/app/api/remittances/[id]/approve/route";
import * as remittanceExecute from "@/app/api/remittances/[id]/execute/route";
import * as remittanceView from "@/app/api/remittances/[id]/view/route";
import { getContainer } from "@/infrastructure/container";
import { closeDb } from "@/infrastructure/db/client";
import { approvePlanViaApi, openWorkspace } from "../support/apiFlow";

afterAll(async () => {
  await closeDb();
});

interface RemittanceBody {
  outcome?: string;
  replayed?: boolean;
  remittance: { remittanceId: string; version: number; status: string; reasons: string[]; debit: { minor: string } | null; routeId: string | null };
  attempt?: { attemptId: string; status: string };
}

describe("T3 por HTTP: remesas bajo el permiso permanente (A1)", () => {
  it("dentro del tope se envía sin aprobación; fuera del tope escala y solo el pagador aprueba una vez con su huella", async () => {
    const ws = await openWorkspace("arrival_remittance");
    const first = await ws.browser.call<RemittanceBody>(remittances.POST, "POST", "/api/remittances", { role: "student", body: { netAmount: "2000.00", targetArrivalHours: 48 } });
    expect(first.status).toBe(201);
    expect(first.json.remittance).toMatchObject({ status: "READY", routeId: "R1", debit: { minor: "28800" } });
    const id1 = first.json.remittance.remittanceId;
    const noKey = await ws.browser.call(remittanceExecute.POST, "POST", `/api/remittances/${id1}/execute`, { role: "student", params: { id: id1 } });
    expect(noKey.status).toBe(422);
    const sent = await ws.browser.call<RemittanceBody>(remittanceExecute.POST, "POST", `/api/remittances/${id1}/execute`, { role: "student", params: { id: id1 }, headers: { "idempotency-key": "api-t3-key-0001" } });
    expect(sent.status).toBe(201);
    expect(sent.json.outcome).toBe("SENT");
    expect(sent.json.attempt?.status).toBe("PROVIDER_ACCEPTED");
    const replay = await ws.browser.call<RemittanceBody>(remittanceExecute.POST, "POST", `/api/remittances/${id1}/execute`, { role: "student", params: { id: id1 }, headers: { "idempotency-key": "api-t3-key-0001" } });
    expect([replay.status, replay.json.replayed]).toEqual([200, true]);

    const second = await ws.browser.call<RemittanceBody>(remittances.POST, "POST", "/api/remittances", { role: "student", body: { netAmount: "3000.00", targetArrivalHours: 48 } });
    expect(second.json.remittance).toMatchObject({ status: "APPROVAL_REQUESTED", reasons: ["EXCEEDS_MANDATE_PERIOD_LIMIT"] });
    const id2 = second.json.remittance.remittanceId;
    const needs = await ws.browser.call<RemittanceBody>(remittanceExecute.POST, "POST", `/api/remittances/${id2}/execute`, { role: "student", params: { id: id2 }, headers: { "idempotency-key": "api-t3-key-0002" } });
    expect([needs.status, needs.json.outcome]).toEqual([200, "NEEDS_PAYER_APPROVAL"]);

    expect((await ws.browser.call(remittanceView.GET, "GET", `/api/remittances/${id2}/view`, { role: "student", params: { id: id2 } })).status).toBe(403);
    const view = await ws.browser.call<{ fingerprint: string; version: number; proposedDebit: { minor: string } }>(remittanceView.GET, "GET", `/api/remittances/${id2}/view`, { role: "payer", params: { id: id2 } });
    expect(view.json.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(view.json.proposedDebit.minor).toBe("43200");
    const asStudent = await ws.browser.call(remittanceApprove.POST, "POST", `/api/remittances/${id2}/approve`, { role: "student", params: { id: id2 }, body: { version: view.json.version, fingerprint: view.json.fingerprint } });
    expect(asStudent.status).toBe(403);
    const wrong = await ws.browser.call(remittanceApprove.POST, "POST", `/api/remittances/${id2}/approve`, { role: "payer", params: { id: id2 }, body: { version: view.json.version, fingerprint: "c".repeat(64) } });
    expect(wrong.status).toBe(409);
    const approved = await ws.browser.call(remittanceApprove.POST, "POST", `/api/remittances/${id2}/approve`, { role: "payer", params: { id: id2 }, body: { version: view.json.version, fingerprint: view.json.fingerprint } });
    expect(approved.status).toBe(201);
    const sent2 = await ws.browser.call<RemittanceBody>(remittanceExecute.POST, "POST", `/api/remittances/${id2}/execute`, { role: "student", params: { id: id2 }, headers: { "idempotency-key": "api-t3-key-0003" } });
    expect([sent2.status, sent2.json.outcome]).toEqual([201, "SENT"]);

    await ws.browser.call(advance.POST, "POST", "/api/evaluation/advance-clock", { role: "evaluator", body: { minutes: 1440 } });
    const after = await ws.browser.call<{ remittances: { status: string }[]; localAccount: { balance: { minor: string } } }>(caseRoute.GET, "GET", "/api/case", { role: "student" });
    expect(after.json.remittances.map((r) => r.status)).toEqual(["DELIVERED", "DELIVERED"]);
    expect(after.json.localAccount.balance).toEqual({ currency: "CNY", minor: "500000" });
  });

  it("S15: no hay forma de elegir otro destinatario; con la cuenta local sin abrir se bloquea sin intento", async () => {
    const ws = await openWorkspace("base");
    const smuggled = await ws.browser.call(remittances.POST, "POST", "/api/remittances", { role: "student", body: { netAmount: "2000.00", targetArrivalHours: 48, recipientId: "rcp-attacker" } });
    expect(smuggled.status).toBe(422);
    const blocked = await ws.browser.call<RemittanceBody>(remittances.POST, "POST", "/api/remittances", { role: "student", body: { netAmount: "2000.00", targetArrivalHours: 48 } });
    expect(blocked.json.remittance).toMatchObject({ status: "BLOCKED", reasons: ["RECIPIENT_ACCOUNT_NOT_OPEN"] });
    const id = blocked.json.remittance.remittanceId;
    const exec = await ws.browser.call<{ error: { reasons: string[] } }>(remittanceExecute.POST, "POST", `/api/remittances/${id}/execute`, { role: "student", params: { id }, headers: { "idempotency-key": "s15-key-000001" } });
    expect([exec.status, exec.json.error.reasons]).toEqual([422, ["RECIPIENT_ACCOUNT_NOT_OPEN"]]);
    expect((await getContainer().deps.uow.read.attempts.listAll(ws.workspaceId)).length).toBe(0);
    expect((await ws.browser.call(remittances.POST, "POST", "/api/remittances", { role: "payer", body: { netAmount: "2000.00", targetArrivalHours: 48 } })).status).toBe(403);
  });
});

describe("T7 por HTTP: devoluciones con destino fijo (A2)", () => {
  it("S14: el destino y el monto no se eligen; el reclamo va a la cuenta de origen y llega a REFUNDED con USD 70.00", async () => {
    const ws = await openWorkspace("overpayment_refund");
    const obligationId = (await getContainer().deps.uow.read.obligations.list(ws.workspaceId))[0]!.id;
    expect((await ws.browser.call(refundClaims.POST, "POST", "/api/refund-claims", { role: "student", body: { obligationId, destinationAccountId: "acct-other" } })).status).toBe(422);
    expect((await ws.browser.call(refundClaims.POST, "POST", "/api/refund-claims", { role: "student", body: { obligationId, amountMinor: "999999" } })).status).toBe(422);
    const prepared = await ws.browser.call<{ claim: { claimId: string; amount: { minor: string }; destinationMasked: string; status: string } }>(refundClaims.POST, "POST", "/api/refund-claims", { role: "student", body: { obligationId } });
    expect(prepared.status).toBe(201);
    expect(prepared.json.claim).toMatchObject({ status: "DRAFT", amount: { currency: "CNY", minor: "50000" }, destinationMasked: "•••• 4821" });
    const id = prepared.json.claim.claimId;
    expect((await ws.browser.call(refundSubmit.POST, "POST", `/api/refund-claims/${id}/submit`, { role: "payer", params: { id }, headers: { "idempotency-key": "s14-key-000001" } })).status).toBe(403);
    const submitted = await ws.browser.call<{ claim: { status: string } }>(refundSubmit.POST, "POST", `/api/refund-claims/${id}/submit`, { role: "student", params: { id }, headers: { "idempotency-key": "s14-key-000001" } });
    expect([submitted.status, submitted.json.claim.status]).toEqual([201, "SUBMITTED"]);
    await ws.browser.call(advance.POST, "POST", "/api/evaluation/advance-clock", { role: "evaluator", body: { minutes: 1440 } });
    const after = await ws.browser.call<{ refunds: { status: string; settlement: { minor: string } | null }[]; familyFunds: { balance: { minor: string } } }>(caseRoute.GET, "GET", "/api/case", { role: "student" });
    expect(after.json.refunds[0]).toMatchObject({ status: "REFUNDED", settlement: { currency: "USD", minor: "7000" } });
    expect(after.json.familyFunds.balance).toEqual({ currency: "USD", minor: "221000" });
  });
});

describe("Expediente de evidencia (BUILD_PROMPT 16.6)", () => {
  it("JSON y Markdown sin secretos, con cuentas enmascaradas y claves de idempotencia recortadas", async () => {
    const ws = await openWorkspace("base");
    const { planId } = await approvePlanViaApi(ws, 48);
    await ws.browser.call(payments.POST, "POST", "/api/payments", { role: "student", body: { planId }, headers: { "idempotency-key": "evidence-key-0001-long-enough" } });
    const res = await ws.browser.call<{ attempts: { idempotencyKey: string }[]; approvals: { fingerprint: string }[]; timeline: unknown[]; synthetic: boolean }>(evidence.GET, "GET", "/api/evidence", { role: "evaluator" });
    expect(res.status).toBe(200);
    expect(res.json.synthetic).toBe(true);
    expect(res.json.attempts[0]!.idempotencyKey).toBe("evidence-key…");
    expect(res.json.approvals[0]!.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const text = JSON.stringify(res.json);
    expect(text).not.toContain("evidence-key-0001-long-enough");
    expect(text).not.toMatch(/sk-ant-|postgres(ql)?:\/\/|SESSION_PEPPER|EVAL_ACCESS_CODE/);
    expect(text).not.toMatch(/(?<![\w-])\d{10,}(?![\w-])/);
    expect(text).toContain("•••• 4821");
    for (const role of ["student", "payer"] as const) expect((await ws.browser.call(evidence.GET, "GET", "/api/evidence", { role })).status).toBe(200);
    // Markdown: se lee como texto (el ayudante de pruebas espera JSON).
    const cookie = [...ws.browser.cookies.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
    const md = await evidence.GET(new Request("http://localhost:3000/api/evidence?format=md", { headers: { cookie, "x-ag-actor": "student" } }), { params: Promise.resolve({}) as Promise<never> });
    expect(md.status).toBe(200);
    expect(md.headers.get("content-type")).toContain("text/markdown");
    const body = await md.text();
    expect(body).toContain("# Evidence: Base scenario");
    expect(body).toContain("key `evidence-key…`");
    expect(body).not.toContain("evidence-key-0001-long-enough");
  });
});
