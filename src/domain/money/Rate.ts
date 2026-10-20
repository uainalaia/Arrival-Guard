import { CurrencyMismatchError, DomainValidationError } from "../errors/DomainError";
import type { VirtualInstant } from "../time/Instant";
import { Money, divideHalfEven, type Currency } from "./Money";

const MICROS = 1_000_000n;
const RATE_PATTERN = /^(\d+)(?:\.(\d{1,6}))?$/;

/**
 * Tasa decimal de escala fija (tasa x 10^6). Solo para mostrar y proyectar:
 * débitos y netos de una ruta salen de la cotización, no se recalculan con la tasa (BUILD_PROMPT 8.1).
 */
export class Rate {
  private constructor(readonly rateMicros: bigint) {
    Object.freeze(this);
  }

  static fromMicros(rateMicros: bigint): Rate {
    if (typeof rateMicros !== "bigint" || rateMicros <= 0n) throw new DomainValidationError("La tasa debe ser un bigint positivo");
    return new Rate(rateMicros);
  }

  static fromString(text: string): Rate {
    const match = RATE_PATTERN.exec(text);
    if (!match) throw new DomainValidationError(`Tasa inválida: "${text}"`);
    const [, units = "0", fraction = ""] = match;
    return Rate.fromMicros(BigInt(units) * MICROS + BigInt(fraction.padEnd(6, "0")));
  }

  toString(): string {
    const units = this.rateMicros / MICROS;
    const fraction = (this.rateMicros % MICROS).toString().padStart(6, "0");
    return `${units.toString()}.${fraction}`;
  }
}

/** Cotización FX explícita: toda conversión la exige, con id, tasa, hora virtual y rótulo sintético. */
export interface FxQuote {
  readonly id: string;
  readonly from: Currency;
  readonly to: Currency;
  /** 1 unidad de `from` equivale a `rate` unidades de `to`. */
  readonly rate: Rate;
  readonly asOf: VirtualInstant;
  readonly synthetic: true;
}

export function convertWithQuote(amount: Money, quote: FxQuote): Money {
  // El tipo no protege datos que llegan de la base o de JSON: se valida en tiempo de ejecución.
  if (!quote || typeof quote.id !== "string" || quote.id.trim() === "") throw new DomainValidationError("La cotización FX necesita un id");
  if (quote.synthetic !== true) throw new DomainValidationError("La cotización FX debe estar rotulada como sintética");
  if (quote.from === quote.to) throw new DomainValidationError("La cotización FX debe convertir entre monedas distintas");
  if (!(quote.rate instanceof Rate) || quote.rate.rateMicros <= 0n) throw new DomainValidationError("Tasa FX inválida");
  if (!quote.asOf || quote.asOf.kind !== "virtual") throw new DomainValidationError("La cotización FX necesita una fecha virtual");
  if (amount.currency !== quote.from) throw new CurrencyMismatchError(amount.currency, quote.from);
  return Money.of(quote.to, divideHalfEven(amount.minor * quote.rate.rateMicros, MICROS));
}
