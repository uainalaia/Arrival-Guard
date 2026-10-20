import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { ActorRole, DomainEventDraft } from "@/domain/events/DomainEvent";
import type {
  ActorRecord,
  ActorRepository,
  EventRepository,
  FaultName,
  LockOptions,
  PendingChangeKind,
  PendingChangeRecord,
  PendingChangeRepository,
  PendingChangeStatus,
  ProviderEventReceiptRepository,
  StoredEvent,
  WorkspaceRecord,
  WorkspaceRepository,
} from "@/domain/ports/Repositories";
import { RealInstant, VirtualInstant } from "@/domain/time/Instant";
import { redact } from "../../security/redact";
import type { DbExecutor } from "../executor";
import { actors, domainEvents, pendingChanges, processedProviderEvents, workspaces } from "../schema";

export class DrizzleWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(id: string, options?: LockOptions): Promise<WorkspaceRecord | null> {
    const query = this.db.select().from(workspaces).where(eq(workspaces.id, id));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    if (!row) return null;
    return {
      id: row.id,
      scenario: row.scenario,
      virtualNow: VirtualInstant.fromDate(row.virtualNow),
      virtualStart: VirtualInstant.fromDate(row.virtualStart),
      faults: row.faults ?? {},
      createdAt: RealInstant.fromDate(row.createdAt),
      expiresAt: RealInstant.fromDate(row.expiresAt),
    };
  }

  async insert(record: WorkspaceRecord & { readonly createdByIpHash: string | null }): Promise<void> {
    await this.db.insert(workspaces).values({
      id: record.id,
      scenario: record.scenario,
      virtualNow: record.virtualNow.toDate(),
      virtualStart: record.virtualStart.toDate(),
      faults: { ...record.faults } as Record<string, boolean>,
      createdByIpHash: record.createdByIpHash,
      createdAt: record.createdAt.toDate(),
      expiresAt: record.expiresAt.toDate(),
    });
  }

  async setVirtualNow(id: string, virtualNow: VirtualInstant): Promise<void> {
    await this.db.update(workspaces).set({ virtualNow: virtualNow.toDate() }).where(eq(workspaces.id, id));
  }

  async setFault(id: string, fault: FaultName, enabled: boolean): Promise<void> {
    await this.db
      .update(workspaces)
      .set({ faults: sql`jsonb_set(${workspaces.faults}, ${`{${fault}}`}::text[], ${enabled ? "true" : "false"}::jsonb, true)` })
      .where(eq(workspaces.id, id));
  }

  async consumeFault(id: string, fault: FaultName): Promise<boolean> {
    const rows = await this.db
      .update(workspaces)
      .set({ faults: sql`jsonb_set(${workspaces.faults}, ${`{${fault}}`}::text[], 'false'::jsonb, true)` })
      .where(and(eq(workspaces.id, id), sql`(${workspaces.faults} ->> ${fault}) = 'true'`))
      .returning({ id: workspaces.id });
    return rows.length > 0;
  }
}

export class DrizzleActorRepository implements ActorRepository {
  constructor(private readonly db: DbExecutor) {}

  async list(workspaceId: string): Promise<ActorRecord[]> {
    const rows = await this.db.select().from(actors).where(eq(actors.workspaceId, workspaceId));
    return rows.map((row) => ({ id: row.id, workspaceId: row.workspaceId, role: row.role as ActorRole, displayName: row.displayName }));
  }

  async insert(record: ActorRecord): Promise<void> {
    await this.db.insert(actors).values({ ...record });
  }
}

export class DrizzleEventRepository implements EventRepository {
  constructor(private readonly db: DbExecutor) {}

  async append(workspaceId: string, drafts: readonly DomainEventDraft[]): Promise<void> {
    if (drafts.length === 0) return;
    const [row] = await this.db
      .update(workspaces)
      .set({ eventSeq: sql`${workspaces.eventSeq} + ${drafts.length}` })
      .where(eq(workspaces.id, workspaceId))
      .returning({ seq: workspaces.eventSeq });
    if (!row) throw new Error("Espacio inexistente al registrar eventos");
    const first = row.seq - drafts.length + 1;
    await this.db.insert(domainEvents).values(
      drafts.map((draft, i) => ({
        workspaceId,
        seq: first + i,
        type: draft.type,
        actorRole: draft.actorRole,
        subjectType: draft.subjectType,
        subjectId: draft.subjectId,
        payload: redact({ ...draft.payload }),
        virtualAt: draft.virtualAt.toDate(),
      })),
    );
  }

  async list(workspaceId: string, options?: { readonly afterSeq?: number; readonly limit?: number }): Promise<StoredEvent[]> {
    const rows = await this.db
      .select()
      .from(domainEvents)
      .where(and(eq(domainEvents.workspaceId, workspaceId), gt(domainEvents.seq, options?.afterSeq ?? 0)))
      .orderBy(asc(domainEvents.seq))
      .limit(options?.limit ?? 1000);
    return rows.map((row) => ({
      seq: row.seq,
      type: row.type,
      actorRole: row.actorRole,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      virtualAt: VirtualInstant.fromDate(row.virtualAt),
      realAt: RealInstant.fromDate(row.realAt),
    }));
  }
}

export class DrizzleProviderEventReceiptRepository implements ProviderEventReceiptRepository {
  constructor(private readonly db: DbExecutor) {}

  async markProcessed(workspaceId: string, providerEventId: string): Promise<boolean> {
    const rows = await this.db
      .insert(processedProviderEvents)
      .values({ workspaceId, providerEventId })
      .onConflictDoNothing()
      .returning({ id: processedProviderEvents.providerEventId });
    return rows.length > 0;
  }
}

export class DrizzlePendingChangeRepository implements PendingChangeRepository {
  constructor(private readonly db: DbExecutor) {}

  async get(workspaceId: string, id: string, options?: LockOptions): Promise<PendingChangeRecord | null> {
    const query = this.db.select().from(pendingChanges).where(and(eq(pendingChanges.workspaceId, workspaceId), eq(pendingChanges.id, id)));
    const [row] = options?.forUpdate ? await query.for("update") : await query;
    return row ? toPendingChange(row) : null;
  }

  async listPending(workspaceId: string): Promise<PendingChangeRecord[]> {
    const rows = await this.db
      .select()
      .from(pendingChanges)
      .where(and(eq(pendingChanges.workspaceId, workspaceId), eq(pendingChanges.status, "PENDING")))
      .orderBy(asc(pendingChanges.createdAt));
    return rows.map(toPendingChange);
  }

  async insert(record: PendingChangeRecord): Promise<void> {
    await this.db.insert(pendingChanges).values({ ...record, payload: { ...record.payload } });
  }

  async setStatus(workspaceId: string, id: string, status: PendingChangeStatus): Promise<void> {
    await this.db.update(pendingChanges).set({ status, resolvedAt: new Date() }).where(and(eq(pendingChanges.workspaceId, workspaceId), eq(pendingChanges.id, id)));
  }
}

function toPendingChange(row: typeof pendingChanges.$inferSelect): PendingChangeRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as PendingChangeKind,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    fingerprint: row.fingerprint,
    status: row.status as PendingChangeStatus,
    createdByActorId: row.createdByActorId,
  };
}
