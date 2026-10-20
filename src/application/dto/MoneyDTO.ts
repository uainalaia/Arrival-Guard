import type { Currency } from "@/domain/money/Money";

/** Dinero en la frontera: unidades menores como string (BUILD_PROMPT 4.2). Nunca un number. */
export interface MoneyDTO {
  readonly currency: Currency;
  readonly minor: string;
}
