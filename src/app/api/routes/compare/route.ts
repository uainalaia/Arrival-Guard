import { ValidationError } from "@/application/errors/ApplicationError";
import { RouteMapper } from "@/application/mappers/CaseViewMapper";
import { apiRoute } from "@/interfaces/http/route";
import { compareQuery } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// T5: comparar rutas sin efectos (no crea plan, permiso, intento ni débito).
export const GET = apiRoute({ roles: ["student", "payer"], mutating: false, query: compareQuery }, async ({ actor, query, app }) => {
  if (query.purpose !== "TUITION") throw new ValidationError("Remittance comparison is available in the arrival transfers flow.");
  const result = await app.compareRoutes.tuition(actor, { targetArrivalHours: query.targetArrivalHours });
  const recipients = await app.deps.uow.read.recipients.list(actor.workspaceId);
  const university = recipients.find((r) => r.kind === "INSTITUTION");
  return { synthetic: true, purpose: query.purpose, targetArrivalHours: query.targetArrivalHours, routes: RouteMapper.routingToDTO(result, recipients, university?.id ?? "") };
});
