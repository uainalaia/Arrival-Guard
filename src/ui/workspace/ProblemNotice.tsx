import { BlockedNotice, type ReasonContext } from "@/ui/finance";
import type { Problem } from "./actions";

/** Bloqueos y errores del servidor con su razón y el siguiente paso, nunca una pared de texto (UI_UX 10). */
export function ProblemNotice({ problem, ctx }: { problem: Problem | null; ctx?: ReasonContext }) {
  if (!problem) return null;
  if (problem.kind === "reasons") {
    return (
      <div className="animate-ag-fade-in-base space-y-2" role="alert">
        {problem.reasons.map((code) => (
          <BlockedNotice key={code} code={code} ctx={ctx} tone={code === "ACTIVE_ATTEMPT_EXISTS" || code === "QUOTE_EXPIRED" ? "wait" : "stop"} />
        ))}
      </div>
    );
  }
  return (
    <div className="animate-ag-fade-in-base" role="alert">
      <BlockedNotice code="MESSAGE" title={problem.title} detail={problem.detail} tone={problem.tone} />
    </div>
  );
}
