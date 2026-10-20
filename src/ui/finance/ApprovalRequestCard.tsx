import type { ReactNode } from "react";
import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { ConsentSeal } from "@/ui/brand/ConsentSeal";
import { cn } from "@/ui/lib/cn";
import { MoneyFigure } from "./MoneyFigure";
import { StatusPill, type PillStatus } from "./StatusPill";

export interface ApprovalRequestCardProps {
  readonly variant: "student" | "payer";
  /** "Tuition payment, plan version 1" (estudiante) o "Tuition approval, plan version 1" (pagador). */
  readonly title: string;
  readonly subtitle?: string;
  readonly amount: MoneyDTO;
  /** "Route B, Edu Pay Partner, arrives in about 24 h. University receives CNY 20,000.00." */
  readonly routeLine: string;
  readonly status: PillStatus;
  readonly payerName?: string;
  /** "Waiting 3 min of virtual time" */
  readonly ageText?: string | null;
  readonly fingerprint?: string | null;
  readonly invalidated?: { readonly title: string; readonly detail: string } | null;
  readonly action?: ReactNode;
  readonly secondary?: ReactNode;
  /** Pie bajo la acción, por ejemplo "Approval requested from Carlos". */
  readonly footer?: ReactNode;
  readonly className?: string;
}

/** Tarjeta compacta de solicitud (DESIGN_PLAN 5.2 y 5.3): monto, ruta, estado y la acción que corresponde al rol. */
export function ApprovalRequestCard({
  variant,
  title,
  subtitle,
  amount,
  routeLine,
  status,
  payerName = "Carlos",
  ageText,
  fingerprint,
  invalidated,
  action,
  secondary,
  footer,
  className,
}: ApprovalRequestCardProps) {
  const showSeal = variant === "payer" && status === "APPROVED" && Boolean(fingerprint) && !invalidated;
  return (
    <article className={cn("flex flex-col gap-3 rounded-control border border-line bg-surface p-4", className)}>
      <div className="flex flex-col gap-3">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <h4 className="text-[15px] font-semibold leading-[22px] text-ink">{title}</h4>
            {subtitle ? <p className="text-[14px] leading-[22px] text-ink-2">{subtitle}</p> : null}
          </div>
          <StatusPill status={invalidated ? "NO_LONGER_MATCHES" : status} payerName={payerName} />
        </header>
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <MoneyFigure money={amount} size="l" struck={Boolean(invalidated)} />
            <p className="text-[14px] leading-[22px] text-ink-2">{routeLine}</p>
            {ageText ? <p className="text-[12px] font-medium leading-4 tracking-[0.01em] text-muted">{ageText}</p> : null}
          </div>
          {showSeal ? <ConsentSeal fingerprint={fingerprint ?? null} size={56} /> : null}
        </div>
      </div>
      {invalidated ? (
        <div className="rounded-doc border border-line bg-paper px-3 py-2">
          <p className="text-[14px] font-semibold leading-[22px] text-ink">{invalidated.title}</p>
          <p className="text-[14px] leading-[22px] text-ink-2">{invalidated.detail}</p>
        </div>
      ) : null}
      {action || secondary ? (
        <div className="flex flex-wrap items-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
      {footer ? <div className="text-[12px] font-medium leading-4 text-muted">{footer}</div> : null}
    </article>
  );
}
