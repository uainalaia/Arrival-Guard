import { ValidationError } from "@/application/errors/ApplicationError";
import { RefundMapper } from "@/application/mappers/CaseViewMapper";
import { JsonResponse, apiRoute, requireUuid } from "@/interfaces/http/route";
import { emptyBody, idempotencyKey } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// T7: envía el reclamo a la institución con Idempotency-Key. El seguimiento hasta REFUNDED avanza con la hora virtual.
export const POST = apiRoute<Record<string, never>, undefined, { id: string }>(
  { roles: ["student"], mutating: true, body: emptyBody },
  async ({ actor, params, request, app }) => {
    const key = idempotencyKey.safeParse(request.headers.get("idempotency-key") ?? "");
    if (!key.success) throw new ValidationError("Send an Idempotency-Key header (8 to 128 characters).");
    const result = await app.submitRefund.execute(actor, { claimId: requireUuid(params.id), idempotencyKey: key.data });
    const account = await app.deps.uow.read.accounts.getByKind(actor.workspaceId, "PAYER_USD");
    return new JsonResponse(result.replayed ? 200 : 201, { synthetic: true, replayed: result.replayed, claim: RefundMapper.toDTO(result.claim, account?.toProps().maskedNumber ?? "••••") });
  },
);
