import { z } from "zod";

// Valores no secretos por defecto (AUTONOMIA 2). Una variable de entorno los reemplaza si existe.
// Fuentes y fechas en docs/DECISIONS.md.
export const CONFIG_DEFAULTS = {
  ANTHROPIC_MODEL: "claude-sonnet-5-5",
  EVAL_SESSION_TTL_HOURS: 336,
  EVAL_ACCESS_PER_IP_HOUR: 20,
  EVAL_WORKSPACES_PER_DAY: 200,
  RATE_LIMIT_PREFIX: "access",
  SCRIPTED_TASKS_PER_WORKSPACE_HOUR: 3,
  SCRIPTED_TASKS_PER_ORIGIN_DAY: 10,
  SCRIPTED_TASKS_PER_DAY: 30,
  AI_TURNS_PER_MINUTE: 10,
  AI_TURNS_PER_DAY: 60,
  AI_BUDGET_PER_WORKSPACE_USD: "3.00",
  AI_BUDGET_DAILY_USD: "15.00",
  AI_BUDGET_PER_ORIGIN_DAILY_USD: "7.50",
  PRICE_INPUT_PER_MTOK_USD: "2.00",
  PRICE_OUTPUT_PER_MTOK_USD: "10.00",
  PRICE_CACHE_READ_PER_MTOK_USD: "0.10",
  PRICE_CACHE_WRITE_PER_MTOK_USD: "2.50",
} as const;

const decimalUsd = z.string().regex(/^\d+(\.\d{1,6})?$/, "Decimal positivo en USD, por ejemplo 3.00");

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default(CONFIG_DEFAULTS.ANTHROPIC_MODEL),
  SESSION_PEPPER: z.string().min(32),
  EVAL_ACCESS_CODE: z.string().min(8),
  EVAL_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(CONFIG_DEFAULTS.EVAL_SESSION_TTL_HOURS),
  EVAL_ACCESS_PER_IP_HOUR: z.coerce.number().int().positive().default(CONFIG_DEFAULTS.EVAL_ACCESS_PER_IP_HOUR),
  EVAL_WORKSPACES_PER_DAY: z.coerce.number().int().positive().default(CONFIG_DEFAULTS.EVAL_WORKSPACES_PER_DAY),
  RATE_LIMIT_PREFIX: z.string().regex(/^[a-z0-9-]{1,40}$/).default(CONFIG_DEFAULTS.RATE_LIMIT_PREFIX),
  SCRIPTED_TASKS_PER_WORKSPACE_HOUR: z.coerce.number().int().positive().default(CONFIG_DEFAULTS.SCRIPTED_TASKS_PER_WORKSPACE_HOUR),
  SCRIPTED_TASKS_PER_ORIGIN_DAY: z.coerce.number().int().positive().default(CONFIG_DEFAULTS.SCRIPTED_TASKS_PER_ORIGIN_DAY),
  SCRIPTED_TASKS_PER_DAY: z.coerce.number().int().positive().default(CONFIG_DEFAULTS.SCRIPTED_TASKS_PER_DAY),
  AI_TURNS_PER_MINUTE: z.coerce.number().int().positive().default(CONFIG_DEFAULTS.AI_TURNS_PER_MINUTE),
  AI_TURNS_PER_DAY: z.coerce.number().int().positive().default(CONFIG_DEFAULTS.AI_TURNS_PER_DAY),
  AI_BUDGET_PER_WORKSPACE_USD: decimalUsd.default(CONFIG_DEFAULTS.AI_BUDGET_PER_WORKSPACE_USD),
  AI_BUDGET_DAILY_USD: decimalUsd.default(CONFIG_DEFAULTS.AI_BUDGET_DAILY_USD),
  AI_BUDGET_PER_ORIGIN_DAILY_USD: decimalUsd.default(CONFIG_DEFAULTS.AI_BUDGET_PER_ORIGIN_DAILY_USD),
  PRICE_INPUT_PER_MTOK_USD: decimalUsd.default(CONFIG_DEFAULTS.PRICE_INPUT_PER_MTOK_USD),
  PRICE_OUTPUT_PER_MTOK_USD: decimalUsd.default(CONFIG_DEFAULTS.PRICE_OUTPUT_PER_MTOK_USD),
  PRICE_CACHE_READ_PER_MTOK_USD: decimalUsd.default(CONFIG_DEFAULTS.PRICE_CACHE_READ_PER_MTOK_USD),
  PRICE_CACHE_WRITE_PER_MTOK_USD: decimalUsd.default(CONFIG_DEFAULTS.PRICE_CACHE_WRITE_PER_MTOK_USD),
  APP_BASE_URL: z.url().optional(),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Lee y valida el entorno del servidor una sola vez. Los mensajes de error nombran variables, nunca valores. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse(emptyToUndefined(process.env));
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Configuración del servidor inválida o incompleta: ${names}`);
  }
  cached = result.data;
  return cached;
}

/** Solo para pruebas. */
export function resetServerEnvCache(): void {
  cached = undefined;
}

function emptyToUndefined(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) out[key] = value === "" ? undefined : value;
  return out;
}

type BaseUrlInput = Pick<ServerEnv, "APP_BASE_URL" | "VERCEL_ENV" | "VERCEL_URL" | "VERCEL_BRANCH_URL">;

/**
 * URL base de la app (DEC-002): APP_BASE_URL si existe; en un preview de Vercel, la URL de la rama;
 * si no, la del despliegue; y en local, localhost.
 */
export function resolveAppBaseUrl(env: BaseUrlInput): string {
  if (env.APP_BASE_URL) return stripTrailingSlash(env.APP_BASE_URL);
  if (env.VERCEL_ENV === "preview" && env.VERCEL_BRANCH_URL) return `https://${env.VERCEL_BRANCH_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** "2.50" (USD) a micro-USD como bigint, sin punto flotante. */
export function usdToMicros(decimal: string): bigint {
  const [units, cents = ""] = decimal.split(".");
  return BigInt(units ?? "0") * 1_000_000n + BigInt((cents + "000000").slice(0, 6));
}
