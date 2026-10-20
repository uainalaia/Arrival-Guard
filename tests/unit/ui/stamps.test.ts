import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// UI_UX 8: el sello se estampa una sola vez por aprobación y nunca al volver a montar la vista. El registro vive en
// sessionStorage dentro de try/catch, con memoria de respaldo; si el almacenamiento falla, nada se rompe.

type StampsModule = typeof import("@/ui/lib/stamps");

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

async function load(): Promise<StampsModule> {
  vi.resetModules();
  return import("@/ui/lib/stamps");
}

describe("stamps: registro de sellos ya estampados", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin almacenamiento (servidor o node) recuerda en memoria", async () => {
    const stamps = await load();
    expect(stamps.hasStamped("approval-1")).toBe(false);
    stamps.markStamped("approval-1");
    expect(stamps.hasStamped("approval-1")).toBe(true);
    expect(stamps.hasStamped("approval-2")).toBe(false);
  });

  it("con sessionStorage, un montaje nuevo de la vista ve el sello ya estampado", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { sessionStorage: storage });
    const first = await load();
    first.markStamped("approval-1");
    expect(JSON.parse(storage.data.get("ag-stamped") ?? "[]")).toEqual(["approval-1"]);

    const again = await load();
    expect(again.hasStamped("approval-1")).toBe(true);
    expect(again.hasStamped("approval-2")).toBe(false);
  });

  it("marcar dos veces no duplica la entrada", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { sessionStorage: storage });
    const stamps = await load();
    stamps.markStamped("approval-1");
    stamps.markStamped("approval-1");
    expect(JSON.parse(storage.data.get("ag-stamped") ?? "[]")).toEqual(["approval-1"]);
  });

  it("guarda como mucho 64 huellas y conserva las más recientes", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { sessionStorage: storage });
    const stamps = await load();
    for (let i = 0; i < 70; i++) stamps.markStamped(`approval-${i}`);
    const stored = JSON.parse(storage.data.get("ag-stamped") ?? "[]") as string[];
    expect(stored).toHaveLength(64);
    expect(stored[0]).toBe("approval-6");
    expect(stored[63]).toBe("approval-69");
  });

  it("un valor corrupto en el almacenamiento no rompe nada", async () => {
    vi.stubGlobal("window", { sessionStorage: fakeStorage({ "ag-stamped": "{not json" }) });
    const stamps = await load();
    expect(stamps.hasStamped("approval-1")).toBe(false);
    stamps.markStamped("approval-1");
    expect(stamps.hasStamped("approval-1")).toBe(true);
  });

  it("si el almacenamiento lanza, queda en memoria para esta pestaña", async () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    vi.stubGlobal("window", { sessionStorage: throwing });
    const stamps = await load();
    expect(() => stamps.markStamped("approval-1")).not.toThrow();
    expect(stamps.hasStamped("approval-1")).toBe(true);
  });
});
