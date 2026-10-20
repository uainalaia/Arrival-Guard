import { MoneyMapper } from "@/application/mappers/MoneyMapper";
import { apiRoute, requireUuid } from "@/interfaces/http/route";
import { confirmChangeBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// Confirma en pantalla fija un cambio de política o de mandato preparado por chat. Solo el pagador.
export const POST = apiRoute<{ fingerprint: string }, undefined, { id: string }>(
  { roles: ["payer"], mutating: true, body: confirmChangeBody },
  async ({ actor, body, params, app }) => {
    const result = await app.confirmPayerChange.execute(actor, { changeId: requireUuid(params.id), fingerprint: body.fingerprint });
    return {
      synthetic: true,
      kind: result.kind,
      invalidatedApprovalIds: result.invalidatedApprovalIds,
      policy: result.policy ? { version: result.policy.version, tuitionLimit: MoneyMapper.toDTO(result.policy.maxTuitionDebit), reserve: MoneyMapper.toDTO(result.policy.reserve) } : null,
      mandate: result.mandate ? { mandateId: result.mandate.id, status: result.mandate.status, periodMax: MoneyMapper.toDTO(result.mandate.periodMax), version: result.mandate.version } : null,
    };
  },
);
