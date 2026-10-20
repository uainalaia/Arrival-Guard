import type { Approval } from "@/domain/consent/Approval";
import type { StandingMandate } from "@/domain/consent/StandingMandate";
import type { AttemptRecord, ObligationRecord, PlanVersionRecord, RemittanceRecord, StoredEvent, WorkspaceRecord } from "@/domain/ports/Repositories";
import type { RefundClaim } from "@/domain/refund/RefundClaim";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError } from "../errors/ApplicationError";
import type { AiUsageStorePort } from "../ports/AgentPorts";

export interface EvidenceSnapshot {
  readonly workspace: WorkspaceRecord;
  readonly scenarioLabel: string;
  readonly people: { readonly student: string; readonly payer: string };
  readonly payerAccountMasked: string;
  readonly obligations: readonly ObligationRecord[];
  readonly plans: readonly PlanVersionRecord[];
  readonly approvals: readonly Approval[];
  readonly mandates: readonly StandingMandate[];
  readonly attempts: readonly AttemptRecord[];
  readonly remittances: readonly RemittanceRecord[];
  readonly refunds: readonly RefundClaim[];
  readonly events: readonly StoredEvent[];
  readonly aiUsageMicros: bigint;
}

/**
 * Expediente de evidencia del espacio (BUILD_PROMPT 16.6): todo lo que pasó, desde el servidor. El mapeo, el
 * enmascarado y el recorte de claves los hace EvidenceMapper.
 */
export class GetEvidenceUseCase {
  constructor(
    private readonly deps: Pick<AppDeps, "uow" | "scenarios">,
    private readonly usage: AiUsageStorePort,
  ) {}

  async execute(actor: ActorContext): Promise<EvidenceSnapshot> {
    requireRole(actor, "student", "payer", "evaluator");
    const repos = this.deps.uow.read;
    const ws = actor.workspaceId;
    const workspace = await repos.workspaces.get(ws);
    if (!workspace) throw new NotFoundError();
    const [actors, obligations, mandates, attempts, remittances, refunds, events, account, aiUsageMicros] = await Promise.all([
      repos.actors.list(ws),
      repos.obligations.list(ws),
      repos.mandates.list(ws),
      repos.attempts.listAll(ws),
      repos.remittances.list(ws),
      repos.refunds.list(ws),
      repos.events.list(ws, { afterSeq: 0, limit: 2000 }),
      repos.accounts.getByKind(ws, "PAYER_USD"),
      this.usage.spentByWorkspace(ws),
    ]);
    const plans = (await Promise.all(obligations.map((o) => repos.plans.listForObligation(ws, o.id)))).flat();
    const subjects = [...new Set([...plans.map((p) => p.plan.id), ...remittances.map((r) => r.id)])];
    const approvals = (await Promise.all(subjects.map((id) => repos.approvals.listForSubject(ws, id)))).flat();
    return {
      workspace,
      scenarioLabel: this.deps.scenarios.scenarios().find((s) => s.id === workspace.scenario)?.label ?? workspace.scenario,
      people: {
        student: actors.find((a) => a.role === "student")?.displayName ?? "Student",
        payer: actors.find((a) => a.role === "payer")?.displayName ?? "Payer",
      },
      payerAccountMasked: account?.toProps().maskedNumber ?? "••••",
      obligations,
      plans,
      approvals,
      mandates,
      attempts,
      remittances,
      refunds,
      events,
      aiUsageMicros,
    };
  }
}
