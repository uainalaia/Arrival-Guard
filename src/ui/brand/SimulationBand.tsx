import { cn } from "@/ui/lib/cn";

export interface SimulationBandProps {
  /** Invertida (`paper` sobre `ink`) para el pie de la landing. */
  readonly inverted?: boolean;
  readonly className?: string;
}

/**
 * Banda de simulación (UI_UX 4.3): fija, no se puede cerrar. Texto largo en escritorio y corto en móvil.
 */
export function SimulationBand({ inverted = false, className }: SimulationBandProps) {
  return (
    <div
      role="note"
      className={cn(
        "flex h-7 items-center gap-3 border-b px-4 text-[12px] font-medium leading-4 sm:h-8 sm:px-8 sm:text-[13px] sm:leading-[18px]",
        inverted ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink-2",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-[10px] w-[22px] shrink-0 rounded-doc sm:h-3 sm:w-7"
        style={{
          background: inverted
            ? "repeating-linear-gradient(-45deg, var(--ag-paper) 0 3px, var(--ag-ink) 3px 6px)"
            : "repeating-linear-gradient(-45deg, var(--ag-ink) 0 3px, var(--ag-paper) 3px 6px)",
        }}
      />
      <span className="hidden sm:inline">Simulated funds and a fictional university. No real money moves.</span>
      <span className="sm:hidden">Simulated funds. No real money moves.</span>
    </div>
  );
}
