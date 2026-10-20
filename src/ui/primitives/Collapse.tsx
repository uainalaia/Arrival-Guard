"use client";

import type { ReactNode } from "react";
import { cn } from "@/ui/lib/cn";
import { usePresence } from "@/ui/lib/motion";

export interface CollapseProps {
  readonly open: boolean;
  readonly id?: string;
  /** Clases del contenido. Van en una capa propia: el padding en la capa que recorta no colapsaría a alto cero. */
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Bloque que se abre y se cierra con transición de altura (UI_UX 8, transición de estado de 120 a 180 ms). Al montar
 * abierto no anima. Solo recorta mientras anima, así que no corta los anillos de foco del contenido.
 */
export function Collapse({ open, id, className, children }: CollapseProps) {
  const { mounted, phase, exiting, onAnimationEnd } = usePresence(open, 120);
  if (!mounted) return null;
  return (
    <div
      id={id}
      onAnimationEnd={onAnimationEnd}
      inert={exiting || undefined}
      aria-hidden={exiting || undefined}
      className={cn("grid", phase === "enter" && "animate-ag-collapse-open", exiting && "animate-ag-collapse-close")}
    >
      <div className={cn("min-h-0", phase !== "idle" && "overflow-hidden")}>
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
