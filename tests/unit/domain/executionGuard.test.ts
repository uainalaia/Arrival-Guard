import { describe, expect, it } from "vitest";
import { Approval } from "@/domain/consent/Approval";
import { buildTuitionApprovalPayload, fingerprintOf, type TuitionApprovalPayload } from "@/domain/consent/ApprovalPayload";
import { DomainValidationError, InvalidTransitionError } from "@/domain/errors/DomainError";
import { checkTuitionExecution, type TuitionExecutionFacts } from "@/domain/payment/ExecutionGuard";
import { PaymentPlan } from "@/domain/payment/PaymentPlan";
import { NodeHasher } from "@/infrastructure/crypto/NodeHasher";
import { cny, tuitionFacts, usd } from "../../support/scenarioFacts";

const hasher = new NodeHasher();

function setup(overrides: Partial<TuitionExecutionFacts> = {}, payloadOverrides: Partial<TuitionApprovalPayload> = {}): TuitionExecutionFacts {
  const routing = tuitionFacts("base", { targetHours: 48 });
  const quote = routing.quotes.find((q) => q.routeId === "B")!;
  const expiresAt = routing.now.plusHours(24);
  const payload: TuitionApprovalPayload = {
    ...buildTuitionApprovalPayload({
      workspaceId: "ws-1",
      obligationId: routing.obligation.id,
      obligationVersion: routing.obligation.version,
      planId: "plan-1",
      planVersion: 1,
      routeId: quote.routeId,
      channel: quote.channel,
      receiverId: quote.receiverId,
      reference: routing.obligation.reference,
      sourceAccountId: "acc-payer",
      proposedDebit: quote.debit,
      netAmount: quote.net,
      maxDebit: routing.policy.maxTuitionDebit,
      reserve: routing.policy.reserve,
      quoteId: quote.quoteId,
      approvalExpiresAt: expiresAt,
    }),
    ...payloadOverrides,
  };
  const approval = Approval.grant({
    id: "apr-1",
    payerActorId: "act-payer",
    signed: { subjectType: "TUITION_PLAN", payload },
    presentedFingerprint: fingerprintOf(payload, hasher),
    hasher,
    now: routing.now,
  });
  const plan = PaymentPlan.rehydrate({
    id: "plan-1",
    workspaceId: "ws-1",
    obligationId: routing.obligation.id,
    obligationVersion: 1,
    version: 1,
    status: "APPROVED",
    targetArrivalAt: routing.targetArrivalAt,
    selectedRouteId: "B",
    createdByActorId: "act-student",
    approvalRequestedAt: routing.now,
    approvalExpiresAt: expiresAt,
  });
  return {
    now: routing.now.plusMinutes(5),
    obligation: routing.obligation,
    plan,
    approval,
    hasher,
    sourceAccountId: "acc-payer",
    quote,
    funds: routing.funds,
    policy: routing.policy,
    committedToObligation: usd("0.00"),
    acceptedChannels: routing.acceptedChannels,
    existingAttemptStatuses: [],
    ...overrides,
  };
}

describe("Comprobaciones antes de ejecutar (BUILD_PROMPT 8.3)", () => {
  it("todo en regla: sin razones", () => {
    expect(checkTuitionExecution(setup())).toEqual([]);
  });

  it("sin aprobación vigente: APPROVAL_MISSING (S02)", () => {
    expect(checkTuitionExecution(setup({ approval: null }))).toEqual(["APPROVAL_MISSING"]);
    const facts = setup();
    const notApproved = PaymentPlan.rehydrate({ ...facts.plan.toProps(), status: "APPROVAL_REQUESTED" });
    expect(checkTuitionExecution({ ...facts, plan: notApproved })).toEqual(["APPROVAL_MISSING"]);
  });

  it("aprobación revocada antes de ejecutar: APPROVAL_REVOKED (N12)", () => {
    const facts = setup();
    facts.approval!.revoke();
    expect(checkTuitionExecution(facts)).toEqual(["APPROVAL_REVOKED"]);
  });

  it("una aprobación de otra versión del plan no sirve: APPROVAL_INVALID (S16)", () => {
    const facts = setup();
    const v2 = PaymentPlan.rehydrate({ ...facts.plan.toProps(), version: 2 });
    expect(checkTuitionExecution({ ...facts, plan: v2 })).toEqual(["APPROVAL_INVALID"]);
  });

  it("si cambió la versión de la obligación: APPROVAL_INVALID", () => {
    const facts = setup();
    expect(checkTuitionExecution({ ...facts, obligation: { ...facts.obligation, version: 2 } })).toEqual(["APPROVAL_INVALID"]);
  });

  it("si la obligación, la cuenta o el espacio no son los firmados: APPROVAL_INVALID (VC3-8)", () => {
    const facts = setup();
    expect(checkTuitionExecution({ ...facts, obligation: { ...facts.obligation, id: "obl-other" } })).toContain("APPROVAL_INVALID");
    expect(checkTuitionExecution({ ...facts, sourceAccountId: "acc-other" })).toEqual(["APPROVAL_INVALID"]);
    const otherSpace = PaymentPlan.rehydrate({ ...facts.plan.toProps(), workspaceId: "ws-2" });
    expect(checkTuitionExecution({ ...facts, plan: otherSpace })).toEqual(["APPROVAL_INVALID"]);
  });

  it("un payload guardado alterado no autoriza nada: APPROVAL_INVALID (VC3-2)", () => {
    const facts = setup({ policy: { maxTuitionDebit: usd("3000.00"), reserve: usd("1800.00") } });
    const tamperedPayload = { ...(facts.approval!.toProps().canonicalPayload as unknown as TuitionApprovalPayload), maxDebit: { currency: "USD" as const, minor: "300000" } };
    const tampered = Approval.rehydrate({ ...facts.approval!.toProps(), canonicalPayload: { ...tamperedPayload } });
    expect(checkTuitionExecution({ ...facts, approval: tampered, quote: { ...facts.quote, debit: usd("2950.00") } })).toEqual(["APPROVAL_INVALID"]);
  });

  it("aprobación vencida: APPROVAL_EXPIRED", () => {
    const facts = setup();
    expect(checkTuitionExecution({ ...facts, now: facts.now.plusHours(24) })).toContain("APPROVAL_EXPIRED");
  });

  it("con otro intento activo de la obligación (incluido UNKNOWN): ACTIVE_ATTEMPT_EXISTS (O03, O04)", () => {
    expect(checkTuitionExecution(setup({ existingAttemptStatuses: ["UNKNOWN"] }))).toEqual(["ACTIVE_ATTEMPT_EXISTS"]);
    expect(checkTuitionExecution(setup({ existingAttemptStatuses: ["SUBMITTING"] }))).toEqual(["ACTIVE_ATTEMPT_EXISTS"]);
  });

  it("matrícula ya acreditada: OBLIGATION_NOT_PENDING", () => {
    const facts = setup();
    expect(checkTuitionExecution({ ...facts, obligation: { ...facts.obligation, status: "CREDITED" } })).toEqual(["OBLIGATION_NOT_PENDING"]);
  });

  it("cotización vencida: QUOTE_EXPIRED (el ejecutor debe recotizar antes, A3)", () => {
    const facts = setup();
    expect(checkTuitionExecution({ ...facts, now: facts.now.plusMinutes(15) })).toEqual(["QUOTE_EXPIRED"]);
  });
});

describe("Recotización A3 dentro del guard (VC3-2)", () => {
  it("una recotización de la misma ruta a USD 2,865.00 pasa; a USD 2,905.00 queda bloqueada", () => {
    const facts = setup();
    const later = facts.now.plusMinutes(20);
    const requoted = { ...facts.quote, quoteId: "q-B-2", quotedAt: later, expiresAt: later.plusMinutes(15) };
    expect(checkTuitionExecution({ ...facts, now: later, quote: { ...requoted, debit: usd("2865.00") } })).toEqual([]);
    expect(checkTuitionExecution({ ...facts, now: later, quote: { ...requoted, debit: usd("2905.00") } })).toEqual(["EXCEEDS_PAYER_MAX"]);
  });

  it("una cotización de otra ruta o de otro neto no está cubierta por la aprobación", () => {
    const facts = setup();
    const e = tuitionFacts("base").quotes.find((q) => q.routeId === "E")!;
    expect(checkTuitionExecution({ ...facts, quote: e })).toContain("APPROVAL_INVALID");
    expect(checkTuitionExecution({ ...facts, quote: { ...facts.quote, net: cny("19000.00") } })).toContain("APPROVAL_INVALID");
  });
});

describe("Razones propias del guard (VC3-8)", () => {
  it("un canal que la universidad dejó de aceptar: CHANNEL_NOT_ALLOWED", () => {
    expect(checkTuitionExecution(setup({ acceptedChannels: ["EXPRESS_EDU"] }))).toEqual(["CHANNEL_NOT_ALLOWED"]);
  });

  it("un receptor que ya no es el de la obligación: RECEIVER_NOT_ALLOWED", () => {
    const facts = setup();
    expect(checkTuitionExecution({ ...facts, obligation: { ...facts.obligation, recipientId: "rcp-new-university-account" } })).toEqual(["RECEIVER_NOT_ALLOWED"]);
  });

  it("un neto adeudado mayor que el firmado: NET_INSUFFICIENT", () => {
    const facts = setup();
    expect(checkTuitionExecution({ ...facts, obligation: { ...facts.obligation, netDue: cny("20500.00") } })).toEqual(["NET_INSUFFICIENT"]);
  });

  it("si el plan cambió a un objetivo de 6 h, B ya no llega a tiempo: DEADLINE_MISSED (VC3-5)", () => {
    const facts = setup();
    facts.plan.retarget(facts.now.plusHours(6), facts.obligation.dueAt);
    expect(checkTuitionExecution(facts)).toEqual(["DEADLINE_MISSED"]);
  });

  it("retarget solo antes de ejecutar y nunca después del vencimiento", () => {
    const facts = setup();
    expect(() => facts.plan.retarget(facts.obligation.dueAt.plusHours(1), facts.obligation.dueAt)).toThrow(DomainValidationError);
    const executing = PaymentPlan.rehydrate({ ...facts.plan.toProps(), status: "EXECUTING" });
    expect(() => executing.retarget(facts.now.plusHours(6), facts.obligation.dueAt)).toThrow(InvalidTransitionError);
  });
});

describe("Límites efectivos del guard (VC3-4)", () => {
  it("máximo acumulado: con USD 1,500.00 ya comprometidos se bloquea (S03)", () => {
    expect(checkTuitionExecution(setup({ committedToObligation: usd("1500.00") }))).toEqual(["EXCEEDS_PAYER_MAX"]);
  });

  it("si el pagador bajó el máximo después de aprobar, gana el más estricto (N11)", () => {
    const facts = setup();
    expect(checkTuitionExecution({ ...facts, policy: { ...facts.policy, maxTuitionDebit: usd("2500.00") } })).toEqual(["EXCEEDS_PAYER_MAX"]);
  });

  it("si el pagador subió el máximo después de aprobar, sigue mandando el aprobado", () => {
    const facts = setup({ policy: { maxTuitionDebit: usd("3500.00"), reserve: usd("1800.00") } });
    expect(checkTuitionExecution({ ...facts, quote: { ...facts.quote, debit: usd("2950.00") } })).toEqual(["EXCEEDS_PAYER_MAX"]);
  });

  it("la reserva efectiva es la mayor entre la aprobada y la vigente", () => {
    const funds = { balance: usd("5000.00"), earmarkedRemaining: usd("0.00"), activeHolds: usd("0.00") };
    // Débito 2,860 deja 2,140.
    expect(checkTuitionExecution(setup({ funds, policy: { maxTuitionDebit: usd("2900.00"), reserve: usd("2200.00") } }))).toEqual(["BREAKS_RESERVE"]);
    expect(checkTuitionExecution(setup({ funds }, { reserve: { currency: "USD", minor: "220000" } }))).toEqual(["BREAKS_RESERVE"]);
    expect(checkTuitionExecution(setup({ funds }))).toEqual([]);
  });

  it("si la reserva ya no se conserva por falta de saldo, BREAKS_RESERVE", () => {
    const facts = setup();
    expect(checkTuitionExecution({ ...facts, funds: { ...facts.funds, balance: usd("4500.00") } })).toEqual(["BREAKS_RESERVE"]);
  });
});
