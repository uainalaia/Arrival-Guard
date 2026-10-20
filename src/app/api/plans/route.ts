import { presentPlan } from "@/interfaces/http/presenters";
import { JsonResponse, apiRoute } from "@/interfaces/http/route";
import { planBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// T1, primer paso: plan con el motor de políticas. NOT_VIABLE devuelve 200 con sus razones (no es un error).
export const POST = apiRoute({ roles: ["student"], mutating: true, body: planBody }, async ({ actor, body, app }) => {
  const change = await app.planTuition.execute(actor, { targetArrivalHours: body.targetArrivalHours });
  return new JsonResponse(201, {
    synthetic: true,
    outcome: change.outcome,
    invalidatedApprovalIds: change.invalidatedApprovalIds,
    changedFields: change.materialFields,
    plan: await presentPlan(app, actor, change.record),
  });
});
