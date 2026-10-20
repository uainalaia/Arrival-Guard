import { afterAll, describe, expect, it } from "vitest";
import * as caseRoute from "@/app/api/case/route";
import * as changeConfirm from "@/app/api/payer/changes/[id]/confirm/route";
import * as changeView from "@/app/api/payer/changes/[id]/route";
import * as payments from "@/app/api/payments/route";
import * as policy from "@/app/api/payer/policy/route";
import * as revoke from "@/app/api/permissions/revoke/route";
import { getContainer } from "@/infrastructure/container";
import { Money } from "@/domain/money/Money";
import { closeDb } from "@/infrastructure/db/client";
import { approvePlanViaApi, openWorkspace } from "../support/apiFlow";

afterAll(async () => {
  await closeDb();
});

interface CaseBody {
  payer: { policyFingerprint: string };
  plan: { planId: string; version: number; status: string; routes: { blockers: string[]; discarded: { reasons: string[] }[] }; approvals: { approvalId: string; status: string; invalidationReason: string | null }[] };
}

describe("T6: cambiar o revocar permisos (solo el pagador)", () => {
  it("N11: el pagador baja el máximo a USD 2,500.00: la aprobación vigente se invalida y el plan queda NOT_VIABLE con historial", async () => {
    const ws = await openWorkspace("base");
    const { planId, granted } = await approvePlanViaApi(ws, 48);
    const before = await ws.browser.call<CaseBody>(caseRoute.GET, "GET", "/api/case", { role: "payer" });
    const stale = await ws.browser.call(policy.POST, "POST", "/api/payer/policy", { role: "payer", body: { maxDebitMinor: "250000", fingerprint: "a".repeat(64) } });
    expect(stale.status).toBe(409);
    const res = await ws.browser.call<{ invalidatedApprovalIds: string[]; planStatus: string; policy: { tuitionLimit: { minor: string } } }>(policy.POST, "POST", "/api/payer/policy", {
      role: "payer",
      body: { maxDebitMinor: "250000", fingerprint: before.json.payer.policyFingerprint },
    });
    expect(res.status).toBe(200);
    expect(res.json.policy.tuitionLimit).toEqual({ currency: "USD", minor: "250000" });
    expect(res.json.invalidatedApprovalIds).toEqual([granted.json.approval.approvalId]);
    expect(res.json.planStatus).toBe("NOT_VIABLE");
    const after = await ws.browser.call<CaseBody>(caseRoute.GET, "GET", "/api/case", { role: "payer" });
    expect(after.json.plan.planId).toBe(planId);
    expect(after.json.plan.version).toBe(2);
    expect(after.json.plan.status).toBe("NOT_VIABLE");
    expect(after.json.plan.routes.discarded.every((d) => d.reasons.includes("EXCEEDS_PAYER_MAX"))).toBe(true);
    const history = await getContainer().deps.uow.read.plans.getVersion(ws.workspaceId, planId, 1);
    expect(history?.plan.status).toBe("SUPERSEDED");
    const approval = await getContainer().deps.uow.read.approvals.get(ws.workspaceId, granted.json.approval.approvalId);
    expect(approval?.status).toBe("INVALIDATED");
    expect(approval?.invalidationReason).toBe("POLICY_CHANGED");
  });

  it("N12: el pagador revoca antes de ejecutar y el envío queda impedido", async () => {
    const ws = await openWorkspace("base");
    const { planId, granted } = await approvePlanViaApi(ws, 48);
    const revoked = await ws.browser.call<{ revoked: boolean }>(revoke.POST, "POST", "/api/permissions/revoke", { role: "payer", body: { approvalId: granted.json.approval.approvalId } });
    expect(revoked.json.revoked).toBe(true);
    const res = await ws.browser.call<{ error: { reasons: string[] } }>(payments.POST, "POST", "/api/payments", { role: "student", body: { planId }, headers: { "idempotency-key": "n12-key-000001" } });
    expect(res.status).toBe(422);
    expect(res.json.error.reasons).toEqual(["APPROVAL_MISSING"]);
    expect(await getContainer().deps.uow.read.attempts.listAll(ws.workspaceId)).toHaveLength(0);
    expect((await ws.browser.call(revoke.POST, "POST", "/api/permissions/revoke", { role: "student", body: { approvalId: granted.json.approval.approvalId } })).status).toBe(403);
  });

  it("revocar después de enviar no promete detener el pago (el otro orden)", async () => {
    const ws = await openWorkspace("base");
    const { planId, granted } = await approvePlanViaApi(ws, 48);
    const paid = await ws.browser.call<{ attempt: { attemptId: string } }>(payments.POST, "POST", "/api/payments", { role: "student", body: { planId }, headers: { "idempotency-key": "n12-key-000002" } });
    const revoked = await ws.browser.call<{ revoked: boolean; inFlightAttemptId: string; message: string }>(revoke.POST, "POST", "/api/permissions/revoke", {
      role: "payer",
      body: { approvalId: granted.json.approval.approvalId },
    });
    expect(revoked.json.revoked).toBe(false);
    expect(revoked.json.inFlightAttemptId).toBe(paid.json.attempt.attemptId);
    expect(revoked.json.message).toContain("cannot guarantee");
  });

  it("revocar una aprobación invalidada o ya revocada no afirma que el pago salió (VC6, hallazgo medio)", async () => {
    type RevokeBody = { revoked: boolean; inFlightAttemptId: string | null; approvalStatus: string | null; message: string };
    // Invalidada por N11 (el pagador baja el máximo): no hay ningún intento.
    const ws = await openWorkspace("base");
    const { granted } = await approvePlanViaApi(ws, 48);
    const before = await ws.browser.call<CaseBody>(caseRoute.GET, "GET", "/api/case", { role: "payer" });
    await ws.browser.call(policy.POST, "POST", "/api/payer/policy", { role: "payer", body: { maxDebitMinor: "250000", fingerprint: before.json.payer.policyFingerprint } });
    const invalidated = await ws.browser.call<RevokeBody>(revoke.POST, "POST", "/api/permissions/revoke", { role: "payer", body: { approvalId: granted.json.approval.approvalId } });
    expect(invalidated.status).toBe(200);
    expect(invalidated.json.revoked).toBe(false);
    expect(invalidated.json.inFlightAttemptId).toBeNull();
    expect(invalidated.json.approvalStatus).toBe("INVALIDATED");
    expect(invalidated.json.message).not.toMatch(/already sent/);
    expect(invalidated.json.message).toContain("Nothing will be sent");
    expect(await getContainer().deps.uow.read.attempts.listAll(ws.workspaceId)).toHaveLength(0);

    // Revocada dos veces: la segunda dice que ya estaba revocada.
    const ws2 = await openWorkspace("base");
    const second = await approvePlanViaApi(ws2, 48);
    const first = await ws2.browser.call<RevokeBody>(revoke.POST, "POST", "/api/permissions/revoke", { role: "payer", body: { approvalId: second.granted.json.approval.approvalId } });
    expect(first.json.revoked).toBe(true);
    const again = await ws2.browser.call<RevokeBody>(revoke.POST, "POST", "/api/permissions/revoke", { role: "payer", body: { approvalId: second.granted.json.approval.approvalId } });
    expect(again.json.revoked).toBe(false);
    expect(again.json.inFlightAttemptId).toBeNull();
    expect(again.json.message).toBe("Already revoked. Nothing will be sent with it.");
    expect(await getContainer().deps.uow.read.attempts.listAll(ws2.workspaceId)).toHaveLength(0);
  });

  it("un cambio preparado por chat solo se aplica al confirmarlo en pantalla fija con su huella", async () => {
    const ws = await openWorkspace("base");
    const payer = { workspaceId: ws.workspaceId, actorId: (await getContainer().deps.uow.read.actors.list(ws.workspaceId)).find((a) => a.role === "payer")!.id, role: "payer" as const };
    const prepared = await getContainer().preparePayerChange.execute(payer, { kind: "POLICY_CHANGE", maxTuitionDebit: Money.fromDecimal("USD", "2700.00") });
    const shown = await ws.browser.call<{ change: { fingerprint: string; status: string } }>(changeView.GET, "GET", `/api/payer/changes/${prepared.id}`, { role: "payer", params: { id: prepared.id } });
    expect(shown.json.change.status).toBe("PENDING");
    const before = await ws.browser.call<{ familyFunds: { tuitionLimit: { minor: string } } }>(caseRoute.GET, "GET", "/api/case", { role: "payer" });
    expect(before.json.familyFunds.tuitionLimit.minor).toBe("290000");
    expect((await ws.browser.call(changeConfirm.POST, "POST", `/api/payer/changes/${prepared.id}/confirm`, { role: "student", params: { id: prepared.id }, body: { fingerprint: shown.json.change.fingerprint } })).status).toBe(403);
    expect((await ws.browser.call(changeConfirm.POST, "POST", `/api/payer/changes/${prepared.id}/confirm`, { role: "payer", params: { id: prepared.id }, body: { fingerprint: "b".repeat(64) } })).status).toBe(409);
    const ok = await ws.browser.call(changeConfirm.POST, "POST", `/api/payer/changes/${prepared.id}/confirm`, { role: "payer", params: { id: prepared.id }, body: { fingerprint: shown.json.change.fingerprint } });
    expect(ok.status).toBe(200);
    const after = await ws.browser.call<{ familyFunds: { tuitionLimit: { minor: string } } }>(caseRoute.GET, "GET", "/api/case", { role: "payer" });
    expect(after.json.familyFunds.tuitionLimit.minor).toBe("270000");
    expect((await ws.browser.call(changeConfirm.POST, "POST", `/api/payer/changes/${prepared.id}/confirm`, { role: "payer", params: { id: prepared.id }, body: { fingerprint: shown.json.change.fingerprint } })).status).toBe(409);
  });
});
