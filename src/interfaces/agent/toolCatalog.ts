import { z } from "zod";
import type { AgentToolDefinition } from "@/application/ports/AgentPorts";
import type { ActorRole } from "@/domain/events/DomainEvent";

// Herramientas por rol (BUILD_PROMPT 13.3): strict, esquemas simples y additionalProperties false; los montos van
// como strings decimales ("2860.00") y la semántica se valida con Zod en el servidor. Nunca son herramientas:
// aprobar, confirmar cambios, agregar destinatarios, avanzar el reloj, inyectar fallas ni marcar acreditado.

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const uuidProp = (description: string) => ({ type: "string", description });
const hours = { type: "integer", description: "Hours from now (virtual time) by which the money must arrive, 1 to 720." };
const usd = (description: string) => ({ type: "string", description: `${description} Decimal string in USD, for example "2500.00".` });

export const TOOL_DEFINITIONS: Readonly<Record<string, AgentToolDefinition>> = {
  get_case_overview: {
    name: "get_case_overview",
    description: "Returns the current case state for this role: tuition invoice, family funds, plan, payment status and permissions. Read-only.",
    inputSchema: obj({}),
  },
  plan_tuition_payment: {
    name: "plan_tuition_payment",
    description: "Plans (or re-plans) the tuition payment for the arrival deadline. Compares routes and selects the lowest-cost route that meets every rule. Moves no money.",
    inputSchema: obj({ target_arrival_hours: hours }, ["target_arrival_hours"]),
  },
  compare_routes: {
    name: "compare_routes",
    description: "Compares tuition routes for a deadline without creating a plan, approval or payment.",
    inputSchema: obj({ purpose: { type: "string", enum: ["TUITION"] }, target_arrival_hours: hours }, ["purpose", "target_arrival_hours"]),
  },
  request_payer_approval: {
    name: "request_payer_approval",
    description: "Sends the current plan to the payer for approval. The payer approves only on his own fixed screen, never in the chat.",
    inputSchema: obj({ plan_id: uuidProp("Plan id from the case state.") }, ["plan_id"]),
  },
  execute_approved_payment: {
    name: "execute_approved_payment",
    description: "Sends the tuition payment for a plan the payer already approved. The server checks the approval, limits and reserve. Never use it to retry an uncertain payment: reconcile instead.",
    inputSchema: obj({ plan_id: uuidProp("Approved plan id from the case state.") }, ["plan_id"]),
  },
  get_payment_status: {
    name: "get_payment_status",
    description: "Returns the payment status with its source (provider or university). Without attempt_id, the latest tuition payment.",
    inputSchema: obj({ attempt_id: uuidProp("Payment attempt id, optional.") }),
  },
  reconcile_payment: {
    name: "reconcile_payment",
    description: "Checks the SAME payment with the provider and the university using its idempotency key. Never creates a new payment.",
    inputSchema: obj({ attempt_id: uuidProp("Payment attempt id from the case state.") }, ["attempt_id"]),
  },
  project_cash: {
    name: "project_cash",
    description: "Projects cash per currency after planned payments. Conditional income such as an unpaid scholarship is shown apart and not counted.",
    inputSchema: obj({ arrival_expenses_usd: usd("Optional estimate of arrival expenses.") }),
  },
  prepare_remittance: {
    name: "prepare_remittance",
    description: "Prepares a transfer in CNY to the student's own verified local account for arrival expenses. Within the standing permission it is ready to send; above it, it escalates to the payer. Moves no money.",
    inputSchema: obj(
      {
        net_amount: { type: "string", description: 'Amount the local account must receive, decimal string, for example "2000.00".' },
        currency: { type: "string", enum: ["CNY"] },
        purpose: { type: "string", enum: ["ARRIVAL_EXPENSES"] },
        recipient_id: { type: "string", description: "Optional. Only the student's own local account can receive transfers." },
        target_arrival_hours: hours,
      },
      ["net_amount", "currency", "purpose", "target_arrival_hours"],
    ),
  },
  execute_remittance: {
    name: "execute_remittance",
    description: "Sends a prepared arrival transfer. The server re-checks the standing permission at send time; if it no longer fits, it escalates to the payer instead of sending.",
    inputSchema: obj({ remittance_id: uuidProp("Remittance id from a prepare_remittance result or the case state.") }, ["remittance_id"]),
  },
  prepare_refund_claim: {
    name: "prepare_refund_claim",
    description: "Prepares a refund request for the verified overpayment of an obligation. The amount is the verified excess and the money returns only to the paying account.",
    inputSchema: obj({ obligation_id: uuidProp("Obligation id from the case state.") }, ["obligation_id"]),
  },
  submit_refund_claim: {
    name: "submit_refund_claim",
    description: "Submits a prepared refund request to the university. Its status then advances with virtual time.",
    inputSchema: obj({ claim_id: uuidProp("Refund claim id from prepare_refund_claim.") }, ["claim_id"]),
  },
  prepare_policy_change: {
    name: "prepare_policy_change",
    description: "Prepares a change to the tuition limit or the arrival reserve. It does NOT apply it: the payer confirms it on a fixed screen.",
    inputSchema: obj({ new_max_usd: usd("New tuition limit, optional."), new_reserve_usd: usd("New arrival reserve, optional.") }),
  },
  prepare_mandate_change: {
    name: "prepare_mandate_change",
    description: "Prepares a change to (or the revocation of) the standing permission for arrival transfers. It does NOT apply it: the payer confirms it on a fixed screen.",
    inputSchema: obj({ mandate_id: uuidProp("Standing permission id from the case state."), new_period_max_usd: usd("New period limit, optional."), revoke: { type: "boolean" } }, ["mandate_id"]),
  },
};

export const ROLE_TOOLS: Readonly<Record<"student" | "payer", readonly string[]>> = {
  student: [
    "get_case_overview",
    "plan_tuition_payment",
    "compare_routes",
    "request_payer_approval",
    "execute_approved_payment",
    "get_payment_status",
    "reconcile_payment",
    "project_cash",
    "prepare_remittance",
    "execute_remittance",
    "prepare_refund_claim",
    "submit_refund_claim",
  ],
  payer: ["get_case_overview", "get_payment_status", "reconcile_payment", "project_cash", "compare_routes", "prepare_policy_change", "prepare_mandate_change"],
};

/** Nombres que nunca existen como herramienta, aunque el modelo los invente (13.3). */
export const FORBIDDEN_TOOL_PATTERN = /(^|_)(approve|confirm|grant|authori[sz]e)(_|$)|recipient|beneficiary|clock|fault|(^|_)credit|mark_|set_limit|add_account/i;

export function toolsForRole(role: ActorRole): AgentToolDefinition[] {
  if (role !== "student" && role !== "payer") return [];
  return ROLE_TOOLS[role].map((name) => TOOL_DEFINITIONS[name]!);
}

// Validación semántica de cada entrada (Zod, objetos estrictos).
const uuid = z.uuid();
const decimalUsd = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "Use a decimal string like 2500.00");

export const TOOL_INPUTS = {
  get_case_overview: z.strictObject({}),
  plan_tuition_payment: z.strictObject({ target_arrival_hours: z.number().int().min(1).max(720) }),
  compare_routes: z.strictObject({ purpose: z.literal("TUITION"), target_arrival_hours: z.number().int().min(1).max(720) }),
  request_payer_approval: z.strictObject({ plan_id: uuid }),
  execute_approved_payment: z.strictObject({ plan_id: uuid }),
  get_payment_status: z.strictObject({ attempt_id: uuid.optional() }),
  reconcile_payment: z.strictObject({ attempt_id: uuid }),
  project_cash: z.strictObject({ arrival_expenses_usd: decimalUsd.optional() }),
  prepare_policy_change: z
    .strictObject({ new_max_usd: decimalUsd.optional(), new_reserve_usd: decimalUsd.optional() })
    .refine((v) => v.new_max_usd !== undefined || v.new_reserve_usd !== undefined, { message: "Say what should change" }),
  prepare_mandate_change: z.strictObject({ mandate_id: uuid, new_period_max_usd: decimalUsd.optional(), revoke: z.boolean().optional() }),
  prepare_remittance: z.strictObject({
    net_amount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "Use a decimal string like 2000.00"),
    currency: z.literal("CNY"),
    purpose: z.literal("ARRIVAL_EXPENSES"),
    recipient_id: z.string().max(64).optional(),
    target_arrival_hours: z.number().int().min(1).max(720),
  }),
  execute_remittance: z.strictObject({ remittance_id: uuid }),
  prepare_refund_claim: z.strictObject({ obligation_id: uuid }),
  submit_refund_claim: z.strictObject({ claim_id: uuid }),
} as const;

export type ToolName = keyof typeof TOOL_INPUTS;

/** Etiquetas de actividad que muestra la interfaz (las genera el servidor, no el modelo). */
export const ACTIVITY_LABELS: Readonly<Record<ToolName, string>> = {
  get_case_overview: "Reading the case",
  plan_tuition_payment: "Checking quotes",
  compare_routes: "Comparing routes",
  request_payer_approval: "Requesting Carlos's approval",
  execute_approved_payment: "Validating the approval and sending",
  get_payment_status: "Checking the payment status",
  reconcile_payment: "Checking with the provider",
  project_cash: "Projecting your funds",
  prepare_policy_change: "Preparing the change",
  prepare_mandate_change: "Preparing the change",
  prepare_remittance: "Validating limits",
  execute_remittance: "Sending the transfer",
  prepare_refund_claim: "Checking with the university",
  submit_refund_claim: "Submitting the refund request",
};
