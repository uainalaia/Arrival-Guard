import type { ReactNode } from "react";
import type { RefundDTO, RemittanceDTO } from "@/application/dto/CaseDTO";
import { formatMoney } from "@/interfaces/format/money";
import { formatClock } from "@/ui/format/time";
import { cn } from "@/ui/lib/cn";
import { channelName } from "./channels";
import { MoneyFigure } from "./MoneyFigure";
import { reasonCopy } from "./reasons";
import { StatusPill } from "./StatusPill";
import { endingOf, refundStatus, remittanceStatus } from "./transferStatus";

// Tarjetas de transferencia y de devolución (UI_UX 12, DESIGN_PLAN 5.2): monto, destino enmascarado, ruta y costo,
// estado y procedencia. Todo sale del DTO del servidor; nunca del texto del modelo.

export interface TransferCardProps {
  readonly remittance: RemittanceDTO;
  /** "Arrival Bank" o el nombre del destinatario. */
  readonly recipientLabel: string;
  readonly payerName?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function TransferCard({ remittance: r, recipientLabel, payerName = "Carlos", action, className }: TransferCardProps) {
  const status = remittanceStatus(r, payerName);
  const route = r.routeId ? `Route ${r.routeId}${r.channel ? `, ${channelName(r.channel)}` : ""}${r.debit ? `, costs ${formatMoney(r.debit)}` : ""}.` : null;
  const arrives = r.arrivalHours !== null && r.status !== "DELIVERED" ? ` Arrives in about ${r.arrivalHours} h.` : "";
  const source =
    r.status === "DELIVERED" && r.attempt
      ? `From ${recipientLabel}, ${formatClock(r.attempt.statusChangedAt)} virtual time.`
      : r.attempt
        ? `From the provider, ${formatClock(r.attempt.statusChangedAt)} virtual time.`
        : null;
  return (
    <article className={cn("flex flex-col gap-2 rounded-control border border-line bg-surface p-4", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-[15px] leading-[22px] font-semibold text-ink">Transfer to Sofía&apos;s local account</h4>
        <StatusPill status={status.pill} label={status.label} payerName={payerName} />
      </header>
      <MoneyFigure money={r.net} size="l" />
      <p className="text-[14px] leading-[22px] text-ink-2">
        To {recipientLabel}, account {endingOf(r.recipientMasked)}.{route ? ` ${route}` : ""}
        {arrives}
      </p>
      {r.status === "BLOCKED" || r.status === "APPROVAL_REQUESTED"
        ? r.reasons.map((code) => {
            const copy = reasonCopy(code);
            return (
              <p key={code} className={cn("text-[14px] leading-[22px]", r.status === "BLOCKED" ? "text-stop" : "text-wait")}>
                <span className="font-semibold">{copy.title}.</span> {r.status === "APPROVAL_REQUESTED" ? `${payerName} needs to approve this one.` : copy.detail}
              </p>
            );
          })
        : null}
      {source ? <p className="text-[12px] leading-4 text-muted">{source}</p> : null}
      {action ? <div className="mt-1 flex flex-wrap gap-2">{action}</div> : null}
    </article>
  );
}

export interface RefundRequestCardProps {
  readonly claim: RefundDTO;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function RefundRequestCard({ claim, action, className }: RefundRequestCardProps) {
  const status = refundStatus(claim);
  return (
    <article className={cn("flex flex-col gap-2 rounded-control border border-line bg-surface p-4", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-[15px] leading-[22px] font-semibold text-ink">Refund request</h4>
        <StatusPill status={status.pill} label={status.label} />
      </header>
      <dl className="grid gap-3 text-[14px] leading-[22px] md:grid-cols-2">
        <div>
          <dt className="text-[13px] leading-[18px] font-semibold text-muted">Verified overpayment</dt>
          <dd>
            <MoneyFigure money={claim.amount} size="m" />
          </dd>
        </div>
        <div>
          <dt className="text-[13px] leading-[18px] font-semibold text-muted">Destination</dt>
          <dd className="text-ink">Returns to account {endingOf(claim.destinationMasked)}</dd>
          <dd className="text-[12px] leading-4 text-muted">Fixed. Refunds return to the paying account.</dd>
        </div>
      </dl>
      {claim.settlement ? (
        <p className="text-[14px] leading-[22px] text-arrive">
          <span className="font-semibold">{formatMoney(claim.settlement)} refunded</span> to the account {endingOf(claim.destinationMasked)}.
        </p>
      ) : null}
      {action ? <div className="mt-1 flex flex-wrap gap-2">{action}</div> : null}
    </article>
  );
}
