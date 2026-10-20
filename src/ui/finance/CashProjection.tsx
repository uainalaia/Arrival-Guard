import { BadgeCheck, TriangleAlert } from "lucide-react";
import type { CashProjectionDTO } from "@/application/dto/CaseDTO";
import { formatMoney } from "@/interfaces/format/money";
import { cn } from "@/ui/lib/cn";
import { MoneyFigure } from "./MoneyFigure";
import { absMoney, isNegative, isZero, minMoney, permille, subtractMoney } from "./proportion";

type Row = CashProjectionDTO["byCurrency"][number];

export interface CashProjectionProps {
  readonly row: Row;
  /** Veredicto del servidor; si no llega, se deriva de la fila (disponible para la llegada menos gastos). */
  readonly verdict?: CashProjectionDTO["verdict"] | null;
  readonly className?: string;
}

/** Proyección de caja por moneda (UI_UX 12): filas de concepto y monto, barra y veredicto en texto. */
export function CashProjection({ row, verdict, className }: CashProjectionProps) {
  const available = row.availableForArrivalExpenses;
  const expenses = row.expectedExpenses;
  const margin = verdict?.margin ?? subtractMoney(available, expenses);
  const deficit = verdict ? verdict.status === "DEFICIT" : isNegative(margin);
  const shortfall = verdict?.shortfall ?? (deficit ? absMoney(margin) : null);
  const covered = minMoney(available, expenses);
  const coveredShare = permille(covered, expenses);

  const lines: { label: string; money: Row["confirmedBalance"]; debit?: boolean; strong?: boolean }[] = [{ label: "Confirmed balance", money: row.confirmedBalance }];
  if (!isZero(row.plannedDebits)) lines.push({ label: "Planned tuition", money: row.plannedDebits, debit: true });
  if (!isZero(row.pendingObligations)) lines.push({ label: "Other pending payments", money: row.pendingObligations, debit: true });
  lines.push({ label: "Balance after tuition", money: row.balanceAfterPlanned, strong: true });
  if (available.minor !== row.balanceAfterPlanned.minor) lines.push({ label: "Available for arrival costs", money: available });
  lines.push({ label: "Arrival expenses estimate", money: expenses, debit: true });

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <dl className="flex flex-col">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
            <dt className={cn("text-[14px] leading-[22px]", line.strong ? "font-semibold text-ink" : "text-ink-2")}>{line.label}</dt>
            <dd>
              <MoneyFigure money={line.money} size="s" debit={line.debit} />
            </dd>
          </div>
        ))}
      </dl>
      {!isZero(expenses) ? (
        <div aria-hidden className="flex h-6 gap-[3px]">
          {coveredShare > 0 ? (
            <span className="flex h-full items-center rounded-doc bg-route px-2 text-[12px] font-semibold text-on-route transition-[flex-grow] duration-base" style={{ flexGrow: coveredShare, flexBasis: 0 }}>
              <span className="truncate">Covered {formatMoney(covered)}</span>
            </span>
          ) : null}
          {deficit && coveredShare < 1000 ? (
            <span className="flex h-full items-center rounded-doc border border-dashed border-wait bg-wait-tint px-2 text-[12px] font-semibold text-wait transition-[flex-grow] duration-base" style={{ flexGrow: 1000 - coveredShare, flexBasis: 0 }}>
              <span className="truncate">Missing</span>
            </span>
          ) : null}
        </div>
      ) : null}
      {deficit && shortfall ? (
        <p className="flex items-center gap-2 text-[15px] font-semibold leading-[22px] text-wait">
          <TriangleAlert aria-hidden className="size-5" strokeWidth={1.75} />
          Short by {formatMoney(shortfall)}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-[15px] font-semibold leading-[22px] text-arrive">
          <BadgeCheck aria-hidden className="size-5" strokeWidth={1.75} />
          Covered, {formatMoney(margin)} to spare
        </p>
      )}
    </div>
  );
}
