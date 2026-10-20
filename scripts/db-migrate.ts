import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { loadLocalEnv } from "../src/infrastructure/config/localEnv";
import { normalizeSslMode } from "../src/infrastructure/db/connection";
import { runMain } from "./lib/args";

// Aplica las migraciones generadas en drizzle/ con la cadena directa. En Vercel lo corre el build de producción.
runMain(async () => {
  loadLocalEnv();
  const target = process.env.VERCEL_ENV ?? "local (rama dev de Neon)";
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error("db:migrate: falta DATABASE_URL_UNPOOLED");
    return 1;
  }
  const folder = path.join(process.cwd(), "drizzle");
  if (!fs.existsSync(path.join(folder, "meta", "_journal.json"))) {
    console.log(`db:migrate [${target}]: todavía no hay migraciones generadas; nada que aplicar.`);
    return 0;
  }
  const client = new Client({ connectionString: normalizeSslMode(url), connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    const started = Date.now();
    await migrate(drizzle(client), { migrationsFolder: folder });
    const applied = await client.query<{ count: string }>("select count(*)::text as count from drizzle.__drizzle_migrations");
    console.log(`db:migrate [${target}]: OK, ${applied.rows[0]?.count ?? "?"} migraciones registradas (${Date.now() - started} ms)`);
    return 0;
  } finally {
    await client.end();
  }
});
