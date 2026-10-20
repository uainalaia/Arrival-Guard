import { afterEach, describe, expect, it, vi } from "vitest";

// DEC-022: la caché de la vista por rol vive solo en el cliente. En el servidor no guarda ni devuelve nada, así una
// respuesta nunca se comparte entre solicitudes; en el cliente guarda las 16 lecturas más recientes.

type CacheModule = typeof import("@/ui/lib/resourceCache");

async function load(): Promise<CacheModule> {
  vi.resetModules();
  return import("@/ui/lib/resourceCache");
}

describe("resourceCache: última respuesta por espacio y rol", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("en el servidor (sin window) no guarda ni devuelve nada", async () => {
    const cache = await load();
    cache.writeCached("ws-1:student:case", { status: "CREDITED" });
    expect(cache.readCached("ws-1:student:case")).toBeNull();
  });

  it("en el cliente devuelve lo último guardado para esa clave y nada para otras", async () => {
    vi.stubGlobal("window", {});
    const cache = await load();
    cache.writeCached("ws-1:student:case", { status: "WAITING" });
    cache.writeCached("ws-1:student:case", { status: "CREDITED" });
    expect(cache.readCached("ws-1:student:case")).toEqual({ status: "CREDITED" });
    expect(cache.readCached("ws-1:payer:case")).toBeNull();
    expect(cache.readCached("ws-2:student:case")).toBeNull();
  });

  it("guarda como mucho 16 entradas y descarta la menos reciente", async () => {
    vi.stubGlobal("window", {});
    const cache = await load();
    for (let i = 0; i < 17; i++) cache.writeCached(`ws-${i}:student:case`, i);
    expect(cache.readCached("ws-0:student:case")).toBeNull();
    expect(cache.readCached("ws-1:student:case")).toBe(1);
    expect(cache.readCached("ws-16:student:case")).toBe(16);
  });
});
