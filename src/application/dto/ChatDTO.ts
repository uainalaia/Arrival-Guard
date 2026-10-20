import type { AttemptDTO, CashProjectionDTO, PlanDTO, RefundDTO, RemittanceDTO, RoutingDTO } from "./CaseDTO";

// Contrato del chat (BUILD_PROMPT 11 y 13.2). El texto del asistente es solo texto; todo lo que muestra dinero,
// estados o acciones son componentes construidos desde el estado del servidor, nunca desde el texto del modelo.

/** Etiqueta de actividad generada por el servidor según la herramienta usada ("Checking quotes"). */
export interface ChatActivityDTO {
  readonly tool: string;
  readonly label: string;
  readonly ok: boolean;
  /** Código de razón si la herramienta fue rechazada (por ejemplo ROLE_NOT_ALLOWED o EXCEEDS_PAYER_MAX). */
  readonly reason: string | null;
}

export type ChatComponentDTO =
  | { readonly kind: "PLAN"; readonly plan: PlanDTO }
  | { readonly kind: "ROUTES"; readonly routing: RoutingDTO; readonly targetHours: number; readonly comparedAt: string | null }
  | { readonly kind: "APPROVAL_REQUESTED"; readonly planId: string; readonly planVersion: number }
  | { readonly kind: "PAYMENT"; readonly attempt: AttemptDTO }
  | { readonly kind: "CASH"; readonly projection: CashProjectionDTO }
  | { readonly kind: "BLOCKED"; readonly reasons: readonly string[] }
  | { readonly kind: "SECURITY_BLOCK"; readonly category: string; readonly reason: string }
  | { readonly kind: "PENDING_CHANGE"; readonly changeId: string; readonly changeKind: string; readonly fingerprintPrefix: string }
  | { readonly kind: "REMITTANCE"; readonly remittance: RemittanceDTO }
  | { readonly kind: "REFUND"; readonly claim: RefundDTO };

export type ChatFallbackReason = "AI_UNAVAILABLE" | "BUDGET_EXHAUSTED" | "RATE_LIMITED" | "MODEL_ERROR" | "REFUSAL" | "TIMEOUT";

export interface ChatTurnDTO {
  readonly synthetic: true;
  readonly conversationId: string;
  readonly turnIndex: number;
  /** Mensaje del usuario tal como se guardó (sin case_state). */
  readonly userText: string;
  /** Texto final del asistente. Se muestra como texto plano. */
  readonly text: string;
  readonly activity: readonly ChatActivityDTO[];
  readonly components: readonly ChatComponentDTO[];
  /** Siguiente acción del caso después del turno (NextAction del dominio). */
  readonly nextAction: string;
  /** Si no hubo respuesta del modelo: la interfaz pasa a modo estructurado. El estado nunca se pierde. */
  readonly fallback: { readonly reason: ChatFallbackReason; readonly message: string } | null;
}

export interface ChatHistoryDTO {
  readonly synthetic: true;
  readonly role: string;
  readonly turns: readonly ChatTurnDTO[];
  /** true si el asistente no está disponible ahora (falla AI_UNAVAILABLE o presupuesto agotado). */
  readonly assistantAvailable: boolean;
  readonly unavailableReason: ChatFallbackReason | null;
}
