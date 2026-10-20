import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeSslMode } from "@/infrastructure/db/connection";

// VC5: las migraciones generadas se aplican sobre una base vacía (esquema temporal en la rama dev) y sobre la
// existente sin pérdida de datos. Solo usa la cadena directa de dev.

const folder = path.join(process.cwd(), "drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as { entries: { tag: string }[] };
const statementsOf = (entries: { tag: string }[]) =>
  entries.flatMap((entry) =>
    fs
      .readFileSync(path.join(folder, `${entry.tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean),
  );
const statements = statementsOf(journal.entries);

const schema = `vc5_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const seeded = `vc5s_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: normalizeSslMode(process.env.DATABASE_URL_UNPOOLED ?? ""), connectionTimeoutMillis: 15_000 });
  await client.connect();
});

afterAll(async () => {
  await client.query(`drop schema if exists "${schema}" cascade`);
  await client.query(`drop schema if exists "${seeded}" cascade`);
  await client.end();
});

describe("VC5: migraciones", { concurrent: false }, () => {
  it("el SQL generado no tiene operaciones destructivas", () => {
    for (const sql of statements) expect(sql, sql.slice(0, 80)).not.toMatch(/\bDROP\b|\bRENAME\b|ALTER COLUMN .* TYPE/i);
  });

  it("se aplica completo sobre un esquema vacío", async () => {
    await client.query(`create schema "${schema}"`);
    await client.query(`set search_path to "${schema}"`);
    for (const sql of statements) await client.query(sql.replaceAll('"public".', `"${schema}".`));
    const tables = await client.query<{ count: string }>("select count(*)::text as count from information_schema.tables where table_schema = $1", [schema]);
    expect(tables.rows[0]?.count).toBe("29");
    const partial = await client.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = $1 and indexdef like '%WHERE%' order by indexname",
      [schema],
    );
    expect(partial.rows.map((r) => r.indexname)).toEqual([
      "conversations_one_active_uq",
      "payment_attempts_one_active_per_subject_uq",
      "payment_attempts_one_credited_per_obligation_uq",
      "sim_institution_ledger_transfer_uq",
    ]);
    await client.query("set search_path to public");
  });

  it("la última migración se aplica sobre un esquema sembrado en la versión anterior sin perder filas", async () => {
    const inSchema = (sql: string) => sql.replaceAll('"public".', `"${seeded}".`);
    await client.query(`create schema "${seeded}"`);
    await client.query(`set search_path to "${seeded}"`);
    for (const sql of statementsOf(journal.entries.slice(0, -1))) await client.query(inSchema(sql));
    const ws = randomUUID();
    await client.query("insert into workspaces (id, scenario, virtual_now, virtual_start, expires_at) values ($1, 'base', now(), now(), now() + interval '1 day')", [ws]);
    await client.query(
      `insert into sim_institution_ledger (id, workspace_id, reference, transfer_id, currency, net_minor, owed_minor, status, expected_credit_at_virtual)
       values ('l-hist', $1, 'AG-STUDENT-01', null, 'CNY', 1000, 1000, 'CREDITED', now()),
              ('l-hist-2', $1, 'AG-STUDENT-01', null, 'CNY', 2000, 2000, 'CREDITED', now()),
              ('l-tr', $1, 'AG-STUDENT-01', 'tr_1', 'CNY', 2000000, 2000000, 'PENDING', now())`,
      [ws],
    );
    const tables = (await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = $1 order by table_name", [seeded])).rows.map((r) => r.table_name);
    const countAll = async () => {
      const out: Record<string, string> = {};
      for (const t of tables) out[t] = (await client.query<{ n: string }>(`select count(*)::text as n from "${seeded}"."${t}"`)).rows[0]!.n;
      return out;
    };
    const before = await countAll();
    for (const sql of statementsOf(journal.entries.slice(-1))) await client.query(inSchema(sql));
    expect(await countAll()).toEqual(before);
    expect(before.workspaces).toBe("1");
    expect(before.sim_institution_ledger).toBe("3");
    const column = await client.query("select 1 from information_schema.columns where table_schema = $1 and table_name = 'payment_attempts' and column_name = 'submit_lease_until'", [seeded]);
    expect(column.rowCount).toBe(1);
    await client.query("set search_path to public");
  });

  it("se vuelve a aplicar sobre la base existente sin perder datos en ninguna tabla", async () => {
    const tables = (await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' order by table_name")).rows.map((r) => r.table_name);
    expect(tables).toHaveLength(29);
    const countAll = async () => {
      const out: Record<string, bigint> = {};
      for (const t of tables) out[t] = BigInt((await client.query<{ n: string }>(`select count(*)::text as n from public."${t}"`)).rows[0]!.n);
      return out;
    };
    const before = await countAll();
    await migrate(drizzle(client), { migrationsFolder: folder });
    const after = await countAll();
    // Otras pruebas pueden agregar filas en paralelo; ninguna tabla puede perderlas.
    for (const t of tables) expect(after[t]! >= before[t]!, t).toBe(true);
    const applied = await client.query<{ count: string }>("select count(*)::text as count from drizzle.__drizzle_migrations");
    expect(applied.rows[0]?.count).toBe(String(journal.entries.length));
  });
});
