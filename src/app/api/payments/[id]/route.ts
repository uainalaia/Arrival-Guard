import { presentAttempt } from "@/interfaces/http/presenters";
import { apiRoute, requireUuid } from "@/interfaces/http/route";

export const dynamic = "force-dynamic";

// T2: estado del intento con su procedencia. Un id de otro espacio da 404 sin revelar si existe.
export const GET = apiRoute<undefined, undefined, { id: string }>({ roles: ["student", "payer"], mutating: false }, async ({ actor, params, app }) => {
  return { synthetic: true, attempt: await presentAttempt(app, actor, requireUuid(params.id)) };
});
