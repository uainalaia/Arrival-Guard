import { describe, expect, it } from "vitest";
import { parseAssistantText, parseInline } from "@/ui/chat/assistantMarkdown";

describe("Texto del asistente: markdown mínimo sin HTML (BUILD_PROMPT 14.1)", () => {
  it("negritas como texto marcado, nunca como HTML", () => {
    expect(parseInline("Route **B** costs <b>USD 2,860.00</b>")).toEqual([
      { text: "Route ", strong: false },
      { text: "B", strong: true },
      { text: " costs <b>USD 2,860.00</b>", strong: false },
    ]);
  });

  it("párrafos, listas y encabezados", () => {
    const blocks = parseAssistantText("**The plan**\n- Route: B\n- Amount: CNY 20,000.00\n\nNext, Carlos approves.");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "ul", "p"]);
    expect(blocks[1]).toEqual({ kind: "ul", items: [[{ text: "Route: B", strong: false }], [{ text: "Amount: CNY 20,000.00", strong: false }]] });
    expect(parseAssistantText("## Status\n1. Sent\n2. Credited").map((b) => b.kind)).toEqual(["p", "ol"]);
  });
});
