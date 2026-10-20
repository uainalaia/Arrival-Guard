import type { CSSProperties } from "react";
import type { CaseViewDTO } from "@/application/dto/CaseDTO";
import { formatMoney } from "@/interfaces/format/money";
import { cn } from "@/ui/lib/cn";
import { MoneyFigure } from "./MoneyFigure";
import { isZero, permille } from "./proportion";

export interface FundsBarProps {
  readonly funds: CaseViewDTO["familyFunds"];
  readonly heldLabel?: string;
  readonly className?: string;
}

// Paleta de datos de UI_UX 5.3: disponible en `route`, reserva en `route` al 35% con rayado fino y retenciones en `wait`.
const RESERVE_FILL = "repeating-linear-gradient(45deg, var(--ag-route) 0 1px, transparent 1px 6px), color-mix(in srgb, var(--ag-route) 35%, transparent)";

interface Segment {
  readonly key: string;
  readonly label: string;
  readonly money: CaseViewDTO["familyFunds"]["balance"];
  readonly share: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * Barra apilada de los fondos de la familia con rótulos directos y el marcador del límite de matrícula. Cuando cambian
 * los montos, los tramos y el marcador se mueven en `base` (UI_UX 8) a partir de proporciones enteras.
 */
export function FundsBar({ funds, heldLabel = "Held for this payment", className }: FundsBarProps) {
  const total = funds.balance;
  const segments: Segment[] = [
    { key: "available", label: "Available for tuition", money: funds.availableForTuition, share: permille(funds.availableForTuition, total), className: "bg-route" },
    { key: "held", label: heldLabel, money: funds.activeHolds, share: permille(funds.activeHolds, total), className: "bg-wait" },
    { key: "reserve", label: "Arrival reserve", money: funds.arrivalReserve, share: permille(funds.arrivalReserve, total), style: { background: RESERVE_FILL } },
  ].filter((s) => !isZero(s.money) && s.share > 0);
  const limitAt = permille(funds.tuitionLimit, total);
  const description = [
    `Account ending ${funds.accountMasked.replace(/\D/g, "").slice(-4)}: ${formatMoney(total)}.`,
    ...segments.map((s) => `${s.label}: ${formatMoney(s.money)}.`),
    `Tuition limit: ${formatMoney(funds.tuitionLimit)}.`,
  ].join(" ");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[14px] leading-[22px] text-ink-2">Account ending {funds.accountMasked.replace(/\D/g, "").slice(-4)}</span>
        <MoneyFigure money={total} size="l" />
      </div>
      <div role="img" aria-label={description} className="relative pt-5">
        {limitAt > 0 ? (
          <span aria-hidden className="absolute top-0 flex -translate-x-1/2 flex-col items-center transition-[left] duration-base" style={{ left: `${limitAt / 10}%` }}>
            <span className="whitespace-nowrap text-[12px] font-medium leading-4 text-ink-2">Tuition limit {formatMoney(funds.tuitionLimit)}</span>
          </span>
        ) : null}
        <div className="relative flex h-7 gap-[3px]">
          {segments.map((s) => (
            <span key={s.key} className={cn("h-full rounded-doc transition-[flex-grow] duration-base", s.className)} style={{ flexGrow: s.share, flexBasis: 0, ...s.style }} />
          ))}
          {limitAt > 0 ? <span aria-hidden className="absolute -bottom-1 -top-1 w-0.5 bg-ink transition-[left] duration-base" style={{ left: `${limitAt / 10}%` }} /> : null}
        </div>
      </div>
      <dl aria-hidden className="flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className={cn("size-3 rounded-doc", s.className)} style={s.style} />
            <dt className="text-[13px] font-semibold leading-[18px] text-ink-2">{s.label}</dt>
            <dd>
              <MoneyFigure money={s.money} size="s" />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
