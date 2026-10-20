import type { MoneyDTO } from "@/application/dto/MoneyDTO";

const MINOR_PER_UNIT = 100n;
const MINOR_PATTERN = /^-?\d+$/;

export interface MoneyParts {
  readonly currency: string;
  /** "2,860.00" o "-12.05": parte entera agrupada con comas y dos decimales. */
  readonly amount: string;
  readonly negative: boolean;
}

/**
 * Formato sin punto flotante (UI_UX 6.3): divide con BigInt en parte entera y centavos, agrupa la parte entera
 * con BigInt.prototype.toLocaleString("en-US") y concatena los centavos con dos dígitos.
 */
export function moneyParts(dto: MoneyDTO): MoneyParts {
  if (!MINOR_PATTERN.test(dto.minor)) throw new Error(`Unidades menores inválidas: "${dto.minor}"`);
  const minor = BigInt(dto.minor);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const units = (abs / MINOR_PER_UNIT).toLocaleString("en-US");
  const cents = (abs % MINOR_PER_UNIT).toString().padStart(2, "0");
  return { currency: dto.currency, amount: `${negative ? "-" : ""}${units}.${cents}`, negative };
}

/** "USD 2,860.00", "CNY 20,000.00". */
export function formatMoney(dto: MoneyDTO): string {
  const parts = moneyParts(dto);
  return `${parts.currency} ${parts.amount}`;
}
