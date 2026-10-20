import { detectSecuritySignals } from "@/domain/security/SecuritySignals";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import type { ChatActivityDTO, ChatComponentDTO, ChatFallbackReason, ChatHistoryDTO, ChatTurnDTO } from "../dto/ChatDTO";
import { NotFoundError, RateLimitedError, ValidationError } from "../errors/ApplicationError";
import { CaseStateMapper } from "../mappers/CaseStateMapper";
import { CaseViewMapper } from "../mappers/CaseViewMapper";
import {
  AgentModelError,
  type AgentConfig,
  type AgentMessage,
  type AgentModelPort,
  type AgentUsage,
  type AiUsageStorePort,
  type ConversationStorePort,
  type StoredTurn,
  type ToolRunnerPort,
} from "../ports/AgentPorts";
import type { RateLimiterPort } from "../ports/SessionPort";
import { event } from "../services/events";
import type { GetCaseViewUseCase } from "./GetCaseViewUseCase";

const MAX_MESSAGE_CHARS = 2000;
const SYSTEM_AND_TOOLS_TOKENS_ESTIMATE = 3500n;
const MAX_OUTPUT_TOKENS = 2048n;

const FALLBACK_MESSAGE = "The assistant is unavailable right now. You can continue with the controls below. Nothing has been lost.";
const REFUSAL_TEXT = "I can't help with that here. I can plan and check tuition payments, project your funds, and prepare changes that Carlos confirms on his own screen.";
const OUT_OF_STEPS_TEXT = "I couldn't finish every step in this turn. The panels show the current state from the server; ask me to continue.";

const ZERO_USAGE: AgentUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Escapa los delimitadores para que el texto del usuario no pueda cerrar <user_message> ni abrir <case_state>. */
export function escapeUserText(text: string): string {
  return text.replace(/</g, "‹").replace(/>/g, "›");
}

/**
 * Un turno del chat (BUILD_PROMPT 13.2, 13.5 y 13.6). El actor sale SIEMPRE de la sesión; el modelo solo elige
 * herramientas de su rol, y cada una valida y ejecuta en el servidor. Lo que se muestra de dinero o estado son
 * componentes armados desde el servidor. Ante un tope, una falla de la API o AI_UNAVAILABLE, el turno vuelve con
 * `fallback` y la interfaz pasa a modo estructurado; el estado nunca se pierde.
 */
export class ChatTurnUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow">,
    private readonly caseView: GetCaseViewUseCase,
    private readonly model: AgentModelPort,
    private readonly tools: ToolRunnerPort,
    private readonly conversations: ConversationStorePort,
    private readonly usage: AiUsageStorePort,
    private readonly limiter: RateLimiterPort,
    private readonly config: AgentConfig,
  ) {}

  /** Uso de IA del espacio y del día, con sus topes (consola del evaluador). En micro-USD. */
  async usageSummary(actor: ActorContext): Promise<{ workspace: bigint; daily: bigint; workspaceBudget: bigint; dailyBudget: bigint }> {
    requireRole(actor, "evaluator");
    const [workspace, daily] = await Promise.all([this.usage.spentByWorkspace(actor.workspaceId), this.usage.spentSince(startOfUtcDay(new Date()))]);
    return { workspace, daily, workspaceBudget: this.config.budgetPerWorkspaceMicros, dailyBudget: this.config.budgetDailyMicros };
  }

  async history(actor: ActorContext): Promise<ChatHistoryDTO> {
    requireRole(actor, "student", "payer");
    const conversation = await this.conversations.activeFor(actor.workspaceId, actor.role);
    const turns = await this.conversations.recentTurns(conversation.id, 30);
    const unavailable = await this.unavailableReason(actor.workspaceId);
    return {
      synthetic: true,
      role: actor.role,
      turns: turns.map((t) => this.toDTO(conversation.id, t)),
      assistantAvailable: unavailable === null,
      unavailableReason: unavailable,
    };
  }

  async execute(actor: ActorContext, command: { readonly message: string }): Promise<ChatTurnDTO> {
    requireRole(actor, "student", "payer");
    const message = command.message.trim();
    if (!message || message.length > MAX_MESSAGE_CHARS) throw new ValidationError(`Write a message of 1 to ${MAX_MESSAGE_CHARS} characters.`);
    const conversation = await this.conversations.activeFor(actor.workspaceId, actor.role);
    // Límite de turnos primero: nada se escribe en la bitácora por encima del tope (VC8).
    const perMinute = await this.limiter.hit(`${this.config.rateLimitPrefix}:chat:min:${actor.workspaceId}`, 60, this.config.turnsPerMinute);
    const perDay = await this.limiter.hit(`${this.config.rateLimitPrefix}:chat:day:${actor.workspaceId}`, 86_400, this.config.turnsPerDay);
    if (!perMinute.allowed || !perDay.allowed) throw new RateLimitedError("Too many messages. Wait a moment and use the controls below.", Math.max(perMinute.retryAfterSeconds, perDay.retryAfterSeconds));

    // Señales de ataque: quedan en la bitácora y en pantalla. El efecto ya lo impide el servidor. Afirmar que el
    // pagador aprobó no es un ataque si de verdad hay una aprobación vigente o usada para la versión actual.
    const view = CaseViewMapper.toDTO(await this.caseView.execute(actor));
    const approved = Boolean(view.plan?.approvals.some((a) => a.planVersion === view.plan?.version && (a.status === "ACTIVE" || a.status === "CONSUMED")));
    const signals = detectSecuritySignals(message).filter((s) => !(approved && s.reason === "CLAIMED_APPROVAL"));
    const securityComponents: ChatComponentDTO[] = signals.map((s) => ({ kind: "SECURITY_BLOCK", category: s.category, reason: s.reason }));
    if (signals.length > 0) await this.recordSecurity(actor, conversation.id, signals);

    const unavailable = await this.unavailableReason(actor.workspaceId);
    if (unavailable) return this.fallbackTurn(actor, conversation.id, message, unavailable, securityComponents);

    const history = await this.conversations.recentTurns(conversation.id, this.config.historyTurns);
    const caseState = CaseStateMapper.toCaseState(view);
    // A5: turnos pasados como texto plano; el estado real llega siempre por <case_state>.
    const messages: AgentMessage[] = [];
    for (const t of history) {
      // El texto pasado también se escapa: no puede abrir un <case_state> falso en turnos siguientes (VC8-2).
      messages.push({ role: "user", content: escapeUserText(t.userText) });
      // El texto pasado del asistente también se escapa (VC9-3): si el modelo repitió una etiqueta, no vuelve como tal.
      messages.push({ role: "assistant", content: escapeUserText(t.assistantText) || "(no reply)" });
    }
    messages.push({ role: "user", content: `<case_state>${JSON.stringify(caseState)}</case_state>\n<user_message>${escapeUserText(message)}</user_message>` });

    const definitions = this.tools.definitions(actor.role);
    const activity: ChatActivityDTO[] = [];
    const components: ChatComponentDTO[] = [...securityComponents];
    const total = { ...ZERO_USAGE };
    let cost = 0n;
    let modelCalls = 0;
    let toolCalls = 0;
    let text = "";
    let finished = false;
    const started = Date.now();

    try {
      while (modelCalls < this.config.maxModelCalls) {
        if (Date.now() - started > this.config.turnDeadlineMs) break;
        const estimate = this.estimate(messages);
        // Reserva atómica contra los tres topes: turnos simultáneos no pueden superarlos (VC8-1, VC9-7).
        const reservation = await this.usage.reserve(actor.workspaceId, this.model.model, estimate, {
          workspace: this.config.budgetPerWorkspaceMicros,
          daily: this.config.budgetDailyMicros,
          perOriginDaily: this.config.budgetPerOriginDailyMicros,
          since: startOfUtcDay(new Date()),
        });
        if (!reservation) {
          if (modelCalls === 0) return this.fallbackTurn(actor, conversation.id, message, "BUDGET_EXHAUSTED", securityComponents);
          break;
        }
        let response;
        try {
          response = await this.model.respond({ tools: definitions, messages });
        } catch (error) {
          const timeout = error instanceof AgentModelError && error.kind === "TIMEOUT";
          // Un timeout conserva la estimación (pudo facturarse); cualquier otro error libera la reserva.
          await this.usage.settle(
            reservation,
            { workspaceId: actor.workspaceId, category: "CHAT", model: this.model.model, usage: ZERO_USAGE, costUsdMicros: timeout ? estimate : 0n },
            timeout ? "TIMEOUT" : "FAILED",
          );
          throw error;
        }
        modelCalls++;
        const callCost = this.cost(response.usage);
        cost += callCost;
        addUsage(total, response.usage);
        await this.usage.settle(reservation, { workspaceId: actor.workspaceId, category: "CHAT", model: response.model, usage: response.usage, costUsdMicros: callCost }, "OK");

        if (response.stopReason === "refusal") {
          text = REFUSAL_TEXT;
          finished = true;
          break;
        }
        if (response.stopReason === "tool_use" && response.toolUses.length > 0) {
          // Turno en curso: el contenido del asistente se reenvía literal, con thinking y tool_use (A5).
          messages.push({ role: "assistant", content: response.content });
          const results: unknown[] = [];
          for (const use of response.toolUses) {
            if (toolCalls >= this.config.maxToolCalls) {
              results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: JSON.stringify({ error: "TOOL_LIMIT", reason: "Tool limit for this turn reached. Summarize what you know." }) });
              continue;
            }
            toolCalls++;
            const outcome = await this.tools.run(actor, use.name, use.input);
            activity.push(outcome.activity);
            components.push(...outcome.components);
            results.push({ type: "tool_result", tool_use_id: use.id, is_error: !outcome.ok, content: JSON.stringify(outcome.result) });
          }
          messages.push({ role: "user", content: results });
          if (response.text) text = response.text;
          continue;
        }
        text = response.text || text;
        finished = true;
        break;
      }
    } catch (error) {
      if (error instanceof AgentModelError) {
        return this.fallbackTurn(actor, conversation.id, message, error.kind === "TIMEOUT" ? "TIMEOUT" : "MODEL_ERROR", [...components], activity);
      }
      throw error;
    }

    if (!finished || !text) text = OUT_OF_STEPS_TEXT;
    const nextAction = await this.nextAction(actor);
    const stored: Omit<StoredTurn, "turnIndex"> = {
      userText: message,
      assistantText: text,
      tools: { activity, components: dedupe(components), fallback: null, nextAction },
      usage: { ...total, costUsdMicros: cost.toString(), modelCalls, toolCalls },
    };
    const turnIndex = await this.conversations.appendTurn(actor.workspaceId, conversation.id, stored);
    return this.toDTO(conversation.id, { ...stored, turnIndex });
  }

  private toDTO(conversationId: string, t: StoredTurn): ChatTurnDTO {
    return {
      synthetic: true,
      conversationId,
      turnIndex: t.turnIndex,
      userText: t.userText,
      text: t.assistantText,
      activity: t.tools.activity,
      components: t.tools.components,
      nextAction: t.tools.nextAction,
      fallback: t.tools.fallback,
    };
  }

  private async fallbackTurn(
    actor: ActorContext,
    conversationId: string,
    message: string,
    reason: ChatFallbackReason,
    components: readonly ChatComponentDTO[],
    activity: readonly ChatActivityDTO[] = [],
  ): Promise<ChatTurnDTO> {
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    await this.deps.uow.transaction((r) =>
      r.events.append(actor.workspaceId, [event("AI_FALLBACK_ACTIVATED", actor.role, { type: "Conversation", id: conversationId }, workspace.virtualNow, { reason })]),
    );
    const nextAction = await this.nextAction(actor);
    const stored: Omit<StoredTurn, "turnIndex"> = {
      userText: message,
      assistantText: "",
      tools: { activity: [...activity], components: dedupe([...components]), fallback: { reason, message: FALLBACK_MESSAGE }, nextAction },
      usage: { ...ZERO_USAGE, costUsdMicros: "0", modelCalls: 0, toolCalls: 0 },
    };
    const turnIndex = await this.conversations.appendTurn(actor.workspaceId, conversationId, stored);
    return this.toDTO(conversationId, { ...stored, turnIndex });
  }

  private async recordSecurity(actor: ActorContext, conversationId: string, signals: ReturnType<typeof detectSecuritySignals>): Promise<void> {
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    await this.deps.uow.transaction((r) =>
      r.events.append(
        actor.workspaceId,
        signals.map((s) => event("SECURITY_BLOCK", actor.role, { type: "Conversation", id: conversationId }, workspace.virtualNow, { category: s.category, reason: s.reason, source: "CHAT_MESSAGE" })),
      ),
    );
  }

  private async nextAction(actor: ActorContext): Promise<string> {
    return CaseViewMapper.toDTO(await this.caseView.execute(actor)).payment.nextAction;
  }

  private async unavailableReason(workspaceId: string): Promise<ChatFallbackReason | null> {
    const workspace = await this.deps.uow.read.workspaces.get(workspaceId);
    if (!workspace) throw new NotFoundError();
    if ((workspace.faults as Record<string, unknown>).AI_UNAVAILABLE === true) return "AI_UNAVAILABLE";
    return this.budgetProblem(workspaceId, 0n);
  }

  private async budgetProblem(workspaceId: string, estimate: bigint): Promise<ChatFallbackReason | null> {
    const [byWorkspace, today] = await Promise.all([this.usage.spentByWorkspace(workspaceId), this.usage.spentSince(startOfUtcDay(new Date()))]);
    if (byWorkspace + estimate > this.config.budgetPerWorkspaceMicros) return "BUDGET_EXHAUSTED";
    if (today + estimate > this.config.budgetDailyMicros) return "BUDGET_EXHAUSTED";
    return null;
  }

  /** Costo estimado de una llamada: entrada aproximada por caracteres más la salida máxima. */
  private estimate(messages: readonly AgentMessage[]): bigint {
    const chars = messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length), 0);
    const input = BigInt(Math.ceil(chars / 3)) + SYSTEM_AND_TOOLS_TOKENS_ESTIMATE;
    return perMillion(input, this.config.prices.input) + perMillion(MAX_OUTPUT_TOKENS, this.config.prices.output);
  }

  private cost(u: AgentUsage): bigint {
    const p = this.config.prices;
    return perMillion(BigInt(u.inputTokens), p.input) + perMillion(BigInt(u.outputTokens), p.output) + perMillion(BigInt(u.cacheReadTokens), p.cacheRead) + perMillion(BigInt(u.cacheWriteTokens), p.cacheWrite);
  }
}

/** tokens × precio (micro-USD por millón de tokens), redondeado hacia arriba. */
function perMillion(tokens: bigint, microsPerMillion: bigint): bigint {
  return (tokens * microsPerMillion + 999_999n) / 1_000_000n;
}

function addUsage(total: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }, u: AgentUsage): void {
  total.inputTokens += u.inputTokens;
  total.outputTokens += u.outputTokens;
  total.cacheReadTokens += u.cacheReadTokens;
  total.cacheWriteTokens += u.cacheWriteTokens;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Un componente por tipo y sujeto: el último gana (refleja el estado final del turno). */
function dedupe(components: readonly ChatComponentDTO[]): ChatComponentDTO[] {
  const keyOf = (c: ChatComponentDTO): string => {
    switch (c.kind) {
      case "PLAN":
        return `PLAN:${c.plan.planId}`;
      case "PAYMENT":
        return `PAYMENT:${c.attempt.attemptId}`;
      case "SECURITY_BLOCK":
        return `SEC:${c.category}:${c.reason}`;
      case "BLOCKED":
        return `BLOCKED:${c.reasons.join(",")}`;
      case "PENDING_CHANGE":
        return `CHANGE:${c.changeId}`;
      case "APPROVAL_REQUESTED":
        return `REQ:${c.planId}:${c.planVersion}`;
      default:
        return c.kind;
    }
  };
  const map = new Map<string, ChatComponentDTO>();
  for (const c of components) {
    const key = keyOf(c);
    map.delete(key);
    map.set(key, c);
  }
  return [...map.values()];
}
