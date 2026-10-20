import { DomainValidationError } from "../errors/DomainError";

const MINUTE_MS = 60_000;

/**
 * Hora virtual del espacio de evaluación: controla vencimientos, cotizaciones, llegadas y períodos.
 * Solo el evaluador la avanza. Es un tipo distinto de RealInstant y no se mezclan (BUILD_PROMPT 8.1 y 12).
 */
export class VirtualInstant {
  readonly kind = "virtual" as const;

  private constructor(readonly epochMs: number) {
    Object.freeze(this);
  }

  static fromEpochMs(epochMs: number): VirtualInstant {
    if (!Number.isSafeInteger(epochMs)) throw new DomainValidationError("Instante virtual inválido");
    return new VirtualInstant(epochMs);
  }

  static fromISO(iso: string): VirtualInstant {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) throw new DomainValidationError(`Fecha virtual inválida: "${iso}"`);
    return VirtualInstant.fromEpochMs(ms);
  }

  static fromDate(date: Date): VirtualInstant {
    return VirtualInstant.fromEpochMs(date.getTime());
  }

  plusMinutes(minutes: number): VirtualInstant {
    if (!Number.isInteger(minutes)) throw new DomainValidationError("Los minutos deben ser enteros");
    return VirtualInstant.fromEpochMs(this.epochMs + minutes * MINUTE_MS);
  }

  plusHours(hours: number): VirtualInstant {
    return this.plusMinutes(hours * 60);
  }

  plusDays(days: number): VirtualInstant {
    return this.plusMinutes(days * 24 * 60);
  }

  /** Minutos enteros hasta `other` (negativo si ya pasó). */
  minutesUntil(other: VirtualInstant): number {
    return Math.trunc((other.epochMs - this.epochMs) / MINUTE_MS);
  }

  isBefore(other: VirtualInstant): boolean {
    return this.epochMs < other.epochMs;
  }

  isAfter(other: VirtualInstant): boolean {
    return this.epochMs > other.epochMs;
  }

  equals(other: VirtualInstant): boolean {
    return this.epochMs === other.epochMs;
  }

  static earliest(a: VirtualInstant, b: VirtualInstant): VirtualInstant {
    return a.epochMs <= b.epochMs ? a : b;
  }

  toISOString(): string {
    return new Date(this.epochMs).toISOString();
  }

  toDate(): Date {
    return new Date(this.epochMs);
  }
}

/** Hora real: sesiones, límites de uso y seguridad. Avanzar la hora virtual nunca la toca. */
export class RealInstant {
  readonly kind = "real" as const;

  private constructor(readonly epochMs: number) {
    Object.freeze(this);
  }

  static fromEpochMs(epochMs: number): RealInstant {
    if (!Number.isSafeInteger(epochMs)) throw new DomainValidationError("Instante real inválido");
    return new RealInstant(epochMs);
  }

  static fromDate(date: Date): RealInstant {
    return RealInstant.fromEpochMs(date.getTime());
  }

  plusMinutes(minutes: number): RealInstant {
    return RealInstant.fromEpochMs(this.epochMs + minutes * MINUTE_MS);
  }

  plusHours(hours: number): RealInstant {
    return this.plusMinutes(hours * 60);
  }

  isBefore(other: RealInstant): boolean {
    return this.epochMs < other.epochMs;
  }

  isAfter(other: RealInstant): boolean {
    return this.epochMs > other.epochMs;
  }

  toISOString(): string {
    return new Date(this.epochMs).toISOString();
  }

  toDate(): Date {
    return new Date(this.epochMs);
  }
}
