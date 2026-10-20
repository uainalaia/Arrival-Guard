import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { moneyParts } from "@/interfaces/format/money";
import { cn } from "@/ui/lib/cn";

const SIZES = {
  xl: "text-[40px] leading-[44px] font-[650] tracking-[-0.01em]",
  l: "text-[24px] leading-[30px] font-semibold tracking-[-0.005em]",
  m: "text-[16px] leading-[26px] font-semibold",
  s: "text-[14px] leading-[22px] font-medium",
} as const;

export interface MoneyFigureProps {
  readonly money: MoneyDTO;
  readonly size?: keyof typeof SIZES;
  /** Débito: signo menos tipográfico en `ink`, nunca en rojo (UI_UX 6.3). */
  readonly debit?: boolean;
  /** Tachado, para aprobaciones que ya no coinciden. */
  readonly struck?: boolean;
  readonly className?: string;
}

/** Monto con el código ISO en `muted`, un tamaño menos, y cifras tabulares sin cortes de línea. */
export function MoneyFigure({ money, size = "m", debit = false, struck = false, className }: MoneyFigureProps) {
  const parts = moneyParts(money);
  const amount = parts.negative ? parts.amount.slice(1) : parts.amount;
  const minus = debit || parts.negative;
  return (
    <span className={cn("tabular inline-block whitespace-nowrap text-ink", SIZES[size], struck && "line-through decoration-1", className)}>
      {minus ? "−" : null}
      <span className="mr-[0.25em] text-[0.8em] font-medium text-muted">{parts.currency}</span>
      {amount}
    </span>
  );
}
