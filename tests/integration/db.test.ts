import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getPool } from "@/infrastructure/db/client";

describe("conexión a Neon dev", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("responde select 1 con la cadena con pooling", async () => {
    const result = await getPool().query<{ ok: number }>("select 1 as ok");
    expect(result.rows[0]?.ok).toBe(1);
  });
});
