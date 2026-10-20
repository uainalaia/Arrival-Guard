import { P1_AVAILABLE } from "@/ui/workspace/copy";
import type { ChatFallbackReason } from "@/application/dto/ChatDTO";
import type { PillStatus } from "@/ui/finance";
import { formatClock } from "@/ui/format/time";

// Textos puros del chat (UI_UX 9 y 11.6). Nada se arma con el texto del modelo: solo con datos del servidor.

export type ChatRole = "student" | "payer";

/** Pedidos sugeridos por rol (UI_UX 9.6). Desaparecen tras el primer mensaje. */
export const SUGGESTIONS: Readonly<Record<ChatRole, readonly string[]>> = {
  student: [
    "Pay my tuition without touching the arrival reserve",
    "Has the university received my payment?",
    "Will my money cover the first month?",
    "Send CNY 2,000 to my local account for rent",
  ],
  payer: ["What needs my approval?", "Lower the tuition limit to USD 2,500", "What did Sofía transfer this month?"],
};

/** Bienvenida fija de la interfaz (DESIGN_PLAN 5.2, propuesta). No es texto del modelo. */
export const WELCOME: Readonly<Record<ChatRole, string>> = {
  student: P1_AVAILABLE
    ? "I can plan your tuition payment, check its status, send money for arrival costs and request refunds. Carlos approves tuition and anything above his limits."
    : "I can plan your tuition payment, compare routes, check its status and project your funds. Carlos approves tuition on his own screen.",
  payer: "I can tell you what needs your approval, check payments and prepare limit changes. You confirm every change on its own screen.",
};

/** Estado del plan en el momento del turno, como píldora (BUILD_PROMPT 8.5, mismo criterio que VisibleStatus). */
export function planPill(status: string): PillStatus {
  switch (status) {
    case "READY_FOR_APPROVAL":
      return "PLAN_READY";
    case "APPROVAL_REQUESTED":
      return "WAITING_FOR_PAYER";
    case "APPROVED":
      return "APPROVED";
    case "EXECUTING":
      return "SENDING";
    case "COMPLETED":
      // Un plan completado no se muestra como acreditado: eso solo lo dice un intento CREDITED con recibo.
      return "WAITING_FOR_UNIVERSITY";
    case "NOT_VIABLE":
    case "INCIDENT_OPEN":
      return "BLOCKED";
    default:
      return "DETAILS_NEEDED";
  }
}

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  PROVIDER: "From the provider",
  INSTITUTION: "From the university",
  UNIVERSITY: "From the university",
  SYSTEM: "From ArrivalGuard",
  PAYER: "From Carlos",
};

/** "From the university, 09:42 virtual time." (UI_UX 9.1) */
export function provenanceText(source: string, observedAt: string): string {
  return `${SOURCE_LABEL[source] ?? "From ArrivalGuard"}, ${formatClock(observedAt)} virtual time.`;
}

/** Por qué el asistente no está: la interfaz pasa al modo estructurado y el estado no se pierde. */
export function fallbackFromStatus(status: number, code: string | null): ChatFallbackReason {
  if (code === "AI_BUDGET_EXHAUSTED") return "BUDGET_EXHAUSTED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "AI_UNAVAILABLE";
  if (status === 0) return "TIMEOUT";
  return "MODEL_ERROR";
}

/** Una línea de detalle bajo la banda del modo estructurado. */
export function fallbackDetail(reason: ChatFallbackReason | null): string | null {
  switch (reason) {
    case "BUDGET_EXHAUSTED":
      return "The assistant budget for this workspace or for today was reached.";
    case "RATE_LIMITED":
      return "Too many messages in a short time. Try the assistant again in a minute.";
    case "TIMEOUT":
      return "The assistant took too long to answer.";
    case "REFUSAL":
      return "The assistant declined that request.";
    default:
      return null;
  }
}

/** true si el error de la API debe llevar al modo estructurado (y no a un aviso dentro del hilo). */
export function isFallbackStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 504 || status === 404;
}
