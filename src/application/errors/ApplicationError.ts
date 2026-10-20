import type { ReasonCode } from "@/domain/policy/ReasonCode";

/** Errores de aplicación. Un único httpErrorMapper los traduce a HTTP (BUILD_PROMPT 9.3). */
export abstract class ApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends ApplicationError {
  readonly code = "UNAUTHENTICATED";
  constructor(message = "This workspace session has ended. Open a new workspace with the evaluation code.") {
    super(message);
  }
}

export class RoleNotAllowedError extends ApplicationError {
  readonly code = "ROLE_NOT_ALLOWED";
  readonly reasons: readonly ReasonCode[] = ["ROLE_NOT_ALLOWED"];
  constructor(message = "Only Carlos can do this.") {
    super(message);
  }
}

/** Recurso inexistente o de otro espacio: 404 sin revelar si existe. */
export class NotFoundError extends ApplicationError {
  readonly code = "NOT_FOUND";
  constructor(message = "Not found.") {
    super(message);
  }
}

export class IdempotencyConflictError extends ApplicationError {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor(message = "This idempotency key was already used with different content.") {
    super(message);
  }
}

export class ActiveAttemptExistsError extends ApplicationError {
  readonly code = "ACTIVE_ATTEMPT_EXISTS";
  readonly reasons: readonly ReasonCode[] = ["ACTIVE_ATTEMPT_EXISTS"];
  constructor(
    readonly existingAttemptId: string,
    message = "A payment is already on its way. Check that payment instead of sending another.",
  ) {
    super(message);
  }
}

/** La pestaña opera sobre un espacio que ya no es el de la sesión de este navegador (x-ag-workspace). */
export class WorkspaceMismatchError extends ApplicationError {
  readonly code = "WORKSPACE_MISMATCH";
  constructor(message = "This tab belongs to another workspace. Reload to continue in your current workspace.") {
    super(message);
  }
}

export class VersionConflictError extends ApplicationError {
  readonly code = "VERSION_CONFLICT";
  constructor(
    message = "This plan changed. Review the new version.",
    readonly reasons: readonly ReasonCode[] = [],
    readonly currentVersion: number | null = null,
  ) {
    super(message);
  }
}

export class ValidationError extends ApplicationError {
  readonly code = "VALIDATION_ERROR";
  constructor(
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
  }
}

export class RateLimitedError extends ApplicationError {
  readonly code = "RATE_LIMITED";
  constructor(
    message = "Too many requests. Try again later.",
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

export class AiBudgetExhaustedError extends ApplicationError {
  readonly code = "AI_BUDGET_EXHAUSTED";
  constructor(message = "The assistant budget for this workspace is used up. Structured controls are active.") {
    super(message);
  }
}

export class ProviderUnavailableError extends ApplicationError {
  readonly code = "PROVIDER_UNAVAILABLE";
  constructor(message = "The payment provider is not responding. Your payment state is saved.") {
    super(message);
  }
}
