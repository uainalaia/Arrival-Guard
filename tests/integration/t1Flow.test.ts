import { randomUUID } from "node:crypto";
import { PaymentPlan } from "@/domain/payment/PaymentPlan";
import { afterAll, describe, expect, it } from "vitest";
import { ActiveAttemptExistsError, IdempotencyConflictError, RoleNotAllowedError, VersionConflictError } from "@/application/errors/ApplicationError";
import { PolicyViolationError } from "@/domain/errors/DomainError";
import { closeDb } from "@/infrastructure/db/client";
import { app, count, eventTypes, ledgerRows, newWorkspace, payerBalance, payerFunds, planAndApprove, providerTransfers } from "../support/integration";

afterAll(async () => {
  await closeDb();
});

describe("N01: matrícula con objetivo de 48 h de punta a punta (T1, puerta G1)", () => {
  it("elige B, debita USD 2,860.00 una sola vez, se acredita y deja saldo USD 2,140.00", async () => {
    const t = await newWorkspace("base");
    const { planId, view, approval } = await planAndApprove(t, 48);
    expect(view.record.quote?.routeId).toBe("B");
    expect(view.payload?.proposedDebit).toEqual({ currency: "USD", minor: "286000" });
    expect(approval.status).toBe("ACTIVE");

    const result = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "n01-key" });
    expect(result.replayed).toBe(false);
    expect(result.attempt.attempt.status).toBe("PENDING_UNIVERSITY");
    expect(await payerFunds(t.workspaceId)).toEqual({ balance: "2140.00", activeHolds: "0.00", reserve: "1800.00" });

    const pending = await app().paymentStatus.execute(t.student, {});
    expect(pending.visible.status).toBe("WAITING_FOR_UNIVERSITY");
    expect(pending.observation?.receipt).toBeNull();

    await app().advanceClock.execute(t.evaluator, { minutes: 24 * 60 });
    const credited = await app().paymentStatus.execute(t.student, {});
    expect(credited.attempt?.attempt.status).toBe("CREDITED");
    expect(credited.visible).toEqual({ status: "CREDITED", nextAction: "NONE" });
    expect(credited.observation?.source).toBe("INSTITUTION");
    expect(credited.observation?.receipt?.reference).toBe("AG-STUDENT-01");
    expect(credited.observation?.receipt?.net.toDecimalString()).toBe("20000.00");
    expect(credited.plan?.plan.status).toBe("COMPLETED");
    expect(await payerBalance(t.workspaceId)).toBe("2140.00");

    const types = await eventTypes(t.workspaceId);
    expect(count(types, "DEBIT_CONFIRMED")).toBe(1);
    expect(count(types, "INSTITUTION_CREDITED")).toBe(1);
    for (const type of ["PLAN_CREATED", "APPROVAL_REQUESTED", "APPROVAL_GRANTED", "ATTEMPT_CREATED", "HOLD_PLACED", "PROVIDER_ACCEPTED", "HOLD_CAPTURED", "INSTITUTION_PENDING", "CLOCK_ADVANCED"]) {
      expect(types, type).toContain(type);
    }
    const events = await app().deps.uow.read.events.list(t.workspaceId);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    // Los ids de la bitácora se conservan sin enmascarar (VC4-4).
    for (const e of events.filter((ev) => ev.subjectType === "PaymentAttempt" && typeof ev.payload.attemptId === "string")) {
      expect(e.payload.attemptId).toBe(e.subjectId);
    }

    // Una obligación acreditada no admite otro pago, ni con una clave nueva (VC4-6).
    await expect(app().executeTuition.execute(t.student, { planId, idempotencyKey: "n01-after-credit" })).rejects.toMatchObject({ reasons: ["OBLIGATION_NOT_PENDING"] });
    expect(await app().deps.uow.read.attempts.listAll(t.workspaceId)).toHaveLength(1);
  });

  it("idempotencia: misma clave y mismo contenido devuelve lo existente; con otro contenido, 409", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    const first = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "idem-key" });
    const again = await app().executeTuition.execute(t.payer, { planId, idempotencyKey: "idem-key" });
    expect(again.replayed).toBe(true);
    expect(again.attempt.attempt.id).toBe(first.attempt.attempt.id);
    await app().advanceClock.execute(t.evaluator, { minutes: 24 * 60 });
    // Matrícula ya acreditada: no se vuelve a planificar y el plan que la pagó no se reemplaza (DEC-016).
    await expect(app().planTuition.execute(t.student, { targetArrivalHours: 24 })).rejects.toMatchObject({ reasons: ["OBLIGATION_NOT_PENDING"] });
    const current = await app().deps.uow.read.plans.getCurrent(t.workspaceId, planId);
    expect(current?.plan.status).toBe("COMPLETED");
    expect(count(await eventTypes(t.workspaceId), "DEBIT_CONFIRMED")).toBe(1);

    // Misma clave con otro contenido (otro plan): 409. El segundo plan es estado sintético preparado por la prueba,
    // porque con la matrícula acreditada ya no se puede planificar otro (DEC-016).
    const otherPlanId = randomUUID();
    await app().deps.uow.transaction((r) =>
      r.plans.insertVersion({ ...current!, plan: PaymentPlan.rehydrate({ ...current!.plan.toProps(), id: otherPlanId, version: 1, status: "READY_FOR_APPROVAL" }) }),
    );
    await expect(app().executeTuition.execute(t.student, { planId: otherPlanId, idempotencyKey: "idem-key" })).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(count(await eventTypes(t.workspaceId), "DEBIT_CONFIRMED")).toBe(1);
  });

  it("después de una falla confirmada, la vista de aprobación es para aprobar de nuevo (VC7-1)", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    await app().injectFault.execute(t.evaluator, { fault: "FAIL_NEXT_TRANSFER", enabled: true });
    const failed = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "vc7-1-fail" });
    expect(failed.attempt.attempt.status).toBe("FAILED_CONFIRMED");
    await app().requestApproval.execute(t.student, { planId });
    const view = await app().approvalView.execute(t.payer, { planId });
    expect(view.record.plan.status).toBe("APPROVAL_REQUESTED");
    expect(view.approval).toBeNull();
    const granted = await app().grantApproval.execute(t.payer, { planId, planVersion: view.record.plan.version, fingerprint: view.fingerprint! });
    const paid = await app().executeTuition.execute(t.student, { planId, idempotencyKey: `vc7-1-${granted.id}` });
    expect(paid.attempt.attempt.status).toBe("PENDING_UNIVERSITY");
    expect(count(await eventTypes(t.workspaceId), "DEBIT_CONFIRMED")).toBe(1);
  });
});

describe("Recuperación operativa (BUILD_PROMPT 16.3)", () => {
  it("O03: respuesta perdida: UNKNOWN, conciliación del mismo intento y un solo débito", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    await app().injectFault.execute(t.evaluator, { fault: "LOSE_NEXT_PROVIDER_RESPONSE", enabled: true });
    const result = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "o03-key" });
    expect(result.attempt.attempt.status).toBe("UNKNOWN");
    expect(await payerFunds(t.workspaceId)).toEqual({ balance: "5000.00", activeHolds: "2860.00", reserve: "1800.00" });
    const uncertain = await app().paymentStatus.execute(t.student, {});
    expect(uncertain.visible).toEqual({ status: "UNCERTAIN", nextAction: "CHECK_PAYMENT" });

    // "Pay again" con otra clave: UNKNOWN nunca habilita otro pago.
    await expect(app().executeTuition.execute(t.student, { planId, idempotencyKey: "o03-retry" })).rejects.toBeInstanceOf(ActiveAttemptExistsError);

    const reconciled = await app().reconcile.execute(t.student, { attemptId: result.attempt.attempt.id });
    expect(reconciled.attempt.attempt.status).toBe("PENDING_UNIVERSITY");
    expect(reconciled.attempt.attempt.id).toBe(result.attempt.attempt.id);
    expect(await payerFunds(t.workspaceId)).toEqual({ balance: "2140.00", activeHolds: "0.00", reserve: "1800.00" });
    const types = await eventTypes(t.workspaceId);
    expect(types).toContain("PROVIDER_RESPONSE_LOST");
    expect(types).toContain("ATTEMPT_UNKNOWN");
    expect(count(types, "DEBIT_CONFIRMED")).toBe(1);
    expect(count(types, "ATTEMPT_CREATED")).toBe(1);
    // Del lado del proveedor: una sola transferencia, con la clave del intento, y una sola entrada en el libro (VC4-5).
    const transfers = await providerTransfers(t.workspaceId);
    expect(transfers).toEqual([{ idempotencyKey: "o03-key", id: reconciled.attempt.attempt.providerTransferId }]);
    expect(await ledgerRows(t.workspaceId)).toBe(1);
  });

  it("O04: dos ejecuciones concurrentes reales producen un solo efecto financiero", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    const results = await Promise.allSettled([
      app().executeTuition.execute(t.student, { planId, idempotencyKey: "o04-a" }),
      app().executeTuition.execute(t.payer, { planId, idempotencyKey: "o04-b" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ActiveAttemptExistsError);
    const winner = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<ReturnType<typeof app>["executeTuition"]["execute"]>>>).value;
    expect((rejected[0]!.reason as ActiveAttemptExistsError).existingAttemptId).toBe(winner.attempt.attempt.id);
    expect(await payerBalance(t.workspaceId)).toBe("2140.00");
    const attempts = await app().deps.uow.read.attempts.listAll(t.workspaceId);
    expect(attempts).toHaveLength(1);
    expect(count(await eventTypes(t.workspaceId), "DEBIT_CONFIRMED")).toBe(1);
    expect(await providerTransfers(t.workspaceId)).toHaveLength(1);
    expect(await ledgerRows(t.workspaceId)).toBe(1);
  });

  it("O04: la misma clave en paralelo devuelve el mismo intento", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    const [a, b] = await Promise.all([
      app().executeTuition.execute(t.student, { planId, idempotencyKey: "o04-same" }),
      app().executeTuition.execute(t.student, { planId, idempotencyKey: "o04-same" }),
    ]);
    expect(a.attempt.attempt.id).toBe(b.attempt.attempt.id);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(await payerBalance(t.workspaceId)).toBe("2140.00");
  });

  it("O05: un evento de débito duplicado se ignora y el saldo queda intacto", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    await app().injectFault.execute(t.evaluator, { fault: "DUPLICATE_NEXT_EVENT", enabled: true });
    const result = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "o05-key" });
    await app().reconcile.execute(t.student, { attemptId: result.attempt.attempt.id });
    await app().reconcile.execute(t.payer, { attemptId: result.attempt.attempt.id });
    expect(await payerBalance(t.workspaceId)).toBe("2140.00");
    const types = await eventTypes(t.workspaceId);
    expect(count(types, "DUPLICATE_EVENT_IGNORED")).toBe(1);
    expect(count(types, "DEBIT_CONFIRMED")).toBe(1);
    expect(await providerTransfers(t.workspaceId)).toHaveLength(1);
    expect(await ledgerRows(t.workspaceId)).toBe(1);
  });

  it("O07: falla confirmada sin débito: retención liberada una vez; reintentar exige aprobación nueva", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    await app().injectFault.execute(t.evaluator, { fault: "FAIL_NEXT_TRANSFER", enabled: true });
    const failed = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "o07-a" });
    expect(failed.attempt.attempt.status).toBe("FAILED_CONFIRMED");
    expect(await payerFunds(t.workspaceId)).toEqual({ balance: "5000.00", activeHolds: "0.00", reserve: "1800.00" });
    const status = await app().paymentStatus.execute(t.student, {});
    expect(status.visible.status).toBe("FAILED_NO_DEBIT");
    expect(status.plan?.plan.status).toBe("READY_FOR_APPROVAL");

    await expect(app().executeTuition.execute(t.student, { planId, idempotencyKey: "o07-b" })).rejects.toMatchObject({ reasons: ["APPROVAL_MISSING"] });
    await app().reconcile.execute(t.student, { attemptId: failed.attempt.attempt.id });
    expect(count(await eventTypes(t.workspaceId), "HOLD_RELEASED")).toBe(1);

    await app().requestApproval.execute(t.student, { planId });
    const view = await app().approvalView.execute(t.payer, { planId });
    await app().grantApproval.execute(t.payer, { planId, planVersion: view.record.plan.version, fingerprint: view.fingerprint! });
    const retried = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "o07-c" });
    expect(retried.attempt.attempt.status).toBe("PENDING_UNIVERSITY");
    expect(await payerBalance(t.workspaceId)).toBe("2140.00");
  });

  it("O08: acreditación demorada: sigue esperando a la universidad hasta avanzar 36 h más, sin recibo inventado", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    await app().injectFault.execute(t.evaluator, { fault: "DELAY_INSTITUTION_CREDIT", enabled: true });
    await app().executeTuition.execute(t.student, { planId, idempotencyKey: "o08-key" });
    await app().advanceClock.execute(t.evaluator, { minutes: 24 * 60 });
    const waiting = await app().paymentStatus.execute(t.student, {});
    expect(waiting.attempt?.attempt.status).toBe("PENDING_UNIVERSITY");
    expect(waiting.observation?.receipt).toBeNull();
    await app().advanceClock.execute(t.evaluator, { minutes: 36 * 60 });
    const credited = await app().paymentStatus.execute(t.student, {});
    expect(credited.attempt?.attempt.status).toBe("CREDITED");
    expect(credited.observation?.receipt?.receiptId).toMatch(/^AU-RC-/);
  });

  it("O01: con la cotización vencida antes de aprobar, se recalcula y no se aprueba sobre valores vencidos", async () => {
    const t = await newWorkspace("base");
    const planned = await app().planTuition.execute(t.student, { targetArrivalHours: 48 });
    const planId = planned.record.plan.id;
    await app().requestApproval.execute(t.student, { planId });
    const stale = await app().approvalView.execute(t.payer, { planId });
    await app().advanceClock.execute(t.evaluator, { minutes: 16 });
    await expect(app().grantApproval.execute(t.payer, { planId, planVersion: stale.record.plan.version, fingerprint: stale.fingerprint! })).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      reasons: ["QUOTE_EXPIRED"],
    });
    const fresh = await app().approvalView.execute(t.payer, { planId });
    expect(fresh.quoteExpired).toBe(false);
    expect(fresh.fingerprint).not.toBe(stale.fingerprint);
    const approval = await app().grantApproval.execute(t.payer, { planId, planVersion: fresh.record.plan.version, fingerprint: fresh.fingerprint! });
    expect(approval.status).toBe("ACTIVE");
  });

  it("O02a: cotización vencida después de aprobar: recotiza B a USD 2,865.00 y ejecuta una sola vez", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    await app().advanceClock.execute(t.evaluator, { minutes: 20 });
    const result = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "o02a" });
    expect(result.attempt.attempt.debit.toDecimalString()).toBe("2865.00");
    expect(await payerBalance(t.workspaceId)).toBe("2135.00");
    const types = await eventTypes(t.workspaceId);
    expect(count(types, "AUTO_REQUOTE_WITHIN_APPROVAL")).toBe(1);
    expect(count(types, "DEBIT_CONFIRMED")).toBe(1);
  });

  it("O02b: recotización a USD 2,905.00 (REQUOTE_ABOVE_MAX): bloqueo y nueva aprobación requerida", async () => {
    const t = await newWorkspace("base");
    const { planId, approval } = await planAndApprove(t);
    await app().injectFault.execute(t.evaluator, { fault: "REQUOTE_ABOVE_MAX", enabled: true });
    await app().advanceClock.execute(t.evaluator, { minutes: 20 });
    await expect(app().executeTuition.execute(t.student, { planId, idempotencyKey: "o02b" })).rejects.toMatchObject({ reasons: ["EXCEEDS_PAYER_MAX"] });
    const status = await app().paymentStatus.execute(t.student, {});
    expect(status.plan?.plan.status).toBe("READY_FOR_APPROVAL");
    expect((await app().deps.uow.read.approvals.get(t.workspaceId, approval.id))?.status).toBe("INVALIDATED");
    expect(await app().deps.uow.read.attempts.listAll(t.workspaceId)).toHaveLength(0);
    expect(await payerBalance(t.workspaceId)).toBe("5000.00");
    expect(await eventTypes(t.workspaceId)).toContain("EXECUTION_BLOCKED");
  });
});

describe("Planificación, comparación y autoridad", () => {
  it("N02: con objetivo de 1 h no hay ruta: bloqueo con razones y sin débito", async () => {
    const t = await newWorkspace("deadline_impossible");
    const planned = await app().planTuition.execute(t.student, { targetArrivalHours: 1 });
    expect(planned.record.plan.status).toBe("NOT_VIABLE");
    expect(planned.record.evaluation.discarded.every((d) => d.reasons.includes("DEADLINE_MISSED"))).toBe(true);
    await expect(app().requestApproval.execute(t.student, { planId: planned.record.plan.id })).rejects.toBeInstanceOf(PolicyViolationError);
    expect(await payerBalance(t.workspaceId)).toBe("5000.00");
    expect(await eventTypes(t.workspaceId)).toContain("PLAN_NOT_VIABLE");
  });

  it("N10: comparar rutas no crea plan, permiso, intento ni débito", async () => {
    const t = await newWorkspace("base");
    const result = await app().compareRoutes.tuition(t.payer, { targetArrivalHours: 48 });
    expect(result.selected?.routeId).toBe("B");
    expect(result.discarded.map((d) => [d.routeId, d.reasons])).toEqual([
      ["A", ["DEADLINE_MISSED"]],
      ["C", ["NET_INSUFFICIENT"]],
      ["E", ["RECEIVER_NOT_ALLOWED"]],
    ]);
    const repos = app().deps.uow.read;
    const obligation = (await repos.obligations.list(t.workspaceId))[0]!;
    expect(await repos.plans.latestForObligation(t.workspaceId, obligation.id)).toBeNull();
    expect(await repos.approvals.listActive(t.workspaceId)).toHaveLength(0);
    expect(await repos.attempts.listAll(t.workspaceId)).toHaveLength(0);
    expect(await payerBalance(t.workspaceId)).toBe("5000.00");
  });

  it("D05: corregir el objetivo a 6 h elige D, crea una versión nueva e invalida la aprobación anterior", async () => {
    const t = await newWorkspace("base");
    const { planId, approval } = await planAndApprove(t, 48);
    const corrected = await app().planTuition.execute(t.student, { targetArrivalHours: 6 });
    expect(corrected.outcome).toBe("NEW_VERSION");
    expect(corrected.record.plan.id).toBe(planId);
    expect(corrected.record.plan.version).toBe(2);
    expect(corrected.record.quote?.routeId).toBe("D");
    expect(corrected.record.quote?.debit.toDecimalString()).toBe("2880.00");
    expect(corrected.invalidatedApprovalIds).toEqual([approval.id]);
    expect(corrected.materialFields).toEqual(["routeId", "channel"]);
    // La aprobación anterior no sirve para la versión nueva (S16).
    await expect(app().executeTuition.execute(t.student, { planId, idempotencyKey: "d05" })).rejects.toMatchObject({ reasons: ["APPROVAL_MISSING"] });
    const { approval: second } = await (async () => {
      await app().requestApproval.execute(t.student, { planId });
      const view = await app().approvalView.execute(t.payer, { planId });
      return { approval: await app().grantApproval.execute(t.payer, { planId, planVersion: 2, fingerprint: view.fingerprint! }) };
    })();
    expect(second.subjectVersion).toBe(2);
    const paid = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "d05-ok" });
    expect(paid.attempt.attempt.debit.toDecimalString()).toBe("2880.00");
    await app().advanceClock.execute(t.evaluator, { minutes: 2 * 60 });
    expect((await app().paymentStatus.execute(t.student, {})).attempt?.attempt.status).toBe("CREDITED");
    expect(await payerBalance(t.workspaceId)).toBe("2120.00");
  });

  it("cambiar el objetivo sin cambiar de ruta conserva la versión y la aprobación", async () => {
    const t = await newWorkspace("base");
    const { planId, approval } = await planAndApprove(t, 48);
    const retargeted = await app().planTuition.execute(t.student, { targetArrivalHours: 36 });
    expect(retargeted.outcome).toBe("RETARGETED");
    expect(retargeted.record.plan.version).toBe(1);
    expect((await app().deps.uow.read.approvals.get(t.workspaceId, approval.id))?.status).toBe("ACTIVE");
    const paid = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "retarget" });
    expect(paid.attempt.attempt.status).toBe("PENDING_UNIVERSITY");
  });

  it("solo el pagador aprueba (S07 a nivel de caso de uso) y una huella vieja da 409", async () => {
    const t = await newWorkspace("base");
    const planned = await app().planTuition.execute(t.student, { targetArrivalHours: 48 });
    const planId = planned.record.plan.id;
    await app().requestApproval.execute(t.student, { planId });
    const view = await app().approvalView.execute(t.payer, { planId });
    await expect(app().grantApproval.execute(t.student, { planId, planVersion: 1, fingerprint: view.fingerprint! })).rejects.toBeInstanceOf(RoleNotAllowedError);
    await expect(app().grantApproval.execute(t.payer, { planId, planVersion: 2, fingerprint: view.fingerprint! })).rejects.toBeInstanceOf(VersionConflictError);
    await expect(app().grantApproval.execute(t.payer, { planId, planVersion: 1, fingerprint: "0".repeat(64) })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await app().deps.uow.read.approvals.listActive(t.workspaceId)).toHaveLength(0);
  });
});
