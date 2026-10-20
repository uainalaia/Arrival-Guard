import type { Account } from "@/domain/account/Account";
import type { MandateUsage, StandingMandate } from "@/domain/consent/StandingMandate";
import type { AttemptRecord, RecipientRecord, Repositories } from "@/domain/ports/Repositories";
import type { VirtualInstant } from "@/domain/time/Instant";
import { NotFoundError } from "../errors/ApplicationError";

/** Hechos de una remesa de gastos de llegada (T3): cuenta del pagador, destinatario local, mandato y su uso. */
export interface RemittanceContext {
  readonly now: VirtualInstant;
  readonly account: Account;
  readonly localAccount: Account | null;
  readonly recipient: RecipientRecord;
  readonly mandate: StandingMandate | null;
  readonly usages: readonly MandateUsage[];
  readonly attempts: readonly AttemptRecord[];
}

/** Débitos bajo el mandato que cuentan para el período: todo intento de remesa salvo los fallidos sin débito. */
export function mandateUsages(attempts: readonly AttemptRecord[], mandateId: string | null): MandateUsage[] {
  if (!mandateId) return [];
  return attempts
    .filter((a) => a.attempt.kind === "REMITTANCE" && a.attempt.toProps().mandateId === mandateId && a.attempt.status !== "FAILED_CONFIRMED")
    .map((a) => ({ debit: a.attempt.debit, at: a.attempt.toProps().createdAt }));
}

/** Con `lock`, bloquea la cuenta del pagador primero (mismo orden que la matrícula) y después el mandato. */
export async function loadRemittanceContext(repos: Repositories, workspaceId: string, options: { readonly lock?: boolean } = {}): Promise<RemittanceContext> {
  const workspace = await repos.workspaces.get(workspaceId);
  if (!workspace) throw new NotFoundError();
  const account = await repos.accounts.getByKind(workspaceId, "PAYER_USD", { forUpdate: options.lock });
  if (!account) throw new NotFoundError();
  const recipients = await repos.recipients.list(workspaceId);
  const recipient = recipients.find((r) => r.kind === "STUDENT_LOCAL");
  if (!recipient) throw new NotFoundError();
  const mandates = await repos.mandates.list(workspaceId);
  const listed = mandates.find((m) => m.status === "ACTIVE" && m.recipientId === recipient.id) ?? null;
  const mandate = listed ? await repos.mandates.get(workspaceId, listed.id, { forUpdate: options.lock }) : null;
  const localAccount = await repos.accounts.getByKind(workspaceId, "STUDENT_LOCAL_CNY");
  const attempts = (await repos.attempts.listAll(workspaceId)).filter((a) => a.attempt.kind === "REMITTANCE");
  return { now: workspace.virtualNow, account, localAccount, recipient, mandate, usages: mandateUsages(attempts, mandate?.id ?? null), attempts };
}
