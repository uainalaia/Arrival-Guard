import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { AppDeps } from "@/application/AppDeps";
import { ActiveAttemptExistsError } from "@/application/errors/ApplicationError";
import { TuitionPaymentProcessor } from "@/application/services/TuitionPaymentProcessor";
import { ExecuteTuitionPaymentUseCase } from "@/application/usecases/ExecuteTuitionPaymentUseCase";
import { PaymentAttempt } from "@/domain/payment/PaymentAttempt";
import { DuplicateRecordError, isUniqueViolation } from "@/domain/ports/Repositories";
import { closeDb } from "@/infrastructure/db/client";
import { app, count, eventTypes, ledgerRows, newWorkspace, payerBalance, planAndApprove, providerTransfers } from "../support/integration";

afterAll(async () => {
  await closeDb();
});

describe("Correcciones de la revisión VC4", () => {
  it("VC4-1: el proveedor acepta una sola vez por clave y no duplica la entrega a la universidad", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    const paid = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "vc4-1-key" });
    const ws = (await app().deps.uow.read.workspaces.get(t.workspaceId))!;
    const q = paid.attempt.quote;
    const payload = {
      kind: "TUITION" as const,
      routeId: q.routeId,
      channel: q.channel,
      receiverId: q.receiverId,
      reference: "AG-STUDENT-01",
      quoteId: q.quoteId,
      debit: q.debit.toJSON(),
      net: q.net.toJSON(),
      arrivalMinutes: q.arrivalMinutes,
    };
    const again = await app().deps.provider.submitTransfer({ workspaceId: t.workspaceId, now: ws.virtualNow }, "vc4-1-key", payload);
    expect(again.status).toBe("ACCEPTED");
    expect(await providerTransfers(t.workspaceId)).toHaveLength(1);
    expect(await ledgerRows(t.workspaceId)).toBe(1);
    await app().advanceClock.execute(t.evaluator, { minutes: 24 * 60 });
    const ledger = await app().deps.institution.getLedger({ workspaceId: t.workspaceId, now: ws.virtualNow.plusHours(24) }, "AG-STUDENT-01");
    expect(ledger.credited.toDecimalString()).toBe("20000.00");
    expect(ledger.verifiedExcess.isZero()).toBe(true);
  });

  it("VC4-2: conciliar mientras el envío original sigue en curso no lo deja UNKNOWN ni reenvía", async () => {
    for (const delay of [0, 150, 400]) {
      const t = await newWorkspace("base");
      const { planId } = await planAndApprove(t);
      const execution = app().executeTuition.execute(t.student, { planId, idempotencyKey: `vc4-2-${delay}` });
      const reconciliation = (async () => {
        const started = Date.now();
        while (Date.now() - started < 15_000) {
          const attempt = (await app().deps.uow.read.attempts.listAll(t.workspaceId))[0];
          if (attempt) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            return app().reconcile.execute(t.payer, { attemptId: attempt.attempt.id });
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        return null;
      })();
      const [executed, reconciled] = await Promise.allSettled([execution, reconciliation]);
      expect(executed.status, `ejecución con demora ${delay}`).toBe("fulfilled");
      expect(reconciled.status, `conciliación con demora ${delay}`).toBe("fulfilled");
      const attempts = await app().deps.uow.read.attempts.listAll(t.workspaceId);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]!.attempt.status).toBe("PENDING_UNIVERSITY");
      const types = await eventTypes(t.workspaceId);
      expect(types).not.toContain("PROVIDER_RESPONSE_LOST");
      expect(types).not.toContain("ATTEMPT_UNKNOWN");
      expect(count(types, "DEBIT_CONFIRMED")).toBe(1);
      expect(await providerTransfers(t.workspaceId)).toHaveLength(1);
      expect(await ledgerRows(t.workspaceId)).toBe(1);
      expect(await payerBalance(t.workspaceId)).toBe("2140.00");
    }
  });

  it("VC4-3: el índice único se traduce a DuplicateRecordError aunque Drizzle envuelva el error del driver", async () => {
    expect(isUniqueViolation({ message: "Failed query", cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "40P01" } })).toBe(false);
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    const paid = await app().executeTuition.execute(t.student, { planId, idempotencyKey: "vc4-3-key" });
    const copy = { ...paid.attempt, attempt: PaymentAttempt.rehydrate({ ...paid.attempt.attempt.toProps(), id: randomUUID(), status: "FAILED_CONFIRMED" }) };
    await expect(app().deps.uow.transaction((r) => r.attempts.insert(copy))).rejects.toBeInstanceOf(DuplicateRecordError);

    // La red de seguridad del ejecutor: si el índice salta, la misma clave es replay y otra clave es 409 con el id existente.
    const base = app().deps;
    const racing: AppDeps = { ...base, uow: { read: base.uow.read, transaction: async () => { throw new DuplicateRecordError(); } } as AppDeps["uow"] };
    const executor = new ExecuteTuitionPaymentUseCase(racing, new TuitionPaymentProcessor(racing));
    const replay = await executor.execute(t.student, { planId, idempotencyKey: "vc4-3-key" });
    expect(replay.replayed).toBe(true);
    expect(replay.attempt.attempt.id).toBe(paid.attempt.attempt.id);
    await expect(executor.execute(t.student, { planId, idempotencyKey: "vc4-3-other" })).rejects.toMatchObject({ existingAttemptId: paid.attempt.attempt.id });
    await expect(executor.execute(t.student, { planId, idempotencyKey: "vc4-3-other" })).rejects.toBeInstanceOf(ActiveAttemptExistsError);
  });
});
