import { MoneyMapper } from "@/application/mappers/MoneyMapper";
import { Money } from "@/domain/money/Money";
import { policyFingerprint } from "@/application/services/PayerPolicyService";
import { apiRoute } from "@/interfaces/http/route";
import { payerPolicyBody } from "@/interfaces/http/schemas";

export const dynamic = "force-dynamic";

// T6 desde el panel: solo el pagador. La huella de la política vigente evita cambios sobre datos viejos.
export const POST = apiRoute({ roles: ["payer"], mutating: true, body: payerPolicyBody }, async ({ actor, body, app }) => {
  const result = await app.changePolicy.execute(actor, {
    maxTuitionDebit: body.maxDebitMinor !== undefined ? Money.fromMinorString("USD", body.maxDebitMinor) : undefined,
    reserve: body.reserveMinor !== undefined ? Money.fromMinorString("USD", body.reserveMinor) : undefined,
    expectedFingerprint: body.fingerprint,
  });
  return {
    synthetic: true,
    policy: {
      version: result.policy.version,
      tuitionLimit: MoneyMapper.toDTO(result.policy.maxTuitionDebit),
      reserve: MoneyMapper.toDTO(result.policy.reserve),
      fingerprint: policyFingerprint(result.policy, app.deps.hasher),
    },
    invalidatedApprovalIds: result.invalidatedApprovalIds,
    planStatus: result.plan?.record.plan.status ?? null,
  };
});
