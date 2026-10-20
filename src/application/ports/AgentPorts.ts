import type { ActorRole } from "@/domain/events/DomainEvent";
import type { ActorContext } from "../ActorContext";
import type { ChatActivityDTO, ChatComponentDTO, ChatTurnDTO } from "../dto/ChatDTO";

// Puertos del agente (BUILD_PROMPT 13). El caso de uso orquesta el turno; el adaptador habla con Claude; el ejecutor
// de herramientas llama a los casos de uso con el actor de la sesión. Ninguno recibe identidad del modelo.

/** Herramienta tal como la ve el modelo: esquema simple, strict, sin propiedades adicionales. */
export interface AgentToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/** Mensaje para el modelo. `content` es texto (turnos pasados) o los bloques literales del turno en curso. */
export interface AgentMessage {
  readonly role: "user" | "assistant";
  readonly content: string | readonly unknown[];
}

export interface AgentUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export interface AgentToolUse {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface AgentModelResponse {
  readonly stopReason: string;
  /** Bloques del asistente tal como llegaron; dentro del turno se reenvían sin modificar (A5). */
  readonly content: readonly unknown[];
  readonly text: string;
  readonly toolUses: readonly AgentToolUse[];
  readonly usage: AgentUsage;
  readonly model: string;
}

/** La API del modelo no respondió (timeout, error de red o 5xx) o rechazó el pedido (4xx). */
export class AgentModelError extends Error {
  constructor(
    readonly kind: "TIMEOUT" | "UNAVAILABLE" | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
  }
}

export interface AgentModelPort {
  readonly model: string;
  respond(input: { readonly tools: readonly AgentToolDefinition[]; readonly messages: readonly AgentMessage[] }): Promise<AgentModelResponse>;
}

/** Resultado de una herramienta: lo que vuelve al modelo y lo que se muestra (desde el estado del servidor). */
export interface ToolOutcome {
  readonly ok: boolean;
  /** JSON compacto para el `tool_result`. Datos, nunca instrucciones. */
  readonly result: unknown;
  readonly reason: string | null;
  readonly activity: ChatActivityDTO;
  readonly components: readonly ChatComponentDTO[];
}

export interface ToolRunnerPort {
  definitions(role: ActorRole): readonly AgentToolDefinition[];
  /** Ejecuta con el actor de la SESIÓN. Una herramienta ajena al rol se rechaza y queda como SECURITY_BLOCK. */
  run(actor: ActorContext, name: string, input: unknown): Promise<ToolOutcome>;
}

export interface StoredTurn {
  readonly turnIndex: number;
  readonly userText: string;
  readonly assistantText: string;
  readonly tools: { readonly activity: readonly ChatActivityDTO[]; readonly components: readonly ChatComponentDTO[]; readonly fallback: ChatTurnDTO["fallback"]; readonly nextAction: string };
  readonly usage: AgentUsage & { readonly costUsdMicros: string; readonly modelCalls: number; readonly toolCalls: number };
}

export interface ConversationStorePort {
  /** Conversación activa del rol en el espacio (una sola, BUILD_PROMPT 13.6); la crea si no existe. */
  activeFor(workspaceId: string, role: ActorRole): Promise<{ readonly id: string }>;
  recentTurns(conversationId: string, limit: number): Promise<StoredTurn[]>;
  appendTurn(workspaceId: string, conversationId: string, turn: Omit<StoredTurn, "turnIndex">): Promise<number>;
}

export interface AiUsageRow {
  readonly workspaceId: string | null;
  readonly category: "CHAT";
  readonly model: string;
  readonly usage: AgentUsage;
  readonly costUsdMicros: bigint;
}

export interface AiUsageStorePort {
  /**
   * Reserva el costo estimado antes de llamar (13.6), de forma atómica: bajo un bloqueo por espacio y otro global,
   * vuelve a sumar y solo inserta si la reserva cabe en los dos topes. Devuelve null si no cabe.
   */
  reserve(
    workspaceId: string,
    model: string,
    estimateMicros: bigint,
    limits: { readonly workspace: bigint; readonly daily: bigint; readonly perOriginDaily: bigint; readonly since: Date },
  ): Promise<string | null>;
  /** Registra el uso real sobre la reserva. FAILED libera (costo 0); TIMEOUT conserva la estimación, por si se facturó. */
  settle(id: string, row: AiUsageRow, status: "OK" | "FAILED" | "TIMEOUT"): Promise<void>;
  spentByWorkspace(workspaceId: string): Promise<bigint>;
  spentSince(since: Date): Promise<bigint>;
}

export interface AgentConfig {
  readonly budgetPerWorkspaceMicros: bigint;
  readonly budgetDailyMicros: bigint;
  /** Tope diario por origen (hash de la IP que abrió el espacio): un solo origen no agota el global (VC9-7). */
  readonly budgetPerOriginDailyMicros: bigint;
  readonly turnsPerMinute: number;
  readonly turnsPerDay: number;
  readonly rateLimitPrefix: string;
  /** Precios en micro-USD por millón de tokens. */
  readonly prices: { readonly input: bigint; readonly output: bigint; readonly cacheRead: bigint; readonly cacheWrite: bigint };
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly turnDeadlineMs: number;
  readonly historyTurns: number;
}
