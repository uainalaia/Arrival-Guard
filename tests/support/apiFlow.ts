import * as approvals from "@/app/api/approvals/route";
import * as approvalRequests from "@/app/api/approvals/requests/route";
import * as approvalView from "@/app/api/approvals/[planId]/view/route";
import * as workspaces from "@/app/api/evaluation/workspaces/route";
import * as plans from "@/app/api/plans/route";
import { TestBrowser } from "./http";

export interface ApiWorkspace {
  readonly browser: TestBrowser;
  readonly workspaceId: string;
}

export async function openWorkspace(scenario = "base"): Promise<ApiWorkspace> {
  const browser = new TestBrowser();
  const res = await browser.call<{ workspaceId: string }>(workspaces.POST, "POST", "/api/evaluation/workspaces", {
    role: "guest",
    body: { accessCode: process.env.EVAL_ACCESS_CODE ?? "", scenario },
  });
  if (res.status !== 201) throw new Error(`No se pudo abrir el espacio: ${res.status}`);
  return { browser, workspaceId: res.json.workspaceId };
}

export interface PlannedDTO {
  plan: { planId: string; version: number; status: string; selectedRoute: { routeId: string; debit: { minor: string } } | null; routes: { discarded: { routeId: string; reasons: string[] }[] } };
}

/** Plan, solicitud y aprobación del pagador por HTTP, con la huella de la pantalla fija. */
export async function approvePlanViaApi(ws: ApiWorkspace, targetArrivalHours = 48) {
  const planned = await ws.browser.call<PlannedDTO>(plans.POST, "POST", "/api/plans", { role: "student", body: { targetArrivalHours } });
  const planId = planned.json.plan.planId;
  await ws.browser.call(approvalRequests.POST, "POST", "/api/approvals/requests", { role: "student", body: { planId } });
  const view = await ws.browser.call<{ planVersion: number; fingerprint: string }>(approvalView.GET, "GET", `/api/approvals/${planId}/view`, {
    role: "payer",
    params: { planId },
  });
  const granted = await ws.browser.call<{ approval: { approvalId: string; fingerprintPrefix: string } }>(approvals.POST, "POST", "/api/approvals", {
    role: "payer",
    body: { planId, planVersion: view.json.planVersion, fingerprint: view.json.fingerprint },
  });
  return { planId, planned, view, granted };
}
