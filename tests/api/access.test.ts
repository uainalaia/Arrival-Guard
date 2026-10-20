import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import * as session from "@/app/api/session/route";
import * as workspaces from "@/app/api/evaluation/workspaces/route";
import { OpenEvaluationAccessUseCase } from "@/application/usecases/OpenEvaluationAccessUseCase";
import { closeDb, getDb } from "@/infrastructure/db/client";
import { sessions } from "@/infrastructure/db/schema";
import { DbRateLimiter, EnvAccessCode } from "@/infrastructure/auth/DrizzleSessionStore";
import { getContainer } from "@/infrastructure/container";
import { TestBrowser } from "../support/http";

afterAll(async () => {
  await closeDb();
});

const code = () => process.env.EVAL_ACCESS_CODE ?? "";

describe("Acceso del jurado con código de evaluación (A4, VC6)", () => {
  it("un código inválido da 401 y no fija cookies", async () => {
    const browser = new TestBrowser();
    const res = await browser.call(workspaces.POST, "POST", "/api/evaluation/workspaces", { role: "guest", body: { accessCode: "not-the-code", scenario: "base" } });
    expect(res.status).toBe(401);
    expect(res.setCookies).toEqual([]);
    expect((res.json as { error: { code: string; requestId: string } }).error.code).toBe("UNAUTHENTICATED");
    expect((res.json as { error: { requestId: string } }).error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("con el código crea un espacio con los tres roles y cookies HttpOnly, Secure, SameSite=Strict de 14 días", async () => {
    const browser = new TestBrowser();
    const res = await browser.call<{ workspaceId: string; roles: string[]; next: string }>(workspaces.POST, "POST", "/api/evaluation/workspaces", {
      role: "guest",
      body: { accessCode: code(), scenario: "base" },
    });
    expect(res.status).toBe(201);
    expect(res.json.roles).toEqual(["student", "payer", "evaluator"]);
    expect(res.json.next).toBe(`/w/${res.json.workspaceId}?as=student`);
    expect(res.setCookies.map((c) => c.split("=")[0]).sort()).toEqual(["ag_evaluator", "ag_payer", "ag_student"]);
    for (const cookie of res.setCookies) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Path=/");
      const maxAge = Number.parseInt(/Max-Age=(\d+)/.exec(cookie)?.[1] ?? "0", 10);
      expect(maxAge).toBeGreaterThan(14 * 24 * 3600 - 120);
      expect(maxAge).toBeLessThanOrEqual(14 * 24 * 3600);
    }
    // El cuerpo no lleva tokens.
    expect(JSON.stringify(res.json)).not.toContain(browser.cookies.get("ag_student")!);

    // En la base solo está el hash con pepper del token, nunca el token.
    const rows = await getDb().select().from(sessions).where(eq(sessions.workspaceId, res.json.workspaceId));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect([...browser.cookies.values()]).not.toContain(row.tokenHash);
    }

    for (const role of ["student", "payer", "evaluator"] as const) {
      const s = await browser.call<{ role: string; workspaceId: string }>(session.GET, "GET", "/api/session", { role });
      expect(s.status).toBe(200);
      expect(s.json.role).toBe(role);
      expect(s.json.workspaceId).toBe(res.json.workspaceId);
    }
  });

  it("sin cookie, con un rol desconocido o con una cookie de otro rol: 401", async () => {
    const browser = new TestBrowser();
    await browser.call(workspaces.POST, "POST", "/api/evaluation/workspaces", { role: "guest", body: { accessCode: code(), scenario: "base" } });
    expect((await browser.call(session.GET, "GET", "/api/session", { role: "payer", withCookies: false })).status).toBe(401);
    expect((await browser.call(session.GET, "GET", "/api/session", { role: "admin" as never })).status).toBe(401);
    const student = browser.cookies.get("ag_student")!;
    const crossed = new TestBrowser();
    crossed.cookies.set("ag_payer", student);
    expect((await crossed.call(session.GET, "GET", "/api/session", { role: "payer" })).status).toBe(401);
  });

  it("CSRF: una ruta que muta exige Origin propio, Content-Type JSON y encabezado x-ag-actor", async () => {
    const browser = new TestBrowser();
    const body = { accessCode: code(), scenario: "base" };
    expect((await browser.call(workspaces.POST, "POST", "/api/evaluation/workspaces", { role: "guest", body, origin: "https://evil.example" })).status).toBe(422);
    expect((await browser.call(workspaces.POST, "POST", "/api/evaluation/workspaces", { role: "guest", body, origin: null })).status).toBe(422);
    expect((await browser.call(workspaces.POST, "POST", "/api/evaluation/workspaces", { role: "guest", body, contentType: "text/plain" })).status).toBe(422);
    expect((await browser.call(workspaces.POST, "POST", "/api/evaluation/workspaces", { body })).status).toBe(422);
    expect(browser.cookies.size).toBe(0);
  });

  it("límites: 20 intentos por hora por IP con hash y 200 espacios por día (probado con límites chicos)", async () => {
    const app = getContainer();
    const prefix = `t-${randomUUID().slice(0, 8)}`;
    const limiter = new DbRateLimiter(getDb());
    const access = new OpenEvaluationAccessUseCase(app.createWorkspace, app.sessions, limiter, new EnvAccessCode(code, () => process.env.SESSION_PEPPER ?? ""), {
      sessionTtlHours: 1,
      perIpPerHour: 2,
      perDay: 1,
      keyPrefix: prefix,
    });
    await access.open({ accessCode: code(), scenario: "base", ipHash: "ip-a" });
    await expect(access.open({ accessCode: code(), scenario: "base", ipHash: "ip-b" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(access.open({ accessCode: "wrong", scenario: "base", ipHash: "ip-c" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(access.open({ accessCode: "wrong", scenario: "base", ipHash: "ip-c" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(access.open({ accessCode: code(), scenario: "base", ipHash: "ip-c" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
