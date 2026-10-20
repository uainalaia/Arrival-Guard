import { afterAll, describe, expect, it } from "vitest";
import { Money } from "@/domain/money/Money";
import { closeDb } from "@/infrastructure/db/client";
import { app, count, eventTypes, newWorkspace, payerBalance, payerFunds, type TestWorkspace } from "../support/integration";

// T3 (remesas bajo mandato, A1) y T7 (devoluciones con destino fijo, A2) a nivel de caso de uso (BUILD_PROMPT 16.2).

afterAll(async () => {
  await closeDb();
});

const cny = (decimal: string) => Money.fromDecimal("CNY", decimal);

async function localBalance(workspaceId: string): Promise<string> {
  return (await app().deps.uow.read.accounts.getByKind(workspaceId, "STUDENT_LOCAL_CNY"))!.balance.toDecimalString();
}

async function prepareAndSend(t: TestWorkspace, net: string, key: string) {
  const prepared = await app().prepareRemittance.execute(t.student, { net: cny(net), targetArrivalHours: 48 });
  const sent = await app().executeRemittance.execute(t.student, { remittanceId: prepared.id, idempotencyKey: key });
  return { prepared, sent };
}

describe("T3: remesas para gastos de llegada bajo el permiso permanente", () => {
  it("N05: CNY 2,000 dentro del mandato: R1 sin aprobación nueva, notificación, reserva a USD 1,512.00 y entrega única", async () => {
    const t = await newWorkspace("arrival_remittance");
    const { prepared, sent } = await prepareAndSend(t, "2000.00", "n05-key-0001");
    expect(prepared.status).toBe("READY");
    expect(prepared.authorization).toBe("MANDATE");
    expect(prepared.quote?.routeId).toBe("R1");
    expect(prepared.quote?.debit.toDecimalString()).toBe("288.00");
    expect(sent.outcome).toBe("SENT");
    if (sent.outcome !== "SENT") return;
    expect(sent.attempt.attempt.status).toBe("PROVIDER_ACCEPTED");
    expect((await payerFunds(t.workspaceId)).reserve).toBe("1512.00");
    expect(await payerBalance(t.workspaceId)).toBe("1852.00");
    const types = await eventTypes(t.workspaceId);
    expect(count(types, "REMITTANCE_EXECUTED_UNDER_MANDATE")).toBe(1);
    expect(types).not.toContain("REMITTANCE_ESCALATED");

    await app().advanceClock.execute(t.evaluator, { minutes: 24 * 60 });
    const delivered = await app().deps.uow.read.attempts.get(t.workspaceId, sent.attempt.attempt.id);
    expect(delivered?.attempt.status).toBe("DELIVERED");
    expect(await localBalance(t.workspaceId)).toBe("2000.00");
    expect((await app().deps.uow.read.remittances.get(t.workspaceId, prepared.id))?.status).toBe("DELIVERED");
    // Otra vuelta del reloj no entrega dos veces.
    await app().advanceClock.execute(t.evaluator, { minutes: 60 });
    expect(await localBalance(t.workspaceId)).toBe("2000.00");
    expect(count(await eventTypes(t.workspaceId), "REMITTANCE_DELIVERED")).toBe(1);
    const view = await app().caseView.execute(t.payer);
    expect(view.mandateUsed?.toDecimalString()).toBe("288.00");
  });

  it("N17: la segunda remesa de CNY 3,000 supera el tope (720 > 600): escala, el pagador aprueba una vez y se ejecuta una sola vez", async () => {
    const t = await newWorkspace("arrival_remittance");
    await prepareAndSend(t, "2000.00", "n17-key-0001");
    const second = await app().prepareRemittance.execute(t.student, { net: cny("3000.00"), targetArrivalHours: 48 });
    expect(second.status).toBe("APPROVAL_REQUESTED");
    expect(second.reasons).toEqual(["EXCEEDS_MANDATE_PERIOD_LIMIT"]);
    expect(second.quote?.debit.toDecimalString()).toBe("432.00");
    const blocked = await app().executeRemittance.execute(t.student, { remittanceId: second.id, idempotencyKey: "n17-key-0002" });
    expect(blocked.outcome).toBe("NEEDS_PAYER_APPROVAL");
    expect(await app().deps.uow.read.attempts.findByKey(t.workspaceId, "n17-key-0002")).toBeNull();

    await expect(app().remittanceApproval.grant(t.student, { remittanceId: second.id, version: second.version, fingerprint: "a".repeat(64) })).rejects.toMatchObject({ code: "ROLE_NOT_ALLOWED" });
    const view = await app().remittanceApproval.view(t.payer, { remittanceId: second.id });
    await expect(app().remittanceApproval.grant(t.payer, { remittanceId: second.id, version: second.version, fingerprint: "b".repeat(64) })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await app().remittanceApproval.grant(t.payer, { remittanceId: second.id, version: second.version, fingerprint: view.fingerprint! });

    const sent = await app().executeRemittance.execute(t.student, { remittanceId: second.id, idempotencyKey: "n17-key-0003" });
    expect(sent.outcome).toBe("SENT");
    const again = await app().executeRemittance.execute(t.student, { remittanceId: second.id, idempotencyKey: "n17-key-0003" });
    expect(again.outcome === "SENT" && again.replayed).toBe(true);
    await expect(app().executeRemittance.execute(t.student, { remittanceId: second.id, idempotencyKey: "n17-key-0004" })).rejects.toMatchObject({ code: "ACTIVE_ATTEMPT_EXISTS" });
    const attempts = (await app().deps.uow.read.attempts.listAll(t.workspaceId)).filter((a) => a.attempt.toProps().subjectId === second.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.attempt.toProps().mandateId).toBeNull();
    expect(count(await eventTypes(t.workspaceId), "REMITTANCE_ESCALATED")).toBe(1);
  });

  it("encadenar remesas listas no supera el tope: la que ya no entra escala al momento de ejecutar", async () => {
    const t = await newWorkspace("arrival_remittance");
    const a = await app().prepareRemittance.execute(t.student, { net: cny("1500.00"), targetArrivalHours: 48 });
    const b = await app().prepareRemittance.execute(t.student, { net: cny("1500.00"), targetArrivalHours: 48 });
    const c = await app().prepareRemittance.execute(t.student, { net: cny("1500.00"), targetArrivalHours: 48 });
    expect([a.status, b.status, c.status]).toEqual(["READY", "READY", "READY"]);
    expect((await app().executeRemittance.execute(t.student, { remittanceId: a.id, idempotencyKey: "chain-key-a1" })).outcome).toBe("SENT");
    expect((await app().executeRemittance.execute(t.student, { remittanceId: b.id, idempotencyKey: "chain-key-b1" })).outcome).toBe("SENT");
    const third = await app().executeRemittance.execute(t.student, { remittanceId: c.id, idempotencyKey: "chain-key-c1" });
    expect(third.outcome).toBe("NEEDS_PAYER_APPROVAL");
    expect(third.remittance.reasons).toEqual(["EXCEEDS_MANDATE_PERIOD_LIMIT"]);
    const view = await app().caseView.execute(t.payer);
    expect(view.mandateUsed!.lessThan(Money.fromDecimal("USD", "600.00")) || view.mandateUsed!.equals(Money.fromDecimal("USD", "600.00"))).toBe(true);
  });

  it("VC9-5 (DEC-018): una remesa con aprobación puntual no consume el tope del permiso; el uso autónomo sigue ≤ USD 600.00", async () => {
    const t = await newWorkspace("arrival_remittance");
    const big = await app().prepareRemittance.execute(t.student, { net: cny("5000.00"), targetArrivalHours: 48 });
    expect(big.status).toBe("APPROVAL_REQUESTED");
    expect(big.quote?.debit.toDecimalString()).toBe("720.00");
    const view = await app().remittanceApproval.view(t.payer, { remittanceId: big.id });
    await app().remittanceApproval.grant(t.payer, { remittanceId: big.id, version: big.version, fingerprint: view.fingerprint! });
    expect((await app().executeRemittance.execute(t.student, { remittanceId: big.id, idempotencyKey: "vc9-5-key-0001" })).outcome).toBe("SENT");
    const afterApproved = await app().caseView.execute(t.payer);
    expect(afterApproved.mandateUsed?.toDecimalString()).toBe("0.00");
    const small = await app().prepareRemittance.execute(t.student, { net: cny("4000.00"), targetArrivalHours: 48 });
    expect(small.status).toBe("READY");
    expect((await app().executeRemittance.execute(t.student, { remittanceId: small.id, idempotencyKey: "vc9-5-key-0002" })).outcome).toBe("SENT");
    const after = await app().caseView.execute(t.payer);
    expect(after.mandateUsed?.toDecimalString()).toBe("576.00");
    const third = await app().prepareRemittance.execute(t.student, { net: cny("500.00"), targetArrivalHours: 48 });
    expect(third.status).toBe("APPROVAL_REQUESTED");
    expect(third.reasons).toEqual(["EXCEEDS_MANDATE_PERIOD_LIMIT"]);
    expect(count(await eventTypes(t.workspaceId), "REMITTANCE_EXECUTED_UNDER_MANDATE")).toBe(1);
  });

  it("N18: con la cuenta local sin abrir (escenario base), RECIPIENT_ACCOUNT_NOT_OPEN y ningún intento", async () => {
    const t = await newWorkspace("base");
    const prepared = await app().prepareRemittance.execute(t.student, { net: cny("2000.00"), targetArrivalHours: 48 });
    expect(prepared.status).toBe("BLOCKED");
    expect(prepared.reasons).toEqual(["RECIPIENT_ACCOUNT_NOT_OPEN"]);
    await expect(app().executeRemittance.execute(t.student, { remittanceId: prepared.id, idempotencyKey: "n18-key-0001" })).rejects.toMatchObject({ reasons: ["RECIPIENT_ACCOUNT_NOT_OPEN"] });
    expect((await app().deps.uow.read.attempts.listAll(t.workspaceId)).filter((x) => x.attempt.kind === "REMITTANCE")).toHaveLength(0);
    expect(await payerBalance(t.workspaceId)).toBe("5000.00");
  });
});

describe("T7: devoluciones con destino fijo", () => {
  it("N13: reclamo por el exceso verificado de CNY 500.00, enviado una vez y REFUNDED con USD 70.00 en la cuenta de origen", async () => {
    const t = await newWorkspace("overpayment_refund");
    const obligation = (await app().deps.uow.read.obligations.list(t.workspaceId))[0]!;
    const claim = await app().prepareRefund.execute(t.student, { obligationId: obligation.id });
    expect(claim.amount.toDecimalString()).toBe("500.00");
    expect(claim.status).toBe("DRAFT");
    const payer = (await app().deps.uow.read.accounts.getByKind(t.workspaceId, "PAYER_USD"))!;
    expect(claim.destinationAccountId).toBe(payer.id);
    const submitted = await app().submitRefund.execute(t.student, { claimId: claim.id, idempotencyKey: "n13-key-0001" });
    expect(submitted.claim.status).toBe("SUBMITTED");
    expect((await app().submitRefund.execute(t.student, { claimId: claim.id, idempotencyKey: "n13-key-0001" })).replayed).toBe(true);
    await expect(app().submitRefund.execute(t.student, { claimId: claim.id, idempotencyKey: "n13-key-0002" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    // Preparar otra vez no crea un segundo reclamo: devuelve el abierto.
    expect((await app().prepareRefund.execute(t.student, { obligationId: obligation.id })).id).toBe(claim.id);

    await app().advanceClock.execute(t.evaluator, { minutes: 24 * 60 });
    const done = (await app().deps.uow.read.refunds.get(t.workspaceId, claim.id))!;
    expect(done.status).toBe("REFUNDED");
    expect(done.settlement?.toDecimalString()).toBe("70.00");
    expect(await payerBalance(t.workspaceId)).toBe("2210.00");
    await app().advanceClock.execute(t.evaluator, { minutes: 60 });
    expect(await payerBalance(t.workspaceId)).toBe("2210.00");
    expect(count(await eventTypes(t.workspaceId), "REFUND_CLAIM_SUBMITTED")).toBe(1);
  });

  it("N14: sin exceso verificado no hay reclamo (REFUND_EXCEEDS_VERIFIED_EXCESS) y no se promete nada", async () => {
    const t = await newWorkspace("arrival_remittance");
    const obligation = (await app().deps.uow.read.obligations.list(t.workspaceId))[0]!;
    await expect(app().prepareRefund.execute(t.student, { obligationId: obligation.id })).rejects.toMatchObject({ reasons: ["REFUND_EXCEEDS_VERIFIED_EXCESS"] });
    expect(await app().deps.uow.read.refunds.list(t.workspaceId)).toHaveLength(0);
  });
});
