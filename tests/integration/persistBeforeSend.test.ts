import { afterAll, describe, expect, it } from "vitest";
import type { AppDeps } from "@/application/AppDeps";
import { TuitionPaymentProcessor } from "@/application/services/TuitionPaymentProcessor";
import { ExecuteTuitionPaymentUseCase } from "@/application/usecases/ExecuteTuitionPaymentUseCase";
import type { PaymentProviderPort } from "@/domain/ports/PaymentProviderPort";
import { ProviderUnavailableError } from "@/application/errors/ApplicationError";
import { closeDb } from "@/infrastructure/db/client";
import { app, count, eventTypes, ledgerRows, newWorkspace, payerBalance, planAndApprove, providerTransfers } from "../support/integration";

afterAll(async () => {
  await closeDb();
});

describe("VC4: el intento se persiste antes de enviar al proveedor", () => {
  it("al momento del envío ya existen el intento SUBMITTING, la retención activa y la aprobación consumida", async () => {
    const t = await newWorkspace("base");
    const { planId, approval } = await planAndApprove(t);
    const base = app().deps;
    const seen: Record<string, unknown>[] = [];
    const spy: PaymentProviderPort = {
      quoteTuition: (ctx, req) => base.provider.quoteTuition(ctx, req),
      quoteRemittance: (ctx, req) => base.provider.quoteRemittance(ctx, req),
      requote: (ctx, previous) => base.provider.requote(ctx, previous),
      getTransfer: (ctx, key) => base.provider.getTransfer(ctx, key),
      events: (ctx, transferId) => base.provider.events(ctx, transferId),
      async submitTransfer(ctx, key, payload) {
        const attempt = await base.uow.read.attempts.findByKey(ctx.workspaceId, key);
        const account = await base.uow.read.accounts.getByKind(ctx.workspaceId, "PAYER_USD");
        const storedApproval = await base.uow.read.approvals.get(ctx.workspaceId, approval.id);
        seen.push({
          attemptStatus: attempt?.attempt.status,
          hold: account?.holdFor(attempt?.attempt.id ?? "")?.status,
          approval: storedApproval?.status,
          payloadDebit: payload.debit,
        });
        return base.provider.submitTransfer(ctx, key, payload);
      },
    };
    const deps: AppDeps = { ...base, provider: spy };
    const executor = new ExecuteTuitionPaymentUseCase(deps, new TuitionPaymentProcessor(deps));
    const result = await executor.execute(t.student, { planId, idempotencyKey: "persist-first" });
    expect(seen).toEqual([{ attemptStatus: "SUBMITTING", hold: "ACTIVE", approval: "CONSUMED", payloadDebit: { currency: "USD", minor: "286000" } }]);
    expect(result.attempt.attempt.status).toBe("PENDING_UNIVERSITY");
    const types = (await base.uow.read.events.list(t.workspaceId)).map((e) => e.type);
    expect(types.indexOf("ATTEMPT_CREATED")).toBeLessThan(types.indexOf("PROVIDER_ACCEPTED"));
    expect(types.indexOf("PROVIDER_SUBMIT_SENT")).toBeLessThan(types.indexOf("PROVIDER_ACCEPTED"));
  });

  it("VC4-7: si el proveedor falla antes de recibir el envío no queda PROVIDER_SUBMIT_SENT y la conciliación reenvía con la misma clave", async () => {
    const t = await newWorkspace("base");
    const { planId } = await planAndApprove(t);
    const base = app().deps;
    const down: PaymentProviderPort = {
      quoteTuition: (ctx, req) => base.provider.quoteTuition(ctx, req),
      quoteRemittance: (ctx, req) => base.provider.quoteRemittance(ctx, req),
      requote: (ctx, previous) => base.provider.requote(ctx, previous),
      getTransfer: (ctx, key) => base.provider.getTransfer(ctx, key),
      events: (ctx, transferId) => base.provider.events(ctx, transferId),
      submitTransfer: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    };
    const deps: AppDeps = { ...base, provider: down };
    const executor = new ExecuteTuitionPaymentUseCase(deps, new TuitionPaymentProcessor(deps));
    await expect(executor.execute(t.student, { planId, idempotencyKey: "vc4-7-key" })).rejects.toBeInstanceOf(ProviderUnavailableError);
    const [attempt] = await base.uow.read.attempts.listAll(t.workspaceId);
    expect(attempt!.attempt.status).toBe("SUBMITTING");
    expect(await eventTypes(t.workspaceId)).not.toContain("PROVIDER_SUBMIT_SENT");
    expect(await providerTransfers(t.workspaceId)).toHaveLength(0);

    // Con el proveedor de vuelta, conciliar envía el MISMO intento con su clave, sin esperar a que venza el permiso.
    await app().reconcile.execute(t.payer, { attemptId: attempt!.attempt.id });
    const after = await base.uow.read.attempts.listAll(t.workspaceId);
    expect(after).toHaveLength(1);
    expect(after[0]!.attempt.status).toBe("PENDING_UNIVERSITY");
    const types = await eventTypes(t.workspaceId);
    expect(count(types, "PROVIDER_SUBMIT_SENT")).toBe(1);
    expect(count(types, "DEBIT_CONFIRMED")).toBe(1);
    expect(await providerTransfers(t.workspaceId)).toEqual([{ idempotencyKey: "vc4-7-key", id: after[0]!.attempt.providerTransferId }]);
    expect(await ledgerRows(t.workspaceId)).toBe(1);
    expect(await payerBalance(t.workspaceId)).toBe("2140.00");
  });
});
