import { defineConfig } from "drizzle-kit";
import { loadLocalEnv } from "./src/infrastructure/config/localEnv";
import { normalizeSslMode } from "./src/infrastructure/db/connection";

loadLocalEnv();

// Migraciones con la cadena directa (sin pooling). Solo `generate` y `db:migrate`; nunca `push` (AUTONOMIA 4).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: normalizeSslMode(process.env.DATABASE_URL_UNPOOLED ?? "") },
  strict: true,
  verbose: true,
});
