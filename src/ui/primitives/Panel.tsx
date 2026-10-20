import type { ReactNode } from "react";
import { cn } from "@/ui/lib/cn";

export interface PanelProps {
  readonly title?: ReactNode;
  /** A la derecha del título: una píldora, una nota o una acción quiet. */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly as?: "section" | "div";
  /** Nivel del título; H3 por defecto (paneles dentro de una página con H1 o H2). */
  readonly headingLevel?: 2 | 3;
}

/** Panel grande: `surface`, borde `line` y radio 14. La jerarquía viene del borde y el espacio, sin sombra. */
export function Panel({ title, aside, children, className, as = "section", headingLevel = 3 }: PanelProps) {
  const Tag = as;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Tag className={cn("rounded-panel border border-line bg-surface p-5 sm:p-6", className)}>
      {title || aside ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title ? <Heading className="text-[20px] font-[650] leading-[26px] tracking-[-0.005em] text-ink">{title}</Heading> : <span />}
          {aside ? <div className="flex items-center gap-2 text-[12px] font-medium leading-4 text-muted">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}

/** Barras de carga en `line` con radio 2, sin animación continua (UI_UX 8). */
export function Skeleton({ className }: { readonly className?: string }) {
  return <span aria-hidden className={cn("block h-3 rounded-doc bg-line", className)} />;
}
