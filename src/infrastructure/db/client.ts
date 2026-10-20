import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getServerEnv } from "../config/env";
import { normalizeSslMode } from "./connection";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let db: Db | undefined;

/** Pool de la cadena con pooling de Neon (la app nunca usa la directa). */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: normalizeSslMode(getServerEnv().DATABASE_URL),
      max: poolMax(),
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 15_000,
    });
    // Guía de Vercel para Fluid compute: mantiene viva la instancia mientras se cierran conexiones ociosas.
    attachDatabasePool(pool);
  }
  return pool;
}

function poolMax(): number {
  const raw = process.env.DB_POOL_MAX;
  return raw && /^\d{1,3}$/.test(raw) ? Math.max(1, Math.min(50, Math.trunc(+raw))) : 5;
}

export function getDb(): Db {
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}

/** Para scripts y pruebas: cierra el pool al terminar. */
export async function closeDb(): Promise<void> {
  const current = pool;
  pool = undefined;
  db = undefined;
  if (current) await current.end();
}
