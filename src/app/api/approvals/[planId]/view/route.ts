import { ApprovalMapper } from "@/application/mappers/CaseViewMapper";
import { apiRoute, requireUuid } from "@/interfaces/http/route";

export const dynamic = "force-dynamic";

// Pantalla fija de aprobación: campos del servidor y huella. El texto del modelo nunca aparece aquí.
export const GET = apiRoute<undefined, undefined, { planId: string }>({ roles: ["payer"], mutating: false }, async ({ actor, params, app }) => {
  const view = await app.approvalView.execute(actor, { planId: requireUuid(params.planId) });
  return ApprovalMapper.viewToDTO(view);
});
