import { RefundMapper } from "@/application/mappers/CaseViewMapper";
import { JsonResponse, apiRoute } from "@/interfaces/http/route";
import { refundClaimBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// T7: prepara el reclamo con el exceso verificado y destino fijo en la cuenta de origen (A2).
export const POST = apiRoute({ roles: ["student"], mutating: true, body: refundClaimBody }, async ({ actor, body, app }) => {
  const claim = await app.prepareRefund.execute(actor, { obligationId: body.obligationId });
  const account = await app.deps.uow.read.accounts.getByKind(actor.workspaceId, "PAYER_USD");
  return new JsonResponse(201, { synthetic: true, claim: RefundMapper.toDTO(claim, account?.toProps().maskedNumber ?? "••••") });
});
