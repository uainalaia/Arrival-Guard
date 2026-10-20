import type { RealInstant } from "../time/Instant";

/** Reloj real (sesiones, límites de uso y seguridad). La hora virtual vive en el espacio y solo la avanza el evaluador. */
export interface RealClockPort {
  now(): RealInstant;
}

/** Generador de identificadores (UUID v4 en infraestructura). */
export interface IdGeneratorPort {
  newId(): string;
}
