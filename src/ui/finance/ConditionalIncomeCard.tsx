import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { cn } from "@/ui/lib/cn";
import { MoneyFigure } from "./MoneyFigure";

export interface ConditionalIncomeCardProps {
  readonly amount: MoneyDTO;
  /** Por ejemplo "Awarded, expected in about 60 days." */
  readonly note: string;
  readonly title?: string;
  readonly className?: string;
}

/** Ingreso condicionado (UI_UX 5.3): solo contorno punteado, nunca sumado a las barras de dinero real. */
export function ConditionalIncomeCard({ amount, note, title = "Scholarship", className }: ConditionalIncomeCardProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-doc border-[1.5px] border-dashed border-muted px-4 py-3", className)}>
      <div className="flex min-w-0 flex-col">
        <span className="text-[14px] font-semibold leading-[22px] text-ink">{title}</span>
        <span className="text-[14px] leading-[22px] text-ink-2">
          {note} Not counted until received.
        </span>
      </div>
      <MoneyFigure money={amount} size="s" className="text-ink-2" />
    </div>
  );
}
