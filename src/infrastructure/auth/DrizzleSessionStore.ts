import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { AccessCodePort, RateLimiterPort, SessionPort, SessionRecord } from "@/application/ports/SessionPort";
import type { ActorRole } from "@/domain/events/DomainEvent";
import { RealInstant } from "@/domain/time/Instant";
import type { Db } from "../db/client";
import { rateLimits, sessions } from "../db/schema";
import { constantTimeEquals, newSessionToken, pepperedHash } from "./secrets";

/** Sesiones en Postgres: se guarda HMAC-SHA256(pepper, token), nunca el token. Vencen por hora real. */
export class DrizzleSessionStore implements SessionPort {
  constructor(
    private readonly db: Db,
    private readonly pepper: () => string,
  ) {}

  async issue(input: { readonly workspaceId: string; readonly actorId: string; readonly role: ActorRole; readonly ttlHours: number }) {
    const token = newSessionToken();
    const id = randomUUID();
    const expiresAt = RealInstant.fromDate(new Date()).plusHours(input.ttlHours);
    await this.db.insert(sessions).values({
      id,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      role: input.role,
      tokenHash: pepperedHash(this.pepper(), "session", token),
      expiresAt: expiresAt.toDate(),
    });
    const session: SessionRecord = { id, workspaceId: input.workspaceId, actorId: input.actorId, role: input.role, expiresAt };
    return { token, session };
  }

  async resolve(token: string): Promise<SessionRecord | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, pepperedHash(this.pepper(), "session", token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
    if (!row) return null;
    return { id: row.id, workspaceId: row.workspaceId, actorId: row.actorId, role: row.role as ActorRole, expiresAt: RealInstant.fromDate(row.expiresAt) };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }
}

/** Ventana fija en Postgres: INSERT ... ON CONFLICT DO UPDATE count = count + 1. */
export class DbRateLimiter implements RateLimiterPort {
  /** `now` permite probar el borde de una ventana sin tocar el reloj global (las pruebas corren en paralelo). */
  constructor(
    private readonly db: Db,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async hit(key: string, windowSeconds: number, limit: number) {
    const nowMs = this.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);
    const [row] = await this.db
      .insert(rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
      .returning({ count: rateLimits.count });
    const count = row?.count ?? limit + 1;
    const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - nowMs) / 1000);
    return { allowed: count <= limit, count, retryAfterSeconds };
  }

  async tryAcquire(key: string, intervalSeconds: number) {
    const nowMs = this.now();
    const intervalMs = intervalSeconds * 1000;
    // Bajo un bloqueo por clave: se lee el último inicio concedido y solo se escribe si se concede uno nuevo.
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`slot:${key}`}))`);
      // Milisegundos desde la base como texto entero: no depende de DateStyle ni de cómo se imprima una fecha.
      const [last] = await tx
        .select({ epochMs: sql<string | null>`(extract(epoch from max(${rateLimits.windowStart})) * 1000)::bigint::text` })
        .from(rateLimits)
        .where(eq(rateLimits.key, key));
      const lastMs = last?.epochMs ? Number(last.epochMs) : null;
      // Una lectura inválida cierra la ranura en vez de abrirla.
      if (lastMs !== null && !Number.isFinite(lastMs)) return { acquired: false, retryAfterSeconds: intervalSeconds };
      if (lastMs !== null && nowMs - lastMs < intervalMs) {
        return { acquired: false, retryAfterSeconds: Math.max(1, Math.ceil((lastMs + intervalMs - nowMs) / 1000)) };
      }
      await tx.insert(rateLimits).values({ key, windowStart: new Date(nowMs), count: 1 }).onConflictDoNothing();
      return { acquired: true, retryAfterSeconds: 0 };
    });
  }
}

export class EnvAccessCode implements AccessCodePort {
  constructor(
    private readonly expected: () => string,
    private readonly pepper: () => string,
  ) {}

  verify(code: string): boolean {
    const expected = this.expected();
    if (!expected || typeof code !== "string" || code.length === 0 || code.length > 128) return false;
    return constantTimeEquals(this.pepper(), code.trim(), expected);
  }
}
