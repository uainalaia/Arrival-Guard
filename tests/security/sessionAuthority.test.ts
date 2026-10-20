import { createHash, createHmac, randomUUID } from "node:crypto";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as advance from "@/app/api/evaluation/advance-clock/route";
import * as approvals from "@/app/api/approvals/route";
import * as approvalRequests from "@/app/api/approvals/requests/route";
import * as approvalView from "@/app/api/approvals/[planId]/view/route";
import * as caseRoute from "@/app/api/case/route";
import * as cash from "@/app/api/cash-projection/route";
import * as compare from "@/app/api/routes/compare/route";
import * as events from "@/app/api/evaluation/events/route";
import * as faults from "@/app/api/evaluation/faults/route";
import * as logout from "@/app/api/session/logout/route";
import * as payments from "@/app/api/payments/route";
import * as plans from "@/app/api/plans/route";
import * as policy from "@/app/api/payer/policy/route";
import * as reset from "@/app/api/evaluation/reset/route";
import * as revoke from "@/app/api/permissions/revoke/route";
import * as session from "@/app/api/session/route";
import { OpenEvaluationAccessUseCase } from "@/application/usecases/OpenEvaluationAccessUseCase";
import { DbRateLimiter, EnvAccessCode } from "@/infrastructure/auth/DrizzleSessionStore";
import { getContainer } from "@/infrastructure/container";
import { closeDb, getDb } from "@/infrastructure/db/client";
import { payerPolicies, paymentAttempts, sessions, workspaces } from "@/infrastructure/db/schema";
import { TestBrowser } from "../support/http";
import { approvePlanViaApi, openWorkspace } from "../support/apiFlow";

// VC6 (AUTONOMIA 6): rol, actor y espacio salen solo de la sesión del servidor; token como HMAC con pepper; sesiones
// de 14 días, vencidas o revocadas sin efecto. Casos tomados de la auditoría (docs/reviews/VC6.md). Ninguna aserción
// imprime un secreto: toda comparación con un secreto se reduce a un booleano.

afterAll(async () => {
  await closeDb();
});

type Err = { error: { code: string; reasons?: string[] } };

async function policyRow(workspaceId: string) {
  const [row] = await getDb().select().from(payerPolicies).where(eq(payerPolicies.workspaceId, workspaceId));
  return row!;
}

async function payerFingerprint(ws: { browser: TestBrowser }) {
  const res = await ws.browser.call<{ payer: { policyFingerprint: string } }>(caseRoute.GET, "GET", "/api/case", { role: "payer" });
  return res.json.payer.policyFingerprint;
}

async function attemptCount(workspaceId: string): Promise<number> {
  const [n] = await getDb().select({ n: count() }).from(paymentAttempts).where(eq(paymentAttempts.workspaceId, workspaceId));
  return n?.n ?? 0;
}

describe("VC6: la sesión del servidor es la única fuente de identidad", () => {
  it("el token se guarda como HMAC-SHA256(pepper, 'session:'+token), nunca en claro ni como SHA-256 simple, con 14 días", async () => {
    const ws = await openWorkspace("base");
    const pepper = process.env.SESSION_PEPPER ?? "";
    const rows = await getDb().select().from(sessions).where(eq(sessions.workspaceId, ws.workspaceId));
    expect(rows.map((r) => r.role).sort()).toEqual(["evaluator", "payer", "student"]);
    let allHmac = true;
    let anyPlain = false;
    for (const row of rows) {
      const token = ws.browser.cookies.get(`ag_${row.role}`) ?? "";
      allHmac &&= row.tokenHash === createHmac("sha256", pepper).update(`session:${token}`, "utf8").digest("hex");
      anyPlain ||= row.tokenHash === token || row.tokenHash === createHash("sha256").update(token, "utf8").digest("hex");
      expect(Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 3_600_000)).toBe(336);
    }
    expect(allHmac).toBe(true);
    expect(anyPlain).toBe(false);
  });

  it("GET /api/session devuelve el vencimiento real de la sesión (14 días), no el del espacio", async () => {
    const ws = await openWorkspace("base");
    const res = await ws.browser.call<{ sessionExpiresAt: string }>(session.GET, "GET", "/api/session", { role: "payer" });
    const [row] = await getDb().select().from(sessions).where(and(eq(sessions.workspaceId, ws.workspaceId), eq(sessions.role, "payer")));
    expect(Math.abs(new Date(res.json.sessionExpiresAt).getTime() - row!.expiresAt.getTime())).toBeLessThan(1000);
  });

  it("una sesión vencida o revocada da 401 y no cambia nada", async () => {
    const ws = await openWorkspace("base");
    const before = await policyRow(ws.workspaceId);
    const fp = await payerFingerprint(ws);
    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(and(eq(sessions.workspaceId, ws.workspaceId), eq(sessions.role, "payer")));
    expect((await ws.browser.call(policy.POST, "POST", "/api/payer/policy", { role: "payer", body: { maxDebitMinor: "999999", fingerprint: fp } })).status).toBe(401);
    expect((await ws.browser.call(session.GET, "GET", "/api/session", { role: "payer" })).status).toBe(401);
    const [student] = await getDb().select().from(sessions).where(and(eq(sessions.workspaceId, ws.workspaceId), eq(sessions.role, "student")));
    await getContainer().sessions.revoke(student!.id);
    expect((await ws.browser.call(plans.POST, "POST", "/api/plans", { role: "student", body: { targetArrivalHours: 48 } })).status).toBe(401);
    const after = await policyRow(ws.workspaceId);
    expect([after.version, after.maxTuitionDebitMinor]).toEqual([before.version, before.maxTuitionDebitMinor]);
    expect(await attemptCount(ws.workspaceId)).toBe(0);
  });

  it("tokens falsos, de otro rol, cookies duplicadas, mal codificadas o x-ag-actor raro: 401, nunca 500", async () => {
    const ws = await openWorkspace("base");
    const forged = new TestBrowser();
    forged.cookies.set("ag_payer", "A".repeat(43));
    expect((await forged.call(session.GET, "GET", "/api/session", { role: "payer" })).status).toBe(401);
    const crossed = new TestBrowser();
    crossed.cookies.set("ag_student", ws.browser.cookies.get("ag_evaluator")!);
    expect((await crossed.call(caseRoute.GET, "GET", "/api/case", { role: "student" })).status).toBe(401);
    const duplicated = `ag_payer=${ws.browser.cookies.get("ag_student")}; ag_payer=${ws.browser.cookies.get("ag_payer")}`;
    expect((await new TestBrowser().call(session.GET, "GET", "/api/session", { role: "payer", headers: { cookie: duplicated } })).status).toBe(401);
    const malformed = await new TestBrowser().call<Err>(session.GET, "GET", "/api/session", { role: "student", headers: { cookie: "ag_student=%E0%A4%A" } });
    expect({ status: malformed.status, code: malformed.json.error?.code }).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    for (const value of ["Payer", "PAYER", "payer,student", '"payer"', "admin", "constructor", "__proto__"]) {
      const res = await ws.browser.call(session.GET, "GET", "/api/session", { headers: { "x-ag-actor": value } });
      expect([value, res.status]).toEqual([value, 401]);
    }
  });

  it("rol, actor y espacio en el cuerpo de cada ruta que muta: 422 sin efectos, aun con el rol correcto", async () => {
    const a = await openWorkspace("base");
    const b = await openWorkspace("base");
    const aPayer = (await getContainer().deps.uow.read.actors.list(a.workspaceId)).find((x) => x.role === "payer")!.id;
    const fpB = await payerFingerprint(b);
    const { planId, granted } = await approvePlanViaApi(b, 48);
    const extra = { workspaceId: a.workspaceId, actorId: aPayer, role: "payer" };
    const cases: [string, Promise<{ status: number }>][] = [
      ["plans", b.browser.call(plans.POST, "POST", "/api/plans", { role: "student", body: { targetArrivalHours: 48, ...extra } })],
      ["approvals/requests", b.browser.call(approvalRequests.POST, "POST", "/api/approvals/requests", { role: "student", body: { planId, ...extra } })],
      ["approvals", b.browser.call(approvals.POST, "POST", "/api/approvals", { role: "payer", body: { planId, planVersion: 1, fingerprint: "a".repeat(64), ...extra } })],
      ["payments", b.browser.call(payments.POST, "POST", "/api/payments", { role: "student", body: { planId, ...extra }, headers: { "idempotency-key": "vc6-body-0001" } })],
      ["payer/policy", b.browser.call(policy.POST, "POST", "/api/payer/policy", { role: "payer", body: { maxDebitMinor: "999999", fingerprint: fpB, ...extra } })],
      ["revoke", b.browser.call(revoke.POST, "POST", "/api/permissions/revoke", { role: "payer", body: { approvalId: granted.json.approval.approvalId, ...extra } })],
      ["advance-clock", b.browser.call(advance.POST, "POST", "/api/evaluation/advance-clock", { role: "evaluator", body: { minutes: 60, ...extra } })],
      ["faults", b.browser.call(faults.POST, "POST", "/api/evaluation/faults", { role: "evaluator", body: { fault: "FAIL_NEXT_TRANSFER", enabled: true, ...extra } })],
      ["reset", b.browser.call(reset.POST, "POST", "/api/evaluation/reset", { role: "evaluator", body: { scenario: "base", ...extra } })],
    ];
    for (const [name, pending] of cases) expect([name, (await pending).status]).toEqual([name, 422]);
    expect((await policyRow(b.workspaceId)).version).toBe(1);
    expect((await policyRow(a.workspaceId)).version).toBe(1);
    expect((await getContainer().deps.uow.read.approvals.get(b.workspaceId, granted.json.approval.approvalId))?.status).toBe("ACTIVE");
    for (const id of [a.workspaceId, b.workspaceId]) {
      const [w] = await getDb().select().from(workspaces).where(eq(workspaces.id, id));
      expect(w!.virtualNow.getTime()).toBe(w!.virtualStart.getTime());
      expect(Object.values((w!.faults ?? {}) as Record<string, boolean>).some(Boolean)).toBe(false);
    }
    expect(await attemptCount(b.workspaceId)).toBe(0);
  });

  it("rol, actor y espacio en la query o en encabezados propios no cambian el espacio ni el rol", async () => {
    const a = await openWorkspace("base");
    const b = await openWorkspace("base");
    const q = `?workspaceId=${a.workspaceId}&role=payer&actorId=${randomUUID()}`;
    const c = await b.browser.call<{ workspace: { id: string }; payer: unknown; viewer: { role: string } }>(caseRoute.GET, "GET", `/api/case${q}`, { role: "student" });
    expect([c.status, c.json.workspace.id, c.json.viewer.role, c.json.payer]).toEqual([200, b.workspaceId, "student", null]);
    const s = await b.browser.call<{ workspaceId: string; role: string }>(session.GET, "GET", `/api/session${q}`, { role: "student" });
    expect([s.json.workspaceId, s.json.role]).toEqual([b.workspaceId, "student"]);
    expect((await b.browser.call(cash.GET, "GET", `/api/cash-projection${q}`, { role: "student" })).status).toBe(422);
    expect((await b.browser.call(events.GET, "GET", `/api/evaluation/events${q}`, { role: "evaluator" })).status).toBe(422);
    expect((await b.browser.call(compare.GET, "GET", `/api/routes/compare?purpose=TUITION&targetArrivalHours=48&workspaceId=${a.workspaceId}`, { role: "payer" })).status).toBe(422);

    const headers = { "x-workspace-id": a.workspaceId, "x-actor-id": randomUUID(), "x-ag-role": "payer", "x-role": "payer", "x-user-role": "payer" };
    const h = await b.browser.call<{ workspace: { id: string }; payer: unknown }>(caseRoute.GET, "GET", "/api/case", { role: "student", headers });
    expect([h.json.workspace.id, h.json.payer]).toEqual([b.workspaceId, null]);
    const fp = await payerFingerprint(b);
    expect((await b.browser.call(policy.POST, "POST", "/api/payer/policy", { role: "student", headers, body: { maxDebitMinor: "999999", fingerprint: fp } })).status).toBe(403);
    expect((await policyRow(b.workspaceId)).version).toBe(1);
  });

  it("Origin ajeno con X-Forwarded-Host ajeno da 422 y la política no cambia", async () => {
    const ws = await openWorkspace("base");
    const fp = await payerFingerprint(ws);
    const res = await ws.browser.call(policy.POST, "POST", "/api/payer/policy", {
      role: "payer",
      origin: "https://evil.example",
      headers: { "x-forwarded-host": "evil.example" },
      body: { maxDebitMinor: "250000", fingerprint: fp },
    });
    expect(res.status).toBe(422);
    expect((await policyRow(ws.workspaceId)).version).toBe(1);
  });

  it("una pestaña de otro espacio (x-ag-workspace) no opera en silencio sobre el espacio de la sesión", async () => {
    const ws = await openWorkspace("base");
    const stale = randomUUID();
    const res = await ws.browser.call<Err>(plans.POST, "POST", "/api/plans", { role: "student", headers: { "x-ag-workspace": stale }, body: { targetArrivalHours: 48 } });
    expect([res.status, res.json.error.code]).toEqual([409, "WORKSPACE_MISMATCH"]);
    expect((await ws.browser.call<{ plan: unknown }>(caseRoute.GET, "GET", "/api/case", { role: "student" })).json.plan).toBeNull();
    const ok = await ws.browser.call(plans.POST, "POST", "/api/plans", { role: "student", headers: { "x-ag-workspace": ws.workspaceId }, body: { targetArrivalHours: 48 } });
    expect(ok.status).toBe(201);
    // La sesión responde siempre, para que la pestaña sepa a qué espacio pertenece.
    expect((await ws.browser.call(session.GET, "GET", "/api/session", { role: "student", headers: { "x-ag-workspace": stale } })).status).toBe(200);
  });

  it("la vista de aprobación es solo del pagador: el estudiante no recibe la huella", async () => {
    const ws = await openWorkspace("base");
    const { planId } = await approvePlanViaApi(ws, 48);
    const res = await ws.browser.call<{ fingerprint?: string }>(approvalView.GET, "GET", `/api/approvals/${planId}/view`, { role: "student", params: { planId } });
    expect(res.status).toBe(403);
    expect(res.json.fingerprint).toBeUndefined();
  });

  it("al reiniciar desde la consola, las sesiones anteriores de este navegador quedan revocadas", async () => {
    const ws = await openWorkspace("base");
    const oldStudent = ws.browser.cookies.get("ag_student")!;
    const res = await ws.browser.call<{ workspaceId: string }>(reset.POST, "POST", "/api/evaluation/reset", { role: "evaluator", body: { scenario: "base" } });
    expect(res.status).toBe(201);
    const old = new TestBrowser();
    old.cookies.set("ag_student", oldStudent);
    expect((await old.call(session.GET, "GET", "/api/session", { role: "student" })).status).toBe(401);
    const revoked = await getDb()
      .select({ n: count() })
      .from(sessions)
      .where(and(eq(sessions.workspaceId, ws.workspaceId), isNotNull(sessions.revokedAt)));
    expect(revoked[0]?.n).toBe(3);
    const current = await ws.browser.call<{ workspaceId: string }>(session.GET, "GET", "/api/session", { role: "student" });
    expect(current.json.workspaceId).toBe(res.json.workspaceId);
  });

  it("salir revoca las tres sesiones y borra sus cookies", async () => {
    const ws = await openWorkspace("base");
    const res = await ws.browser.call<{ revokedSessions: number }>(logout.POST, "POST", "/api/session/logout", { role: "student", body: {} });
    expect(res.status).toBe(200);
    expect(res.json.revokedSessions).toBe(3);
    expect(res.setCookies.filter((c) => /Max-Age=0/.test(c))).toHaveLength(3);
    for (const role of ["student", "payer", "evaluator"] as const) {
      expect((await ws.browser.call(session.GET, "GET", "/api/session", { role })).status).toBe(401);
    }
  });

  it("el reinicio respeta el mismo límite por IP que el acceso", async () => {
    const app = getContainer();
    const code = () => process.env.EVAL_ACCESS_CODE ?? "";
    const access = new OpenEvaluationAccessUseCase(app.createWorkspace, app.sessions, new DbRateLimiter(getDb()), new EnvAccessCode(code, () => process.env.SESSION_PEPPER ?? ""), {
      sessionTtlHours: 1,
      perIpPerHour: 2,
      perDay: 100,
      keyPrefix: `t-${randomUUID().slice(0, 8)}`,
    });
    const opened = await access.open({ accessCode: code(), scenario: "base", ipHash: "ip-reset" });
    const evaluator = { workspaceId: opened.workspace.workspaceId, actorId: opened.workspace.actors.evaluatorActorId, role: "evaluator" as const };
    await access.reset(evaluator, { scenario: "base", ipHash: "ip-reset" });
    await expect(access.reset(evaluator, { scenario: "base", ipHash: "ip-reset" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
