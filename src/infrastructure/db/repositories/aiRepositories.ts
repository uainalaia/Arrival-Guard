import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { AiUsageRow, AiUsageStorePort, ConversationStorePort, StoredTurn } from "@/application/ports/AgentPorts";
import type { ActorRole } from "@/domain/events/DomainEvent";
import { getDb } from "../client";
import { aiUsage, conversations, conversationTurns, workspaces } from "../schema";

// Conversaciones (una activa por rol y espacio) y uso de IA con reserva previa (BUILD_PROMPT 13.5 y 13.6).

export class DrizzleConversationStore implements ConversationStorePort {
  async activeFor(workspaceId: string, role: ActorRole): Promise<{ id: string }> {
    const db = getDb();
    const find = async () =>
      (await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.role, role), eq(conversations.status, "ACTIVE"))))[0];
    const existing = await find();
    if (existing) return existing;
    // El índice único parcial resuelve la carrera: si otro pedido la creó primero, se relee.
    await db.insert(conversations).values({ id: randomUUID(), workspaceId, role, status: "ACTIVE" }).onConflictDoNothing();
    return (await find())!;
  }

  async recentTurns(conversationId: string, limit: number): Promise<StoredTurn[]> {
    const rows = await getDb()
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId))
      .orderBy(desc(conversationTurns.turnIndex))
      .limit(limit);
    return rows.reverse().map((r) => ({
      turnIndex: r.turnIndex,
      userText: r.userText,
      assistantText: r.assistantText,
      tools: r.tools as StoredTurn["tools"],
      usage: r.usage as StoredTurn["usage"],
    }));
  }

  async appendTurn(workspaceId: string, conversationId: string, turn: Omit<StoredTurn, "turnIndex">): Promise<number> {
    return getDb().transaction(async (tx) => {
      // Bloquea la conversación para numerar los turnos sin huecos ni choques.
      await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, conversationId)).for("update");
      const [last] = await tx
        .select({ max: sql<number | null>`max(${conversationTurns.turnIndex})` })
        .from(conversationTurns)
        .where(eq(conversationTurns.conversationId, conversationId));
      const turnIndex = (last?.max ?? -1) + 1;
      await tx.insert(conversationTurns).values({
        id: randomUUID(),
        workspaceId,
        conversationId,
        turnIndex,
        userText: turn.userText,
        assistantText: turn.assistantText,
        tools: turn.tools,
        usage: turn.usage,
      });
      return turnIndex;
    });
  }
}

/** Lo que cuenta para los topes: reservas en curso, uso real y timeouts (que pudieron facturarse). */
const COUNTED = ["RESERVED", "OK", "TIMEOUT"];

export class DrizzleAiUsageStore implements AiUsageStorePort {
  async reserve(workspaceId: string, model: string, estimateMicros: bigint, limits: { workspace: bigint; daily: bigint; perOriginDaily: bigint; since: Date }): Promise<string | null> {
    return getDb().transaction(async (tx) => {
      const [owner] = await tx.select({ origin: workspaces.createdByIpHash }).from(workspaces).where(eq(workspaces.id, workspaceId));
      const origin = owner?.origin ?? null;
      // Mismo orden de bloqueo siempre: el global del día, el del origen y el del espacio (VC8-1, VC9-7).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ai-budget:daily'))`);
      if (origin) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-budget:origin:${origin}`}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai-budget:ws:${workspaceId}`}))`);
      const [ws] = await tx
        .select({ total: sql<string | null>`sum(${aiUsage.costUsdMicros})::text` })
        .from(aiUsage)
        .where(and(eq(aiUsage.workspaceId, workspaceId), inArray(aiUsage.status, COUNTED)));
      const [day] = await tx
        .select({ total: sql<string | null>`sum(${aiUsage.costUsdMicros})::text` })
        .from(aiUsage)
        .where(and(gte(aiUsage.createdAt, limits.since), inArray(aiUsage.status, COUNTED)));
      if (BigInt(ws?.total ?? "0") + estimateMicros > limits.workspace) return null;
      if (BigInt(day?.total ?? "0") + estimateMicros > limits.daily) return null;
      if (origin) {
        const [fromOrigin] = await tx
          .select({ total: sql<string | null>`sum(${aiUsage.costUsdMicros})::text` })
          .from(aiUsage)
          .innerJoin(workspaces, eq(workspaces.id, aiUsage.workspaceId))
          .where(and(eq(workspaces.createdByIpHash, origin), gte(aiUsage.createdAt, limits.since), inArray(aiUsage.status, COUNTED)));
        if (BigInt(fromOrigin?.total ?? "0") + estimateMicros > limits.perOriginDaily) return null;
      }
      const id = randomUUID();
      await tx.insert(aiUsage).values({ id, workspaceId, category: "CHAT", model, status: "RESERVED", costUsdMicros: estimateMicros });
      return id;
    });
  }

  async settle(id: string, row: AiUsageRow, status: "OK" | "FAILED" | "TIMEOUT"): Promise<void> {
    await getDb()
      .update(aiUsage)
      .set({
        status,
        model: row.model,
        inputTokens: row.usage.inputTokens,
        outputTokens: row.usage.outputTokens,
        cacheReadTokens: row.usage.cacheReadTokens,
        cacheWriteTokens: row.usage.cacheWriteTokens,
        costUsdMicros: row.costUsdMicros,
      })
      .where(eq(aiUsage.id, id));
  }

  async spentByWorkspace(workspaceId: string): Promise<bigint> {
    const [row] = await getDb()
      .select({ total: sql<string | null>`sum(${aiUsage.costUsdMicros})::text` })
      .from(aiUsage)
      .where(and(eq(aiUsage.workspaceId, workspaceId), inArray(aiUsage.status, COUNTED)));
    return BigInt(row?.total ?? "0");
  }

  async spentSince(since: Date): Promise<bigint> {
    const [row] = await getDb()
      .select({ total: sql<string | null>`sum(${aiUsage.costUsdMicros})::text` })
      .from(aiUsage)
      .where(and(gte(aiUsage.createdAt, since), inArray(aiUsage.status, COUNTED)));
    return BigInt(row?.total ?? "0");
  }
}
