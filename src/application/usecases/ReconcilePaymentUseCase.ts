import type { AttemptRecord } from "@/domain/ports/Repositories";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError } from "../errors/ApplicationError";
import type { Observation, TuitionPaymentProcessor } from "../services/TuitionPaymentProcessor";

/** Concilia el MISMO intento con el proveedor y la institución. Nunca crea un pago nuevo (T2, O03, D11). */
export class ReconcilePaymentUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow">,
    private readonly processor: TuitionPaymentProcessor,
  ) {}

  async execute(actor: ActorContext, command: { readonly attemptId: string }): Promise<{ attempt: AttemptRecord; observation: Observation }> {
    requireRole(actor, "student", "payer");
    const record = await this.deps.uow.read.attempts.get(actor.workspaceId, command.attemptId);
    if (!record) throw new NotFoundError();
    const observation = await this.processor.reconcile(actor.workspaceId, command.attemptId, actor.role);
    const attempt = await this.deps.uow.read.attempts.get(actor.workspaceId, command.attemptId);
    return { attempt: attempt ?? record, observation };
  }
}
