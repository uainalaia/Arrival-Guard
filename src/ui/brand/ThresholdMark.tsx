import { cn } from "@/ui/lib/cn";

export interface ThresholdMarkProps {
  readonly size?: number;
  /** Una sola tinta: el punto también en `ink` (o en `paper` con `tone="paper"`). */
  readonly mono?: boolean;
  readonly tone?: "color" | "ink" | "paper";
  /** Con título, el símbolo se anuncia solo (`role="img"`); sin él acompaña a un texto y queda oculto. */
  readonly title?: string;
  readonly className?: string;
}

/** Símbolo "Threshold" (UI_UX 4.1): arco sobre un umbral con el punto que ya cruzó. Grilla de 32 × 32. */
export function ThresholdMark({ size = 28, mono = false, tone, title, className }: ThresholdMarkProps) {
  const resolved = tone ?? (mono ? "ink" : "color");
  const stroke = resolved === "paper" ? "stroke-paper" : "stroke-ink";
  const dot = resolved === "color" ? "fill-route" : resolved === "paper" ? "fill-paper" : "fill-ink";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      {title ? <title>{title}</title> : null}
      <path d="M8 28 V15 A8 8 0 0 1 24 15 V28" className={stroke} strokeWidth={4} fill="none" />
      <line x1={2} y1={28} x2={30} y2={28} className={stroke} strokeWidth={2} strokeLinecap="round" />
      <circle cx={16} cy={21} r={3.25} className={dot} />
    </svg>
  );
}
