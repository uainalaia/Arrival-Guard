import { ApprovalMapper } from "@/application/mappers/CaseViewMapper";
import { MoneyMapper } from "@/application/mappers/MoneyMapper";
import { apiRoute, requireUuid } from "@/interfaces/http/route";

export const dynamic = "force-dynamic";

// Pantalla fija de aprobación de una remesa fuera del permiso (solo el pagador). Campos del servidor y su huella.
export const GET = apiRoute<undefined, undefined, { id: string }>({ roles: ["payer"], mutating: false }, async ({ actor, params, app }) => {
  const v = await app.remittanceApproval.view(actor, { remittanceId: requireUuid(params.id) });
  const q = v.remittance.quote;
  return {
    synthetic: true,
    remittanceId: v.remittance.id,
    version: v.remittance.version,
    status: v.remittance.status,
    reasons: v.remittance.reasons,
    purpose: v.remittance.purpose,
    recipientName: v.recipient.displayName,
    recipientMasked: v.recipient.maskedAccount,
    sourceAccountMasked: v.sourceAccountMasked,
    recipientReceives: MoneyMapper.toDTO(v.remittance.net),
    proposedDebit: q ? MoneyMapper.toDTO(q.debit) : null,
    route: q ? { routeId: q.routeId, channel: q.channel, arrivalHours: Math.round(q.arrivalMinutes / 60) } : null,
    validUntil: v.remittance.approvalExpiresAt?.toISOString() ?? null,
    fingerprint: v.fingerprint,
    quoteExpired: v.quoteExpired,
    approval: v.approval ? ApprovalMapper.summary(v.approval) : null,
    virtualNow: v.now.toISOString(),
  };
});
