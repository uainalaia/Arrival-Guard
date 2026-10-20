import { tuitionDebitReasons, type FundsSnapshot } from "../cash/CashInvariants";
import { Money } from "../money/Money";
import type { ReasonCode } from "../policy/ReasonCode";
import type { TuitionApprovalPayload } from "./ApprovalPayload";

/**
 * Campos cuyo cambio invalida una aprobación (BUILD_PROMPT 8.4): obligación o su versión, ruta o canal,
 * receptor, cuenta de origen, neto (incluye moneda) y referencia. Un cambio de objetivo que no obliga a otra
 * ruta no aparece aquí y no invalida.
 */
export const MATERIAL_FIELDS = [
  "obligationId",
  "obligationVersion",
  "routeId",
  "channel",
  "receiverId",
  "sourceAccountId",
  "netAmount",
  "reference",
] as const;
export type MaterialField = (typeof MATERIAL_FIELDS)[number];

export function materialChanges(previous: TuitionApprovalPayload, next: TuitionApprovalPayload): MaterialField[] {
  return MATERIAL_FIELDS.filter((field) => {
    const a = previous[field];
    const b = next[field];
    if (typeof a === "object" && typeof b === "object") return a.currency !== b.currency || a.minor !== b.minor;
    return a !== b;
  });
}

/** Razones por las que un plan aprobado ya no cumple una política nueva del pagador (vacío si cumple). */
export function policyChangeReasons(
  approved: TuitionApprovalPayload,
  newPolicy: { readonly maxTuitionDebit: Money; readonly reserve: Money },
  funds: FundsSnapshot,
  committedToObligation: Money,
): ReasonCode[] {
  return tuitionDebitReasons({
    debit: Money.fromJSON(approved.proposedDebit),
    funds,
    reserve: newPolicy.reserve,
    maxTuitionDebit: newPolicy.maxTuitionDebit,
    committedToObligation,
  });
}
