import { loadLocalEnv } from "@/infrastructure/config/localEnv";

// Las pruebas de integración usan la rama dev de Neon desde .env.local. Nunca credenciales de producción.
loadLocalEnv();

// Las pruebas de integración corren en paralelo (cada una en su espacio): pool más grande que el de producción.
process.env.DB_POOL_MAX ??= "12";
// Las pruebas crean muchos espacios: contadores propios para no agotar el límite diario real de dev. Se fijan siempre,
// aunque .env.local traiga los valores de .env.example (20 por hora): así `pnpm test` pasa siguiendo solo el README
// (VC11). Las pruebas de los límites arman su propio limitador con valores explícitos.
process.env.RATE_LIMIT_PREFIX = "test";
process.env.EVAL_WORKSPACES_PER_DAY = "1000000";
process.env.EVAL_ACCESS_PER_IP_HOUR = "1000000";
