import { RevokeMapper } from "@/application/mappers/RevokeMapper";
import { apiRoute } from "@/interfaces/http/route";
import { revokeBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// T6, revocar. El mensaje depende del estado real (RevokeMapper): si el pago ya salió, se informa que revocar no
// garantiza detenerlo; si no hay pago, nunca se afirma que salió.
export const POST = apiRoute({ roles: ["payer"], mutating: true, body: revokeBody }, async ({ actor, body, app }) => {
  return RevokeMapper.toDTO(await app.revoke.execute(actor, { approvalId: body.approvalId, mandateId: body.mandateId }));
});
