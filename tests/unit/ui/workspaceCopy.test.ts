import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, formatElapsed, formatVirtual, formatWhen, minutesBetween } from "@/ui/format/time";
import { eventDetail, eventGroup, parseUsdToMinor, sealCode } from "@/ui/workspace/copy";

describe("Hora virtual en la interfaz (UI_UX 6.3)", () => {
  it("formatea en UTC como Tue 20 Oct, 09:00, sin depender de la zona del navegador", () => {
    expect(formatVirtual("2026-10-20T09:00:00.000Z")).toBe("Tue 20 Oct, 09:00");
    expect(formatVirtual("2026-10-22T09:00:00.000Z")).toBe("Thu 22 Oct, 09:00");
    expect(formatClock("2026-10-20T11:14:00.000Z")).toBe("11:14");
  });

  it("diferencias y duraciones con el formato de los exportes", () => {
    expect(formatElapsed(0)).toBe("+0 h");
    expect(formatElapsed(2)).toBe("+2 min");
    expect(formatElapsed(134)).toBe("+2 h 14 min");
    expect(formatElapsed(360)).toBe("+6 h");
    expect(formatDuration(48 * 60)).toBe("48 h");
    expect(minutesBetween("2026-10-20T09:00:00.000Z", "2026-10-22T09:00:00.000Z")).toBe(2880);
    expect(formatWhen("2026-10-20T11:14:00.000Z", "2026-10-20T09:00:00.000Z")).toBe("11:14");
    expect(formatWhen("2026-10-21T09:00:00.000Z", "2026-10-20T09:00:00.000Z")).toBe("Wed 21 Oct, 09:00");
  });
});

describe("Montos que escribe el pagador, sin punto flotante", () => {
  it("convierte dólares escritos a unidades menores como string", () => {
    expect(parseUsdToMinor("2500")).toBe("250000");
    expect(parseUsdToMinor("2,500.00")).toBe("250000");
    expect(parseUsdToMinor("USD 2,900.5")).toBe("290050");
    expect(parseUsdToMinor("0.07")).toBe("7");
    expect(parseUsdToMinor("1800.10")).toBe("180010");
  });

  it("rechaza lo que no es un monto válido", () => {
    expect(parseUsdToMinor("")).toBeNull();
    expect(parseUsdToMinor("-5")).toBeNull();
    expect(parseUsdToMinor("12.345")).toBeNull();
    expect(parseUsdToMinor("1e3")).toBeNull();
    expect(parseUsdToMinor("abc")).toBeNull();
  });
});

describe("Bitácora legible", () => {
  it("el código del sello son los 8 primeros caracteres de la huella en dos grupos", () => {
    expect(sealCode("3f9a21c7e04b88d1aaaa")).toBe("3F9A 21C7");
  });

  it("agrupa los eventos para los filtros de la consola y resume su payload redactado", () => {
    expect(eventGroup("SECURITY_BLOCK")).toBe("security");
    expect(eventGroup("APPROVAL_GRANTED")).toBe("approvals");
    expect(eventGroup("FAULT_INJECTED")).toBe("clock");
    expect(eventGroup("DEBIT_CONFIRMED")).toBe("payments");
    expect(eventDetail("PLAN_CREATED", { routeId: "B", debit: { currency: "USD", minor: "286000" }, version: 1 })).toBe("Route B. USD 2,860.00. plan version 1");
    expect(eventDetail("FAULT_INJECTED", { fault: "LOSE_NEXT_PROVIDER_RESPONSE" })).toBe("Lose the next provider response");
  });
});
