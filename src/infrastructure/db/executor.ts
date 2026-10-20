import type { Db } from "./client";

/** Una conexión o una transacción de Drizzle: los repositorios funcionan con cualquiera de las dos. */
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbExecutor = Db | DbTransaction;
