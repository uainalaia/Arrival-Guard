import { z } from "zod";
import { FAULT_NAMES } from "@/domain/ports/Repositories";
import { SCENARIO_IDS } from "@/infrastructure/scenarios/types";

// Esquemas de la frontera HTTP. Objetos estrictos: un campo de más (por ejemplo "role") es un error 422.

const uuid = z.uuid();
const minor = z.string().regex(/^\d{1,15}$/, "Amounts are whole numbers of cents, as a string");
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/, "Fingerprint must be 64 hex characters");

export const createWorkspaceBody = z.strictObject({
  accessCode: z.string().min(1).max(128),
  scenario: z.enum(SCENARIO_IDS),
});

export const resetBody = z.strictObject({ scenario: z.enum(SCENARIO_IDS) });

export const advanceClockBody = z.strictObject({ minutes: z.number().int().min(1).max(10_080) });

export const faultBody = z.strictObject({
  fault: z.enum(FAULT_NAMES as [string, ...string[]]),
  enabled: z.boolean(),
});

export const planBody = z.strictObject({ targetArrivalHours: z.number().int().min(1).max(720) });

export const compareQuery = z.strictObject({
  purpose: z.enum(["TUITION", "REMITTANCE"]),
  targetArrivalHours: z.coerce.number().int().min(1).max(720),
  netMinor: minor.optional(),
});

export const planIdBody = z.strictObject({ planId: uuid });

export const grantApprovalBody = z.strictObject({
  planId: uuid,
  planVersion: z.number().int().min(1),
  fingerprint,
});

export const idempotencyKey = z.string().regex(/^[A-Za-z0-9:._-]{8,128}$/, "Idempotency-Key must be 8 to 128 characters [A-Za-z0-9:._-]");

export const payerPolicyBody = z
  .strictObject({
    maxDebitMinor: minor.optional(),
    reserveMinor: minor.optional(),
    fingerprint,
  })
  .refine((b) => b.maxDebitMinor !== undefined || b.reserveMinor !== undefined, { message: "Send maxDebitMinor, reserveMinor or both" });

export const revokeBody = z
  .strictObject({ approvalId: uuid.optional(), mandateId: uuid.optional() })
  .refine((b) => (b.approvalId === undefined) !== (b.mandateId === undefined), { message: "Send exactly one of approvalId or mandateId" });

export const confirmChangeBody = z.strictObject({ fingerprint });

export const cashQuery = z.strictObject({ arrivalExpensesMinor: minor.optional() });

export const emptyBody = z.strictObject({});

export const chatBody = z.strictObject({ message: z.string().min(1).max(2000) });

/** T3: solo el monto neto en CNY y el plazo. El destino es siempre la cuenta local de la estudiante. */
export const remittanceBody = z.strictObject({
  netAmount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "Use a decimal string like 2000.00"),
  targetArrivalHours: z.number().int().min(1).max(720),
});

export const approveRemittanceBody = z.strictObject({ version: z.number().int().min(1), fingerprint });

/** T7: solo la obligación. Monto (el exceso verificado) y destino (la cuenta de origen) los fija el servidor. */
export const refundClaimBody = z.strictObject({ obligationId: uuid });

export const evidenceQuery = z.strictObject({ format: z.enum(["json", "md"]).optional() });

export const eventsQuery = z.strictObject({ afterSeq: z.coerce.number().int().min(0).optional() });

export const uuidParam = uuid;
