import { projectCash, type CashProjection } from "@/domain/cash/CashProjection";
import { Money } from "@/domain/money/Money";
import { evaluateTuitionRoutes } from "@/domain/policy/PolicyEngine";
import type { AppDeps } from "../AppDeps";
import { requireRole, type ActorContext } from "../ActorContext";
import { NotFoundError, ValidationError } from "../errors/ApplicationError";
import { loadTuitionContext, routingFacts } from "../services/TuitionContext";

/**
 * T4: proyección de caja por moneda. Resta el débito de matrícula planificado (o, sin plan, el de la ruta que
 * elegiría el motor con el objetivo por defecto), nunca cuenta ingresos condicionados y no suma monedas.
 */
export class ProjectCashUseCase {
  constructor(private readonly deps: Pick<AppDeps, "uow" | "provider" | "scenarios">) {}

  async execute(actor: ActorContext, command: { readonly arrivalExpensesMinor?: string } = {}): Promise<CashProjection> {
    requireRole(actor, "student", "payer");
    const repos = this.deps.uow.read;
    const workspace = await repos.workspaces.get(actor.workspaceId);
    if (!workspace) throw new NotFoundError();
    const ctx = await loadTuitionContext(repos, actor.workspaceId, this.deps.scenarios.acceptedTuitionChannels(workspace.scenario));
    const local = await repos.accounts.getByKind(actor.workspaceId, "STUDENT_LOCAL_CNY");
    if (!local) throw new NotFoundError();

    let plannedTuitionDebit: Money | null = null;
    if (ctx.obligation.status === "PENDING" && !ctx.account.funds().activeHolds.isPositive()) {
      const plan = await repos.plans.latestForObligation(actor.workspaceId, ctx.obligation.id);
      if (plan?.quote && plan.plan.isBeforeExecution() && plan.plan.status !== "NOT_VIABLE") {
        plannedTuitionDebit = plan.quote.debit;
      } else {
        const quotes = await this.deps.provider.quoteTuition(
          { workspaceId: actor.workspaceId, now: ctx.now },
          { universityRecipientId: ctx.university.id, unverifiedRecipientId: ctx.unverifiedAgent?.id ?? "rcp-none" },
        );
        const target = ctx.now.plusHours(this.deps.scenarios.defaultTargetArrivalHours(workspace.scenario));
        plannedTuitionDebit = evaluateTuitionRoutes(routingFacts(ctx, quotes, target)).selected?.debit ?? null;
      }
    }

    let expenses = await repos.finance.expectedExpenses(actor.workspaceId);
    if (command.arrivalExpensesMinor !== undefined) {
      if (!/^\d{1,15}$/.test(command.arrivalExpensesMinor)) throw new ValidationError("arrivalExpensesMinor must be a non-negative whole number of cents");
      expenses = [{ id: "user-estimate", label: "Arrival costs (your estimate)", amount: Money.fromMinorString("USD", command.arrivalExpensesMinor), source: "USER_ESTIMATE" }];
    }
    const pending = ctx.obligation.status === "PENDING" ? [{ id: ctx.obligation.id, label: `Tuition invoice ${ctx.obligation.reference}`, amount: ctx.obligation.netDue }] : [];

    return projectCash({
      payerFunds: ctx.account.funds(),
      arrivalEarmarkRemaining: ctx.account.earmarkRemaining("ARRIVAL_EXPENSES"),
      plannedTuitionDebit,
      localFunds: { balance: local.balance, status: local.toProps().status },
      pendingObligations: pending,
      conditionalIncomes: await repos.finance.conditionalIncomes(actor.workspaceId),
      expectedExpenses: expenses,
    });
  }
}
