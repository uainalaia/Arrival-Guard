import { cn } from "@/ui/lib/cn";

/** Sello miniatura de la píldora "Approved" (DESIGN_PLAN 4.2). Genérico, no derivado de la huella. */
export function MiniSeal({ size = 14, className }: { readonly size?: number; readonly className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden className={cn("shrink-0", className)}>
      <rect x={1} y={1} width={12} height={12} rx={2} className="stroke-seal" strokeWidth={1.6} />
      {[
        [4, 4],
        [7.8, 4],
        [4, 7.8],
        [7.8, 7.8],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={2.2} height={2.2} className="fill-seal" />
      ))}
    </svg>
  );
}
