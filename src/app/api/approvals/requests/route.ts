import { presentPlan } from "@/interfaces/http/presenters";
import { apiRoute } from "@/interfaces/http/route";
import { planIdBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// La estudiante pide la aprobación de Carlos: el plan pasa a APPROVAL_REQUESTED.
export const POST = apiRoute({ roles: ["student"], mutating: true, body: planIdBody }, async ({ actor, body, app }) => {
  const record = await app.requestApproval.execute(actor, { planId: body.planId });
  return { synthetic: true, plan: await presentPlan(app, actor, record) };
});
