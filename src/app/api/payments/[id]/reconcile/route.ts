import { presentAttempt } from "@/interfaces/http/presenters";
import { apiRoute, requireUuid } from "@/interfaces/http/route";
import { emptyBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// "Check this payment": concilia el MISMO intento con el proveedor y la institución. Nunca paga de nuevo.
export const POST = apiRoute<Record<string, never>, undefined, { id: string }>(
  { roles: ["student", "payer"], mutating: true, body: emptyBody },
  async ({ actor, params, app }) => {
    const attemptId = requireUuid(params.id);
    await app.reconcile.execute(actor, { attemptId });
    return { synthetic: true, attempt: await presentAttempt(app, actor, attemptId) };
  },
);
