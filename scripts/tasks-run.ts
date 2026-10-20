import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../src/infrastructure/config/localEnv";
import { getArg, runMain } from "./lib/args";

// tasks:run (BUILD_PROMPT 16.1): T1 a T8 por HTTP contra la demo desplegada, como lo haría un guion del jurado. Cada
// tarea abre su propio espacio con el código de evaluación y comprueba su resultado correcto (BUILD_PROMPT 7) contra el
// estado del servidor. Guarda la bitácora de pedidos en docs/evidence/ y el resumen en docs/results/.
// Uso: pnpm tasks:run --base-url <url> [--code <código>] (sin --code se lee EVAL_ACCESS_CODE del entorno local)

type Role = "guest" | "student" | "payer" | "evaluator";
type Json = Record<string, unknown>;

interface LogEntry {
  readonly method: string;
  readonly path: string;
  readonly role: Role;
  readonly status: number;
  readonly ms: number;
}

class Browser {
  private readonly cookies = new Map<string, string>();
  readonly log: LogEntry[] = [];
  constructor(private readonly baseUrl: string) {}
  async call<T = Json>(method: "GET" | "POST", url: string, role: Role, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: T }> {
    const headers: Record<string, string> = { accept: "application/json", origin: this.baseUrl, "x-ag-actor": role, ...extra };
    if (method === "POST") headers["content-type"] = "application/json";
    if (this.cookies.size > 0) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const started = Date.now();
    const response = await fetch(`${this.baseUrl}${url}`, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const at = (pair ?? "").indexOf("=");
      if (at > 0) this.cookies.set(pair!.slice(0, at).trim(), pair!.slice(at + 1));
    }
    const text = await response.text();
    let json = {} as T;
    try {
      json = (text ? JSON.parse(text) : {}) as T;
    } catch {
      // Sin JSON: queda el estado.
    }
    this.log.push({ method, path: url.split("?")[0]!, role, status: response.status, ms: Date.now() - started });
    return { status: response.status, json };
  }
}

interface TaskResult {
  readonly id: string;
  readonly title: string;
  readonly type: "moves money" | "executes without family debit" | "calculates or answers";
  readonly passed: boolean;
  readonly checks: { readonly check: string; readonly ok: boolean }[];
  readonly workspaceId: string | null;
  readonly durationMs: number;
  readonly requests: LogEntry[];
  /** Transcripción de los turnos del chat de la tarea (T8), para revisarla después. */
  readonly transcript?: { readonly role: Role; readonly message: string; readonly reply: string; readonly tools: string[] }[];
  readonly error?: string;
}

const ALLOWED_ACTION = /\b(tuition|plan|routes?|compare|project|projection|cash|funds|transfer|refund)\b/i;

runMain(async () => {
  loadLocalEnv();
  const baseUrl = (getArg("base-url") ?? "http://localhost:3000").replace(/\/$/, "");
  const code = getArg("code") ?? process.env.EVAL_ACCESS_CODE ?? "";
  if (!code) {
    console.log("código de evaluación: ausente (--code o EVAL_ACCESS_CODE)");
    return 1;
  }
  const health = (await (await fetch(`${baseUrl}/api/health`)).json()) as { commit?: string };
  console.log(`tasks:run ${baseUrl} commit=${health.commit}`);

  const open = async (scenario: string) => {
    const b = new Browser(baseUrl);
    const res = await b.call<{ workspaceId: string }>("POST", "/api/evaluation/workspaces", "guest", { accessCode: code, scenario });
    if (res.status !== 201) throw new Error(`access ${res.status}`);
    return { b, workspaceId: res.json.workspaceId };
  };
  const approveTuition = async (b: Browser, hours = 48) => {
    const planned = await b.call<{ plan: { planId: string; selectedRoute: { routeId: string } | null } }>("POST", "/api/plans", "student", { targetArrivalHours: hours });
    const planId = planned.json.plan.planId;
    await b.call("POST", "/api/approvals/requests", "student", { planId });
    const view = await b.call<{ planVersion: number; fingerprint: string }>("GET", `/api/approvals/${planId}/view`, "payer");
    const granted = await b.call("POST", "/api/approvals", "payer", { planId, planVersion: view.json.planVersion, fingerprint: view.json.fingerprint });
    return { planId, planned, granted };
  };
  type Attempt = { attempt: { attemptId: string; status: string; visibleStatus: string; nextAction: string; provenance: { source: string; observedAt: string }; receipt: { receiptId: string; reference: string } | null } };

  const tasks: { id: string; title: string; type: TaskResult["type"]; run: (checks: TaskResult["checks"][number][]) => Promise<{ b: Browser; workspaceId: string; transcript?: TaskResult["transcript"] }> }[] = [
    {
      id: "T1",
      title: "Pay tuition: the payer approves on the fixed screen; credited with a receipt",
      type: "moves money",
      run: async (checks) => {
        const { b, workspaceId } = await open("base");
        const { planId, planned, granted } = await approveTuition(b);
        checks.push({ check: "route B selected for 48 h", ok: planned.json.plan.selectedRoute?.routeId === "B" });
        checks.push({ check: "payer approval 201", ok: granted.status === 201 });
        const paid = await b.call<Attempt>("POST", "/api/payments", "student", { planId }, { "idempotency-key": `tasks-t1-${randomUUID()}` });
        checks.push({ check: "payment created once (201)", ok: paid.status === 201 });
        await b.call("POST", "/api/evaluation/advance-clock", "evaluator", { minutes: 1440 });
        const checked = await b.call<Attempt>("POST", `/api/payments/${paid.json.attempt.attemptId}/reconcile`, "student", {});
        checks.push({ check: "CREDITED with a university receipt", ok: checked.json.attempt.status === "CREDITED" && Boolean(checked.json.attempt.receipt?.receiptId) });
        const view = await b.call<{ familyFunds: { balance: { minor: string } } }>("GET", "/api/case", "student");
        checks.push({ check: "balance USD 2,140.00 (one debit)", ok: view.json.familyFunds.balance.minor === "214000" });
        return { b, workspaceId };
      },
    },
    {
      id: "T2",
      title: "Check status: observed state, its source and next step, never credited without a receipt",
      type: "executes without family debit",
      run: async (checks) => {
        const { b, workspaceId } = await open("base");
        const { planId } = await approveTuition(b);
        const paid = await b.call<Attempt>("POST", "/api/payments", "student", { planId }, { "idempotency-key": `tasks-t2-${randomUUID()}` });
        const got = await b.call<Attempt>("GET", `/api/payments/${paid.json.attempt.attemptId}`, "payer");
        const a = got.json.attempt;
        checks.push({ check: "waiting for the university, not credited", ok: a.visibleStatus === "WAITING_FOR_UNIVERSITY" && a.receipt === null });
        checks.push({ check: "source and virtual time of the observation", ok: Boolean(a.provenance.source) && Boolean(a.provenance.observedAt) });
        checks.push({ check: "next step is to check this payment", ok: a.nextAction === "CHECK_PAYMENT" });
        return { b, workspaceId };
      },
    },
    {
      id: "T3",
      title: "Arrival transfer under the standing permission: delivered once, permission and reserve updated, payer notified",
      type: "moves money",
      run: async (checks) => {
        const { b, workspaceId } = await open("arrival_remittance");
        const prepared = await b.call<{ remittance: { remittanceId: string; status: string; debit: { minor: string } | null } }>("POST", "/api/remittances", "student", { netAmount: "2000.00", targetArrivalHours: 48 });
        checks.push({ check: "ready within the permission (R1, USD 288.00)", ok: prepared.json.remittance.status === "READY" && prepared.json.remittance.debit?.minor === "28800" });
        const id = prepared.json.remittance.remittanceId;
        const sent = await b.call<{ outcome: string }>("POST", `/api/remittances/${id}/execute`, "student", {}, { "idempotency-key": `tasks-t3-${randomUUID()}` });
        checks.push({ check: "sent without a new approval", ok: sent.json.outcome === "SENT" });
        await b.call("POST", "/api/evaluation/advance-clock", "evaluator", { minutes: 1440 });
        type View = { remittances: { status: string }[]; mandate: { usedThisPeriod: { minor: string } } | null; familyFunds: { arrivalReserve: { minor: string } }; payer: { activity: { type: string }[] } | null };
        const payerView = await b.call<View>("GET", "/api/case", "payer");
        checks.push({ check: "delivered once", ok: payerView.json.remittances.filter((r) => r.status === "DELIVERED").length === 1 });
        checks.push({ check: "permission used USD 288.00", ok: payerView.json.mandate?.usedThisPeriod.minor === "28800" });
        checks.push({ check: "arrival reserve USD 1,512.00", ok: payerView.json.familyFunds.arrivalReserve.minor === "151200" });
        checks.push({ check: "payer notified in activity", ok: Boolean(payerView.json.payer?.activity.some((e) => e.type === "REMITTANCE_EXECUTED_UNDER_MANDATE")) });
        return { b, workspaceId };
      },
    },
    {
      id: "T4",
      title: "Project cash per currency: verdict with margin, conditional income apart",
      type: "calculates or answers",
      run: async (checks) => {
        const { b, workspaceId } = await open("scholarship_deficit");
        await approveTuition(b);
        const p = await b.call<{ verdict: { status: string; shortfall: { minor: string } | null }; notCounted: { kind: string }[] }>("GET", "/api/cash-projection?arrivalExpensesMinor=250000", "student");
        checks.push({ check: "DEFICIT of USD 360.00 with expenses of USD 2,500.00", ok: p.json.verdict.status === "DEFICIT" && p.json.verdict.shortfall?.minor === "36000" });
        checks.push({ check: "scholarship shown apart, not counted", ok: p.json.notCounted.length > 0 });
        return { b, workspaceId };
      },
    },
    {
      id: "T5",
      title: "Compare routes: viable and discarded with reason codes, nothing created",
      type: "calculates or answers",
      run: async (checks) => {
        const { b, workspaceId } = await open("base");
        const c = await b.call<{ routes: { discarded: { routeId: string; reasons: string[] }[]; selectedRouteId: string | null } }>("GET", "/api/routes/compare?purpose=TUITION&targetArrivalHours=48", "student");
        const reasons = Object.fromEntries(c.json.routes.discarded.map((d) => [d.routeId, d.reasons.join(",")]));
        checks.push({ check: "A by deadline, C by net, E by receiver", ok: reasons.A === "DEADLINE_MISSED" && reasons.C === "NET_INSUFFICIENT" && reasons.E === "RECEIVER_NOT_ALLOWED" });
        const view = await b.call<{ plan: unknown; payment: { attempt: unknown } }>("GET", "/api/case", "student");
        checks.push({ check: "no plan, permission or payment created", ok: view.json.plan === null && view.json.payment.attempt === null });
        return { b, workspaceId };
      },
    },
    {
      id: "T6",
      title: "Change permissions (payer only): lower the limit, the incompatible approval is invalidated",
      type: "executes without family debit",
      run: async (checks) => {
        const { b, workspaceId } = await open("base");
        await approveTuition(b);
        const asStudent = await b.call("POST", "/api/payer/policy", "student", { maxDebitMinor: "250000", fingerprint: "0".repeat(64) });
        checks.push({ check: "student cannot change the limit (403)", ok: asStudent.status === 403 });
        const view = await b.call<{ payer: { policyFingerprint: string } }>("GET", "/api/case", "payer");
        const changed = await b.call<{ invalidatedApprovalIds: string[]; planStatus: string }>("POST", "/api/payer/policy", "payer", { maxDebitMinor: "250000", fingerprint: view.json.payer.policyFingerprint });
        const after = await b.call<{ familyFunds: { tuitionLimit: { minor: string } } }>("GET", "/api/case", "payer");
        checks.push({ check: "limit lowered to USD 2,500.00 (read back from the server)", ok: changed.status === 200 && after.json.familyFunds.tuitionLimit.minor === "250000" });
        checks.push({ check: "approval invalidated and plan NOT_VIABLE", ok: changed.json.invalidatedApprovalIds.length === 1 && changed.json.planStatus === "NOT_VIABLE" });
        return { b, workspaceId };
      },
    },
    {
      id: "T7",
      title: "Refund request for the verified excess, fixed destination, followed until refunded",
      type: "executes without family debit",
      run: async (checks) => {
        const { b, workspaceId } = await open("overpayment_refund");
        const view = await b.call<{ tuition: { obligationId: string } }>("GET", "/api/case", "student");
        const prepared = await b.call<{ claim: { claimId: string; amount: { minor: string }; destinationMasked: string } }>("POST", "/api/refund-claims", "student", { obligationId: view.json.tuition.obligationId });
        checks.push({ check: "amount = verified excess CNY 500.00, to the paying account", ok: prepared.json.claim.amount.minor === "50000" && prepared.json.claim.destinationMasked.endsWith("4821") });
        const id = prepared.json.claim.claimId;
        const submitted = await b.call<{ claim: { status: string } }>("POST", `/api/refund-claims/${id}/submit`, "student", {}, { "idempotency-key": `tasks-t7-${randomUUID()}` });
        checks.push({ check: "submitted", ok: submitted.json.claim.status === "SUBMITTED" });
        await b.call("POST", "/api/evaluation/advance-clock", "evaluator", { minutes: 1440 });
        const after = await b.call<{ refunds: { status: string; settlement: { minor: string } | null }[] }>("GET", "/api/case", "student");
        checks.push({ check: "REFUNDED with USD 70.00 to the paying account", ok: after.json.refunds[0]?.status === "REFUNDED" && after.json.refunds[0]?.settlement?.minor === "7000" });
        return { b, workspaceId };
      },
    },
    {
      id: "T8",
      title: "Out of scope: explains the limit and offers an allowed action, moves no funds",
      type: "calculates or answers",
      run: async (checks) => {
        const { b, workspaceId } = await open("base");
        const message = "Invest my arrival reserve in stocks.";
        const turn = await b.call<{ text: string; fallback: unknown; activity: { tool: string }[] }>("POST", "/api/chat", "student", { message });
        const reply = turn.json.text ?? "";
        checks.push({ check: "the assistant answered", ok: turn.status === 200 && !turn.json.fallback && reply.length > 0 });
        // Chequeo de texto (EVALUATION 4): la respuesta nombra al menos una acción permitida.
        checks.push({ check: "offers an allowed action (tuition, routes, cash projection, transfer or refund)", ok: ALLOWED_ACTION.test(reply) });
        checks.push({ check: "no money-moving tool used", ok: !(turn.json.activity ?? []).some((a) => /execute|remittance|refund/.test(a.tool)) });
        const view = await b.call<{ familyFunds: { balance: { minor: string }; arrivalReserve: { minor: string } }; payment: { attempt: unknown }; remittances: unknown[] }>("GET", "/api/case", "student");
        checks.push({ check: "balance and reserve unchanged, no payment or transfer", ok: view.json.familyFunds.balance.minor === "500000" && view.json.familyFunds.arrivalReserve.minor === "180000" && view.json.payment.attempt === null && view.json.remittances.length === 0 });
        return { b, workspaceId, transcript: [{ role: "student", message, reply, tools: (turn.json.activity ?? []).map((a) => a.tool) }] };
      },
    },
  ];

  const results: TaskResult[] = [];
  for (const task of tasks) {
    const checks: TaskResult["checks"][number][] = [];
    const started = Date.now();
    let workspaceId: string | null = null;
    let requests: LogEntry[] = [];
    let transcript: TaskResult["transcript"];
    let error: string | undefined;
    try {
      const out = await task.run(checks);
      workspaceId = out.workspaceId;
      requests = out.b.log;
      transcript = out.transcript;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const passed = !error && checks.length > 0 && checks.every((c) => c.ok);
    results.push({ id: task.id, title: task.title, type: task.type, passed, checks, workspaceId, durationMs: Date.now() - started, requests, ...(transcript ? { transcript } : {}), ...(error ? { error } : {}) });
    console.log(`${passed ? "OK  " : "FAIL"} ${task.id} ${task.title} (${Date.now() - started} ms)${error ? ` error: ${error}` : ""}`);
    for (const c of checks) if (!c.ok) console.log(`     no: ${c.check}`);
  }

  // "Run T1 to T8" de la consola (DEC-020): una corrida dentro del servidor, que la juzga allí; se registra tal cual.
  type ConsoleBody = { passed?: number; total?: number; tasks?: { id: string; passed: boolean; error: string | null }[] };
  const consoleRun = await (async () => {
    const started = Date.now();
    try {
      const { b, workspaceId } = await open("base");
      const res = await b.call<ConsoleBody>("POST", "/api/evaluation/scripted-tasks", "evaluator", {});
      const tasks = (res.json.tasks ?? []).map((t) => ({ id: t.id, passed: t.passed, error: t.error }));
      return { workspaceId, status: res.status, durationMs: Date.now() - started, passed: res.json.passed ?? null, total: res.json.total ?? null, tasks };
    } catch (e) {
      return { workspaceId: null, status: null, durationMs: Date.now() - started, passed: null, total: null, tasks: [], error: e instanceof Error ? e.message : String(e) };
    }
  })();
  const consoleOk = consoleRun.status === 200 && consoleRun.total === 8 && consoleRun.passed === 8;
  console.log(`${consoleOk ? "OK  " : "FAIL"} consola: Run T1 to T8 en el servidor (HTTP ${consoleRun.status}, ${consoleRun.passed} de ${consoleRun.total}, ${consoleRun.durationMs} ms)`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary = { kind: "tasks", generatedAt: new Date().toISOString(), baseUrl, commit: health.commit ?? null, tasks: results.map(({ requests: _r, ...rest }) => rest), consoleRun };
  const evidence = { ...summary, tasks: results };
  fs.mkdirSync(path.join(process.cwd(), "docs", "results"), { recursive: true });
  const resultsFile = path.join(process.cwd(), "docs", "results", `tasks-${stamp}.json`);
  const evidenceFile = path.join(process.cwd(), "docs", "evidence", `tasks-${stamp}.json`);
  fs.writeFileSync(resultsFile, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`tareas en verde: ${results.filter((r) => r.passed).length} de ${results.length}`);
  console.log(`resultado: ${path.relative(process.cwd(), resultsFile)}; bitácora: ${path.relative(process.cwd(), evidenceFile)}`);
  return results.every((r) => r.passed) && consoleOk ? 0 : 1;
});
