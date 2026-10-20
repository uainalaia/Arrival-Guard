import { Fragment } from "react";
import { parseAssistantText, type Inline } from "./assistantMarkdown";

/** Texto del asistente como elementos de React (sin innerHTML): párrafos, listas y negritas. */
export function AssistantText({ text }: { text: string }) {
  const blocks = parseAssistantText(text);
  const inline = (parts: Inline[]) => parts.map((p, i) => (p.strong ? <strong key={i} className="font-semibold">{p.text}</strong> : <Fragment key={i}>{p.text}</Fragment>));
  return (
    <div className="max-w-[68ch] space-y-2 text-[15px] leading-[24px] text-ink [overflow-wrap:anywhere]">
      <span className="sr-only">ArrivalGuard: </span>
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
