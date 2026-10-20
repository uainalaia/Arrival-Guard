/** Enumeración cerrada de códigos de razón (BUILD_PROMPT 8.1). Los textos para el usuario viven en la interfaz (UI_UX 9.5). */
export const REASON_CODES = [
  "DEADLINE_MISSED",
  "NET_INSUFFICIENT",
  "RECEIVER_NOT_ALLOWED",
  "CHANNEL_NOT_ALLOWED",
  "QUOTE_EXPIRED",
  "EXCEEDS_PAYER_MAX",
  "BREAKS_RESERVE",
  "INSUFFICIENT_FUNDS",
  "OBLIGATION_NOT_PENDING",
  "ACTIVE_ATTEMPT_EXISTS",
  "APPROVAL_MISSING",
  "APPROVAL_INVALID",
  "APPROVAL_EXPIRED",
  "APPROVAL_REVOKED",
  "MANDATE_MISSING",
  "MANDATE_REVOKED",
  "MANDATE_EXPIRED",
  "EXCEEDS_MANDATE_PERIOD_LIMIT",
  "RECIPIENT_NOT_VERIFIED",
  "RECIPIENT_ACCOUNT_NOT_OPEN",
  "CONDITIONAL_FUNDS_NOT_AVAILABLE",
  "REFUND_EXCEEDS_VERIFIED_EXCESS",
  "REFUND_DESTINATION_FIXED",
  "TARGET_LATER_THAN_DUE_DATE",
  "OUT_OF_SCOPE",
  "ROLE_NOT_ALLOWED",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as readonly string[]).includes(value);
}

/** Une listas de razones sin repetir y en el orden de la enumeración (salida reproducible). */
export function sortReasons(reasons: Iterable<ReasonCode>): ReasonCode[] {
  const set = new Set(reasons);
  return REASON_CODES.filter((code) => set.has(code));
}
