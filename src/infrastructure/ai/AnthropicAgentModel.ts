import Anthropic from "@anthropic-ai/sdk";
import { AgentModelError, type AgentMessage, type AgentModelPort, type AgentModelResponse, type AgentToolDefinition } from "@/application/ports/AgentPorts";
import { SYSTEM_PROMPT } from "./systemPrompt";

// Adaptador de Claude con la configuración de BUILD_PROMPT 13.1 (verificada en la Fase 0, DEC-011): thinking
// between_tools con effort low, system con cache_control, herramientas strict y tool_choice auto. 25 s por llamada.

const CALL_TIMEOUT_MS = 25_000;

export class AnthropicAgentModel implements AgentModelPort {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, timeout: CALL_TIMEOUT_MS, maxRetries: 0 });
  }

  async respond(input: { readonly tools: readonly AgentToolDefinition[]; readonly messages: readonly AgentMessage[] }): Promise<AgentModelResponse> {
    const tools: Anthropic.Tool[] = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      strict: true,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        thinking: { type: "between_tools" },
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools,
        tool_choice: { type: "auto" },
        messages: input.messages as Anthropic.MessageParam[],
      });
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AgentModelError("TIMEOUT", "The model did not answer in time.");
      if (error instanceof Anthropic.APIError && error.status !== undefined && error.status >= 400 && error.status < 500 && error.status !== 429) {
        // Un 400 indica un pedido mal armado: se registra el código (sin contenido) para corregirlo.
        console.error(`[agent] Anthropic ${error.status} ${error.name}`);
        throw new AgentModelError("BAD_REQUEST", `Model request rejected (${error.status}).`);
      }
      throw new AgentModelError("UNAVAILABLE", "The model is unavailable.");
    }
    const toolUses = message.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      stopReason: message.stop_reason ?? "end_turn",
      content: message.content,
      text,
      toolUses,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
      model: message.model,
    };
  }
}
