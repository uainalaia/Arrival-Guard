import type { AppDeps } from "@/application/AppDeps";
import { TuitionPaymentProcessor } from "@/application/services/TuitionPaymentProcessor";
import { AdvanceVirtualClockUseCase } from "@/application/usecases/AdvanceVirtualClockUseCase";
import { CompareRoutesUseCase } from "@/application/usecases/CompareRoutesUseCase";
import { CreateEvaluationWorkspaceUseCase } from "@/application/usecases/CreateEvaluationWorkspaceUseCase";
import { ExecuteTuitionPaymentUseCase } from "@/application/usecases/ExecuteTuitionPaymentUseCase";
import { GetApprovalViewUseCase } from "@/application/usecases/GetApprovalViewUseCase";
import { GetPaymentStatusUseCase } from "@/application/usecases/GetPaymentStatusUseCase";
import { GrantApprovalUseCase } from "@/application/usecases/GrantApprovalUseCase";
import { InjectFaultUseCase } from "@/application/usecases/InjectFaultUseCase";
import { PlanTuitionPaymentUseCase } from "@/application/usecases/PlanTuitionPaymentUseCase";
import { ProjectCashUseCase } from "@/application/usecases/ProjectCashUseCase";
import { ChangePayerPolicyUseCase } from "@/application/usecases/ChangePayerPolicyUseCase";
import { ConfirmPayerChangeUseCase } from "@/application/usecases/ConfirmPayerChangeUseCase";
import { GetCaseViewUseCase } from "@/application/usecases/GetCaseViewUseCase";
import { OpenEvaluationAccessUseCase } from "@/application/usecases/OpenEvaluationAccessUseCase";
import { PreparePayerChangeUseCase } from "@/application/usecases/PreparePayerChangeUseCase";
import { ReadModelsUseCase } from "@/application/usecases/ReadModelsUseCase";
import { RevokePermissionUseCase } from "@/application/usecases/RevokePermissionUseCase";
import { DbRateLimiter, DrizzleSessionStore, EnvAccessCode } from "./auth/DrizzleSessionStore";
import { pepperedHash } from "./auth/secrets";
import { getServerEnv, usdToMicros } from "./config/env";
import { ChatTurnUseCase } from "@/application/usecases/ChatTurnUseCase";
import { ExecuteRemittanceUseCase } from "@/application/usecases/ExecuteRemittanceUseCase";
import { PrepareRemittanceUseCase } from "@/application/usecases/PrepareRemittanceUseCase";
import { PrepareRefundClaimUseCase, SubmitRefundClaimUseCase } from "@/application/usecases/RefundClaimUseCases";
import { RemittanceApprovalUseCase } from "@/application/usecases/RemittanceApprovalUseCase";
import { RefundProcessor } from "@/application/services/RefundProcessor";
import { GetEvidenceUseCase } from "@/application/usecases/GetEvidenceUseCase";
import { AgentModelError, type AgentModelPort } from "@/application/ports/AgentPorts";
import { ToolExecutor } from "@/interfaces/agent/ToolExecutor";
import { AnthropicAgentModel } from "./ai/AnthropicAgentModel";
import { DrizzleAiUsageStore, DrizzleConversationStore } from "./db/repositories/aiRepositories";
import { ReconcilePaymentUseCase } from "@/application/usecases/ReconcilePaymentUseCase";
import { RequestPayerApprovalUseCase } from "@/application/usecases/RequestPayerApprovalUseCase";
import { RunScriptedTasksUseCase } from "@/application/usecases/RunScriptedTasksUseCase";
import { NodeHasher } from "./crypto/NodeHasher";
import { getDb } from "./db/client";
import { DrizzleUnitOfWork } from "./db/DrizzleUnitOfWork";
import { ScenarioSeeder } from "./scenarios/ScenarioSeeder";
import { SimulatedInstitutionAdapter } from "./simulators/institution/SimulatedInstitutionAdapter";
import { SimulatedProviderAdapter } from "./simulators/provider/SimulatedProviderAdapter";
import { SystemClock, UuidGenerator } from "./system/SystemClock";

/** Raíz de composición: arma los puertos reales y los casos de uso. */
export function buildContainer() {
  const db = getDb();
  const hasher = new NodeHasher();
  const ids = new UuidGenerator();
  const institution = new SimulatedInstitutionAdapter(db);
  const provider = new SimulatedProviderAdapter(db, institution, hasher);
  const seeder = new ScenarioSeeder(ids, institution);
  const deps: AppDeps = {
    uow: new DrizzleUnitOfWork(db),
    provider,
    institution,
    hasher,
    ids,
    scenarios: seeder,
    seeder,
    realClock: new SystemClock(),
  };
  const processor = new TuitionPaymentProcessor(deps);
  const refundProcessor = new RefundProcessor(deps);
  const pepper = () => getServerEnv().SESSION_PEPPER;
  const sessions = new DrizzleSessionStore(db, pepper);
  const limiter = new DbRateLimiter(db);
  const createWorkspace = new CreateEvaluationWorkspaceUseCase(deps);
  const caseView = new GetCaseViewUseCase(deps, processor);
  return {
    deps,
    processor,
    sessions,
    limiter,
    /** HMAC con pepper de un valor que no debe guardarse en claro (por ejemplo, la IP). */
    hashForStorage: (purpose: string, value: string) => pepperedHash(pepper(), purpose, value),
    createWorkspace,
    access: new OpenEvaluationAccessUseCase(createWorkspace, sessions, limiter, new EnvAccessCode(() => getServerEnv().EVAL_ACCESS_CODE, pepper), {
      sessionTtlHours: getServerEnv().EVAL_SESSION_TTL_HOURS,
      perIpPerHour: getServerEnv().EVAL_ACCESS_PER_IP_HOUR,
      perDay: getServerEnv().EVAL_WORKSPACES_PER_DAY,
      keyPrefix: getServerEnv().RATE_LIMIT_PREFIX,
    }),
    caseView,
    changePolicy: new ChangePayerPolicyUseCase(deps),
    preparePayerChange: new PreparePayerChangeUseCase(deps),
    confirmPayerChange: new ConfirmPayerChangeUseCase(deps),
    revoke: new RevokePermissionUseCase(deps),
    readModels: new ReadModelsUseCase(deps),
    planTuition: new PlanTuitionPaymentUseCase(deps),
    compareRoutes: new CompareRoutesUseCase(deps),
    requestApproval: new RequestPayerApprovalUseCase(deps),
    approvalView: new GetApprovalViewUseCase(deps),
    grantApproval: new GrantApprovalUseCase(deps),
    executeTuition: new ExecuteTuitionPaymentUseCase(deps, processor),
    reconcile: new ReconcilePaymentUseCase(deps, processor),
    paymentStatus: new GetPaymentStatusUseCase(deps, processor),
    advanceClock: new AdvanceVirtualClockUseCase(deps, processor, refundProcessor),
    prepareRemittance: new PrepareRemittanceUseCase(deps),
    executeRemittance: new ExecuteRemittanceUseCase(deps, processor),
    remittanceApproval: new RemittanceApprovalUseCase(deps),
    prepareRefund: new PrepareRefundClaimUseCase(deps),
    submitRefund: new SubmitRefundClaimUseCase(deps, refundProcessor),
    refundProcessor,
    evidence: new GetEvidenceUseCase(deps, new DrizzleAiUsageStore()),
    injectFault: new InjectFaultUseCase(deps),
    projectCash: new ProjectCashUseCase(deps),
  };
}

/** Sin clave de API el asistente queda no disponible y la interfaz usa el modo estructurado (BUILD_PROMPT 13.6). */
function agentModel(apiKey: string | undefined, model: string): AgentModelPort {
  if (apiKey) return new AnthropicAgentModel(apiKey, model);
  return {
    model,
    respond: async () => {
      throw new AgentModelError("UNAVAILABLE", "No API key configured.");
    },
  };
}

/** Núcleo sin el chat: lo usan el ejecutor de herramientas y los presentadores (evita un tipo circular). */
export type CoreContainer = ReturnType<typeof buildContainer>;

function buildChat(core: CoreContainer): ChatTurnUseCase {
  const env = getServerEnv();
  return new ChatTurnUseCase(core.deps, core.caseView, agentModel(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL), new ToolExecutor(() => getContainer()), new DrizzleConversationStore(), new DrizzleAiUsageStore(), core.limiter, {
    budgetPerWorkspaceMicros: usdToMicros(env.AI_BUDGET_PER_WORKSPACE_USD),
    budgetDailyMicros: usdToMicros(env.AI_BUDGET_DAILY_USD),
    budgetPerOriginDailyMicros: usdToMicros(env.AI_BUDGET_PER_ORIGIN_DAILY_USD),
    turnsPerMinute: env.AI_TURNS_PER_MINUTE,
    turnsPerDay: env.AI_TURNS_PER_DAY,
    rateLimitPrefix: env.RATE_LIMIT_PREFIX,
    prices: {
      input: usdToMicros(env.PRICE_INPUT_PER_MTOK_USD),
      output: usdToMicros(env.PRICE_OUTPUT_PER_MTOK_USD),
      cacheRead: usdToMicros(env.PRICE_CACHE_READ_PER_MTOK_USD),
      cacheWrite: usdToMicros(env.PRICE_CACHE_WRITE_PER_MTOK_USD),
    },
    maxModelCalls: 4,
    maxToolCalls: 6,
    // No se empieza otra llamada pasados 25 s: 25 s más una llamada de 25 s y el guardado caben en los 60 s de la ruta.
    turnDeadlineMs: 25_000,
    historyTurns: 8,
  });
}

export type Container = CoreContainer & { readonly chat: ChatTurnUseCase; readonly scriptedTasks: RunScriptedTasksUseCase };

let container: Container | undefined;

export function getContainer(): Container {
  if (!container) {
    const core = buildContainer();
    const env = getServerEnv();
    const scriptedTasks = new RunScriptedTasksUseCase(core.deps, () => getContainer(), core.limiter, {
      keyPrefix: env.RATE_LIMIT_PREFIX,
      perWorkspacePerHour: env.SCRIPTED_TASKS_PER_WORKSPACE_HOUR,
      perOriginPerDay: env.SCRIPTED_TASKS_PER_ORIGIN_DAY,
      perDay: env.SCRIPTED_TASKS_PER_DAY,
      startIntervalSeconds: 60,
    });
    container = Object.assign(core, { chat: buildChat(core), scriptedTasks });
  }
  return container;
}
