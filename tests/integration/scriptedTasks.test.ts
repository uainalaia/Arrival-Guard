import { afterAll, describe, expect, it } from "vitest";
import * as scriptedTasks from "@/app/api/evaluation/scripted-tasks/route";
import { RoleNotAllowedError, RateLimitedError } from "@/application/errors/ApplicationError";
import { RunScriptedTasksUseCase, type ScriptedTaskApp } from "@/application/usecases/RunScriptedTasksUseCase";
import { closeDb, getDb } from "@/infrastructure/db/client";
import { DbRateLimiter } from "@/infrastructure/auth/DrizzleSessionStore";
import { openWorkspace } from "../support/apiFlow";
import { app, eventTypes, newWorkspace } from "../support/integration";
import { ScriptedModel, chatWith, say } from "../support/scriptedModel";

// Consola del evaluador, "Run T1 to T8" (UI_UX 11.5): las ocho tareas en espacios nuevos, juzgadas por el servidor.
// El modelo es guionado; con el modelo real la misma tarea T8 la mide eval:agent.

afterAll(async () => {
  await closeDb();
});

const limits = (prefix: string, overrides: Partial<{ perWorkspacePerHour: number; perOriginPerDay: number; perDay: number; startIntervalSeconds: number }> = {}) => ({
  keyPrefix: `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  perWorkspacePerHour: 3,
  perOriginPerDay: 100,
  perDay: 100,
  // El intervalo entre corridas tiene su propia prueba (60 s); aquí se apaga para que no se cruce con el límite medido.
  startIntervalSeconds: 0,
  ...overrides,
});

const runner = (prefix: string, perWorkspacePerHour = 3) =>
  new RunScriptedTasksUseCase(app().deps, () => ({ ...app(), chat: chatWith(new ScriptedModel([() => say("I can't invest your reserve. I can plan your tuition payment or project your funds.")])) }), new DbRateLimiter(getDb()), limits(prefix, { perWorkspacePerHour }));

// App falsa cuyo primer paso falla con un error crudo de base de datos: las corridas terminan al instante.
const brokenApp = () =>
  ({
    createWorkspace: {
      execute: async () => {
        throw new Error("Failed query: insert into workspaces params: secret-host.neon.tech");
      },
    },
  }) as unknown as ScriptedTaskApp;
const fastRunner = (overrides: Parameters<typeof limits>[1]) => new RunScriptedTasksUseCase(app().deps, brokenApp, new DbRateLimiter(getDb()), limits("scripted-fast", overrides));
const ORIGIN = { originHash: "test-origin" };

describe("Run T1 to T8 desde la consola", () => {
  it("las ocho tareas pasan, cada una en su propio espacio, y el espacio del evaluador solo recibe el resumen", async () => {
    const t = await newWorkspace("base");
    const run = await runner("scripted-ok").execute(t.evaluator, ORIGIN);
    expect(run.tasks.map((x) => [x.id, x.passed, x.error])).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"].map((id) => [id, true, null]));
    expect(run.passed).toBe(8);
    const spaces = new Set(run.tasks.map((x) => x.workspaceId));
    expect(spaces.size).toBe(8);
    expect(spaces.has(t.workspaceId)).toBe(false);
    const events = await app().deps.uow.read.events.list(t.workspaceId);
    expect(events.find((e) => e.type === "SCRIPTED_TASKS_RUN")?.payload).toMatchObject({ passed: 8, total: 8, failed: [] });
    expect(await eventTypes(t.workspaceId)).not.toContain("ATTEMPT_CREATED");
    expect((await app().deps.uow.read.attempts.listAll(t.workspaceId)).length).toBe(0);
  });

  it("solo el evaluador lo corre y el límite por espacio se aplica antes de crear espacios", async () => {
    const t = await newWorkspace("base");
    const limited = runner("scripted-limit", 1);
    await expect(limited.execute(t.student, ORIGIN)).rejects.toBeInstanceOf(RoleNotAllowedError);
    await expect(limited.execute(t.payer, ORIGIN)).rejects.toBeInstanceOf(RoleNotAllowedError);
    await limited.execute(t.evaluator, ORIGIN);
    await expect(limited.execute(t.evaluator, ORIGIN)).rejects.toBeInstanceOf(RateLimitedError);
    expect((await eventTypes(t.workspaceId)).filter((e) => e === "SCRIPTED_TASKS_RUN")).toHaveLength(1);
  });

  it("VC9b: un error inesperado de una tarea no expone su mensaje (solo el código)", async () => {
    const t = await newWorkspace("base");
    const run = await fastRunner({}).execute(t.evaluator, ORIGIN);
    expect(run.passed).toBe(0);
    for (const task of run.tasks) {
      expect(task.error).toBe("UNEXPECTED_ERROR");
      expect(JSON.stringify(task)).not.toMatch(/Failed query|neon\.tech/);
    }
  });

  it("VC9b: una sola corrida empieza por intervalo, aunque la pidan evaluadores distintos", async () => {
    const [a, b] = await Promise.all([newWorkspace("base"), newWorkspace("base")]);
    const shared = fastRunner({ startIntervalSeconds: 60 });
    const results = await Promise.allSettled([shared.execute(a.evaluator, { originHash: "origin-a" }), shared.execute(b.evaluator, { originHash: "origin-b" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(RateLimitedError);
  });

  it("dos corridas a ambos lados del cambio de ventana del limitador tampoco empiezan las dos (borde de la ventana fija)", async () => {
    const [a, b] = await Promise.all([newWorkspace("base"), newWorkspace("base")]);
    // Reloj propio del limitador (no el global: las pruebas corren en paralelo): 20 ms antes y después de un cambio de
    // ventana de 120 s, que es la grilla sin desplazar para un intervalo de 60 s.
    const edge = Math.ceil(Date.now() / 120_000) * 120_000 + 120_000;
    let now = edge - 20;
    const limiter = new DbRateLimiter(getDb(), () => now);
    const shared = new RunScriptedTasksUseCase(app().deps, brokenApp, limiter, limits("scripted-edge", { startIntervalSeconds: 60 }));
    await shared.execute(a.evaluator, { originHash: "edge-a" });
    now = edge + 20;
    await expect(shared.execute(b.evaluator, { originHash: "edge-b" })).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("VC11-5: un intento rechazado no alarga el bloqueo; al pasar el intervalo desde la corrida aceptada se puede volver a correr", async () => {
    const [a, b, c] = await Promise.all([newWorkspace("base"), newWorkspace("base"), newWorkspace("base")]);
    const edge = Math.ceil(Date.now() / 120_000) * 120_000 + 120_000;
    let now = edge - 20;
    const shared = new RunScriptedTasksUseCase(app().deps, brokenApp, new DbRateLimiter(getDb(), () => now), limits("scripted-chain", { startIntervalSeconds: 60 }));
    await shared.execute(a.evaluator, { originHash: "chain-a" });
    now = edge + 20;
    await expect(shared.execute(b.evaluator, { originHash: "chain-b" })).rejects.toBeInstanceOf(RateLimitedError);
    // 60 s y 10 ms después de la única corrida aceptada: el rechazo intermedio no debe contar.
    now = edge - 20 + 60_010;
    await expect(shared.execute(c.evaluator, { originHash: "chain-c" })).resolves.toMatchObject({ total: 8 });
  });

  it("VC11-5: reintentar en el Retry-After devuelto permite empezar", async () => {
    const [a, b] = await Promise.all([newWorkspace("base"), newWorkspace("base")]);
    let now = Date.now();
    const shared = new RunScriptedTasksUseCase(app().deps, brokenApp, new DbRateLimiter(getDb(), () => now), limits("scripted-retry", { startIntervalSeconds: 60 }));
    await shared.execute(a.evaluator, { originHash: "retry-a" });
    now += 15_000;
    const rejected = await shared.execute(b.evaluator, { originHash: "retry-b" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(rejected).toBeInstanceOf(RateLimitedError);
    const retryAfter = (rejected as RateLimitedError).retryAfterSeconds!;
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    now += retryAfter * 1000;
    await expect(shared.execute(b.evaluator, { originHash: "retry-b" })).resolves.toMatchObject({ total: 8 });
  });

  it("VC9b: un solo origen no agota las corridas del día; otro origen sigue corriendo", async () => {
    const [a, b, c] = await Promise.all([newWorkspace("base"), newWorkspace("base"), newWorkspace("base")]);
    const perOrigin = fastRunner({ perOriginPerDay: 2, perWorkspacePerHour: 10 });
    await perOrigin.execute(a.evaluator, { originHash: "same-origin" });
    await perOrigin.execute(b.evaluator, { originHash: "same-origin" });
    await expect(perOrigin.execute(a.evaluator, { originHash: "same-origin" })).rejects.toBeInstanceOf(RateLimitedError);
    await expect(perOrigin.execute(c.evaluator, { originHash: "other-origin" })).resolves.toMatchObject({ total: 8 });
  });

  it("VC9b: por HTTP, campos de autoridad en el cuerpo dan 422 y no corre nada", async () => {
    const ws = await openWorkspace("base");
    const res = await ws.browser.call(scriptedTasks.POST, "POST", "/api/evaluation/scripted-tasks", { role: "evaluator", body: { workspaceId: ws.workspaceId, role: "payer", tasks: ["T1"], scenario: "evil" } });
    expect(res.status).toBe(422);
    expect(await eventTypes(ws.workspaceId)).not.toContain("SCRIPTED_TASKS_RUN");
  });

  it("por HTTP, la sesión del estudiante o del pagador recibe 403", async () => {
    const ws = await openWorkspace("base");
    for (const role of ["student", "payer"] as const) {
      const res = await ws.browser.call(scriptedTasks.POST, "POST", "/api/evaluation/scripted-tasks", { role, body: {} });
      expect(res.status).toBe(403);
    }
    expect(await eventTypes(ws.workspaceId)).not.toContain("SCRIPTED_TASKS_RUN");
  });
});
