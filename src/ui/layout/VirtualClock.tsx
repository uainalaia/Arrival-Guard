import { formatClock, formatDay, formatElapsed, formatVirtual } from "@/ui/format/time";
import { cn } from "@/ui/lib/cn";

/** Hora virtual con su rótulo y la diferencia respecto al inicio del espacio (UI_UX 12). */
export function VirtualClock({ virtualNow, elapsedMinutes, compact = false, className }: { virtualNow: string; elapsedMinutes: number; compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <p className={cn("tabular text-right text-[12px] leading-4", className)} aria-label={`${formatVirtual(virtualNow)}, virtual time, ${formatElapsed(elapsedMinutes)} from start`}>
        <span className="block font-semibold text-ink">
          {formatDay(virtualNow)}, {formatClock(virtualNow)}
        </span>
        <span className="text-muted">virtual time, {formatElapsed(elapsedMinutes)}</span>
      </p>
    );
  }
  return (
    <p className={cn("tabular flex items-center gap-2 text-[14px] leading-[22px]", className)}>
      <span className="font-semibold text-ink">{formatVirtual(virtualNow)}</span>
      <span className="text-muted">virtual time</span>
      <span className="rounded-full border border-line px-2 text-[12px] font-medium leading-5 text-ink-2">{formatElapsed(elapsedMinutes)}</span>
    </p>
  );
}
