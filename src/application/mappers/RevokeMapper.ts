import type { RevokeResult } from "../usecases/RevokePermissionUseCase";

export interface RevokeDTO {
  readonly synthetic: true;
  readonly target: "APPROVAL" | "MANDATE";
  readonly id: string;
  readonly revoked: boolean;
  readonly inFlightAttemptId: string | null;
  readonly approvalStatus: string | null;
  readonly attemptStatus: string | null;
  readonly message: string;
}

/**
 * Respuesta de T6, revocar. El mensaje sale del estado real: nunca afirma que un pago salió si no hay intento en
 * vuelo, ni promete detener uno que ya salió (BUILD_PROMPT 8.4).
 */
export class RevokeMapper {
  static toDTO(result: RevokeResult): RevokeDTO {
    return {
      synthetic: true,
      target: result.target,
      id: result.id,
      revoked: result.revoked,
      inFlightAttemptId: result.inFlightAttemptId,
      approvalStatus: result.priorStatus,
      attemptStatus: result.attemptStatus,
      message: RevokeMapper.message(result),
    };
  }

  static message(result: RevokeResult): string {
    if (result.revoked) return "Permission revoked. Nothing will be sent with it.";
    if (result.inFlightAttemptId) return "This payment was already sent. Revoking cannot guarantee stopping it. Check its status.";
    switch (result.priorStatus) {
      case "REVOKED":
        return "Already revoked. Nothing will be sent with it.";
      case "INVALIDATED":
        return "This approval no longer matches the plan. Nothing will be sent with it.";
      case "EXPIRED":
        return "This approval expired. Nothing will be sent with it.";
      default:
        if (result.attemptStatus === "CREDITED") return "This payment was already credited by the university. Revoking does not reverse it.";
        if (result.attemptStatus === "FAILED_CONFIRMED") return "That payment failed and no money left the account. Nothing else will be sent with this approval.";
        return "This approval was already used. Nothing else will be sent with it.";
    }
  }
}
