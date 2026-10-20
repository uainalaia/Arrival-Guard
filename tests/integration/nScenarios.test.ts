import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/infrastructure/db/client";
import { app, newWorkspace, planAndApprove } from "../support/integration";

// Escenarios normales de BUILD_PROMPT 16.2 que no tenían una prueba con su id: N03, N04 y N09.

afterAll(async () => {
  await closeDb();
});

describe("Escenarios normales (BUILD_PROMPT 16.2)", () => {
  it("N03: consulta con pago pendiente: origen y siguiente acción, sin afirmar acreditación", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    const paid = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "n03-key-000001" });
    const status = await app().paymentStatus.execute(t.student, { attemptId: paid.attempt.attempt.id });
    expect(status.visible.status).toBe("WAITING_FOR_UNIVERSITY");
    expect(status.visible.nextAction).toBe("CHECK_PAYMENT");
    expect(status.observation?.source).toBe("INSTITUTION");
    expect(status.observation?.receipt).toBeNull();
    expect(status.attempt?.attempt.status).not.toBe("CREDITED");
  });

  it("N04: consulta con pago acreditado: recibo y referencia concordantes con el libro de la universidad", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    const paid = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "n04-key-000001" });
    await app().advanceClock.execute(t.evaluator, { minutes: 24 * 60 });
    const status = await app().paymentStatus.execute(t.payer, { attemptId: paid.attempt.attempt.id });
    expect(status.visible.status).toBe("CREDITED");
    const receipt = status.observation?.receipt;
    expect(receipt?.reference).toBe("AG-STUDENT-01");
    expect(receipt?.net.toDecimalString()).toBe("20000.00");
    expect(receipt?.receiptId).toMatch(/^AU-RC-/);
    const workspace = (await app().deps.uow.read.workspaces.get(t.workspaceId))!;
    const ledger = await app().deps.institution.getLedger({ workspaceId: t.workspaceId, now: workspace.virtualNow }, "AG-STUDENT-01");
    expect(ledger.credited.toDecimalString()).toBe(receipt?.net.toDecimalString());
  });

  it("VC9-6: en los escenarios con la matrícula ya pagada, el caso muestra CREDITED y ninguna acción, no 'datos por confirmar'", async () => {
    for (const scenario of ["arrival_remittance", "overpayment_refund"]) {
      const t = await newWorkspace(scenario);
      for (const actor of [t.student, t.payer]) {
        const view = await app().caseView.execute(actor);
        expect(view.obligation.status).toBe("CREDITED");
        expect([scenario, view.visible]).toEqual([scenario, { status: "CREDITED", nextAction: "NONE" }]);
      }
    }
  });

  it("N09: comparar: A por plazo, C por neto y E por receptor", async () => {
    const t = await newWorkspace("base");
    const result = await app().compareRoutes.tuition(t.student, { targetArrivalHours: 48 });
    const reasons = Object.fromEntries(result.discarded.map((r) => [r.routeId, r.reasons]));
    expect(reasons).toEqual({ A: ["DEADLINE_MISSED"], C: ["NET_INSUFFICIENT"], E: ["RECEIVER_NOT_ALLOWED"] });
    expect(result.selected?.routeId).toBe("B");
    expect(result.viable.map((r) => r.routeId)).toEqual(["B", "D"]);
  });
});
