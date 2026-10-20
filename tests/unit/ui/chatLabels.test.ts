import { describe, expect, it } from "vitest";
import { fallbackDetail, fallbackFromStatus, isFallbackStatus, planPill, provenanceText, SUGGESTIONS } from "@/ui/chat/labels";

describe("Chat: textos armados con datos del servidor (UI_UX 9 y 11.6)", () => {
  it("el estado del plan del turno se muestra como la píldora del dominio, y COMPLETED nunca como acreditado", () => {
    expect(planPill("READY_FOR_APPROVAL")).toBe("PLAN_READY");
    expect(planPill("APPROVAL_REQUESTED")).toBe("WAITING_FOR_PAYER");
    expect(planPill("APPROVED")).toBe("APPROVED");
    expect(planPill("EXECUTING")).toBe("SENDING");
    expect(planPill("COMPLETED")).toBe("WAITING_FOR_UNIVERSITY");
    expect(planPill("NOT_VIABLE")).toBe("BLOCKED");
    expect(planPill("SUPERSEDED")).toBe("DETAILS_NEEDED");
  });

  it("la procedencia dice de dónde viene el dato, con hora virtual", () => {
    expect(provenanceText("INSTITUTION", "2026-10-20T09:42:00.000Z")).toBe("From the university, 09:42 virtual time.");
    expect(provenanceText("PROVIDER", "2026-10-20T09:14:00.000Z")).toBe("From the provider, 09:14 virtual time.");
    expect(provenanceText("SYSTEM", "2026-10-20T09:13:00.000Z")).toBe("From ArrivalGuard, 09:13 virtual time.");
  });

  it("sin asistente (presupuesto, límite, 503 o ruta ausente) se pasa al modo estructurado; un 422 no", () => {
    expect(fallbackFromStatus(429, "AI_BUDGET_EXHAUSTED")).toBe("BUDGET_EXHAUSTED");
    expect(fallbackFromStatus(429, "RATE_LIMITED")).toBe("RATE_LIMITED");
    expect(fallbackFromStatus(503, "PROVIDER_UNAVAILABLE")).toBe("AI_UNAVAILABLE");
    expect(isFallbackStatus(429)).toBe(true);
    expect(isFallbackStatus(503)).toBe(true);
    expect(isFallbackStatus(404)).toBe(true);
    expect(isFallbackStatus(422)).toBe(false);
    expect(isFallbackStatus(401)).toBe(false);
    expect(fallbackDetail("BUDGET_EXHAUSTED")).toContain("budget");
    expect(fallbackDetail("AI_UNAVAILABLE")).toBeNull();
  });

  it("las sugerencias por rol son las de UI_UX 9.6", () => {
    expect(SUGGESTIONS.student).toHaveLength(4);
    expect(SUGGESTIONS.student[0]).toBe("Pay my tuition without touching the arrival reserve");
    expect(SUGGESTIONS.payer).toEqual(["What needs my approval?", "Lower the tuition limit to USD 2,500", "What did Sofía transfer this month?"]);
  });
});
