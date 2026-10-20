import { describe, expect, it } from "vitest";
import { FORBIDDEN_TOOL_PATTERN, ROLE_TOOLS, TOOL_DEFINITIONS, TOOL_INPUTS, toolsForRole } from "@/interfaces/agent/toolCatalog";
import { SYSTEM_PROMPT } from "@/infrastructure/ai/systemPrompt";

function walk(schema: Record<string, unknown>, visit: (node: Record<string, unknown>) => void): void {
  visit(schema);
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  for (const child of Object.values(props ?? {})) walk(child, visit);
}

describe("Herramientas del agente (BUILD_PROMPT 13.3)", () => {
  it("cada esquema es un objeto simple con additionalProperties false y tipos permitidos", () => {
    for (const def of Object.values(TOOL_DEFINITIONS)) {
      expect(def.inputSchema.type).toBe("object");
      walk(def.inputSchema as Record<string, unknown>, (node) => {
        expect(["object", "string", "integer", "boolean"]).toContain(node.type);
        if (node.type === "object") expect(node.additionalProperties).toBe(false);
      });
      const required = (def.inputSchema.required as string[]) ?? [];
      for (const r of required) expect(Object.keys(def.inputSchema.properties as object)).toContain(r);
    }
  });

  it("el modelo no tiene herramientas para aprobar, confirmar, destinatarios, reloj, fallas ni acreditar", () => {
    for (const name of Object.keys(TOOL_DEFINITIONS)) expect([name, FORBIDDEN_TOOL_PATTERN.test(name)]).toEqual([name, false]);
    expect(toolsForRole("evaluator")).toEqual([]);
  });

  it("estudiante y pagador tienen exactamente las herramientas de su rol, y cada una valida con Zod", () => {
    // Las listas exactas de BUILD_PROMPT 13.3.
    expect([...ROLE_TOOLS.student].sort()).toEqual(["compare_routes", "execute_approved_payment", "execute_remittance", "get_case_overview", "get_payment_status", "plan_tuition_payment", "prepare_refund_claim", "prepare_remittance", "project_cash", "reconcile_payment", "request_payer_approval", "submit_refund_claim"]);
    expect([...ROLE_TOOLS.payer].sort()).toEqual(["compare_routes", "get_case_overview", "get_payment_status", "prepare_mandate_change", "prepare_policy_change", "project_cash", "reconcile_payment"]);
    for (const name of [...ROLE_TOOLS.student, ...ROLE_TOOLS.payer]) expect(name in TOOL_INPUTS).toBe(true);
    expect(TOOL_INPUTS.plan_tuition_payment.safeParse({ target_arrival_hours: 48, role: "payer" }).success).toBe(false);
    expect(TOOL_INPUTS.prepare_policy_change.safeParse({ new_max_usd: "2500.5" }).success).toBe(true);
    expect(TOOL_INPUTS.prepare_policy_change.safeParse({ new_max_usd: "2,500" }).success).toBe(false);
    expect(TOOL_INPUTS.execute_approved_payment.safeParse({ plan_id: "not-a-uuid" }).success).toBe(false);
  });

  it("el system prompt es el de 13.4 y no lleva secretos ni configuración", () => {
    expect(SYSTEM_PROMPT.startsWith("You are ArrivalGuard, an AI payment agent running in a SIMULATED environment")).toBe(true);
    expect(SYSTEM_PROMPT).toContain("Retry a payment whose status is UNKNOWN. Reconcile the same attempt.");
    expect(SYSTEM_PROMPT).not.toMatch(/sk-ant-|postgres|DATABASE_URL|SESSION_PEPPER|EVAL_ACCESS_CODE/);
    expect(SYSTEM_PROMPT).not.toContain("—");
  });
});
