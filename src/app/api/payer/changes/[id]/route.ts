import { apiRoute, requireUuid } from "@/interfaces/http/route";

export const dynamic = "force-dynamic";

// Detalle de un cambio preparado por chat, para la pantalla fija de confirmación.
export const GET = apiRoute<undefined, undefined, { id: string }>({ roles: ["payer"], mutating: false }, async ({ actor, params, app }) => {
  const change = await app.readModels.pendingChange(actor, requireUuid(params.id));
  return { synthetic: true, change: { changeId: change.id, kind: change.kind, status: change.status, payload: change.payload, fingerprint: change.fingerprint } };
});
