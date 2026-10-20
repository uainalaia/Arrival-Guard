import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loadLocalEnv } from "../src/infrastructure/config/localEnv";
import { getServerEnv } from "../src/infrastructure/config/env";
import { runMain } from "./lib/args";

// Fase 0: llamada real a Claude con la configuración de BUILD_PROMPT 13.1 y una herramienta strict.
// Hace el ciclo completo: tool_use, tool_result y respuesta final, reenviando literal el contenido del
// asistente (incluidos los bloques thinking) dentro del turno en curso (13.5). Guarda la evidencia sin texto de razonamiento.
runMain(async () => {
  loadLocalEnv();
  const env = getServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    console.error("ai:check: falta ANTHROPIC_API_KEY");
    return 1;
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 });

  const tools: Anthropic.Tool[] = [
    {
      name: "get_case_overview",
      description: "Returns the synthetic tuition case overview for the current workspace.",
      strict: true,
      input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  ];
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: "You are ArrivalGuard, an AI payment agent in a SIMULATED environment. Use tools for facts. English, brief.",
      cache_control: { type: "ephemeral" },
    },
  ];
  const request = {
    model: env.ANTHROPIC_MODEL,
    max_tokens: 2048,
    thinking: { type: "between_tools" },
    output_config: { effort: "low" },
    system,
    tools,
    tool_choice: { type: "auto" },
  } satisfies Omit<Anthropic.MessageCreateParamsNonStreaming, "messages">;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        '<case_state>{"role":"student","virtual_now":"Tue 20 Oct, 09:00"}</case_state>\n' +
        "<user_message>How much is my tuition and when is it due? Check the case first.</user_message>",
    },
  ];

  const calls: Record<string, unknown>[] = [];
  const first = await client.messages.create({ ...request, messages });
  calls.push(summarize(first));
  console.log(`llamada 1: stop_reason=${first.stop_reason} bloques=${first.content.map((b) => b.type).join(",")}`);

  const toolUse = first.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  let finalText = first.content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
  if (toolUse) {
    messages.push({ role: "assistant", content: first.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({
            obligation: { reference: "AG-STUDENT-01", net: { currency: "CNY", minor: "2000000" }, dueInHours: 48 },
            synthetic: true,
          }),
        },
      ],
    });
    const second = await client.messages.create({ ...request, messages });
    calls.push(summarize(second));
    console.log(`llamada 2: stop_reason=${second.stop_reason} bloques=${second.content.map((b) => b.type).join(",")}`);
    finalText = second.content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
  }

  const ok = Boolean(toolUse) && calls.length === 2 && calls[1]?.stop_reason === "end_turn";
  console.log(`respuesta final: ${JSON.stringify(finalText.slice(0, 200))}`);
  console.log(ok ? "ai:check: OK (tool_use, tool_result y end_turn)" : "ai:check: FALLA");

  const evidence = {
    generatedAt: new Date().toISOString(),
    check: "phase0-ai-check",
    model: env.ANTHROPIC_MODEL,
    config: { max_tokens: 2048, thinking: "between_tools", effort: "low", tool_choice: "auto", strictTools: true },
    calls,
    finalText,
    ok,
  };
  const out = path.join(process.cwd(), "docs", "evidence", "phase0-ai-check.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`evidencia: ${path.relative(process.cwd(), out)}`);
  return ok ? 0 : 1;
});

function summarize(message: Anthropic.Message): Record<string, unknown> {
  return {
    id: message.id,
    model: message.model,
    stop_reason: message.stop_reason,
    blocks: message.content.map((b) => (b.type === "tool_use" ? `tool_use:${b.name}` : b.type)),
    usage: message.usage,
  };
}
