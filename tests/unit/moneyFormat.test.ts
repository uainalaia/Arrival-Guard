import { describe, expect, it } from "vitest";
import { MoneyMapper } from "@/application/mappers/MoneyMapper";
import { Money } from "@/domain/money/Money";
import { formatMoney, moneyParts } from "@/interfaces/format/money";

describe("MoneyDTO y formato (VC1)", () => {
  it("MoneyMapper convierte Money (bigint) a { currency, minor: string } y de vuelta", () => {
    const dto = MoneyMapper.toDTO(Money.fromDecimal("USD", "2860.00"));
    expect(dto).toEqual({ currency: "USD", minor: "286000" });
    expect(typeof dto.minor).toBe("string");
    expect(MoneyMapper.fromDTO(dto).minor).toBe(286000n);
    expect(MoneyMapper.toDTOOrNull(null)).toBeNull();
  });

  it("formatea como USD 2,860.00 y CNY 20,000.00", () => {
    expect(formatMoney({ currency: "USD", minor: "286000" })).toBe("USD 2,860.00");
    expect(formatMoney({ currency: "CNY", minor: "2000000" })).toBe("CNY 20,000.00");
    expect(formatMoney({ currency: "USD", minor: "214000" })).toBe("USD 2,140.00");
    expect(formatMoney({ currency: "USD", minor: "7" })).toBe("USD 0.07");
    expect(formatMoney({ currency: "USD", minor: "-36000" })).toBe("USD -360.00");
    expect(formatMoney({ currency: "USD", minor: "123456789012345678901" })).toBe("USD 1,234,567,890,123,456,789.01");
  });

  it("separa código y monto para la interfaz", () => {
    expect(moneyParts({ currency: "USD", minor: "29250" })).toEqual({ currency: "USD", amount: "292.50", negative: false });
  });

  it("rechaza unidades menores que no son enteras", () => {
    expect(() => formatMoney({ currency: "USD", minor: "2860.5" })).toThrow();
    expect(() => formatMoney({ currency: "USD", minor: "1e3" })).toThrow();
  });
});
