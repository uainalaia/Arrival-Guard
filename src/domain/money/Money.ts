import { CurrencyMismatchError, DomainValidationError } from "../errors/DomainError";

export const CURRENCIES = ["USD", "CNY"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

/** Forma del dinero en DTO y JSON: unidades menores como string (BUILD_PROMPT 4.2). */
export interface MoneyJSON {
  readonly currency: Currency;
  readonly minor: string;
}

// USD y CNY tienen dos decimales.
const MINOR_PER_UNIT = 100n;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
const MINOR_PATTERN = /^-?\d+$/;

/**
 * Dinero como entero de unidades menores en `bigint`. Nunca punto flotante.
 * Inmutable: cada operación devuelve un Money nuevo. No mezcla monedas.
 */
export class Money {
  private constructor(
    readonly currency: Currency,
    readonly minor: bigint,
  ) {
    Object.freeze(this);
  }

  static of(currency: Currency, minor: bigint): Money {
    if (typeof minor !== "bigint") throw new DomainValidationError("Las unidades menores deben ser bigint");
    if (!isCurrency(currency)) throw new DomainValidationError(`Moneda no admitida: ${String(currency)}`);
    return new Money(currency, minor);
  }

  static zero(currency: Currency): Money {
    return Money.of(currency, 0n);
  }

  /** Lee "2860.00", "0.1" o "-12.05" de forma exacta. Rechaza separadores de miles, exponentes y más de dos decimales. */
  static fromDecimal(currency: Currency, text: string): Money {
    const match = DECIMAL_PATTERN.exec(text);
    if (!match) throw new DomainValidationError(`Monto inválido: "${text}"`);
    const [, sign, units = "0", cents = ""] = match;
    const minor = BigInt(units) * MINOR_PER_UNIT + BigInt(cents.padEnd(2, "0"));
    return Money.of(currency, sign === "-" ? -minor : minor);
  }

  static fromMinorString(currency: Currency, minor: string): Money {
    if (!MINOR_PATTERN.test(minor)) throw new DomainValidationError(`Unidades menores inválidas: "${minor}"`);
    return Money.of(currency, BigInt(minor));
  }

  static fromJSON(json: MoneyJSON): Money {
    if (!json || !isCurrency(json.currency)) throw new DomainValidationError("Moneda no admitida");
    return Money.fromMinorString(json.currency, json.minor);
  }

  static sum(currency: Currency, items: readonly Money[]): Money {
    return items.reduce((total, item) => total.add(item), Money.zero(currency));
  }

  static min(a: Money, b: Money): Money {
    return a.compare(b) <= 0 ? a : b;
  }

  static max(a: Money, b: Money): Money {
    return a.compare(b) >= 0 ? a : b;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.currency, this.minor + other.minor);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.currency, this.minor - other.minor);
  }

  negate(): Money {
    return Money.of(this.currency, -this.minor);
  }

  /** -1, 0 o 1. */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.minor < other.minor) return -1;
    if (this.minor > other.minor) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }

  lessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }

  isNegative(): boolean {
    return this.minor < 0n;
  }

  isZero(): boolean {
    return this.minor === 0n;
  }

  isPositive(): boolean {
    return this.minor > 0n;
  }

  /** Escala por numerador/denominador con redondeo bancario (mitad al par). */
  mulDiv(numerator: bigint, denominator: bigint): Money {
    return Money.of(this.currency, divideHalfEven(this.minor * numerator, denominator));
  }

  /** "2860.00". El formato con código y separadores (`USD 2,860.00`) vive solo en la interfaz. */
  toDecimalString(): string {
    const negative = this.minor < 0n;
    const abs = negative ? -this.minor : this.minor;
    const units = abs / MINOR_PER_UNIT;
    const cents = (abs % MINOR_PER_UNIT).toString().padStart(2, "0");
    return `${negative ? "-" : ""}${units.toString()}.${cents}`;
  }

  toJSON(): MoneyJSON {
    return { currency: this.currency, minor: this.minor.toString() };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) throw new CurrencyMismatchError(this.currency, other.currency);
  }
}

/** División entera de bigint con redondeo mitad al par. */
export function divideHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new DomainValidationError("División por cero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let quotient = n / d;
  const twiceRemainder = (n % d) * 2n;
  if (twiceRemainder > d || (twiceRemainder === d && quotient % 2n === 1n)) quotient += 1n;
  return negative ? -quotient : quotient;
}
