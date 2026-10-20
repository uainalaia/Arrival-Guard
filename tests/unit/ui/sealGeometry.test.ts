import { describe, expect, it } from "vitest";
import { cellOrigin, fingerprintGroups, sealCells } from "@/ui/brand/sealGeometry";

describe("Sello de consentimiento: geometría (UI_UX 4.2, DESIGN_PLAN 4.2)", () => {
  it("el vector de prueba 3f9a21c7e04b88d1 da los glifos y rotaciones del plan de diseño", () => {
    const names = ["bar", "corner", "dot", "cross"] as const;
    const cells = sealCells("3f9a21c7e04b88d1").map((c) => `${names[c.glyph]} ${c.rotation}`);
    expect(cells).toEqual([
      "bar 270",
      "cross 270",
      "dot 90",
      "dot 180",
      "bar 180",
      "bar 90",
      "cross 0",
      "corner 270",
      "cross 180",
      "bar 0",
      "corner 0",
      "dot 270",
      "dot 0",
      "dot 0",
      "cross 90",
      "bar 90",
    ]);
  });

  it("usa solo los primeros 16 dígitos y no distingue mayúsculas", () => {
    const full = "3F9A21C7E04B88D1c2a7f0b93e6d5148a1c0e9f2b7d63a58e4c1f09b2d7a6e35";
    expect(sealCells(full)).toEqual(sealCells("3f9a21c7e04b88d1"));
  });

  it("huellas distintas dan sellos distintos", () => {
    expect(sealCells("3f9a21c7e04b88d1")).not.toEqual(sealCells("b7710e2a9c4f5d63"));
  });

  it("rechaza una huella que no es hex o que es corta", () => {
    expect(() => sealCells("3f9a")).toThrow();
    expect(() => sealCells("zzzzzzzzzzzzzzzz")).toThrow();
  });

  it("celdas de 16 px con 2 px de separación y margen 12; texto en dos grupos de 4", () => {
    expect(cellOrigin(0)).toEqual({ x: 12, y: 12 });
    expect(cellOrigin(3)).toEqual({ x: 66, y: 12 });
    expect(cellOrigin(4)).toEqual({ x: 12, y: 30 });
    expect(cellOrigin(15)).toEqual({ x: 66, y: 66 });
    expect(fingerprintGroups("3f9a21c7e04b88d1")).toBe("3F9A 21C7");
  });
});
