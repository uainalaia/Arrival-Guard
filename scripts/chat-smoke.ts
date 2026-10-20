import fs from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../src/infrastructure/config/localEnv";
import { getArg, runMain } from "./lib/args";

// Puerta G2 (BUILD_PROMPT 19): T1 completa por chat contra un despliegue, por HTTP como el navegador. La aprobación de
// Carlos va por su pantalla fija (vista y POST /api/approvals, como la interfaz), nunca por el chat. Exige CREDITED
// según el servidor y guarda la conversación en docs/evidence/. Uso: pnpm smoke:chat --base-url <url>

type Role = "guest" | "student" | "payer" | "evaluator";

class Browser {
  private readonly cookies = new Map<string, string>();
  constructor(private readonly baseUrl: string) {}
  async call<T>(method: "GET" | "POST", url: string, role: Role, body?: unknown): Promise<{ status: number; json: T }> {
    const headers: Record<string, string> = { accept: "application/json", origin: this.baseUrl, "x-ag-actor": role };
    if (method === "POST") headers["content-type"] = "application/json";
    if (this.cookies.size > 0) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
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
      // Respuesta sin JSON: se informa el estado.
    }
    return { status: response.status, json };
  }
}

interface Turn {
  text: string;
  fallback: { reason: string } | null;
  activity: { tool: string; ok: boolean; reason: string | null }[];
  components: { kind: string }[];
}

runMain(async () => {
  loadLocalEnv();
  const baseUrl = (getArg("base-url") ?? "http://localhost:3000").replace(/\/$/, "");
  const accessCode = process.env.EVAL_ACCESS_CODE;
  if (!accessCode) {
    console.log("EVAL_ACCESS_CODE: ausente");
    return 1;
  }
  const health = (await (await fetch(`${baseUrl}/api/health`)).json()) as { commit?: string };
  const b = new Browser(baseUrl);
  const transcript: { role: string; message: string; text: string; tools: string[]; components: string[]; fallback: string | null }[] = [];
  const say = async (message: string): Promise<Turn> => {
    const started = Date.now();
    const res = await b.call<Turn>("POST", "/api/chat", "student", { message });
    const turn = res.json;
    transcript.push({ role: "student", message, text: turn.text ?? "", tools: (turn.activity ?? []).map((a) => `${a.tool}${a.ok ? "" : `!${a.reason}`}`), components: (turn.components ?? []).map((c) => c.kind), fallback: turn.fallback?.reason ?? null });
    console.log(`POST /api/chat -> ${res.status} ${turn.fallback ? `FALLBACK ${turn.fallback.reason}` : "ok"} tools=[${(turn.activity ?? []).map((a) => a.tool).join(", ")}] ${Date.now() - started} ms`);
    console.log(`   > ${message}`);
    console.log(`   < ${(turn.text ?? "").replace(/\s+/g, " ").slice(0, 200)}`);
    return turn;
  };
  type CaseView = { plan: { planId: string; status: string } | null; payment: { visibleStatus: string; attempt: { status: string; receipt: { receiptId: string } | null } | null } };
  const caseView = async () => (await b.call<CaseView>("GET", "/api/case", "student")).json;

  const opened = await b.call<{ workspaceId: string }>("POST", "/api/evaluation/workspaces", "guest", { accessCode, scenario: "base" });
  if (opened.status !== 201) {
    console.log(`acceso: ${opened.status}`);
    return 1;
  }
  console.log(`smoke:chat ${baseUrl} commit=${health.commit} espacio=${opened.json.workspaceId}`);
  let fallbacks = 0;
  const count = (t: Turn) => {
    if (t.fallback) fallbacks++;
  };

  count(await say("Pay my tuition without touching the arrival reserve. It must arrive within 48 hours."));
  let view = await caseView();
  if (view.plan?.status === "READY_FOR_APPROVAL") count(await say("Please ask Carlos to approve it."));
  view = await caseView();
  if (view.plan?.status !== "APPROVAL_REQUESTED") {
    console.log(`el plan quedó en ${view.plan?.status ?? "ninguno"}, se esperaba APPROVAL_REQUESTED`);
    return 1;
  }
  // Pantalla fija del pagador: la aprobación nunca pasa por el chat.
  const planId = view.plan.planId;
  const approvalView = await b.call<{ planVersion: number; fingerprint: string }>("GET", `/api/approvals/${planId}/view`, "payer");
  const granted = await b.call("POST", "/api/approvals", "payer", { planId, planVersion: approvalView.json.planVersion, fingerprint: approvalView.json.fingerprint });
  console.log(`POST /api/approvals (pagador, pantalla fija) -> ${granted.status}`);
  if (granted.status !== 201) return 1;
  count(await say("Carlos approved it. Send the payment now."));
  const advanced = await b.call("POST", "/api/evaluation/advance-clock", "evaluator", { minutes: 1440 });
  console.log(`POST /api/evaluation/advance-clock 24 h -> ${advanced.status}`);
  count(await say("Has the university received my payment?"));
  view = await caseView();
  const t1 = { visibleStatus: view.payment.visibleStatus, attemptStatus: view.payment.attempt?.status ?? null, receiptId: view.payment.attempt?.receipt?.receiptId ?? null };
  console.log(`T1 (servidor): ${t1.visibleStatus} ${t1.receiptId ?? ""}`);

  const file = path.join(process.cwd(), "docs", "evidence", `g2-chat-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, commit: health.commit ?? null, workspaceId: opened.json.workspaceId, t1, transcript }, null, 2)}\n`);
  console.log(`evidencia: ${path.relative(process.cwd(), file)}`);
  if (fallbacks > 0 || t1.attemptStatus !== "CREDITED") {
    console.log(`smoke:chat: FALLA (salidas seguras: ${fallbacks}, T1: ${t1.attemptStatus})`);
    return 1;
  }
  console.log("smoke:chat: OK (T1 CREDITED por chat)");
  return 0;
});
