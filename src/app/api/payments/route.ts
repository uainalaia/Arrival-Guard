import { ValidationError } from "@/application/errors/ApplicationError";
import { presentAttempt } from "@/interfaces/http/presenters";
import { JsonResponse, apiRoute } from "@/interfaces/http/route";
import { idempotencyKey, planIdBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// Ejecuta un plan aprobado. Exige Idempotency-Key: misma clave y contenido devuelve lo existente (200).
export const POST = apiRoute({ roles: ["student", "payer"], mutating: true, body: planIdBody }, async ({ actor, body, request, app }) => {
  const key = idempotencyKey.safeParse(request.headers.get("idempotency-key") ?? "");
  if (!key.success) throw new ValidationError("Send an Idempotency-Key header (8 to 128 characters).");
  const result = await app.executeTuition.execute(actor, { planId: body.planId, idempotencyKey: key.data });
  return new JsonResponse(result.replayed ? 200 : 201, {
    synthetic: true,
    replayed: result.replayed,
    attempt: await presentAttempt(app, actor, result.attempt.attempt.id),
  });
});
