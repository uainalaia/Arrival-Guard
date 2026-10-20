import { FileText, Hourglass } from "lucide-react";
import Link from "next/link";
import type { CaseViewDTO } from "@/application/dto/CaseDTO";
import type { ChatComponentDTO } from "@/application/dto/ChatDTO";
import { formatMoney } from "@/interfaces/format/money";
import {
  ApprovalRequestCard,
  BlockedNotice,
  CashProjection,
  channelName,
  MoneyFigure,
  RefundRequestCard,
  RouteBoard,
  StatusPill,
  securityCategoryLabel,
  TransferCard,
  type PillStatus,
  type ReasonContext,
} from "@/ui/finance";
import { firstName, sealCode } from "@/ui/workspace/copy";
import { planPill, provenanceText, type ChatRole } from "./labels";

// Tarjetas del servidor dentro del hilo (UI_UX 12, ChatThread): todo monto, estado o acción sale del componente que
// arma el servidor con su estado, nunca del texto del modelo. Ninguna tarjeta ofrece una acción que el servidor no
// exponga; las aprobaciones y los cambios se confirman en sus pantallas fijas.

export interface ChatComponentCardProps {
  readonly component: ChatComponentDTO;
  readonly role: ChatRole;
  readonly workspaceId: string;
  readonly data: CaseViewDTO;
  readonly ctx?: ReasonContext;
}

export function ChatComponentCard({ component, role, workspaceId, data, ctx }: ChatComponentCardProps) {
  const payer = firstName(data.people.payer);
  switch (component.kind) {
    case "PLAN": {
      const plan = component.plan;
      const route = plan.selectedRoute;
      if (!route) {
        const reasons = plan.routes.blockers.length > 0 ? plan.routes.blockers : ["DEADLINE_MISSED"];
        return (
          <div className="space-y-2">
            {reasons.map((code) => (
              <BlockedNotice key={code} code={code} ctx={{ ...ctx, targetHours: plan.targetArrivalHours ?? ctx?.targetHours }} />
            ))}
          </div>
        );
      }
      return (
        <ApprovalRequestCard
          variant="student"
          title={`Tuition payment, plan version ${plan.version}`}
          amount={route.debit}
          routeLine={`Route ${route.routeId}, ${channelName(route.channel)}, arrives in about ${route.arrivalHours} h. University receives ${formatMoney(route.net)}.`}
          status={planPill(plan.status)}
          payerName={payer}
        />
      );
    }
    case "ROUTES":
      return <RouteBoard routing={component.routing} targetHours={component.targetHours} invoiceNet={data.tuition.netDue} comparedAt={component.comparedAt} payerName={payer} />;
    case "APPROVAL_REQUESTED":
      return (
        <div className="flex flex-col gap-2 rounded-control border border-line bg-surface p-3 md:flex-row md:items-center md:justify-between">
          <p className="flex items-start gap-2 text-[14px] leading-[22px] text-ink">
            <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-wait" strokeWidth={1.75} />
            <span>
              <span className="font-semibold">Approval requested from {payer}</span>
              <span className="block text-ink-2">
                Plan version {component.planVersion}. {payer} approves on his own screen.
              </span>
            </span>
          </p>
          {role === "payer" ? (
            <Link href={`/w/${workspaceId}/approve/${component.planId}`} className="inline-flex h-11 shrink-0 items-center rounded-control border border-line-strong px-4 text-[15px] font-semibold text-ink hover:border-ink md:h-10">
              Review and approve
            </Link>
          ) : null}
        </div>
      );
    case "PAYMENT": {
      const attempt = component.attempt;
      return (
        <article className="flex flex-col gap-2 rounded-control border border-line bg-surface p-4">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-[15px] leading-[22px] font-semibold text-ink">Tuition payment</h4>
            <StatusPill status={attempt.visibleStatus as PillStatus} payerName={payer} />
          </header>
          <MoneyFigure money={attempt.debit} size="l" />
          <p className="text-[14px] leading-[22px] text-ink-2">Route {attempt.routeId}. {provenanceText(attempt.provenance.source, attempt.provenance.observedAt)}</p>
          {attempt.receipt ? (
            <p className="text-[14px] leading-[22px] text-ink">
              Receipt {attempt.receipt.receiptId}, {formatMoney(attempt.receipt.net)} to reference {attempt.receipt.reference}.
            </p>
          ) : null}
        </article>
      );
    }
    case "CASH":
      return (
        <div className="space-y-3 rounded-control border border-line bg-surface p-4">
          {component.projection.byCurrency.map((row) => (
            <CashProjection key={row.currency} row={row} verdict={component.projection.verdict.margin.currency === row.currency ? component.projection.verdict : null} />
          ))}
        </div>
      );
    case "BLOCKED":
      return (
        <div className="space-y-2">
          {component.reasons.map((code) => (
            <BlockedNotice key={code} code={code} ctx={ctx} tone={code === "ACTIVE_ATTEMPT_EXISTS" || code === "EXCEEDS_MANDATE_PERIOD_LIMIT" ? "wait" : "stop"} />
          ))}
        </div>
      );
    case "SECURITY_BLOCK":
      return <BlockedNotice code={component.reason} ctx={ctx} category={securityCategoryLabel(component.category)} tone="stop" />;
    case "PENDING_CHANGE":
      return (
        <div className="flex flex-col gap-3 rounded-control border border-line bg-surface p-4">
          <p className="flex items-start gap-2 text-[14px] leading-[22px] text-ink">
            <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" strokeWidth={1.75} />
            <span>
              <span className="font-semibold">{component.changeKind === "MANDATE_CHANGE" ? "Permission change prepared" : "Limit change prepared"}</span>
              <span className="block text-ink-2">Nothing changes until you confirm it on its own screen.</span>
              <span className="block font-mono text-[12px] leading-4 text-ink-2">Consent fingerprint {component.fingerprintPrefix.length >= 8 ? sealCode(component.fingerprintPrefix) : component.fingerprintPrefix.toUpperCase()}</span>
            </span>
          </p>
          <Link href={`/w/${workspaceId}/payer/changes/${component.changeId}`} className="inline-flex h-11 w-fit items-center rounded-control border border-line-strong px-4 text-[15px] font-semibold text-ink hover:border-ink md:h-10">
            Review change
          </Link>
        </div>
      );
    case "REMITTANCE":
      return <TransferCard remittance={component.remittance} recipientLabel={data.localAccount.bankName ?? "the local bank"} payerName={payer} />;
    case "REFUND":
      return <RefundRequestCard claim={component.claim} />;
  }
}
