import { ApprovalMapper } from "@/application/mappers/CaseViewMapper";
import { JsonResponse, apiRoute } from "@/interfaces/http/route";
import { grantApprovalBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// Solo el pagador aprueba: 403 para cualquier otro rol; 409 si la versión o la huella no coinciden.
export const POST = apiRoute({ roles: ["payer"], mutating: true, body: grantApprovalBody }, async ({ actor, body, app }) => {
  const approval = await app.grantApproval.execute(actor, { planId: body.planId, planVersion: body.planVersion, fingerprint: body.fingerprint });
  return new JsonResponse(201, { synthetic: true, approval: ApprovalMapper.summary(approval) });
});
