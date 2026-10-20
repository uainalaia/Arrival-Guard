import { afterAll, describe, expect, it } from "vitest";
import * as caseRoute from "@/app/api/case/route";
import * as cash from "@/app/api/cash-projection/route";
import * as compare from "@/app/api/routes/compare/route";
import * as advance from "@/app/api/evaluation/advance-clock/route";
import * as events from "@/app/api/evaluation/events/route";
import * as faults from "@/app/api/evaluation/faults/route";
import * as payment from "@/app/api/payments/[id]/route";
import * as payments from "@/app/api/payments/route";
import * as reconcile from "@/app/api/payments/[id]/reconcile/route";
import { closeDb } from "@/infrastructure/db/client";
import { approvePlanViaApi, openWorkspace } from "../support/apiFlow";

afterAll(async () => {
  await closeDb();
});

interface AttemptBody {
  replayed?: boolean;
  attempt: { attemptId: string; status: string; visibleStatus: string; nextAction: string; debit: { currency: string; minor: string }; receipt: { receiptId: string } | null; provenance: { source: string } };
}

describe("T1 de punta a punta por HTTP en modo estructurado", () => {
  it("plan, aprobación, pago idempotente, conciliación y CREDITED con saldo USD 2,140.00", async () => {
    const ws = await openWorkspace("base");
    const { planId, planned, view, granted } = await approvePlanViaApi(ws, 48);
    expect(planned.status).toBe(201);
    expect(planned.json.plan.selectedRoute?.routeId).toBe("B");
    expect(planned.json.plan.routes.discarded.map((d) => [d.routeId, d.reasons])).toEqual([
      ["A", ["DEADLINE_MISSED"]],
      ["C", ["NET_INSUFFICIENT"]],
      ["E", ["RECEIVER_NOT_ALLOWED"]],
    ]);
    expect(view.json.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(granted.status).toBe(201);
    expect(granted.json.approval.fingerprintPrefix).toBe(view.json.fingerprint.slice(0, 8));

    const missingKey = await ws.browser.call(payments.POST, "POST", "/api/payments", { role: "student", body: { planId } });
    expect(missingKey.status).toBe(422);

    const paid = await ws.browser.call<AttemptBody>(payments.POST, "POST", "/api/payments", { role: "student", body: { planId }, headers: { "idempotency-key": "api-t1-key-0001" } });
    expect(paid.status).toBe(201);
    expect(paid.json.attempt.status).toBe("PENDING_UNIVERSITY");
    expect(paid.json.attempt.visibleStatus).toBe("WAITING_FOR_UNIVERSITY");
    expect(paid.json.attempt.debit).toEqual({ currency: "USD", minor: "286000" });

    const replay = await ws.browser.call<AttemptBody>(payments.POST, "POST", "/api/payments", { role: "payer", body: { planId }, headers: { "idempotency-key": "api-t1-key-0001" } });
    expect(replay.status).toBe(200);
    expect(replay.json.replayed).toBe(true);
    expect(replay.json.attempt.attemptId).toBe(paid.json.attempt.attemptId);

    const another = await ws.browser.call<{ error: { code: string; existingAttemptId: string } }>(payments.POST, "POST", "/api/payments", {
      role: "student",
      body: { planId },
      headers: { "idempotency-key": "api-t1-key-0002" },
    });
    expect(another.status).toBe(409);
    expect(another.json.error.code).toBe("ACTIVE_ATTEMPT_EXISTS");
    expect(another.json.error.existingAttemptId).toBe(paid.json.attempt.attemptId);

    expect((await ws.browser.call(advance.POST, "POST", "/api/evaluation/advance-clock", { role: "student", body: { minutes: 1440 } })).status).toBe(403);
    expect((await ws.browser.call(advance.POST, "POST", "/api/evaluation/advance-clock", { role: "evaluator", body: { minutes: 1440 } })).status).toBe(200);

    const attemptId = paid.json.attempt.attemptId;
    const checked = await ws.browser.call<AttemptBody>(reconcile.POST, "POST", `/api/payments/${attemptId}/reconcile`, { role: "student", params: { id: attemptId } });
    expect(checked.json.attempt.status).toBe("CREDITED");
    expect(checked.json.attempt.receipt?.receiptId).toMatch(/^AU-RC-/);
    expect(checked.json.attempt.provenance.source).toBe("INSTITUTION");

    const got = await ws.browser.call<AttemptBody>(payment.GET, "GET", `/api/payments/${attemptId}`, { role: "payer", params: { id: attemptId } });
    expect(got.json.attempt.visibleStatus).toBe("CREDITED");

    const view2 = await ws.browser.call<{ familyFunds: { balance: { minor: string }; arrivalReserve: { minor: string }; accountMasked: string }; payment: { visibleStatus: string; journey: { key: string; state: string }[] } }>(
      caseRoute.GET,
      "GET",
      "/api/case",
      { role: "student" },
    );
    expect(view2.json.familyFunds.balance).toEqual({ currency: "USD", minor: "214000" });
    expect(view2.json.familyFunds.arrivalReserve).toEqual({ currency: "USD", minor: "180000" });
    expect(view2.json.familyFunds.accountMasked).toBe("•••• 4821");
    expect(view2.json.payment.visibleStatus).toBe("CREDITED");
    expect(view2.json.payment.journey.map((s) => s.state)).toEqual(["done", "done", "done", "done", "done", "done"]);
  });

  it("con respuesta perdida la consulta muestra estado incierto y el mismo intento se concilia (O03 por HTTP)", async () => {
    const ws = await openWorkspace("base");
    const { planId } = await approvePlanViaApi(ws, 48);
    expect((await ws.browser.call(faults.POST, "POST", "/api/evaluation/faults", { role: "evaluator", body: { fault: "LOSE_NEXT_PROVIDER_RESPONSE", enabled: true } })).status).toBe(200);
    const paid = await ws.browser.call<AttemptBody>(payments.POST, "POST", "/api/payments", { role: "student", body: { planId }, headers: { "idempotency-key": "api-o03-key-0001" } });
    expect(paid.json.attempt.status).toBe("UNKNOWN");
    expect(paid.json.attempt.visibleStatus).toBe("UNCERTAIN");
    expect(paid.json.attempt.nextAction).toBe("CHECK_PAYMENT");
    const id = paid.json.attempt.attemptId;
    const checked = await ws.browser.call<AttemptBody>(reconcile.POST, "POST", `/api/payments/${id}/reconcile`, { role: "student", params: { id } });
    expect(checked.json.attempt.attemptId).toBe(id);
    expect(checked.json.attempt.status).toBe("PENDING_UNIVERSITY");
    const log = await ws.browser.call<{ events: { type: string }[] }>(events.GET, "GET", "/api/evaluation/events", { role: "evaluator" });
    const types = log.json.events.map((e) => e.type);
    expect(types).toContain("FAULT_INJECTED");
    expect(types).toContain("ATTEMPT_UNKNOWN");
    expect(types.filter((t) => t === "DEBIT_CONFIRMED")).toHaveLength(1);
  });

  it("T5 y T4 por HTTP: comparar sin efectos y proyectar la caja (N07; N08: DEFICIT de USD 360.00 con la beca aparte)", async () => {
    const ws = await openWorkspace("base");
    const cmp = await ws.browser.call<{ routes: { selectedRouteId: string } }>(compare.GET, "GET", "/api/routes/compare?purpose=TUITION&targetArrivalHours=6", { role: "payer" });
    expect(cmp.status).toBe(200);
    expect(cmp.json.routes.selectedRouteId).toBe("D");
    const projection = await ws.browser.call<{ verdict: { status: string; margin: { minor: string } }; notCounted: { amount: { minor: string } }[] }>(cash.GET, "GET", "/api/cash-projection", {
      role: "student",
    });
    expect(projection.json.verdict).toMatchObject({ status: "COVERED", margin: { currency: "USD", minor: "34000" } });
    expect(projection.json.notCounted[0]?.amount).toEqual({ currency: "CNY", minor: "2000000" });
    const deficit = await ws.browser.call<{ verdict: { status: string; shortfall: { minor: string } } }>(cash.GET, "GET", "/api/cash-projection?arrivalExpensesMinor=250000", { role: "payer" });
    expect(deficit.json.verdict).toMatchObject({ status: "DEFICIT", shortfall: { currency: "USD", minor: "36000" } });
    const state = await ws.browser.call<{ plan: unknown }>(caseRoute.GET, "GET", "/api/case", { role: "student" });
    expect(state.json.plan).toBeNull();
  });
});
