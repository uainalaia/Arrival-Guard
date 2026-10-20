"use client";

import { useCallback, useRef, useState } from "react";
import type { RefundDTO, RemittanceDTO } from "@/application/dto/CaseDTO";
import { ApiError, api, newIdempotencyKey, type ActorRole } from "@/ui/lib/api";

// Acciones del espacio contra la API. El servidor decide; la interfaz muestra la razón exacta que devuelve.

export type Problem =
  | { readonly kind: "reasons"; readonly reasons: readonly string[] }
  | { readonly kind: "message"; readonly title: string; readonly detail: string; readonly tone: "stop" | "wait" };

export function problemFrom(error: unknown): Problem {
  if (!(error instanceof ApiError)) return { kind: "message", title: "Something went wrong", detail: "Your payment state is saved. Try again.", tone: "wait" };
  switch (error.code) {
    case "POLICY_VIOLATION":
      return error.reasons.length > 0 ? { kind: "reasons", reasons: error.reasons } : { kind: "message", title: "Blocked", detail: error.message, tone: "stop" };
    case "ACTIVE_ATTEMPT_EXISTS":
      return { kind: "reasons", reasons: ["ACTIVE_ATTEMPT_EXISTS"] };
    case "ROLE_NOT_ALLOWED":
      return { kind: "reasons", reasons: ["ROLE_NOT_ALLOWED"] };
    case "VERSION_CONFLICT":
      return { kind: "message", title: "This plan changed", detail: "Review the new version.", tone: "wait" };
    case "UNAUTHENTICATED":
      return { kind: "message", title: "Session ended", detail: "This workspace session has ended. Open a new workspace with the evaluation code.", tone: "wait" };
    case "WORKSPACE_MISMATCH":
      return { kind: "message", title: "This tab belongs to another workspace", detail: "Reload to continue in your current workspace.", tone: "wait" };
    case "IDEMPOTENCY_CONFLICT":
      return { kind: "message", title: "This request was already used", detail: "Refresh the page and try again.", tone: "wait" };
    case "RATE_LIMITED":
      return { kind: "message", title: "Too many requests", detail: "Wait a moment and try again.", tone: "wait" };
    default:
      return { kind: "message", title: error.code === "NETWORK" ? "Couldn't reach ArrivalGuard" : "Not available right now", detail: error.message, tone: "wait" };
  }
}

export interface ActionState {
  readonly busy: string | null;
  readonly problem: Problem | null;
  readonly clearProblem: () => void;
  /** Corre una acción: marca `busy`, refresca el caso al terminar y guarda el problema si falla. */
  readonly run: <T>(name: string, action: () => Promise<T>) => Promise<T | null>;
}

export function useActionState(refresh: () => Promise<void>): ActionState {
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const run = useCallback(
    async <T,>(name: string, action: () => Promise<T>): Promise<T | null> => {
      setBusy(name);
      setProblem(null);
      try {
        return await action();
      } catch (error) {
        setProblem(problemFrom(error));
        return null;
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [refresh],
  );
  return { busy, problem, clearProblem: () => setProblem(null), run };
}

/**
 * Clave de idempotencia del envío: una por plan y versión, reutilizada si el usuario reintenta tras un error de red.
 * Así un doble clic o un reintento nunca crean un segundo pago (y el servidor lo garantiza igual).
 */
export function usePaymentKey() {
  const ref = useRef<{ planId: string; version: number; approvalId: string; key: string } | null>(null);
  return useCallback((planId: string, version: number, approvalId: string) => {
    if (!ref.current || ref.current.planId !== planId || ref.current.version !== version || ref.current.approvalId !== approvalId) {
      ref.current = { planId, version, approvalId, key: newIdempotencyKey(`ui-tuition-v${version}`) };
    }
    return ref.current.key;
  }, []);
}

/** Una clave por acción y sujeto (remesa o reclamo): un reintento de la misma acción repite la misma clave. */
export function useActionKeys() {
  const ref = useRef(new Map<string, string>());
  return useCallback((scope: string) => {
    let key = ref.current.get(scope);
    if (!key) {
      key = newIdempotencyKey(`ui-${scope.split(":")[0]}`);
      ref.current.set(scope, key);
    }
    return key;
  }, []);
}

export const studentApi = {
  plan: (targetArrivalHours: number) => api<{ outcome: string; plan: { status: string } }>("/api/plans", { role: "student", body: { targetArrivalHours } }),
  requestApproval: (planId: string) => api("/api/approvals/requests", { role: "student", body: { planId } }),
  send: (role: ActorRole, planId: string, key: string) => api<{ replayed: boolean; attempt: { status: string } }>("/api/payments", { role, body: { planId }, idempotencyKey: key }),
  prepareRemittance: (netAmount: string, targetArrivalHours: number) =>
    api<{ remittance: RemittanceDTO }>("/api/remittances", { role: "student", body: { netAmount, targetArrivalHours } }),
  executeRemittance: (remittanceId: string, key: string) =>
    api<{ outcome: "SENT" | "NEEDS_PAYER_APPROVAL"; replayed?: boolean; remittance: RemittanceDTO }>(`/api/remittances/${remittanceId}/execute`, { role: "student", body: {}, idempotencyKey: key }),
  prepareRefund: (obligationId: string) => api<{ claim: RefundDTO }>("/api/refund-claims", { role: "student", body: { obligationId } }),
  submitRefund: (claimId: string, key: string) => api<{ replayed: boolean; claim: RefundDTO }>(`/api/refund-claims/${claimId}/submit`, { role: "student", body: {}, idempotencyKey: key }),
  check: (role: ActorRole, attemptId: string) => api<{ attempt: { status: string; visibleStatus: string } }>(`/api/payments/${attemptId}/reconcile`, { role, body: {} }),
};
