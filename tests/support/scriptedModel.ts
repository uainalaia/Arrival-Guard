import { type AgentConfig, type AgentMessage, type AgentModelPort, type AgentModelResponse } from "@/application/ports/AgentPorts";
import { ChatTurnUseCase } from "@/application/usecases/ChatTurnUseCase";
import { DbRateLimiter } from "@/infrastructure/auth/DrizzleSessionStore";
import { getDb } from "@/infrastructure/db/client";
import { DrizzleAiUsageStore, DrizzleConversationStore } from "@/infrastructure/db/repositories/aiRepositories";
import { ToolExecutor } from "@/interfaces/agent/ToolExecutor";
import { app } from "./integration";

// Modelo guionizado para probar el bucle del agente sin costo de IA y de forma determinista.

export type Step = (messages: readonly AgentMessage[]) => Partial<AgentModelResponse> | Error;

export class ScriptedModel implements AgentModelPort {
  readonly model = "scripted";
  readonly calls: AgentMessage[][] = [];
  constructor(private readonly steps: Step[], private readonly repeatLast = false) {}
  async respond(input: { readonly messages: readonly AgentMessage[] }): Promise<AgentModelResponse> {
    this.calls.push([...input.messages]);
    const step = this.steps[Math.min(this.calls.length - 1, this.steps.length - 1)];
    if (!step || (!this.repeatLast && this.calls.length > this.steps.length)) throw new Error("unexpected model call");
    const out = step(input.messages);
    if (out instanceof Error) throw out;
    const toolUses = out.toolUses ?? [];
    return {
      stopReason: out.stopReason ?? (toolUses.length ? "tool_use" : "end_turn"),
      content: out.content ?? [...(out.text ? [{ type: "text", text: out.text }] : []), ...toolUses.map((t) => ({ type: "tool_use", id: t.id, name: t.name, input: t.input }))],
      text: out.text ?? "",
      toolUses,
      usage: out.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      model: "scripted",
    };
  }
}

export const tool = (name: string, input: unknown, id = `tu_${name}_${Math.random().toString(36).slice(2, 8)}`) => ({ toolUses: [{ id, name, input }] });
export const say = (text: string) => ({ text });

export const CONFIG: AgentConfig = {
  budgetPerWorkspaceMicros: 3_000_000n,
  budgetDailyMicros: 10_000_000_000n,
  budgetPerOriginDailyMicros: 10_000_000_000n,
  turnsPerMinute: 1000,
  turnsPerDay: 100000,
  rateLimitPrefix: "test",
  prices: { input: 0n, output: 0n, cacheRead: 0n, cacheWrite: 0n },
  maxModelCalls: 4,
  maxToolCalls: 6,
  turnDeadlineMs: 60_000,
  historyTurns: 8,
};

export function chatWith(model: AgentModelPort, config: Partial<AgentConfig> = {}) {
  const c = app();
  return new ChatTurnUseCase(c.deps, c.caseView, model, new ToolExecutor(() => c), new DrizzleConversationStore(), new DrizzleAiUsageStore(), new DbRateLimiter(getDb()), { ...CONFIG, ...config });
}
