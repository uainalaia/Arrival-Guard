import { Account } from "@/domain/account/Account";
import { StandingMandate } from "@/domain/consent/StandingMandate";
import { Money } from "@/domain/money/Money";
import type { IdGeneratorPort } from "@/domain/ports/ClockPort";
import type { Repositories } from "@/domain/ports/Repositories";
import { VirtualInstant } from "@/domain/time/Instant";
import type { ScenarioCatalogPort, SeededWorkspace, WorkspaceSeederPort } from "@/application/ports/WorkspaceSeederPort";
import type { SimulatedInstitutionAdapter } from "../simulators/institution/SimulatedInstitutionAdapter";
import { SCENARIOS, getScenario } from "./definitions";
import { SCENARIO_IDS, type ScenarioId } from "./types";

const usd = (text: string) => Money.fromDecimal("USD", text);
const cny = (text: string) => Money.fromDecimal("CNY", text);

function scenarioOf(id: string) {
  if (!(SCENARIO_IDS as readonly string[]).includes(id)) throw new Error(`Escenario desconocido: ${id}`);
  return getScenario(id as ScenarioId);
}

/** Siembra un espacio de evaluación con los datos exactos de su escenario (BUILD_PROMPT 6). */
export class ScenarioSeeder implements WorkspaceSeederPort, ScenarioCatalogPort {
  constructor(
    private readonly ids: IdGeneratorPort,
    private readonly institution: SimulatedInstitutionAdapter,
  ) {}

  isKnownScenario(scenarioId: string): boolean {
    return (SCENARIO_IDS as readonly string[]).includes(scenarioId);
  }

  startOf(scenarioId: string): VirtualInstant {
    return VirtualInstant.fromISO(scenarioOf(scenarioId).startVirtualTime);
  }

  acceptedTuitionChannels(scenarioId: string): readonly string[] {
    return scenarioOf(scenarioId).acceptedTuitionChannels;
  }

  approvalValidityHours(scenarioId: string): number {
    return scenarioOf(scenarioId).approvalValidityHours;
  }

  defaultTargetArrivalHours(scenarioId: string): number {
    const s = scenarioOf(scenarioId);
    return s.requestedTargetArrivalHours ?? s.defaultTargetArrivalHours;
  }

  scenarios() {
    return SCENARIO_IDS.map((id) => ({ id, label: SCENARIOS[id].label, description: SCENARIOS[id].description }));
  }

  async seed(repos: Repositories, workspaceId: string, scenarioId: string, start: VirtualInstant): Promise<SeededWorkspace> {
    const s = scenarioOf(scenarioId);
    const studentActorId = this.ids.newId();
    const payerActorId = this.ids.newId();
    const evaluatorActorId = this.ids.newId();
    await repos.actors.insert({ id: studentActorId, workspaceId, role: "student", displayName: s.student.displayName });
    await repos.actors.insert({ id: payerActorId, workspaceId, role: "payer", displayName: s.payer.displayName });
    await repos.actors.insert({ id: evaluatorActorId, workspaceId, role: "evaluator", displayName: "Evaluator" });

    const payerAccount = Account.rehydrate({
      id: this.ids.newId(),
      workspaceId,
      ownerActorId: payerActorId,
      kind: "PAYER_USD",
      currency: "USD",
      balance: usd(s.payer.balanceUsd),
      maskedNumber: s.payer.accountMasked,
      status: "OPEN",
      version: 1,
      earmarks: [{ id: this.ids.newId(), purpose: "ARRIVAL_EXPENSES", amount: usd(s.arrivalReserveUsd), used: usd(s.arrivalReserveUsedUsd) }],
      holds: [],
    });
    await repos.accounts.insert(payerAccount);
    const local = s.student.localAccount;
    await repos.accounts.insert(
      Account.rehydrate({
        id: this.ids.newId(),
        workspaceId,
        ownerActorId: studentActorId,
        kind: "STUDENT_LOCAL_CNY",
        currency: "CNY",
        balance: Money.zero("CNY"),
        maskedNumber: local.masked,
        status: local.status,
        version: 1,
        earmarks: [],
        holds: [],
      }),
      { bankName: local.bankName },
    );
    await repos.policies.insert({
      id: this.ids.newId(),
      workspaceId,
      accountId: payerAccount.id,
      maxTuitionDebit: usd(s.policy.maxTuitionDebitUsd),
      reserve: usd(s.policy.reserveUsd),
      version: 1,
    });

    const universityId = this.ids.newId();
    await repos.recipients.insert({
      id: universityId,
      workspaceId,
      kind: "INSTITUTION",
      displayName: s.obligation.receiverDisplayName,
      maskedAccount: s.obligation.receiverMasked,
      currency: "CNY",
      verified: true,
      accountStatus: "OPEN",
      addedByActorId: null,
    });
    await repos.recipients.insert({
      id: this.ids.newId(),
      workspaceId,
      kind: "EXTERNAL",
      displayName: "Fast tuition agent (not the university's account)",
      maskedAccount: "•••• 5561",
      currency: "CNY",
      verified: false,
      accountStatus: "OPEN",
      addedByActorId: null,
    });
    const localRecipientId = this.ids.newId();
    await repos.recipients.insert({
      id: localRecipientId,
      workspaceId,
      kind: "STUDENT_LOCAL",
      displayName: `${s.student.displayName}, ${local.bankName}`,
      maskedAccount: local.masked,
      currency: "CNY",
      verified: local.verified,
      accountStatus: local.status,
      addedByActorId: local.verified ? payerActorId : null,
    });

    await repos.obligations.insert({
      id: this.ids.newId(),
      workspaceId,
      recipientId: universityId,
      studentActorId,
      sourceAccountId: payerAccount.id,
      netDue: cny(s.obligation.netDueCny),
      reference: s.obligation.reference,
      dueAt: start.plusHours(s.obligation.dueInHours),
      status: s.obligation.status,
      version: 1,
    });

    await repos.finance.insertConditionalIncome(workspaceId, {
      id: this.ids.newId(),
      kind: "SCHOLARSHIP",
      amount: cny(s.scholarship.amountCny),
      expectedAt: start.plusDays(s.scholarship.expectedInDays),
      condition: s.scholarship.condition,
      status: s.scholarship.status,
    });
    await repos.finance.insertExpectedExpense(workspaceId, {
      id: this.ids.newId(),
      label: "Arrival costs (your estimate)",
      amount: usd(s.expectedArrivalExpenseUsd),
      source: "USER_ESTIMATE",
    });

    if (s.mandate) {
      await repos.mandates.insert(
        StandingMandate.rehydrate({
          id: this.ids.newId(),
          workspaceId,
          payerActorId,
          purpose: s.mandate.purpose,
          recipientId: localRecipientId,
          periodMax: usd(s.mandate.periodMaxUsd),
          periodDays: s.mandate.periodDays,
          expiresAt: start.plusDays(s.mandate.expiresInDays),
          status: "ACTIVE",
          version: 1,
        }),
      );
    }
    return { studentActorId, payerActorId, evaluatorActorId };
  }

  async seedSimulators(workspaceId: string, scenarioId: string, start: VirtualInstant): Promise<void> {
    const s = scenarioOf(scenarioId);
    if (s.obligation.status === "CREDITED") {
      await this.institution.seedCredited(
        { workspaceId, now: start },
        {
          reference: s.obligation.reference,
          net: cny(s.obligation.historicalPaidCny ?? s.obligation.netDueCny),
          owed: cny(s.obligation.netDueCny),
          creditedAt: start.plusDays(-7),
        },
      );
    }
  }
}
