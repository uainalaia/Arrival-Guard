// Markdown mínimo y seguro para el texto del asistente (BUILD_PROMPT 14.1: nunca HTML crudo). Solo párrafos, listas
// con "-", "*" o "1." y negritas con **; todo lo demás queda como texto. El resultado se dibuja con elementos de React.

export type Inline = { readonly text: string; readonly strong: boolean };
export type Block = { readonly kind: "p"; readonly lines: Inline[][] } | { readonly kind: "ul" | "ol"; readonly items: Inline[][] };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), strong: false });
    parts.push({ text: m[1]!, strong: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), strong: false });
  return parts.map((p) => ({ ...p, text: p.text.replace(/`/g, "") }));
}

export function parseAssistantText(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] = [];
  let list: { kind: "ul" | "ol"; items: Inline[][] } | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "p", lines: paragraph });
    if (list) blocks.push(list);
    paragraph = [];
    list = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (paragraph.length) {
        blocks.push({ kind: "p", lines: paragraph });
        paragraph = [];
      }
      if (!list || list.kind !== kind) {
        if (list) blocks.push(list);
        list = { kind, items: [] };
      }
      list.items.push(parseInline((bullet ?? numbered)![1]!));
      continue;
    }
    if (list) {
      blocks.push(list);
      list = null;
    }
    paragraph.push(heading ? [{ text: heading[1]!.replace(/\*\*/g, ""), strong: true }] : parseInline(line));
  }
  flush();
  return blocks;
}
