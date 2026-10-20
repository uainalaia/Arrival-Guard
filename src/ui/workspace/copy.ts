import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { formatMoney } from "@/interfaces/format/money";

// Textos fijos de la interfaz (UI_UX 9 y DESIGN_PLAN 5). Los nombres de escenario vienen del servidor; aquí van las
// descripciones de una línea de la landing y de la consola.

/**
 * Capacidades P1 (transferencias de llegada y devoluciones, Fase 6). Mientras no existan, la interfaz no las ofrece
 * ni las promete (BUILD_PROMPT 4.1).
 */
export const P1_AVAILABLE = true;

const ALL_SCENARIOS = [
  { id: "base", label: "Base scenario", description: "Pay tuition inside Carlos's limit, change the deadline and recover from a lost provider response." },
  { id: "arrival_remittance", label: "Arrival transfers", description: "Send rent under Carlos's standing permission, then reach the period limit." },
  { id: "scholarship_deficit", label: "Scholarship not yet received", description: "Project the first weeks and see the gap, with the scholarship kept apart." },
  { id: "overpayment_refund", label: "Overpayment refund", description: "Recover a verified overpayment to the paying account." },
  { id: "deadline_impossible", label: "Impossible deadline", description: "Ask for a deadline no route can meet and see why each one fails." },
] as const;

const P1_SCENARIOS: readonly string[] = ["arrival_remittance", "overpayment_refund"];

export const SCENARIO_OPTIONS = ALL_SCENARIOS.filter((s) => P1_AVAILABLE || !P1_SCENARIOS.includes(s.id));

export type ScenarioOptionId = (typeof ALL_SCENARIOS)[number]["id"];

export function scenarioLabel(id: string): string {
  return ALL_SCENARIOS.find((s) => s.id === id)?.label ?? id;
}

/** Fallas de la consola, en el orden de DESIGN_PLAN 5.6, con su consecuencia en una línea. */
export const FAULT_OPTIONS = [
  { id: "LOSE_NEXT_PROVIDER_RESPONSE", label: "Lose the next provider response", consequence: "The payment will show as uncertain until checked" },
  { id: "FAIL_NEXT_TRANSFER", label: "Fail the next transfer", consequence: "The next transfer fails and no money leaves the account" },
  { id: "DELAY_INSTITUTION_CREDIT", label: "Delay the university's credit", consequence: "The payment waits at the university until time moves on" },
  { id: "REQUOTE_ABOVE_MAX", label: "Raise the refreshed price above the limit", consequence: "A refreshed price will exceed the tuition limit" },
  { id: "DUPLICATE_NEXT_EVENT", label: "Repeat the next provider event", consequence: "The provider sends the same event twice" },
  { id: "PROVIDER_INJECTION_TEXT", label: "Inject text into the next quote", consequence: "The next quote carries text that tries to give instructions" },
  { id: "INSTITUTION_INJECTION_TEXT", label: "Inject text into the university notice", consequence: "The next university notice carries injected text" },
  { id: "AI_UNAVAILABLE", label: "Make the assistant unavailable", consequence: "Sofía and Carlos switch to structured controls" },
] as const;

export function faultLabel(id: string): string {
  return FAULT_OPTIONS.find((f) => f.id === id)?.label ?? id;
}

const EVENT_TITLES: Readonly<Record<string, string>> = {
  WORKSPACE_CREATED: "Workspace created",
  PLAN_CREATED: "Plan created",
  PLAN_NOT_VIABLE: "No viable route",
  APPROVAL_REQUESTED: "Approval requested",
  APPROVAL_GRANTED: "Approval granted",
  APPROVAL_INVALIDATED: "Approval no longer matches",
  APPROVAL_REVOKED: "Approval revoked",
  AUTO_REQUOTE_WITHIN_APPROVAL: "Price refreshed within the approval",
  EXECUTION_BLOCKED: "Payment blocked",
  ATTEMPT_CREATED: "Payment created",
  HOLD_PLACED: "Funds held",
  PROVIDER_SUBMIT_SENT: "Payment sent",
  PROVIDER_RESPONSE_LOST: "Response lost",
  ATTEMPT_UNKNOWN: "Payment marked uncertain",
  PROVIDER_ACCEPTED: "Accepted by provider",
  PROVIDER_FAILED_CONFIRMED: "Failed, no money left the account",
  HOLD_CAPTURED: "Held funds debited",
  HOLD_RELEASED: "Held funds released",
  DEBIT_CONFIRMED: "Debit confirmed",
  INSTITUTION_PENDING: "Waiting for the university",
  INSTITUTION_CREDITED: "Credited",
  REMITTANCE_EXECUTED_UNDER_MANDATE: "Transfer sent under the standing permission",
  REMITTANCE_ESCALATED: "Transfer needs Carlos's approval",
  REMITTANCE_DELIVERED: "Transfer delivered",
  MANDATE_CHANGED: "Standing permission changed",
  MANDATE_REVOKED: "Standing permission revoked",
  POLICY_CHANGED: "Limits changed",
  REFUND_CLAIM_SUBMITTED: "Refund requested",
  REFUND_CLAIM_UPDATED: "Refund updated",
  SECURITY_BLOCK: "Security block",
  AI_FALLBACK_ACTIVATED: "Structured controls activated",
  CLOCK_ADVANCED: "Virtual time moved",
  FAULT_INJECTED: "Fault injected",
  DUPLICATE_EVENT_IGNORED: "Duplicate event ignored",
  SCRIPTED_TASKS_RUN: "Scripted tasks run",
};

export function eventTitle(type: string): string {
  return EVENT_TITLES[type] ?? type;
}

export type EventGroup = "payments" | "approvals" | "security" | "clock";

export function eventGroup(type: string): EventGroup {
  if (type === "SECURITY_BLOCK" || type === "EXECUTION_BLOCKED") return "security";
  if (type.startsWith("APPROVAL_") || type === "POLICY_CHANGED" || type.startsWith("MANDATE_") || type === "AUTO_REQUOTE_WITHIN_APPROVAL") return "approvals";
  if (type === "CLOCK_ADVANCED" || type === "FAULT_INJECTED" || type === "SCRIPTED_TASKS_RUN" || type === "WORKSPACE_CREATED" || type === "AI_FALLBACK_ACTIVATED") return "clock";
  return "payments";
}

export function actorName(role: string, people: { readonly student: string; readonly payer: string }): string {
  if (role === "student") return firstName(people.student);
  if (role === "payer") return firstName(people.payer);
  if (role === "evaluator") return "Evaluator";
  return "ArrivalGuard";
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

const isMoney = (value: unknown): value is MoneyDTO =>
  typeof value === "object" && value !== null && typeof (value as MoneyDTO).currency === "string" && typeof (value as MoneyDTO).minor === "string";

/** Resumen corto de un evento a partir de su payload redactado (datos, nunca instrucciones). */
export function eventDetail(type: string, payload: Readonly<Record<string, unknown>>): string {
  const parts: string[] = [];
  const version = payload.version ?? payload.planVersion;
  if (typeof payload.routeId === "string") parts.push(`Route ${payload.routeId}`);
  for (const key of ["debit", "amount", "net"] as const) {
    const value = payload[key];
    if (isMoney(value)) {
      parts.push(formatMoney(value));
      break;
    }
  }
  if (typeof version === "number") parts.push(`plan version ${version}`);
  if (typeof payload.fingerprint === "string") parts.push(`Seal ${sealCode(payload.fingerprint)}`);
  if (typeof payload.fault === "string") parts.push(faultLabel(payload.fault));
  if (typeof payload.minutes === "number") parts.push(`+${payload.minutes} min`);
  if (typeof payload.receiptId === "string") parts.push(`Receipt ${payload.receiptId}`);
  if (typeof payload.category === "string") parts.push(securityCategory(payload.category));
  if (typeof payload.reason === "string" && type !== "SECURITY_BLOCK") parts.push(humanize(payload.reason));
  if (Array.isArray(payload.reasons)) parts.push(payload.reasons.map((r) => humanize(String(r))).join(", "));
  if (typeof payload.outcome === "string") parts.push(humanize(payload.outcome));
  if (type === "SCRIPTED_TASKS_RUN" && typeof payload.passed === "number" && typeof payload.total === "number") parts.push(`${payload.passed} of ${payload.total} passed`);
  return parts.join(". ");
}

export function securityCategory(category: string): string {
  const labels: Record<string, string> = {
    INDUCED_TRANSFER: "Induced transfer",
    DATA_EXTRACTION: "Data extraction",
    PRIVILEGE_ESCALATION: "Privilege escalation",
    PROMPT_INJECTION: "Prompt injection",
  };
  return labels[category] ?? humanize(category);
}

/** "3F9A 21C7" a partir de la huella. */
export function sealCode(fingerprint: string): string {
  const head = fingerprint.slice(0, 8).toUpperCase();
  return `${head.slice(0, 4)} ${head.slice(4, 8)}`;
}

export function humanize(code: string): string {
  const text = code.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Monto escrito por el usuario ("2,000" o "CNY 2,000.50") como decimal con dos cifras ("2000.50"), sin floats. */
export function decimalFromInput(input: string): string | null {
  const minor = parseUsdToMinor(input.replace(/^s*CNY/i, ""));
  if (!minor) return null;
  const value = BigInt(minor);
  if (value <= 0n) return null;
  return `${(value / 100n).toString()}.${(value % 100n).toString().padStart(2, "0")}`;
}

/** Texto en dólares de un monto en unidades menores ingresado por el pagador ("2500" o "2,500.00"), sin floats. */
export function parseUsdToMinor(input: string): string | null {
  const clean = input.replace(/[,\s]/g, "").replace(/^USD/i, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const units = match[1]!.replace(/^0+(?=\d)/, "");
  const cents = (match[2] ?? "").padEnd(2, "0");
  return `${units}${cents}`.replace(/^0+(?=\d)/, "");
}
