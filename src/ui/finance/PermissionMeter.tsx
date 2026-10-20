import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { formatMoney } from "@/interfaces/format/money";
import { cn } from "@/ui/lib/cn";
import { ticksOf } from "./proportion";

const TICKS = 60;

export interface PermissionMeterProps {
  readonly used: MoneyDTO;
  readonly max: MoneyDTO;
  readonly held?: MoneyDTO;
  readonly daysLeft?: number | null;
  readonly className?: string;
}

/** Medidor del permiso permanente (UI_UX 12): 60 marcas verticales, usadas en `route`, retenidas en `wait` y libres en `line`. */
export function PermissionMeter({ used, max, held, daysLeft, className }: PermissionMeterProps) {
  const usedTicks = ticksOf(used, max, TICKS);
  const heldTicks = held ? Math.min(TICKS - usedTicks, ticksOf(held, max, TICKS)) : 0;
  const text = `${formatMoney(used)} of ${formatMoney(max)} used this period`;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div role="meter" aria-valuemin={0} aria-valuemax={TICKS} aria-valuenow={usedTicks} aria-valuetext={text} aria-label="Standing permission used this period">
        <svg viewBox={`0 0 ${TICKS * 6} 24`} preserveAspectRatio="none" className="block h-6 w-full" aria-hidden>
          {Array.from({ length: TICKS }, (_, i) => (
            <rect key={i} x={i * 6} y={0} width={3.5} height={24} rx={1} className={cn("transition-colors duration-base", i < usedTicks ? "fill-route" : i < usedTicks + heldTicks ? "fill-wait" : "fill-line")} />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="tabular text-[14px] leading-[22px] text-ink">{text}</span>
        {daysLeft !== undefined && daysLeft !== null ? (
          <span className="text-[12px] font-medium leading-4 text-muted">{daysLeft === 1 ? "1 day left" : `${daysLeft} days left`}</span>
        ) : null}
      </div>
    </div>
  );
}
