import type { Approval } from "@/domain/consent/Approval";
import { fingerprintOf, type TuitionApprovalPayload } from "@/domain/consent/ApprovalPayload";
import { isQuoteExpired } from "@/domain/policy/RouteQuote";
import type { PlanVersionRecord, RecipientRecord } from "@/domain/ports/Repositories";
import type { VirtualInstant } from "@/domain/time/Instant";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError } from "../errors/ApplicationError";
import { approvalPayloadFor, loadTuitionContext, type TuitionContext } from "../services/TuitionContext";

export interface ApprovalView {
  readonly context: TuitionContext;
  readonly record: PlanVersionRecord;
  readonly receiver: RecipientRecord | null;
  /** Payload exacto que se firmaría ahora; null si el plan todavía no pidió aprobación. */
  readonly payload: TuitionApprovalPayload | null;
  readonly fingerprint: string | null;
  readonly quoteExpired: boolean;
  readonly approval: Approval | null;
  readonly now: VirtualInstant;
  readonly studentName: string;
  readonly payerName: string;
}

/**
 * Pantalla fija de aprobación (BUILD_PROMPT 15.2.3): todos los campos salen del estado del servidor.
 * El texto del modelo nunca aparece aquí. La estudiante puede verla en modo lectura.
 */
export class GetApprovalViewUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "hasher" | "scenarios">) {}

  async execute(actor: ActorContext, command: { readonly planId: string }): Promise<ApprovalView> {
    requireRole(actor, "payer", "student");
    const workspace = await this.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    const ctx = await loadTuitionContext(this.deps.uow.read, actor.workspaceId, this.deps.scenarios.acceptedTuitionChannels(workspace.scenario));
    const record = await this.deps.uow.read.plans.getCurrent(actor.workspaceId, command.planId);
    if (!record) throw new NotFoundError();
    // La aprobación que corresponde a la pantalla: la vigente; si no hay, la última de esta versión SOLO cuando el plan
    // ya salió o terminó. Con una solicitud nueva pendiente (por ejemplo, tras una falla confirmada que consumió la
    // anterior), el documento es para aprobar de nuevo (VC7-1).
    const waiting = record.plan.status === "APPROVAL_REQUESTED" || record.plan.status === "READY_FOR_APPROVAL";
    const approval =
      (await this.deps.uow.read.approvals.findActive(actor.workspaceId, record.plan.id, record.plan.version)) ??
      (waiting ? null : (await this.deps.uow.read.approvals.listForSubject(actor.workspaceId, record.plan.id)).filter((a) => a.subjectVersion === record.plan.version).at(-1)) ??
      null;
    const limits = approval ? { maxDebit: approval.maxDebit, reserve: approval.reserve } : { maxDebit: ctx.policy.maxTuitionDebit, reserve: ctx.policy.reserve };
    const payload = approvalPayloadFor(ctx, record, limits);
    const receiver = record.quote ? await this.deps.uow.read.recipients.get(actor.workspaceId, record.quote.receiverId) : null;
    const actors = await this.deps.uow.read.actors.list(actor.workspaceId);
    return {
      context: ctx,
      record,
      receiver,
      payload,
      fingerprint: payload ? fingerprintOf(payload, this.deps.hasher) : null,
      quoteExpired: record.quote ? isQuoteExpired(record.quote, ctx.now) : false,
      approval,
      now: ctx.now,
      studentName: actors.find((a) => a.role === "student")?.displayName ?? "Student",
      payerName: actors.find((a) => a.role === "payer")?.displayName ?? "Payer",
    };
  }
}
