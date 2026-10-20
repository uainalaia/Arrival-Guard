import { AiUsageMapper } from "@/application/mappers/AiUsageMapper";
import { EventMapper } from "@/application/mappers/CaseViewMapper";
import { apiRoute } from "@/interfaces/http/route";
import { eventsQuery } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// Bitácora completa redactada, solo para la consola del evaluador.
export const GET = apiRoute({ roles: ["evaluator"], mutating: false, query: eventsQuery }, async ({ actor, query, app }) => {
  const events = await app.readModels.events(actor, query.afterSeq ?? 0);
  const workspace = await app.deps.uow.read.workspaces.get(actor.workspaceId);
  const aiUsage = AiUsageMapper.toDTO(await app.chat.usageSummary(actor));
  return { synthetic: true, virtualNow: workspace?.virtualNow.toISOString() ?? null, faults: workspace?.faults ?? {}, aiUsage, events: events.map(EventMapper.toDTO) };
});
