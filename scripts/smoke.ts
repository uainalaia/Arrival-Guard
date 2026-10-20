import { randomUUID } from "node:crypto";
import { loadLocalEnv } from "../src/infrastructure/config/localEnv";
import { getArg, runMain } from "./lib/args";

// Smoke contra un despliegue (BUILD_PROMPT 17, DEC-010): salud del servicio y de la base, banda de simulación y
// T1 de punta a punta en modo estructurado por HTTP, como el navegador (cookies, Origin, x-ag-actor), hasta CREDITED.
// El código de evaluación se lee de .env.local (el mismo que el de Vercel, ARRANQUE 4) y nunca se imprime.

type Role = "guest" | "student" | "payer" | "evaluator";

class Browser {
  private readonly cookies = new Map<string, string>();
  constructor(private readonly baseUrl: string) {}

  async call<T>(method: "GET" | "POST", path: string, role: Role, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; json: T }> {
    const headers: Record<string, string> = { accept: "application/json", origin: this.baseUrl, "x-ag-actor": role, ...extra };
    if (method === "POST") headers["content-type"] = "application/json";
    if (this.cookies.size > 0) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const at = (pair ?? "").indexOf("=");
      if (at > 0) this.cookies.set(pair!.slice(0, at).trim(), pair!.slice(at + 1));
    }
    const text = await response.text();
    let json: T;
    try {
      json = (text ? JSON.parse(text) : {}) as T;
    } catch {
      json = {} as T;
    }
    return { status: response.status, json };
  }
}

function step(label: string, status: number, expected: number, detail = ""): boolean {
  const ok = status === expected;
  console.log(`${ok ? "OK  " : "FAIL"} ${label} -> ${status}${detail ? ` ${detail}` : ""}`);
  return ok;
}

runMain(async () => {
  loadLocalEnv();
  const baseUrl = (getArg("base-url") ?? "http://localhost:3000").replace(/\/$/, "");
  console.log(`smoke: ${baseUrl}`);

  const health = await fetch(`${baseUrl}/api/health`, { headers: { accept: "application/json" } });
  const body = (await health.json().catch(() => ({}))) as { status?: string; database?: string; commit?: string };
  console.log(`GET /api/health -> ${health.status} status=${body.status} database=${body.database} commit=${body.commit}`);
  if (health.status !== 200 || body.status !== "ok" || body.database !== "ok") return 1;

  const home = await fetch(`${baseUrl}/`);
  const html = await home.text();
  const labelled = html.includes("Simulated funds");
  console.log(`GET / -> ${home.status} simulation band=${labelled ? "present" : "missing"}`);
  if (home.status !== 200 || !labelled) return 1;

  // El código del despliegue al que apunta: --code o, si no, EVAL_ACCESS_CODE de .env.local (VC11).
  const accessCode = getArg("code") ?? process.env.EVAL_ACCESS_CODE;
  if (!accessCode) {
    console.log("código de evaluación: ausente (--code o EVAL_ACCESS_CODE)");
    return 1;
  }
  const b = new Browser(baseUrl);

  const opened = await b.call<{ workspaceId?: string }>("POST", "/api/evaluation/workspaces", "guest", { accessCode, scenario: "base" });
  if (!step("POST /api/evaluation/workspaces (código de evaluación)", opened.status, 201, `workspace=${opened.json.workspaceId ?? "?"}`)) return 1;

  const planned = await b.call<{ plan?: { planId: string; selectedRoute: { routeId: string } | null } }>("POST", "/api/plans", "student", { targetArrivalHours: 48 });
  const planId = planned.json.plan?.planId ?? "";
  if (!step("POST /api/plans", planned.status, 201, `route=${planned.json.plan?.selectedRoute?.routeId ?? "none"}`)) return 1;
  if (planned.json.plan?.selectedRoute?.routeId !== "B") return 1;

  const requested = await b.call("POST", "/api/approvals/requests", "student", { planId });
  if (!step("POST /api/approvals/requests", requested.status, 200)) return 1;

  const view = await b.call<{ planVersion?: number; fingerprint?: string }>("GET", `/api/approvals/${planId}/view`, "payer");
  if (!step("GET /api/approvals/{planId}/view (pagador)", view.status, 200, `fingerprint=${(view.json.fingerprint ?? "").slice(0, 8)}`)) return 1;

  const granted = await b.call("POST", "/api/approvals", "payer", { planId, planVersion: view.json.planVersion, fingerprint: view.json.fingerprint });
  if (!step("POST /api/approvals (pagador)", granted.status, 201)) return 1;

  type Attempt = { attempt?: { attemptId: string; status: string; debit: { currency: string; minor: string } } };
  const paid = await b.call<Attempt>("POST", "/api/payments", "student", { planId }, { "idempotency-key": `smoke-${randomUUID()}` });
  const attemptId = paid.json.attempt?.attemptId ?? "";
  if (!step("POST /api/payments (Idempotency-Key)", paid.status, 201, `status=${paid.json.attempt?.status} debit=${paid.json.attempt?.debit.currency} ${paid.json.attempt?.debit.minor}`)) return 1;

  const advanced = await b.call("POST", "/api/evaluation/advance-clock", "evaluator", { minutes: 1440 });
  if (!step("POST /api/evaluation/advance-clock 24 h (evaluador)", advanced.status, 200)) return 1;

  const checked = await b.call<Attempt>("POST", `/api/payments/${attemptId}/reconcile`, "student", {});
  if (!step("POST /api/payments/{id}/reconcile", checked.status, 200, `status=${checked.json.attempt?.status}`)) return 1;

  const view2 = await b.call<{ familyFunds?: { balance: { minor: string } } }>("GET", "/api/case", "student");
  if (!step("GET /api/case", view2.status, 200, `balance minor=${view2.json.familyFunds?.balance.minor}`)) return 1;

  if (checked.json.attempt?.status !== "CREDITED" || view2.json.familyFunds?.balance.minor !== "214000") return 1;
  console.log("smoke: OK (T1 CREDITED)");
  return 0;
});
