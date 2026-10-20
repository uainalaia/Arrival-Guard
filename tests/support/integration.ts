import type { ActorContext } from "@/application/ActorContext";
import { and, eq, isNotNull } from "drizzle-orm";
import { getContainer } from "@/infrastructure/container";
import { getDb } from "@/infrastructure/db/client";
import { simInstitutionLedger, simProviderTransfers } from "@/infrastructure/db/schema";

// Ayudantes de integración: cada prueba crea su propio espacio en la rama dev de Neon (aislamiento por workspace_id).

export const app = () => getContainer();

export interface TestWorkspace {
  readonly workspaceId: string;
  readonly student: ActorContext;
  readonly payer: ActorContext;
  readonly evaluator: ActorContext;
}

export async function newWorkspace(scenario = "base"): Promise<TestWorkspace> {
  const created = await app().createWorkspace.execute({ scenario, ipHash: null });
  const ws = created.workspaceId;
  return {
    workspaceId: ws,
    student: { workspaceId: ws, actorId: created.actors.studentActorId, role: "student" },
    payer: { workspaceId: ws, actorId: created.actors.payerActorId, role: "payer" },
    evaluator: { workspaceId: ws, actorId: created.actors.evaluatorActorId, role: "evaluator" },
  };
}

/** Planifica, pide aprobación y aprueba como el pagador con la huella de la pantalla fija. */
export async function planAndApprove(t: TestWorkspace, targetArrivalHours = 48) {
  const planned = await app().planTuition.execute(t.student, { targetArrivalHours });
  const planId = planned.record.plan.id;
  await app().requestApproval.execute(t.student, { planId });
  const view = await app().approvalView.execute(t.payer, { planId });
  const approval = await app().grantApproval.execute(t.payer, {
    planId,
    planVersion: view.record.plan.version,
    fingerprint: view.fingerprint!,
  });
  return { planId, view, approval };
}

export async function payerBalance(workspaceId: string): Promise<string> {
  const account = await app().deps.uow.read.accounts.getByKind(workspaceId, "PAYER_USD");
  return account!.balance.toDecimalString();
}

export async function payerFunds(workspaceId: string) {
  const account = await app().deps.uow.read.accounts.getByKind(workspaceId, "PAYER_USD");
  const funds = account!.funds();
  return {
    balance: funds.balance.toDecimalString(),
    activeHolds: funds.activeHolds.toDecimalString(),
    reserve: account!.earmarkRemaining("ARRIVAL_EXPENSES").toDecimalString(),
  };
}

export async function eventTypes(workspaceId: string): Promise<string[]> {
  return (await app().deps.uow.read.events.list(workspaceId)).map((e) => e.type);
}

export const count = (items: readonly string[], value: string) => items.filter((i) => i === value).length;

/** Transferencias del proveedor simulado en el espacio (el lado del proveedor, VC4-5). */
export async function providerTransfers(workspaceId: string): Promise<{ idempotencyKey: string; id: string }[]> {
  const rows = await getDb().select().from(simProviderTransfers).where(eq(simProviderTransfers.workspaceId, workspaceId));
  return rows.map((r) => ({ idempotencyKey: r.idempotencyKey, id: r.id }));
}

/** Entradas del libro de la universidad para transferencias (no las históricas sembradas). */
export async function ledgerRows(workspaceId: string): Promise<number> {
  const rows = await getDb()
    .select()
    .from(simInstitutionLedger)
    .where(and(eq(simInstitutionLedger.workspaceId, workspaceId), isNotNull(simInstitutionLedger.transferId)));
  return rows.length;
}
