import { EvidenceMapper } from "@/application/mappers/EvidenceMapper";
import { apiRoute } from "@/interfaces/http/route";
import { evidenceQuery } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// Expediente del espacio (BUILD_PROMPT 16.6): JSON por defecto, `?format=md` en Markdown. Sin secretos y enmascarado.
export const GET = apiRoute({ roles: ["student", "payer", "evaluator"], mutating: false, query: evidenceQuery }, async ({ actor, query, app }) => {
  const snapshot = await app.evidence.execute(actor);
  if (query.format === "md") {
    return new Response(EvidenceMapper.toMarkdown(snapshot), {
      status: 200,
      headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="arrivalguard-evidence.md"` },
    });
  }
  return EvidenceMapper.toJSON(snapshot);
});
