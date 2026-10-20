import { DomainValidationError, InvalidTransitionError } from "../errors/DomainError";
import { assertTransition, type TransitionTable } from "../shared/StateMachine";
import type { VirtualInstant } from "../time/Instant";

export const PLAN_STATUSES = [
  "DRAFT",
  "NOT_VIABLE",
  "READY_FOR_APPROVAL",
  "APPROVAL_REQUESTED",
  "APPROVED",
  "EXECUTING",
  "COMPLETED",
  "INCIDENT_OPEN",
  "INVALIDATED",
  "SUPERSEDED",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** BUILD_PROMPT 8.5. Desde cualquier estado previo a EXECUTING se puede pasar a INVALIDATED o SUPERSEDED. */
export const PLAN_TRANSITIONS: TransitionTable<PlanStatus> = {
  DRAFT: ["NOT_VIABLE", "READY_FOR_APPROVAL", "INVALIDATED", "SUPERSEDED"],
  NOT_VIABLE: ["INVALIDATED", "SUPERSEDED"],
  READY_FOR_APPROVAL: ["APPROVAL_REQUESTED", "INVALIDATED", "SUPERSEDED"],
  APPROVAL_REQUESTED: ["APPROVED", "INVALIDATED", "SUPERSEDED"],
  APPROVED: ["EXECUTING", "READY_FOR_APPROVAL", "INVALIDATED", "SUPERSEDED"],
  EXECUTING: ["COMPLETED", "INCIDENT_OPEN", "READY_FOR_APPROVAL"],
  COMPLETED: [],
  INCIDENT_OPEN: [],
  INVALIDATED: [],
  SUPERSEDED: [],
};

export interface PaymentPlanProps {
  /** Identidad del plan; cada versión es una fila distinta con el mismo id. */
  readonly id: string;
  readonly workspaceId: string;
  readonly obligationId: string;
  readonly obligationVersion: number;
  readonly version: number;
  readonly status: PlanStatus;
  readonly targetArrivalAt: VirtualInstant;
  readonly selectedRouteId: string | null;
  readonly createdByActorId: string;
  /** Hora virtual de la solicitud de aprobación; fija la vigencia que entra en la huella. */
  readonly approvalRequestedAt: VirtualInstant | null;
  readonly approvalExpiresAt: VirtualInstant | null;
}

/** Una versión concreta de un plan de pago de matrícula. Las aprobaciones se ligan a (id, version). */
export class PaymentPlan {
  private constructor(private props: PaymentPlanProps) {}

  static rehydrate(props: PaymentPlanProps): PaymentPlan {
    return new PaymentPlan({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get version(): number {
    return this.props.version;
  }
  get status(): PlanStatus {
    return this.props.status;
  }
  get obligationId(): string {
    return this.props.obligationId;
  }
  get obligationVersion(): number {
    return this.props.obligationVersion;
  }
  get selectedRouteId(): string | null {
    return this.props.selectedRouteId;
  }
  get targetArrivalAt(): VirtualInstant {
    return this.props.targetArrivalAt;
  }
  get approvalRequestedAt(): VirtualInstant | null {
    return this.props.approvalRequestedAt;
  }
  get approvalExpiresAt(): VirtualInstant | null {
    return this.props.approvalExpiresAt;
  }

  toProps(): PaymentPlanProps {
    return { ...this.props };
  }

  transitionTo(next: PlanStatus): void {
    assertTransition("PaymentPlan", PLAN_TRANSITIONS, this.props.status, next);
    this.props = { ...this.props, status: next };
  }

  requestApproval(at: VirtualInstant, expiresAt: VirtualInstant): void {
    this.transitionTo("APPROVAL_REQUESTED");
    this.props = { ...this.props, approvalRequestedAt: at, approvalExpiresAt: expiresAt };
  }

  /**
   * Cambio de objetivo sin cambio material: misma versión, nuevo objetivo. Solo antes de ejecutar y nunca más
   * tarde que el vencimiento. Si el objetivo nuevo obliga a otra ruta, el guard de ejecución da DEADLINE_MISSED
   * y la aplicación crea una versión nueva (cambio material).
   */
  retarget(targetArrivalAt: VirtualInstant, obligationDueAt: VirtualInstant): void {
    if (!this.isBeforeExecution()) throw new InvalidTransitionError("PaymentPlan", this.props.status, "RETARGET");
    if (targetArrivalAt.isAfter(obligationDueAt)) throw new DomainValidationError("El objetivo no puede ser posterior al vencimiento");
    this.props = { ...this.props, targetArrivalAt };
  }

  isBeforeExecution(): boolean {
    return ["DRAFT", "NOT_VIABLE", "READY_FOR_APPROVAL", "APPROVAL_REQUESTED", "APPROVED"].includes(this.props.status);
  }
}
