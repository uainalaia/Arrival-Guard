import type { ReasonCode } from "../policy/ReasonCode";

/** Base de los errores de dominio. `code` es estable y lo traduce a HTTP un único httpErrorMapper. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class CurrencyMismatchError extends DomainError {
  readonly code = "CURRENCY_MISMATCH";

  constructor(left: string, right: string) {
    super(`No se mezclan monedas distintas: ${left} y ${right}`);
  }
}

export class DomainValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
}

export class InvalidTransitionError extends DomainError {
  readonly code = "INVALID_TRANSITION";

  constructor(
    readonly entity: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Transición no permitida en ${entity}: ${from} -> ${to}`);
  }
}

/** Una regla de dinero, permiso o seguridad bloquea la operación. Lleva sus códigos de razón. */
export class PolicyViolationError extends DomainError {
  readonly code = "POLICY_VIOLATION";

  constructor(
    readonly reasons: readonly ReasonCode[],
    message = `Bloqueado por política: ${reasons.join(", ")}`,
  ) {
    super(message);
  }
}

/** Un invariante interno se rompió (por ejemplo, capturar una retención ya liberada). */
export class InvariantViolationError extends DomainError {
  readonly code = "INVARIANT_VIOLATION";
}

/** La versión o la huella que presenta el pagador no coincide con el plan vigente (HTTP 409). */
export class ConsentMismatchError extends DomainError {
  readonly code = "VERSION_CONFLICT";

  constructor(message = "La versión o la huella no coinciden con el plan vigente") {
    super(message);
  }
}
