import { cn } from "@/ui/lib/cn";

export interface StopOctagonProps {
  readonly size?: number;
  /** Relleno en avisos de bloqueo; contorno en píldoras, bitácora y expediente (UI_UX 7). */
  readonly variant?: "filled" | "outline";
  readonly className?: string;
}

/** Octágono de alto (DESIGN_PLAN 4.4). Siempre acompaña a un texto: `aria-hidden`. */
export function StopOctagon({ size = 24, variant = "filled", className }: StopOctagonProps) {
  if (variant === "outline") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={cn("shrink-0", className)}>
        <polygon points="7.5,2 16.5,2 22,7.5 22,16.5 16.5,22 7.5,22 2,16.5 2,7.5" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" />
        <line x1={8} y1={12} x2={16} y2={12} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={cn("shrink-0", className)}>
      <polygon points="7,1 17,1 23,7 23,17 17,23 7,23 1,17 1,7" className="fill-stop" />
      <line x1={7} y1={12} x2={17} y2={12} className="stroke-surface" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}
