import { describe, expect, it } from "vitest";
import { REASON_CODES } from "@/domain/policy/ReasonCode";
import { channelName } from "@/ui/finance/channels";
import { absMoney, minMoney, permille, subtractMoney, ticksOf } from "@/ui/finance/proportion";
import { reasonCopy, securityCategoryLabel } from "@/ui/finance/reasons";
import { pillText } from "@/ui/finance/StatusPill";

const usd = (minor: string) => ({ currency: "USD" as const, minor });
const cny = (minor: string) => ({ currency: "CNY" as const, minor });

// Contexto del escenario base (BUILD_PROMPT 6): los textos deben salir iguales a UI_UX 9.5.
const base = {
  invoiceNet: cny("2000000"),
  limit: usd("290000"),
  reserve: usd("180000"),
  available: usd("34000"),
  mandateUsed: usd("28800"),
  mandateMax: usd("60000"),
  verifiedExcess: cny("50000"),
  institution: "Arrival University",
};

describe("Textos de razones (UI_UX 9.5)", () => {
  it("con los datos del escenario base reproducen las frases de UI_UX", () => {
    expect(reasonCopy("DEADLINE_MISSED", { ...base, routeHours: 72, targetHours: 48 })).toEqual({ title: "Arrives too late", detail: "Takes 72 h. You need it within 48 h." });
    expect(reasonCopy("NET_INSUFFICIENT", { ...base, routeNet: cny("1980000") })).toEqual({
      title: "University would receive less",
      detail: "Delivers CNY 19,800.00. The invoice is CNY 20,000.00.",
    });
    expect(reasonCopy("RECEIVER_NOT_ALLOWED", base)).toEqual({ title: "Not the university's registered account", detail: "Payments go only to the account on the invoice." });
    expect(reasonCopy("CHANNEL_NOT_ALLOWED", base)).toEqual({ title: "Channel not accepted", detail: "Arrival University does not accept this payment channel." });
    expect(reasonCopy("QUOTE_EXPIRED", base)).toEqual({ title: "Price expired", detail: "Getting a fresh price for the same route." });
    expect(reasonCopy("EXCEEDS_PAYER_MAX", base)).toEqual({ title: "Above the tuition limit", detail: "Carlos set a limit of USD 2,900.00 for this tuition." });
    expect(reasonCopy("BREAKS_RESERVE", base)).toEqual({ title: "Would use the arrival reserve", detail: "USD 1,800.00 stays aside for the first weeks." });
    expect(reasonCopy("INSUFFICIENT_FUNDS", base)).toEqual({ title: "Not enough available funds", detail: "Available now: USD 340.00." });
    expect(reasonCopy("APPROVAL_MISSING", base)).toEqual({ title: "Needs Carlos's approval", detail: "Send the request. Carlos approves on his own screen." });
    expect(reasonCopy("APPROVAL_INVALID", base)).toEqual({ title: "Approval no longer matches", detail: "The plan changed. Carlos needs to approve the new one." });
    expect(reasonCopy("APPROVAL_EXPIRED", base)).toEqual({ title: "Approval expired", detail: "Request a new approval to continue." });
    expect(reasonCopy("APPROVAL_REVOKED", base)).toEqual({ title: "Approval revoked", detail: "Carlos revoked this approval." });
    expect(reasonCopy("EXCEEDS_MANDATE_PERIOD_LIMIT", base)).toEqual({
      title: "Over this month's transfer limit",
      detail: "USD 288.00 of USD 600.00 used. Carlos needs to approve this one.",
    });
    expect(reasonCopy("RECIPIENT_NOT_VERIFIED", base)).toEqual({ title: "Recipient not verified", detail: "Only accounts Carlos has verified can receive transfers." });
    expect(reasonCopy("RECIPIENT_ACCOUNT_NOT_OPEN", base)).toEqual({ title: "Local account not open yet", detail: "Transfers start once Sofía's account in China is open." });
    expect(reasonCopy("CONDITIONAL_FUNDS_NOT_AVAILABLE", base)).toEqual({ title: "Scholarship not received yet", detail: "It is shown apart and not counted as available money." });
    expect(reasonCopy("REFUND_EXCEEDS_VERIFIED_EXCESS", base)).toEqual({ title: "More than the overpayment", detail: "The verified overpayment is CNY 500.00." });
    expect(reasonCopy("REFUND_DESTINATION_FIXED", base)).toEqual({ title: "Refunds return to the paying account", detail: "They cannot be sent to another account." });
    expect(reasonCopy("ACTIVE_ATTEMPT_EXISTS", base)).toEqual({ title: "A payment is already on its way", detail: "Check that payment instead of sending another." });
    expect(reasonCopy("ROLE_NOT_ALLOWED", base)).toEqual({ title: "Only Carlos can do this", detail: "Ask Carlos to do it from his view." });
    expect(reasonCopy("OUT_OF_SCOPE", base)).toEqual({
      title: "Outside what ArrivalGuard does",
      detail: "It can plan and send education payments, transfers for arrival costs and refund requests.",
    });
  });

  it("las cifras salen del contexto, no de valores fijos", () => {
    expect(reasonCopy("EXCEEDS_PAYER_MAX", { limit: usd("250000") }).detail).toBe("Carlos set a limit of USD 2,500.00 for this tuition.");
    expect(reasonCopy("DEADLINE_MISSED", { routeHours: 24, targetHours: 6 }).detail).toBe("Takes 24 h. You need it within 6 h.");
    expect(reasonCopy("APPROVAL_INVALID", { payerName: "Ana" }).detail).toBe("The plan changed. Ana needs to approve the new one.");
  });

  it("sin datos dice la frase sin cifra, y todo código de la enumeración tiene texto propio", () => {
    expect(reasonCopy("EXCEEDS_PAYER_MAX").detail).not.toMatch(/\d/);
    expect(reasonCopy("DEADLINE_MISSED").detail).not.toMatch(/\d/);
    for (const code of REASON_CODES) expect(reasonCopy(code).title, code).not.toBe("Blocked");
    expect(reasonCopy("SOMETHING_NEW")).toEqual({ title: "Blocked", detail: "SOMETHING_NEW" });
  });

  it("categorías de seguridad y nombres de canal", () => {
    expect(securityCategoryLabel("INDUCED_TRANSFER")).toBe("Blocked: possible induced transfer");
    expect(securityCategoryLabel("Blocked: custom")).toBe("Blocked: custom");
    expect(channelName("EDU_PAY_PARTNER")).toBe("Edu Pay Partner");
    expect(channelName("EXPRESS_EDU")).toBe("Express Edu");
    expect(channelName("FX_BROKER_FAST")).toBe("FX Broker Fast");
  });

  it("estados visibles con los textos de UI_UX 9.4", () => {
    expect(pillText("WAITING_FOR_PAYER")).toBe("Waiting for Carlos");
    expect(pillText("UNCERTAIN")).toBe("Checking with the provider");
    expect(pillText("PROVIDER_ACCEPTED")).toBe("Accepted by provider");
    expect(pillText("CREDITED")).toBe("Credited by the university");
    expect(pillText("FAILED_NO_DEBIT")).toBe("Failed, no money left the account");
  });
});

describe("Proporciones sin punto flotante para barras y medidores", () => {
  it("décimas de porcentaje y marcas calculadas con BigInt", () => {
    expect(permille(usd("290000"), usd("500000"))).toBe(580);
    expect(permille(usd("0"), usd("500000"))).toBe(0);
    expect(permille(usd("100"), usd("0"))).toBe(0);
    expect(permille(usd("900000"), usd("500000"))).toBe(1000);
    // USD 288.00 de 600.00 son 28.8 marcas de 60: se redondea a 29 (DESIGN_PLAN 8.3).
    expect(ticksOf(usd("28800"), usd("60000"), 60)).toBe(29);
    expect(ticksOf(usd("72000"), usd("60000"), 60)).toBe(60);
  });

  it("restas y comparaciones en unidades menores", () => {
    expect(subtractMoney(usd("214000"), usd("250000"))).toEqual(usd("-36000"));
    expect(absMoney(usd("-36000"))).toEqual(usd("36000"));
    expect(minMoney(usd("214000"), usd("250000"))).toEqual(usd("214000"));
    expect(() => subtractMoney(usd("1"), cny("1"))).toThrow();
  });
});
