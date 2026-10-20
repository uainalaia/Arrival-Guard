import { ValidationError } from "@/application/errors/ApplicationError";
import { presentAttempt, presentRemittance } from "@/interfaces/http/presenters";
import { JsonResponse, apiRoute, requireUuid } from "@/interfaces/http/route";
import { emptyBody, idempotencyKey } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// T3: ejecuta dentro del permiso permanente o devuelve NEEDS_PAYER_APPROVAL (BUILD_PROMPT 11).
export const POST = apiRoute<Record<string, never>, undefined, { id: string }>(
  { roles: ["student"], mutating: true, body: emptyBody },
  async ({ actor, params, request, app }) => {
    const key = idempotencyKey.safeParse(request.headers.get("idempotency-key") ?? "");
    if (!key.success) throw new ValidationError("Send an Idempotency-Key header (8 to 128 characters).");
    const remittanceId = requireUuid(params.id);
    const result = await app.executeRemittance.execute(actor, { remittanceId, idempotencyKey: key.data });
    const remittance = await presentRemittance(app, actor, remittanceId);
    if (result.outcome === "NEEDS_PAYER_APPROVAL") return { synthetic: true, outcome: "NEEDS_PAYER_APPROVAL", remittance };
    return new JsonResponse(result.replayed ? 200 : 201, {
      synthetic: true,
      outcome: "SENT",
      replayed: result.replayed,
      remittance,
      attempt: await presentAttempt(app, actor, result.attempt.attempt.id),
    });
  },
);
