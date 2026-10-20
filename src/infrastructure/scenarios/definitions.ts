import type { ScenarioDefinition, ScenarioId } from "./types";

// Valores exactos de BUILD_PROMPT 6. Las pruebas dependen de ellos: no se cambian sin cambiar el spec.

const tuitionRoutes: ScenarioDefinition["tuitionRoutes"] = [
  { routeId: "A", channel: "BANK_WIRE_STANDARD", debitUsd: "2820.00", netCny: "20000.00", arrivalHours: 72, receiver: "UNIVERSITY", requoteDebitUsd: "2825.00" },
  { routeId: "B", channel: "EDU_PAY_PARTNER", debitUsd: "2860.00", netCny: "20000.00", arrivalHours: 24, receiver: "UNIVERSITY", requoteDebitUsd: "2865.00" },
  { routeId: "C", channel: "FX_BROKER_FAST", debitUsd: "2840.00", netCny: "19800.00", arrivalHours: 12, receiver: "UNIVERSITY", requoteDebitUsd: "2845.00" },
  { routeId: "D", channel: "EXPRESS_EDU", debitUsd: "2880.00", netCny: "20000.00", arrivalHours: 2, receiver: "UNIVERSITY", requoteDebitUsd: "2885.00" },
  { routeId: "E", channel: "UNVERIFIED_AGENT", debitUsd: "2830.00", netCny: "20000.00", arrivalHours: 12, receiver: "UNVERIFIED_AGENT_ACCOUNT", requoteDebitUsd: "2835.00" },
];

const remittanceRoutes: ScenarioDefinition["remittanceRoutes"] = [
  { routeId: "R1", channel: "LOCAL_TRANSFER_STANDARD", debitUsd: "288.00", netCny: "2000.00", arrivalHours: 24 },
  { routeId: "R2", channel: "LOCAL_TRANSFER_INSTANT", debitUsd: "292.50", netCny: "2000.00", arrivalHours: 1 },
  { routeId: "R3", channel: "FX_BROKER_FAST", debitUsd: "284.00", netCny: "1950.00", arrivalHours: 6 },
];

const base: ScenarioDefinition = {
  id: "base",
  label: "Base scenario",
  description: "Tuition of CNY 20,000.00 due in 48 hours. USD 5,000.00 family savings with a USD 1,800.00 arrival reserve.",
  servesFor: ["T1", "T2", "T4", "T5", "T6", "T8", "video"],
  startVirtualTime: "2026-10-20T09:00:00.000Z",
  payer: { displayName: "Carlos Ramos", accountMasked: "•••• 4821", balanceUsd: "5000.00" },
  student: {
    displayName: "Sofía Ramos",
    localAccount: { bankName: "Arrival Bank", masked: "•••• 7310", status: "PENDING_OPENING", verified: false },
  },
  arrivalReserveUsd: "1800.00",
  arrivalReserveUsedUsd: "0.00",
  policy: { maxTuitionDebitUsd: "2900.00", reserveUsd: "1800.00" },
  obligation: {
    netDueCny: "20000.00",
    reference: "AG-STUDENT-01",
    receiverDisplayName: "Arrival University, tuition account ending 0098",
    receiverMasked: "•••• 0098",
    dueInHours: 48,
    status: "PENDING",
  },
  defaultTargetArrivalHours: 48,
  scholarship: { amountCny: "20000.00", status: "AWARDED_NOT_DISBURSED", expectedInDays: 60, condition: "LOCAL_ACCOUNT_OPEN" },
  expectedArrivalExpenseUsd: "1800.00",
  quoteValidityMinutes: 15,
  approvalValidityHours: 24,
  // La universidad acepta los cinco canales siempre que el pago llegue a su cuenta registrada;
  // por eso E se descarta por receptor y no por canal (BUILD_PROMPT 6.2, DEC-012).
  acceptedTuitionChannels: ["BANK_WIRE_STANDARD", "EDU_PAY_PARTNER", "FX_BROKER_FAST", "EXPRESS_EDU", "UNVERIFIED_AGENT"],
  tuitionRoutes,
  requote: { aboveMaxDebitUsd: "2905.00" },
  remittanceReferenceNetCny: "2000.00",
  remittanceRoutes,
  delayedCreditExtraHours: 36,
};

export const SCENARIOS: Readonly<Record<ScenarioId, ScenarioDefinition>> = {
  base,
  deadline_impossible: {
    ...base,
    id: "deadline_impossible",
    label: "Impossible deadline",
    description: "Same as base, but the tuition must arrive within 1 hour. No route can make it.",
    servesFor: ["N02"],
    requestedTargetArrivalHours: 1,
  },
  scholarship_deficit: {
    ...base,
    id: "scholarship_deficit",
    label: "Scholarship not yet received",
    description: "Same as base, with arrival costs estimated at USD 2,500.00. The scholarship is shown apart and not counted.",
    servesFor: ["T4", "N08"],
    expectedArrivalExpenseUsd: "2500.00",
  },
  arrival_remittance: {
    ...base,
    id: "arrival_remittance",
    label: "Arrival transfers",
    description: "Tuition already credited. Sofía's local account is open and verified, with a standing permission of USD 600.00 per 30 days.",
    servesFor: ["T3", "N05", "N06", "N17", "N18"],
    payer: { ...base.payer, balanceUsd: "2140.00" },
    student: {
      ...base.student,
      localAccount: { ...base.student.localAccount, status: "OPEN", verified: true },
    },
    obligation: { ...base.obligation, status: "CREDITED", historicalDebitUsd: "2860.00", historicalPaidCny: "20000.00" },
    mandate: { purpose: "ARRIVAL_EXPENSES", periodMaxUsd: "600.00", periodDays: 30, expiresInDays: 90 },
  },
  overpayment_refund: {
    ...base,
    id: "overpayment_refund",
    label: "Overpayment refund",
    description: "A past tuition payment credited CNY 20,500.00 against CNY 20,000.00 owed. Verified excess: CNY 500.00.",
    servesFor: ["T7", "N13", "N14"],
    payer: { ...base.payer, balanceUsd: "2140.00" },
    obligation: { ...base.obligation, status: "CREDITED", historicalDebitUsd: "2860.00", historicalPaidCny: "20500.00" },
    refund: { verifiedExcessCny: "500.00", settlementUsd: "70.00", settlesInHours: 24 },
  },
};

export function getScenario(id: ScenarioId): ScenarioDefinition {
  return SCENARIOS[id];
}
