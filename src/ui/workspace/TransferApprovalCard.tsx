"use client";

import type { ApprovalSummaryDTO, CaseViewDTO } from "@/application/dto/CaseDTO";
import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { MoneyFigure, StatusPill, channelName, endingOf, reasonCopy } from "@/ui/finance";
import { formatVirtual } from "@/ui/format/time";
import { Button, notify } from "@/ui/primitives";
import { api } from "@/ui/lib/api";
import { useResource } from "@/ui/lib/useResource";
import { useActionState } from "./actions";
import { firstName, sealCode } from "./copy";
import { ProblemNotice } from "./ProblemNotice";

// Aprobación puntual de una transferencia por encima del permiso permanente (T3, N17). Es la pantalla fija del pagador
// para esta remesa: todos los campos salen de GET /api/remittances/[id]/view y se aprueba con su huella.

interface TransferApprovalViewDTO {
  readonly remittanceId: string;
  readonly version: number;
  readonly status: string;
  readonly reasons: readonly string[];
  readonly recipientName: string;
  readonly recipientMasked: string;
  readonly sourceAccountMasked: string;
  readonly recipientReceives: MoneyDTO;
  readonly proposedDebit: MoneyDTO | null;
  readonly route: { readonly routeId: string; readonly channel: string; readonly arrivalHours: number } | null;
  readonly validUntil: string | null;
  readonly fingerprint: string | null;
  readonly quoteExpired: boolean;
  readonly approval: ApprovalSummaryDTO | null;
}

export function TransferApprovalCard({ remittanceId, data }: { remittanceId: string; data: CaseViewDTO }) {
  const view = useResource((signal) => api<TransferApprovalViewDTO>(`/api/remittances/${remittanceId}/view`, { role: "payer", signal }), [remittanceId], 8000);
  const actions = useActionState(view.refresh);
  const v = view.data;
  const student = firstName(data.people.student);
  if (!v) {
    return <p className="text-[14px] leading-[22px] text-ink-2">{view.error ? view.error.message : "Loading the transfer request"}</p>;
  }
  const changed = actions.problem?.kind === "message" && actions.problem.title === "This plan changed";
  const canApprove = v.status === "APPROVAL_REQUESTED" && Boolean(v.fingerprint) && !v.quoteExpired && !changed;
  const rows: [string, React.ReactNode][] = [
    ["Pays to", `${v.recipientName}, account ${endingOf(v.recipientMasked)}`],
    ["Local account receives", <MoneyFigure key="net" money={v.recipientReceives} size="m" />],
    ["Proposed debit", v.proposedDebit ? <MoneyFigure key="debit" money={v.proposedDebit} size="l" /> : "Not quoted"],
    ["From", `Your account ${endingOf(v.sourceAccountMasked)}`],
    ["Route", v.route ? `${v.route.routeId}, ${channelName(v.route.channel)}, arrives in about ${v.route.arrivalHours} h` : "No route"],
    ["Valid until", v.validUntil ? `${formatVirtual(v.validUntil)} virtual time` : "Not set"],
  ];
  return (
    <article className="flex flex-col gap-3 rounded-control border border-line bg-surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-[15px] leading-[22px] font-semibold text-ink">Transfer to {student}&apos;s local account</h4>
          <p className="text-[14px] leading-[22px] text-ink-2">Requested by {data.people.student}</p>
        </div>
        <StatusPill status="WAITING_FOR_PAYER" payerName={firstName(data.people.payer)} />
      </header>
      {v.reasons.map((code) => (
        <p key={code} className="text-[14px] leading-[22px] text-wait">
          <span className="font-semibold">{reasonCopy(code).title}.</span> It needs your approval once.
        </p>
      ))}
      {changed || v.quoteExpired ? (
        <p role="status" className="rounded-control bg-wait-tint px-3 py-2 text-[14px] leading-[22px] text-wait">
          {v.quoteExpired ? `The price expired. ${student} needs to prepare the transfer again.` : "This transfer changed. Review the new version."}
        </p>
      ) : null}
      <dl className="grid gap-x-6 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="border-b border-line py-2">
            <dt className="text-[13px] leading-[18px] font-semibold text-muted">{label}</dt>
            <dd className="mt-0.5 text-[14px] leading-[22px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {v.fingerprint ? <p className="font-mono text-[12px] leading-4 text-ink-2">Consent fingerprint {sealCode(v.fingerprint)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          loading={actions.busy === "approve-transfer"}
          loadingText="Approving"
          disabled={!canApprove}
          onClick={async () => {
            if (!v.fingerprint) return;
            const result = await actions.run("approve-transfer", () =>
              api(`/api/remittances/${v.remittanceId}/approve`, { role: "payer", body: { version: v.version, fingerprint: v.fingerprint } }),
            );
            if (result) notify("Transfer approved");
          }}
        >
          Approve this transfer
        </Button>
      </div>
      <p className="text-[12px] leading-4 text-muted">Approving does not send it. {student} sends it after your approval, and the server checks this exact approval.</p>
      <ProblemNotice problem={changed ? null : actions.problem} />
    </article>
  );
}
