// Geometría del sello de consentimiento (UI_UX 4.2, DESIGN_PLAN 4.2). Pura: dibuja lo que recibe; la huella la
// calcula el servidor. El sello es una representación visual: la seguridad la da la verificación en el servidor.

export type SealGlyph = 0 | 1 | 2 | 3;
export type SealRotation = 0 | 90 | 180 | 270;

export interface SealCell {
  readonly glyph: SealGlyph;
  readonly rotation: SealRotation;
}

const HEX = /^[0-9a-f]{16,}$/;

/** Los primeros 16 dígitos hex: `d >> 2` elige el glifo y `d & 3` la rotación (horaria en pantalla). */
export function sealCells(fingerprint: string): SealCell[] {
  const hex = fingerprint.toLowerCase();
  if (!HEX.test(hex)) throw new Error("La huella debe tener al menos 16 dígitos hexadecimales.");
  return [...hex.slice(0, 16)].map((ch) => {
    const d = parseInt(ch, 16);
    return { glyph: (d >> 2) as SealGlyph, rotation: ((d & 3) * 90) as SealRotation };
  });
}

/** Origen de la celda `i` en el lienzo de 96: margen 12, celdas de 16 y separación 2. */
export function cellOrigin(i: number): { x: number; y: number } {
  return { x: 12 + (i % 4) * 18, y: 12 + Math.floor(i / 4) * 18 };
}

/** "3F9A 21C7": los primeros 8 caracteres en mayúsculas, en dos grupos. */
export function fingerprintGroups(fingerprint: string): string {
  const head = fingerprint.slice(0, 8).toUpperCase();
  return `${head.slice(0, 4)} ${head.slice(4, 8)}`;
}
