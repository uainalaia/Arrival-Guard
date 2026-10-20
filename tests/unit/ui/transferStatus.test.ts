import { describe, expect, it } from "vitest";
import { endingOf, refundStatus, remittanceStatus } from "@/ui/finance/transferStatus";
import { decimalFromInput, P1_AVAILABLE, SCENARIO_OPTIONS } from "@/ui/workspace/copy";

describe("Estados visibles de transferencias y devoluciones (UI_UX 9.4)", () => {
  it("la remesa muestra el estado del servidor y, mientras se envía, el del intento", () => {
    const at = { attemptId: "a", statusChangedAt: "2026-10-20T09:00:00.000Z" };
    expect(remittanceStatus({ status: "READY", attempt: null })).toEqual({ pill: "PLAN_READY", label: "Ready to send" });
    expect(remittanceStatus({ status: "APPROVAL_REQUESTED", attempt: null }, "Carlos")).toEqual({ pill: "WAITING_FOR_PAYER", label: "Waiting for Carlos" });
    expect(remittanceStatus({ status: "APPROVED", attempt: null }).label).toBe("Approved");
    expect(remittanceStatus({ status: "EXECUTING", attempt: { ...at, status: "PROVIDER_ACCEPTED" } }).label).toBe("Accepted by provider");
    expect(remittanceStatus({ status: "EXECUTING", attempt: { ...at, status: "UNKNOWN" } }).label).toBe("Checking with the provider");
    expect(remittanceStatus({ status: "DELIVERED", attempt: { ...at, status: "DELIVERED" } })).toEqual({ pill: "DELIVERED", label: "Delivered" });
    expect(remittanceStatus({ status: "BLOCKED", attempt: null }).pill).toBe("BLOCKED");
    expect(remittanceStatus({ status: "FAILED", attempt: null }).label).toBe("Failed, no money left the account");
  });

  it("el reclamo sigue SUBMITTED, UNDER_REVIEW, APPROVED y REFUNDED con su texto", () => {
    expect(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REFUNDED", "REJECTED"].map((status) => refundStatus({ status }).label)).toEqual([
      "Ready to submit",
      "Refund requested",
      "Under review",
      "Approved",
      "Refunded",
      "Refund declined",
    ]);
  });

  it("los destinos se muestran con los 4 últimos dígitos", () => {
    expect(endingOf("•••• 7310")).toBe("ending 7310");
  });
});

describe("Montos en CNY escritos por la estudiante, sin floats", () => {
  it("normaliza a dos decimales y rechaza lo que no es un monto positivo", () => {
    expect(decimalFromInput("2,000")).toBe("2000.00");
    expect(decimalFromInput("CNY 3,000.5")).toBe("3000.50");
    expect(decimalFromInput("0")).toBeNull();
    expect(decimalFromInput("-5")).toBeNull();
    expect(decimalFromInput("1e3")).toBeNull();
  });

  it("con las capacidades P1 activas, la landing ofrece los cinco escenarios", () => {
    expect(P1_AVAILABLE).toBe(true);
    expect(SCENARIO_OPTIONS.map((s) => s.id)).toContain("arrival_remittance");
    expect(SCENARIO_OPTIONS.map((s) => s.id)).toContain("overpayment_refund");
  });
});
