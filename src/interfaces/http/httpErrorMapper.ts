import {
  ActiveAttemptExistsError,
  ApplicationError,
  RateLimitedError,
  ValidationError,
  VersionConflictError,
} from "@/application/errors/ApplicationError";
import { DomainError, PolicyViolationError } from "@/domain/errors/DomainError";
import { redactString } from "@/infrastructure/security/redact";

// Único lugar donde los errores tipados se traducen a HTTP (BUILD_PROMPT 9.3).
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  ROLE_NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  WORKSPACE_MISMATCH: 409,
  IDEMPOTENCY_CONFLICT: 409,
  ACTIVE_ATTEMPT_EXISTS: 409,
  INVALID_TRANSITION: 409,
  INVARIANT_VIOLATION: 409,
  VALIDATION_ERROR: 422,
  POLICY_VIOLATION: 422,
  CURRENCY_MISMATCH: 422,
  RATE_LIMITED: 429,
  AI_BUDGET_EXHAUSTED: 429,
  PROVIDER_UNAVAILABLE: 503,
};

// Los mensajes de dominio están en español para el equipo; al cliente van mensajes fijos en inglés.
const DOMAIN_MESSAGES: Readonly<Record<string, string>> = {
  POLICY_VIOLATION: "Blocked by the server rules. See the reasons.",
  INVALID_TRANSITION: "This action is not available in the current state.",
  INVARIANT_VIOLATION: "This action is not available in the current state.",
  VALIDATION_ERROR: "The request is not valid.",
  CURRENCY_MISMATCH: "Amounts in different currencies cannot be combined.",
  VERSION_CONFLICT: "This plan changed. Review the new version.",
};

export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly reasons?: readonly string[];
    readonly requestId: string;
    readonly existingAttemptId?: string;
    readonly currentVersion?: number;
    readonly issues?: readonly string[];
  };
}

export interface HttpError {
  readonly status: number;
  readonly body: ErrorBody;
  readonly headers: Readonly<Record<string, string>>;
}

export function httpErrorMapper(error: unknown, requestId: string): HttpError {
  if (error instanceof ApplicationError || error instanceof DomainError) {
    const status = STATUS_BY_CODE[error.code] ?? 400;
    const reasons = "reasons" in error && Array.isArray((error as { reasons?: unknown }).reasons) ? [...(error as { reasons: string[] }).reasons] : undefined;
    const message = error instanceof DomainError ? (DOMAIN_MESSAGES[error.code] ?? "The request could not be completed.") : error.message;
    const headers: Record<string, string> = {};
    if (error instanceof RateLimitedError && error.retryAfterSeconds) headers["retry-after"] = String(error.retryAfterSeconds);
    return {
      status,
      headers,
      body: {
        error: {
          code: error.code,
          message,
          ...(reasons && reasons.length ? { reasons } : {}),
          requestId,
          ...(error instanceof ActiveAttemptExistsError ? { existingAttemptId: error.existingAttemptId } : {}),
          ...(error instanceof VersionConflictError && error.currentVersion !== null ? { currentVersion: error.currentVersion } : {}),
          ...(error instanceof ValidationError && error.issues.length ? { issues: error.issues } : {}),
          ...(error instanceof PolicyViolationError ? { reasons: [...error.reasons] } : {}),
        },
      },
    };
  }
  // Error inesperado: se registra redactado y el cliente recibe un mensaje genérico, sin detalles internos.
  console.error(`[api] ${requestId} ${redactString(error instanceof Error ? `${error.name}: ${error.message}` : String(error))}`);
  return {
    status: 500,
    headers: {},
    body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Your payment state is saved. Try again.", requestId } },
  };
}
