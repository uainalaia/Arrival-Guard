import type { MoneyDTO } from "@/application/dto/MoneyDTO";

// Proporciones de dinero para dibujar barras y medidores sin punto flotante: la cuenta se hace en BigInt y recién
// el resultado entero (décimas de porcentaje o marcas) pasa a número para el estilo.

const minorOf = (money: MoneyDTO) => BigInt(money.minor);

/** Parte sobre total en décimas de porcentaje (0 a 1000), truncado. Total cero o negativo da 0. */
export function permille(part: MoneyDTO, total: MoneyDTO): number {
  const t = minorOf(total);
  if (t <= 0n) return 0;
  const p = minorOf(part);
  if (p <= 0n) return 0;
  const value = (p * 1000n) / t;
  return Number(value > 1000n ? 1000n : value);
}

/** Cuántas de `ticks` marcas cubre `part` sobre `total`, redondeado al más cercano y acotado. */
export function ticksOf(part: MoneyDTO, total: MoneyDTO, ticks: number): number {
  const t = minorOf(total);
  if (t <= 0n) return 0;
  const p = minorOf(part);
  if (p <= 0n) return 0;
  const n = BigInt(ticks);
  const value = (p * n * 2n + t) / (t * 2n);
  return Number(value > n ? n : value);
}

/** Resta en unidades menores (misma moneda), para totales que la interfaz necesita mostrar. */
export function subtractMoney(a: MoneyDTO, b: MoneyDTO): MoneyDTO {
  if (a.currency !== b.currency) throw new Error("No se restan monedas distintas.");
  return { currency: a.currency, minor: (minorOf(a) - minorOf(b)).toString() };
}

export function isZero(money: MoneyDTO): boolean {
  return minorOf(money) === 0n;
}

export function isNegative(money: MoneyDTO): boolean {
  return minorOf(money) < 0n;
}

export function absMoney(money: MoneyDTO): MoneyDTO {
  const v = minorOf(money);
  return { currency: money.currency, minor: (v < 0n ? -v : v).toString() };
}

export function minMoney(a: MoneyDTO, b: MoneyDTO): MoneyDTO {
  return minorOf(a) <= minorOf(b) ? a : b;
}
