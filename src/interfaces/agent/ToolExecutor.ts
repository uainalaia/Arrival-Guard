import type { ActorContext } from "@/application/ActorContext";
import type { ChatComponentDTO } from "@/application/dto/ChatDTO";
import { ApplicationError } from "@/application/errors/ApplicationError";
import { CaseStateMapper } from "@/application/mappers/CaseStateMapper";
import { CaseViewMapper, CashProjectionMapper, RefundMapper, RouteMapper } from "@/application/mappers/CaseViewMapper";
import { moneyText } from "@/application/mappers/CaseStateMapper";
import type { AgentToolDefinition, ToolOutcome, ToolRunnerPort } from "@/application/ports/AgentPorts";
import { event } from "@/application/services/events";
import { DomainError, PolicyViolationError } from "@/domain/errors/DomainError";
import type { ActorRole } from "@/domain/events/DomainEvent";
import { Money } from "@/domain/money/Money";
import type { CoreContainer } from "@/infrastructure/container";
import { presentAttempt, presentPlan, presentRemittance } from "../http/presenters";
import { ACTIVITY_LABELS, ROLE_TOOLS, TOOL_INPUTS, toolsForRole, type ToolName } from "./toolCatalog";

// Ejecutor de herramientas (BUILD_PROMPT 13.2 y 13.3). Usa SIEMPRE el actor de la sesión: el modelo no puede elegir
// rol, actor ni espacio. Valida cada entrada con Zod, llama a los casos de uso (que vuelven a comprobar el rol y las
// reglas) y arma los componentes de la interfaz desde el estado del servidor.

interface Done {
  readonly result: unknown;
  readonly components: readonly ChatComponentDTO[];
}

export class ToolExecutor implements ToolRunnerPort {
  constructor(private readonly app: () => CoreContainer) {}

  definitions(role: ActorRole): readonly AgentToolDefinition[] {
    return toolsForRole(role);
  }

  async run(actor: ActorContext, name: string, input: unknown): Promise<ToolOutcome> {
    const allowed = actor.role === "student" || actor.role === "payer" ? ROLE_TOOLS[actor.role] : [];
    if (!allowed.includes(name) || !(name in TOOL_INPUTS)) return this.privilegeEscalation(actor, name);
    const tool = name as ToolName;
    const activity = (ok: boolean, reason: string | null) => ({ tool, label: ACTIVITY_LABELS[tool], ok, reason });
    const parsed = TOOL_INPUTS[tool].safeParse(input ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        result: { error: "VALIDATION_ERROR", issues: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`) },
        reason: "VALIDATION_ERROR",
        activity: activity(false, "VALIDATION_ERROR"),
        components: [],
      };
    }
    try {
      const done = await this.execute(actor, tool, parsed.data as Record<string, unknown>);
      return { ok: true, result: done.result, reason: null, activity: activity(true, null), components: done.components };
    } catch (error) {
      const failure = toFailure(error);
      return {
        ok: false,
        result: failure.result,
        reason: failure.reason,
        activity: activity(false, failure.reason),
        components: failure.reasons.length > 0 ? [{ kind: "BLOCKED", reasons: failure.reasons }] : [],
      };
    }
  }

  private async execute(actor: ActorContext, tool: ToolName, input: Record<string, unknown>): Promise<Done> {
    const app = this.app();
    switch (tool) {
      case "get_case_overview": {
        const view = CaseViewMapper.toDTO(await app.caseView.execute(actor));
        return { result: CaseStateMapper.toCaseState(view), components: [] };
      }
      case "plan_tuition_payment": {
        const change = await app.planTuition.execute(actor, { targetArrivalHours: input.target_arrival_hours as number });
        const plan = await presentPlan(app, actor, change.record);
        return {
          result: { outcome: change.outcome, invalidated_approvals: change.invalidatedApprovalIds.length, changed_fields: change.materialFields, plan: CaseStateMapper.plan(plan) },
          components: [{ kind: "PLAN", plan }],
        };
      }
      case "compare_routes": {
        const hours = input.target_arrival_hours as number;
        const result = await app.compareRoutes.tuition(actor, { targetArrivalHours: hours });
        const recipients = await app.deps.uow.read.recipients.list(actor.workspaceId);
        const university = recipients.find((r) => r.kind === "INSTITUTION");
        const routing = RouteMapper.routingToDTO(result, recipients, university?.id ?? "");
        const workspace = await app.deps.uow.read.workspaces.get(actor.workspaceId);
        return {
          result: { no_effects: true, target_arrival_hours: hours, routes: CaseStateMapper.routing(routing) },
          components: [{ kind: "ROUTES", routing, targetHours: hours, comparedAt: workspace?.virtualNow.toISOString() ?? null }],
        };
      }
      case "request_payer_approval": {
        const record = await app.requestApproval.execute(actor, { planId: input.plan_id as string });
        const plan = await presentPlan(app, actor, record);
        return {
          result: { requested: true, plan: CaseStateMapper.plan(plan), note: "The payer approves on his own fixed screen." },
          components: [{ kind: "APPROVAL_REQUESTED", planId: plan.planId, planVersion: plan.version }, { kind: "PLAN", plan }],
        };
      }
      case "execute_approved_payment": {
        const planId = input.plan_id as string;
        const repos = app.deps.uow.read;
        const current = await repos.plans.getCurrent(actor.workspaceId, planId);
        // La aprobación de esta versión, vigente o ya consumida: así un reintento del agente repite la MISMA clave.
        const approvals = current ? await repos.approvals.listForSubject(actor.workspaceId, planId) : [];
        const approval = approvals.find((a) => a.subjectVersion === current!.plan.version && (a.status === "ACTIVE" || a.status === "CONSUMED")) ?? null;
        // La clave la deriva el servidor (BUILD_PROMPT 11): un reintento del agente nunca duplica el pago.
        const key = `tuition:${planId}:v${current?.plan.version ?? 0}:${approval?.id ?? "none"}`;
        const executed = await app.executeTuition.execute(actor, { planId, idempotencyKey: key });
        const attempt = await presentAttempt(app, actor, executed.attempt.attempt.id);
        return { result: { replayed: executed.replayed, payment: CaseStateMapper.attempt(attempt) }, components: [{ kind: "PAYMENT", attempt }] };
      }
      case "get_payment_status": {
        const status = await app.paymentStatus.execute(actor, { attemptId: input.attempt_id as string | undefined });
        if (!status.attempt) return { result: { payment: null, visible_status: status.visible.status, next_action: status.visible.nextAction }, components: [] };
        const attempt = await presentAttempt(app, actor, status.attempt.attempt.id);
        return { result: { payment: CaseStateMapper.attempt(attempt) }, components: [{ kind: "PAYMENT", attempt }] };
      }
      case "reconcile_payment": {
        const attemptId = input.attempt_id as string;
        await app.reconcile.execute(actor, { attemptId });
        const attempt = await presentAttempt(app, actor, attemptId);
        return { result: { same_payment: true, payment: CaseStateMapper.attempt(attempt) }, components: [{ kind: "PAYMENT", attempt }] };
      }
      case "project_cash": {
        const usd = input.arrival_expenses_usd as string | undefined;
        const projection = CashProjectionMapper.toDTO(
          await app.projectCash.execute(actor, { arrivalExpensesMinor: usd ? Money.fromDecimal("USD", usd).minor.toString() : undefined }),
        );
        return { result: { projection: CaseStateMapper.cash(projection) }, components: [{ kind: "CASH", projection }] };
      }
      case "prepare_remittance": {
        const local = (await app.deps.uow.read.recipients.list(actor.workspaceId)).find((r) => r.kind === "STUDENT_LOCAL");
        const asked = input.recipient_id as string | undefined;
        if (asked && asked !== local?.id) {
          // Un destino que no es la cuenta local verificada no se acepta (S15): queda como inducción.
          await this.securityBlock(actor, "prepare_remittance", "INDUCED_TRANSFER", "RECIPIENT_NOT_VERIFIED");
          throw new PolicyViolationError(["RECIPIENT_NOT_VERIFIED"]);
        }
        const record = await app.prepareRemittance.execute(actor, { net: Money.fromDecimal("CNY", input.net_amount as string), targetArrivalHours: input.target_arrival_hours as number });
        const remittance = await presentRemittance(app, actor, record.id);
        return {
          result: {
            remittance_id: record.id,
            status: record.status,
            authorization: record.authorization,
            reasons: record.reasons,
            route: record.quote?.routeId ?? null,
            debit: record.quote ? moneyText(record.quote.debit.toJSON()) : null,
            net: moneyText(record.net.toJSON()),
            next: record.status === "READY" ? "Within the standing permission: it can be sent." : record.status === "APPROVAL_REQUESTED" ? "Above the standing permission: the payer must approve it once on his screen." : "Blocked: see reasons.",
          },
          components: [{ kind: "REMITTANCE", remittance }],
        };
      }
      case "execute_remittance": {
        const remittanceId = input.remittance_id as string;
        const record = await app.deps.uow.read.remittances.get(actor.workspaceId, remittanceId);
        // Clave derivada por el servidor: un reintento del agente repite la misma.
        const key = `remittance:${remittanceId}:v${record?.version ?? 0}:${record?.approvalId ?? "mandate"}`;
        const outcome = await app.executeRemittance.execute(actor, { remittanceId, idempotencyKey: key });
        const remittance = await presentRemittance(app, actor, remittanceId);
        if (outcome.outcome === "NEEDS_PAYER_APPROVAL") {
          return { result: { sent: false, needs_payer_approval: true, reasons: outcome.remittance.reasons }, components: [{ kind: "REMITTANCE", remittance }] };
        }
        const attempt = await presentAttempt(app, actor, outcome.attempt.attempt.id);
        return { result: { sent: true, replayed: outcome.replayed, payment: CaseStateMapper.attempt(attempt) }, components: [{ kind: "REMITTANCE", remittance }] };
      }
      case "prepare_refund_claim": {
        const claim = await app.prepareRefund.execute(actor, { obligationId: input.obligation_id as string });
        const account = await app.deps.uow.read.accounts.getByKind(actor.workspaceId, "PAYER_USD");
        const dto = RefundMapper.toDTO(claim, account?.toProps().maskedNumber ?? "••••");
        return {
          result: { claim_id: claim.id, status: claim.status, amount: moneyText(dto.amount), destination: "the paying account (fixed)", verified_excess: moneyText(dto.verifiedExcess) },
          components: [{ kind: "REFUND", claim: dto }],
        };
      }
      case "submit_refund_claim": {
        const claimId = input.claim_id as string;
        const submitted = await app.submitRefund.execute(actor, { claimId, idempotencyKey: `refund:${claimId}` });
        const account = await app.deps.uow.read.accounts.getByKind(actor.workspaceId, "PAYER_USD");
        const dto = RefundMapper.toDTO(submitted.claim, account?.toProps().maskedNumber ?? "••••");
        return { result: { claim_id: claimId, status: dto.status, replayed: submitted.replayed }, components: [{ kind: "REFUND", claim: dto }] };
      }
      case "prepare_policy_change": {
        const record = await app.preparePayerChange.execute(actor, {
          kind: "POLICY_CHANGE",
          maxTuitionDebit: input.new_max_usd ? Money.fromDecimal("USD", input.new_max_usd as string) : undefined,
          reserve: input.new_reserve_usd ? Money.fromDecimal("USD", input.new_reserve_usd as string) : undefined,
        });
        return {
          result: { prepared: true, applied: false, change_id: record.id, note: "Nothing changed yet. The payer must confirm it on the fixed confirmation screen." },
          components: [{ kind: "PENDING_CHANGE", changeId: record.id, changeKind: record.kind, fingerprintPrefix: record.fingerprint.slice(0, 8) }],
        };
      }
      case "prepare_mandate_change": {
        const record = await app.preparePayerChange.execute(actor, {
          kind: "MANDATE_CHANGE",
          mandateId: input.mandate_id as string,
          newPeriodMax: input.new_period_max_usd ? Money.fromDecimal("USD", input.new_period_max_usd as string) : undefined,
          revoke: input.revoke as boolean | undefined,
        });
        return {
          result: { prepared: true, applied: false, change_id: record.id, note: "Nothing changed yet. The payer must confirm it on the fixed confirmation screen." },
          components: [{ kind: "PENDING_CHANGE", changeId: record.id, changeKind: record.kind, fingerprintPrefix: record.fingerprint.slice(0, 8) }],
        };
      }
    }
  }

  private async securityBlock(actor: ActorContext, tool: string, category: "INDUCED_TRANSFER" | "PRIVILEGE_ESCALATION", reason: string): Promise<void> {
    const app = this.app();
    const workspace = await app.deps.uow.read.workspaces.get(actor.workspaceId);
    if (!workspace) return;
    await app.deps.uow.transaction((r) => r.events.append(actor.workspaceId, [event("SECURITY_BLOCK", actor.role, { type: "Tool", id: tool }, workspace.virtualNow, { category, reason, tool })]));
  }

  /** Herramienta ajena al rol (o inventada): se rechaza y queda como SECURITY_BLOCK de escalada de privilegios. */
  private async privilegeEscalation(actor: ActorContext, name: string): Promise<ToolOutcome> {
    const app = this.app();
    const workspace = await app.deps.uow.read.workspaces.get(actor.workspaceId);
    if (workspace) {
      await app.deps.uow.transaction((r) =>
        r.events.append(actor.workspaceId, [
          event("SECURITY_BLOCK", actor.role, { type: "Tool", id: name.slice(0, 64) }, workspace.virtualNow, { category: "PRIVILEGE_ESCALATION", reason: "ROLE_NOT_ALLOWED", tool: name.slice(0, 64) }),
        ]),
      );
    }
    return {
      ok: false,
      result: { error: "ROLE_NOT_ALLOWED", reason: "This tool is not available for this role. Approvals and limit changes happen only on the payer's fixed screen." },
      reason: "ROLE_NOT_ALLOWED",
      activity: { tool: name.slice(0, 64), label: "Checking permissions", ok: false, reason: "ROLE_NOT_ALLOWED" },
      components: [{ kind: "SECURITY_BLOCK", category: "PRIVILEGE_ESCALATION", reason: "ROLE_NOT_ALLOWED" }],
    };
  }
}

function toFailure(error: unknown): { result: Record<string, unknown>; reason: string; reasons: string[] } {
  if (error instanceof DomainError || error instanceof ApplicationError) {
    const reasons = "reasons" in error && Array.isArray((error as { reasons?: unknown }).reasons) ? [...(error as { reasons: string[] }).reasons] : [];
    const result: Record<string, unknown> = { error: error.code, reasons };
    if ("existingAttemptId" in error) result.existing_attempt_id = (error as { existingAttemptId?: string }).existingAttemptId;
    if (error.code === "ACTIVE_ATTEMPT_EXISTS") result.instruction = "A payment is already on its way. Reconcile that same payment; never send another.";
    return { result, reason: reasons[0] ?? error.code, reasons: error.code === "POLICY_VIOLATION" ? reasons : error.code === "ACTIVE_ATTEMPT_EXISTS" ? ["ACTIVE_ATTEMPT_EXISTS"] : [] };
  }
  console.error(`[agent] tool failed: ${error instanceof Error ? error.name : "unknown"}`);
  return { result: { error: "TOOL_FAILED", reason: "The tool could not run. The payment state is saved." }, reason: "TOOL_FAILED", reasons: [] };
}
