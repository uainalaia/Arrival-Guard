"use client";

import { ChevronLeft, Hourglass } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ApprovalViewDTO } from "@/application/dto/CaseDTO";
import { formatMoney } from "@/interfaces/format/money";
import { ConsentSeal } from "@/ui/brand";
import { channelName, MoneyFigure } from "@/ui/finance";
import { formatVirtual } from "@/ui/format/time";
import { Button, notify } from "@/ui/primitives";
import { api, setWorkspaceScope } from "@/ui/lib/api";
import { useResource } from "@/ui/lib/useResource";
import { useActionState } from "./actions";
import { firstName } from "./copy";
import { ProblemNotice } from "./ProblemNotice";
import { lastFour } from "./StudentView";

// Documento de aprobación (UI_UX 11.4, DESIGN_PLAN 5.4). Todos los campos se leen del servidor (ApprovalViewDTO);
// el texto del modelo nunca aparece aquí. La aprobación se manda con planId, planVersion y la huella mostrada.

const SENT_STATUSES = new Set(["EXECUTING", "COMPLETED"]);

export function ApprovalDocument({ workspaceId, planId }: { workspaceId: string; planId: string }) {
  setWorkspaceScope(workspaceId);
  // Versión y huella que Carlos vio al abrir: si el servidor trae otras, el plan cambió con el documento abierto.
  const [seen, setSeen] = useState<{ version: number; fingerprint: string | null } | null>(null);
  const view = useResource(
    async (signal) => {
      const v = await api<ApprovalViewDTO>(`/api/approvals/${planId}/view`, { role: "payer", signal });
      setSeen((prev) => prev ?? { version: v.planVersion, fingerprint: v.fingerprint });
      return v;
    },
    [planId],
    5000,
  );
  const actions = useActionState(view.refresh);
  const [stampedNow, setStampedNow] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  if (view.error && !view.data) {
    return (
      <Shell workspaceId={workspaceId}>
        <p className="text-ink-2">{view.error.status === 404 ? "This approval request is not in your workspace." : view.error.message}</p>
      </Shell>
    );
  }
  const d = view.data;
  if (!d) {
    return (
      <Shell workspaceId={workspaceId}>
        <p className="text-ink-2">Loading the approval</p>
      </Shell>
    );
  }

  const approval = d.approval;
  // Aprobado solo si está vigente, o si se usó en un pago que salió (VC7-1): una aprobación consumida por un pago
  // fallido no cuenta cuando hay una solicitud nueva.
  const approved = approval?.status === "ACTIVE" || (approval?.status === "CONSUMED" && SENT_STATUSES.has(d.status));
  const invalidated = approval?.status === "INVALIDATED";
  const revoked = approval?.status === "REVOKED";
  const expired = approval?.status === "EXPIRED";
  const payer = firstName(d.payerName);
  const canApprove = d.status === "APPROVAL_REQUESTED" && !approved && Boolean(d.fingerprint) && !d.quoteExpired;
  const route = d.route;

  const approve = async () => {
    if (!d.fingerprint) return;
    // La intención de estampar va antes de la acción: el primer render con el sello ya trae la animación (UI_UX 11.4).
    setStampedNow(true);
    const result = await actions.run("approve", () => api("/api/approvals", { role: "payer", body: { planId: d.planId, planVersion: d.planVersion, fingerprint: d.fingerprint } }));
    if (result) notify("Payment approved");
    else setStampedNow(false);
  };
  // El plan cambió mientras el documento estaba abierto: por un 409 del servidor o porque el refresco trajo otra
  // versión u otra huella (UI_UX 11.4). Hasta que Carlos revise la versión nueva, no puede aprobar.
  const moved = Boolean(seen && !approved && (seen.version !== d.planVersion || seen.fingerprint !== d.fingerprint));
  const conflict = moved || (actions.problem?.kind === "message" && actions.problem.title === "This plan changed");

  return (
    <Shell workspaceId={workspaceId}>
      <article className="rounded-doc border border-line bg-surface px-5 pt-6 pb-6 md:px-12 md:pt-8 md:pb-7">
        {conflict || (d.quoteExpired && !approved) ? (
          <div role="status" className="-mx-5 -mt-6 mb-6 flex items-center gap-2 bg-wait-tint px-5 py-2 text-[14px] text-wait md:-mx-12 md:-mt-8 md:px-12">
            <Hourglass aria-hidden className="size-4" strokeWidth={1.75} />
            {d.quoteExpired && !conflict ? `The price expired. ${firstName(d.requestedBy)} needs to refresh the plan.` : "This plan changed. Review the new version."}
            {conflict ? (
              <button
                type="button"
                className="ml-auto min-h-11 font-semibold underline md:min-h-0"
                onClick={() => {
                  setSeen({ version: d.planVersion, fingerprint: d.fingerprint });
                  actions.clearProblem();
                  void view.refresh();
                }}
              >
                Review the new version
              </button>
            ) : null}
          </div>
        ) : null}
        <p className="tabular text-[12px] leading-4 font-medium text-muted">
          Plan version {d.planVersion}
        </p>
        <h1 className="mt-2 text-[28px] leading-[34px] font-bold tracking-[-0.015em] md:text-[36px] md:leading-[42px]">Payment approval</h1>
        <p className="mt-1 text-ink-2">
          {d.institution} tuition, requested by {d.requestedBy}
        </p>
        <p className="my-6 border-y border-line py-5 font-serif text-[17px] leading-[28px] text-ink">
          I approve a single tuition payment from my account ending {lastFour(d.sourceAccountMasked)} to {d.institution}&apos;s registered account, under the terms below. If the price expires,
          ArrivalGuard may refresh it for the same route only while the debit stays within my limit and the arrival reserve is kept.
        </p>
        <dl className="grid gap-x-8 md:grid-cols-2">
          <Term label="Purpose">Tuition, reference {d.reference}</Term>
          <Term label="Pays to">
            {d.institution}, account ending {lastFour(d.receiverMasked)}
          </Term>
          <Term label="University receives">{d.universityReceives ? <MoneyFigure money={d.universityReceives} size="m" /> : "Not quoted"}</Term>
          <Term label="Proposed debit">{d.proposedDebit ? <MoneyFigure money={d.proposedDebit} size="l" /> : "Not quoted"}</Term>
          <Term label="Your limit">
            <MoneyFigure money={d.limit} size="m" />
          </Term>
          <Term label="Left after payment">at least {formatMoney(d.reserveKept)} (arrival reserve)</Term>
          <Term label="Route">{route ? `${route.routeId}, ${channelName(route.channel)}, arrives in about ${route.arrivalHours} h` : "No route"}</Term>
          <Term label="Valid until">{d.validUntil ? `${formatVirtual(d.validUntil)} virtual time` : "Not set"}</Term>
        </dl>

        <div className="mt-6 grid gap-5 border-t border-line pt-6 md:grid-cols-[120px_1fr]">
          <ConsentSeal
            fingerprint={approval?.fingerprint ?? d.fingerprint}
            size={96}
            state={approved ? "stamped" : invalidated || revoked || expired ? "invalidated" : "placeholder"}
            animate={stampedNow ? "once" : false}
          />
          <div className="space-y-3" aria-live="polite">
            {approved && approval ? (
              <>
                <p className="font-semibold text-ink">
                  Approved by {d.payerName}, {formatVirtual(approval.grantedAt)} virtual time
                </p>
                <p className="text-[14px] leading-[22px] text-ink-2">This approval covers only the terms above. Any change to the plan needs a new approval.</p>
              </>
            ) : invalidated && approval ? (
              <>
                <p className="font-semibold text-ink">Approval no longer matches</p>
                <p className="text-[14px] leading-[22px] text-ink-2">
                  Approved {formatVirtual(approval.grantedAt)} virtual time. The plan changed. {payer} needs to approve the new one.
                </p>
              </>
            ) : revoked ? (
              <>
                <p className="font-semibold text-ink">Approval revoked</p>
                <p className="text-[14px] leading-[22px] text-ink-2">{payer} revoked this approval.</p>
              </>
            ) : expired ? (
              <>
                <p className="font-semibold text-ink">Approval expired</p>
                <p className="text-[14px] leading-[22px] text-ink-2">Request a new approval to continue.</p>
              </>
            ) : (
              <>
                <p className="text-[14px] leading-[22px] text-ink-2">The seal appears when {payer} approves.</p>
                <p className="text-[14px] leading-[22px] text-ink-2">
                  Signing as {d.payerName}, payer, account ending {lastFour(d.sourceAccountMasked)}
                </p>
              </>
            )}
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              {!approved ? (
                <Button onClick={approve} loading={actions.busy === "approve"} loadingText="Approving" disabled={!canApprove || conflict}>
                  Approve this payment
                </Button>
              ) : null}
              {approval?.status === "ACTIVE" ? (
                confirmRevoke ? (
                  <Button
                    variant="danger"
                    loading={actions.busy === "revoke"}
                    loadingText="Revoking"
                    onClick={async () => {
                      const result = await actions.run("revoke", () => api("/api/permissions/revoke", { role: "payer", body: { approvalId: approval.approvalId } }));
                      if (result) notify("Approval revoked");
                      setConfirmRevoke(false);
                    }}
                  >
                    Revoke approval
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setConfirmRevoke(true)}>
                    Review or revoke
                  </Button>
                )
              ) : null}
            </div>
            {confirmRevoke ? (
              <p className="text-[14px] leading-[22px] text-ink-2">
                {SENT_STATUSES.has(d.status) ? "This payment was already sent. Revoking stops future use but may not stop it." : "Revoking stops this approval. Nothing is sent without a new one."}
              </p>
            ) : null}
            <ProblemNotice problem={conflict ? null : actions.problem} />
          </div>
        </div>
      </article>
      <p className="mt-4 text-[12px] leading-4 text-muted">
        The seal is a picture of the approval fingerprint. The server checks the fingerprint, the plan and its version before anything is sent.
      </p>
    </Shell>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-3">
      <dt className="text-[13px] leading-[18px] font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}

function Shell({ workspaceId, children }: { workspaceId: string; children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[640px] px-4 pt-5 pb-12 md:px-0">
      <Link href={`/w/${workspaceId}?as=payer`} className="mb-3 inline-flex h-11 items-center gap-1 text-[15px] md:h-10 font-semibold text-route hover:underline xl:absolute xl:top-5 xl:-left-36">
        <ChevronLeft aria-hidden className="size-4" strokeWidth={1.75} />
        Requests
      </Link>
      {children}
    </div>
  );
}
