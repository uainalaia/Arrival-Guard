"use client";

import { useId } from "react";
import { cn } from "@/ui/lib/cn";
import { markStamped, useStamped } from "@/ui/lib/stamps";
import { cellOrigin, fingerprintGroups, sealCells, type SealCell } from "./sealGeometry";

export interface ConsentSealProps {
  /** SHA-256 en hex de la aprobación, calculado por el servidor. */
  readonly fingerprint: string | null;
  readonly size?: number;
  readonly state?: "placeholder" | "stamped" | "invalidated";
  /**
   * Firma de movimiento 2 (UI_UX 8). `"once"`: se estampa una sola vez por aprobación (registro en stamps.ts), nunca al
   * volver a montar la vista. `true` fuerza el estampado (vitrina).
   */
  readonly animate?: boolean | "once";
  /** Clave de la aprobación para "una sola vez"; por defecto, la huella. */
  readonly stampKey?: string;
  /** Texto "Consent fingerprint 3F9A 21C7" debajo. Por defecto, desde 56 px. */
  readonly caption?: boolean;
  readonly className?: string;
}

/**
 * Sello de consentimiento (UI_UX 4.2): cuadrado de radio 6 y 16 glifos derivados de la huella. Es una
 * representación visual de la huella; la seguridad la da la verificación en el servidor, no el dibujo.
 */
export function ConsentSeal({ fingerprint, size = 96, state = "stamped", animate = false, stampKey, caption, className }: ConsentSealProps) {
  const key = stampKey ?? fingerprint ?? null;
  const alreadyStamped = useStamped(animate === "once" ? key : null);
  const play = state === "stamped" && Boolean(fingerprint) && (animate === true || (animate === "once" && !alreadyStamped));
  const filterId = `ag-seal-ink-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const showCaption = (caption ?? size >= 56) && Boolean(fingerprint);
  const groups = fingerprint ? fingerprintGroups(fingerprint) : "";
  const captionNode = showCaption ? (
    <span aria-hidden={state === "stamped" ? true : undefined} className={cn("font-mono text-[12px] leading-4", state === "stamped" ? "text-ink-2" : "text-muted")}>
      Consent fingerprint {groups}
    </span>
  ) : null;

  if (state === "placeholder" || !fingerprint) {
    return (
      <span className={cn("inline-flex flex-col items-start gap-2", className)}>
        <span aria-hidden className="block rounded-[6px] border-2 border-dashed border-line-strong" style={{ width: size, height: size }} />
        {captionNode}
      </span>
    );
  }

  const small = size < 64;
  const textured = size >= 96 && state === "stamped";
  const ink = state === "invalidated" ? "stroke-line-strong" : "stroke-seal";
  const fill = state === "invalidated" ? "fill-line-strong" : "fill-seal";
  const glyphStroke = small ? 4.2 : 3.5;
  const cells = sealCells(fingerprint);

  return (
    <span className={cn("inline-flex flex-col items-start gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 96 96"
        fill="none"
        role="img"
        aria-label={`Consent seal, fingerprint ${groups.replace(" ", "")}`}
        className={cn("shrink-0", play && "ag-seal-stamp")}
        onAnimationEnd={(event) => {
          if (event.animationName === "ag-seal-stamp" && key) markStamped(key);
        }}
      >
        {textured ? (
          <defs>
            <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={0.9} />
            </filter>
          </defs>
        ) : null}
        <g className={textured ? "ag-seal-ink" : undefined} filter={textured ? `url(#${filterId})` : undefined}>
          <rect x={2} y={2} width={92} height={92} rx={6} className={ink} strokeWidth={small ? 5 : 4} />
          {cells.map((cell, i) => (
            <Glyph key={i} index={i} cell={cell} stroke={ink} fill={fill} width={glyphStroke} />
          ))}
        </g>
      </svg>
      {captionNode}
    </span>
  );
}

function Glyph({ index, cell, stroke, fill, width }: { index: number; cell: SealCell; stroke: string; fill: string; width: number }) {
  const { x, y } = cellOrigin(index);
  const transform = cell.rotation === 0 ? undefined : `rotate(${cell.rotation} ${x + 8} ${y + 8})`;
  const line = { className: stroke, strokeWidth: width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (cell.glyph) {
    case 0:
      return <line x1={x + 3} y1={y + 8} x2={x + 13} y2={y + 8} transform={transform} {...line} />;
    case 1:
      return <polyline points={`${x + 3},${y + 3} ${x + 3},${y + 13} ${x + 13},${y + 13}`} fill="none" transform={transform} {...line} />;
    case 2:
      return (
        <g transform={transform}>
          <circle cx={x + 5} cy={y + 8} r={1.8} className={fill} />
          <circle cx={x + 11} cy={y + 8} r={1.8} className={fill} />
        </g>
      );
    default:
      return (
        <g transform={transform}>
          <line x1={x + 8} y1={y + 4} x2={x + 8} y2={y + 12} {...line} />
          <line x1={x + 4} y1={y + 8} x2={x + 12} y2={y + 8} {...line} />
        </g>
      );
  }
}
