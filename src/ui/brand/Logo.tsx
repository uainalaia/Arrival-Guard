import { cn } from "@/ui/lib/cn";
import { ThresholdMark } from "./ThresholdMark";

const SIZES = { sm: 20, md: 28, lg: 40 } as const;

export interface LogoProps {
  readonly size?: keyof typeof SIZES;
  /** `paper` para fondos oscuros (pie de la landing, consola). */
  readonly tone?: "ink" | "paper";
  readonly className?: string;
}

/**
 * Lockup horizontal (UI_UX 4.1, DESIGN_PLAN 4.1): símbolo, separación 0.375 × alto y "ArrivalGuard" en Overpass 700
 * con −1% de interletrado, a 0.72 × alto y sobre la línea base óptica del umbral.
 */
export function Logo({ size = "md", tone = "ink", className }: LogoProps) {
  const h = SIZES[size];
  return (
    <span
      className={cn("inline-flex items-center whitespace-nowrap font-bold tracking-[-0.01em]", tone === "paper" ? "text-paper" : "text-ink", className)}
      style={{ fontSize: Math.round(h * 0.72), lineHeight: 1 }}
    >
      <ThresholdMark size={h} tone={tone === "paper" ? "paper" : "color"} className="relative" />
      <span style={{ marginLeft: h * 0.375, position: "relative", top: Math.round(h * 0.06) }}>ArrivalGuard</span>
    </span>
  );
}
