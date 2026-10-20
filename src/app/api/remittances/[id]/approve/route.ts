import { ApprovalMapper } from "@/application/mappers/CaseViewMapper";
import { JsonResponse, apiRoute, requireUuid } from "@/interfaces/http/route";
import { approveRemittanceBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// Solo el pagador: aprobación puntual con la huella que vio en la pantalla fija. 409 si la versión o la huella no coinciden.
export const POST = apiRoute<{ version: number; fingerprint: string }, undefined, { id: string }>(
  { roles: ["payer"], mutating: true, body: approveRemittanceBody },
  async ({ actor, body, params, app }) => {
    const approval = await app.remittanceApproval.grant(actor, { remittanceId: requireUuid(params.id), version: body.version, fingerprint: body.fingerprint });
    return new JsonResponse(201, { synthetic: true, approval: ApprovalMapper.summary(approval) });
  },
);
