import type { CoreContainer } from "@/infrastructure/container";
import type { ActorContext } from "@/application/ActorContext";
import { NotFoundError } from "@/application/errors/ApplicationError";
import { AttemptMapper, PlanMapper, RemittanceMapper } from "@/application/mappers/CaseViewMapper";
import type { PlanVersionRecord } from "@/domain/ports/Repositories";
import { visibleTuitionStatus } from "@/domain/payment/VisibleStatus";

/** Arma PlanDTO con sus aprobaciones y receptores enmascarados. */
export async function presentPlan(app: CoreContainer, actor: ActorContext, record: PlanVersionRecord) {
  const repos = app.deps.uow.read;
  const [recipients, approvals, workspace] = await Promise.all([
    repos.recipients.list(actor.workspaceId),
    repos.approvals.listForSubject(actor.workspaceId, record.plan.id),
    repos.workspaces.get(actor.workspaceId),
  ]);
  const university = recipients.find((r) => r.kind === "INSTITUTION");
  return PlanMapper.toDTO(record, approvals, recipients, university?.id ?? "", workspace!.virtualNow);
}

/** Arma RemittanceDTO con su último intento y el destinatario enmascarado. */
export async function presentRemittance(app: CoreContainer, actor: ActorContext, remittanceId: string) {
  const repos = app.deps.uow.read;
  const [record, attempts, recipients] = await Promise.all([repos.remittances.get(actor.workspaceId, remittanceId), repos.attempts.listAll(actor.workspaceId), repos.recipients.list(actor.workspaceId)]);
  if (!record) throw new NotFoundError();
  const attempt = attempts.filter((a) => a.attempt.kind === "REMITTANCE" && a.attempt.toProps().subjectId === record.id).at(-1) ?? null;
  return RemittanceMapper.toDTO(record, attempt, recipients.find((r) => r.id === record.recipientId)?.maskedAccount ?? "••••");
}

/** Arma AttemptDTO con su estado visible y procedencia. */
export async function presentAttempt(app: CoreContainer, actor: ActorContext, attemptId: string) {
  const status = await app.paymentStatus.execute(actor, { attemptId });
  const attempt = status.attempt!;
  const visible = visibleTuitionStatus(status.plan?.plan ?? null, attempt.attempt);
  return AttemptMapper.toDTO(attempt, visible, status.observation);
}
