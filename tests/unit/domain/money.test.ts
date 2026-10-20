import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, DomainValidationError } from "@/domain/errors/DomainError";
import { Money, divideHalfEven } from "@/domain/money/Money";
import { Rate, convertWithQuote, type FxQuote } from "@/domain/money/Rate";
import { VirtualInstant } from "@/domain/time/Instant";

const usd = (text: string) => Money.fromDecimal("USD", text);
const cny = (text: string) => Money.fromDecimal("CNY", text);

describe("Money (BUILD_PROMPT 4.2 y 8.1)", () => {
  it("guarda el monto como bigint en unidades menores", () => {
    const m = usd("2860.00");
    expect(m.currency).toBe("USD");
    expect(m.minor).toBe(286000n);
    expect(typeof m.minor).toBe("bigint");
  });

  it("lee decimales exactos sin punto flotante", () => {
    expect(usd("0.1").minor).toBe(10n);
    expect(usd("0.10").minor).toBe(10n);
    expect(usd("1999.99").minor).toBe(199999n);
    expect(cny("19800").minor).toBe(1980000n);
    expect(usd("-12.05").minor).toBe(-1205n);
    // 0.1 + 0.2 en punto flotante da 0.30000000000000004; aquí es exacto.
    expect(usd("0.10").add(usd("0.20")).equals(usd("0.30"))).toBe(true);
  });

  it("rechaza textos que no son montos válidos", () => {
    for (const bad of ["", "1,000.00", "12.345", "1e3", "abc", " 1.00", "1.", ".5", "NaN"]) {
      expect(() => usd(bad), bad).toThrow(DomainValidationError);
    }
  });

  it("rechaza unidades menores que no son bigint", () => {
    expect(() => Money.of("USD", 100 as unknown as bigint)).toThrow(DomainValidationError);
  });

  it("suma, resta, compara y detecta negativos", () => {
    const balance = usd("5000.00");
    const debit = usd("2860.00");
    expect(balance.subtract(debit).toDecimalString()).toBe("2140.00");
    expect(debit.add(usd("20.00")).toDecimalString()).toBe("2880.00");
    expect(balance.compare(debit)).toBe(1);
    expect(debit.compare(balance)).toBe(-1);
    expect(debit.compare(usd("2860"))).toBe(0);
    expect(debit.subtract(balance).isNegative()).toBe(true);
    expect(Money.zero("USD").isZero()).toBe(true);
    expect(usd("0.01").isPositive()).toBe(true);
  });

  it("no mezcla monedas: lanza CurrencyMismatchError", () => {
    expect(() => usd("1.00").add(cny("1.00"))).toThrow(CurrencyMismatchError);
    expect(() => usd("1.00").subtract(cny("1.00"))).toThrow(CurrencyMismatchError);
    expect(() => usd("1.00").compare(cny("1.00"))).toThrow(CurrencyMismatchError);
    expect(() => Money.sum("USD", [usd("1.00"), cny("1.00")])).toThrow(CurrencyMismatchError);
  });

  it("es inmutable", () => {
    const m = usd("1.00");
    expect(Object.isFrozen(m)).toBe(true);
    m.add(usd("1.00"));
    expect(m.toDecimalString()).toBe("1.00");
  });

  it("convierte a JSON solo de forma explícita: JSON.stringify directo falla con bigint", () => {
    expect(() => JSON.stringify({ m: usd("1.00").minor })).toThrow();
    expect(usd("2860.00").toJSON()).toEqual({ currency: "USD", minor: "286000" });
    expect(Money.fromJSON({ currency: "CNY", minor: "2000000" }).equals(cny("20000.00"))).toBe(true);
    expect(() => Money.fromJSON({ currency: "EUR", minor: "1" } as never)).toThrow(DomainValidationError);
    expect(() => Money.fromJSON({ currency: "USD", minor: "1.5" })).toThrow(DomainValidationError);
  });

  it("escala con redondeo bancario (mitad al par)", () => {
    // Remesa: CNY 3,000.00 por R1 escala USD 288.00 x 3000 / 2000 = USD 432.00 (BUILD_PROMPT 6.4).
    expect(usd("288.00").mulDiv(3000n, 2000n).toDecimalString()).toBe("432.00");
    expect(divideHalfEven(5n, 2n)).toBe(2n);
    expect(divideHalfEven(7n, 2n)).toBe(4n);
    expect(divideHalfEven(-5n, 2n)).toBe(-2n);
    expect(divideHalfEven(-7n, 2n)).toBe(-4n);
    expect(divideHalfEven(10n, 3n)).toBe(3n);
    expect(divideHalfEven(11n, 3n)).toBe(4n);
    expect(() => divideHalfEven(1n, 0n)).toThrow(DomainValidationError);
  });

  it("suma listas de la misma moneda", () => {
    expect(Money.sum("USD", [usd("288.00"), usd("432.00")]).toDecimalString()).toBe("720.00");
    expect(Money.sum("USD", []).isZero()).toBe(true);
  });
});

describe("Rate y conversión con cotización explícita (8.1)", () => {
  const asOf = VirtualInstant.fromISO("2026-10-20T14:00:00.000Z");

  it("guarda la tasa como entero escalado por 10^6", () => {
    expect(Rate.fromString("7.142857").rateMicros).toBe(7142857n);
    expect(Rate.fromString("0.14").rateMicros).toBe(140000n);
    expect(() => Rate.fromString("7.1234567")).toThrow(DomainValidationError);
    expect(() => Rate.fromString("-1")).toThrow(DomainValidationError);
  });

  it("convierte solo con una cotización de la moneda correcta, rotulada como sintética", () => {
    const quote: FxQuote = { id: "fx-1", from: "CNY", to: "USD", rate: Rate.fromString("0.14"), asOf, synthetic: true };
    expect(convertWithQuote(cny("500.00"), quote).toDecimalString()).toBe("70.00");
    expect(convertWithQuote(cny("500.00"), quote).currency).toBe("USD");
    expect(() => convertWithQuote(usd("500.00"), quote)).toThrow(CurrencyMismatchError);
  });

  it("valida la cotización en tiempo de ejecución: id, rótulo sintético, monedas distintas, tasa y fecha virtual (VC1-2)", () => {
    const good: FxQuote = { id: "fx-1", from: "CNY", to: "USD", rate: Rate.fromString("0.14"), asOf, synthetic: true };
    for (const bad of [
      { ...good, id: "" },
      { ...good, synthetic: false },
      { ...good, to: "CNY" },
      { ...good, rate: { rateMicros: 140000n } },
      { ...good, asOf: { epochMs: 0 } },
    ]) {
      expect(() => convertWithQuote(cny("500.00"), bad as unknown as FxQuote), JSON.stringify(Object.keys(bad))).toThrow(DomainValidationError);
    }
  });

  it("redondea la conversión con mitad al par", () => {
    const quote: FxQuote = { id: "fx-2", from: "USD", to: "CNY", rate: Rate.fromString("0.125"), asOf, synthetic: true };
    // 12 x 0.125 = 1.5 -> 2; 4 x 0.125 = 0.5 -> 0; 20 x 0.125 = 2.5 -> 2 (unidades menores)
    expect(convertWithQuote(usd("0.12"), quote).minor).toBe(2n);
    expect(convertWithQuote(usd("0.04"), quote).minor).toBe(0n);
    expect(convertWithQuote(usd("0.20"), quote).minor).toBe(2n);
  });
});
