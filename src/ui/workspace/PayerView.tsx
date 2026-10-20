"use client";

import { Inbox, MessageSquare, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ActivityDTO, CaseViewDTO } from "@/application/dto/CaseDTO";
import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { formatMoney } from "@/interfaces/format/money";
import { ApprovalRequestCard, channelName, MoneyFigure, PermissionMeter, remittanceStatus, StatusPill } from "@/ui/finance";
import { formatDuration, formatWhen, minutesBetween } from "@/ui/format/time";
import { Button, Field, Input, Panel, Tabs, notify } from "@/ui/primitives";
import { api } from "@/ui/lib/api";
import { cn } from "@/ui/lib/cn";
import { ConversationPanel } from "@/ui/chat";
import { useActionState } from "./actions";
import { TransferApprovalCard } from "./TransferApprovalCard";
import { eventDetail, eventTitle, firstName, parseUsdToMinor, sealCode } from "./copy";
import { ProblemNotice } from "./ProblemNotice";
import { lastFour, reasonContext } from "./StudentView";

// Vista de Carlos (UI_UX 11.3, DESIGN_PLAN 5.3): solicitudes y actividad a la izquierda, permisos a la derecha.
// Solo el pagador aprueba, cambia límites y revoca; la interfaz llama a la API y el servidor lo exige.

type MobileTab = "requests" | "permissions" | "activity";

export function PayerView({ data, refresh, workspaceId }: { data: CaseViewDTO; refresh: () => Promise<void>; workspaceId: string }) {
  const [tab, setTab] = useState<MobileTab>("requests");
  // En móvil la sección elegida entra con un fundido (UI_UX 8), solo después de que la persona toca las pestañas.
  const [switched, setSwitched] = useState(false);
  const section = (id: MobileTab) => (tab === id ? cn("block", switched && "max-lg:animate-ag-fade-in-base") : "hidden lg:block");
  return (
    <div className="mx-auto w-full max-w-[1344px] px-4 pt-4 pb-24 md:px-8 md:pt-6 lg:pb-8">
      <Tabs
        className="mb-4 lg:hidden"
        ariaLabel="Payer sections"
        value={tab}
        onChange={(id) => {
          setSwitched(true);
          setTab(id as MobileTab);
        }}
        tabs={[
          {
            id: "requests",
            label: "Requests",
            badge: (data.payer?.requests.length ?? 0) > 0 || data.remittances.some((r) => r.status === "APPROVAL_REQUESTED"),
            icon: <Inbox aria-hidden className="size-4" strokeWidth={1.75} />,
          },
          { id: "permissions", label: "Permissions", icon: <SlidersHorizontal aria-hidden className="size-4" strokeWidth={1.75} /> },
          { id: "activity", label: "Activity", icon: <MessageSquare aria-hidden className="size-4" strokeWidth={1.75} /> },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-5">
          <div id="panel-requests" role="tabpanel" aria-label="Requests" className={section("requests")}>
            <RequestsPanel data={data} workspaceId={workspaceId} />
          </div>
          <div id="panel-activity" role="tabpanel" aria-label="Activity" className={section("activity")}>
            <ActivityPanel data={data} />
          </div>
        </div>
        <div id="panel-permissions" role="tabpanel" aria-label="Permissions" className={cn("min-w-0 lg:col-span-7", section("permissions"))}>
          <PermissionsPanel data={data} refresh={refresh} workspaceId={workspaceId} />
        </div>
        <div className="min-w-0 lg:col-span-12">
          <Panel title="Conversation">
            <ConversationPanel
              role="payer"
              workspaceId={workspaceId}
              data={data}
              refresh={refresh}
              ctx={reasonContext(data)}
              structured={<p className="text-[14px] leading-[22px] text-ink-2">Use the Requests and Permissions panels to approve, change limits or revoke permissions.</p>}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function RequestsPanel({ data, workspaceId }: { data: CaseViewDTO; workspaceId: string }) {
  const requests = data.payer?.requests ?? [];
  const plan = data.plan;
  const student = data.people.student;
  const route = plan?.selectedRoute;
  const routeText = route ? `Route ${route.routeId}, ${channelName(route.channel)}, arrives in about ${route.arrivalHours} h` : "";
  const history = (plan?.approvals ?? []).filter((a) => !requests.some((r) => r.planVersion === a.planVersion)).slice().reverse();
  // Solo la versión actual tiene su monto a la vista; las anteriores se listan sin cifras para no mostrar un monto inventado.
  const current = history.filter((a) => a.planVersion === plan?.version && route);
  const older = history.filter((a) => !(a.planVersion === plan?.version && route));
  const changes = data.payer?.pendingChanges ?? [];
  const transfers = data.remittances.filter((r) => r.status === "APPROVAL_REQUESTED");
  const waiting = requests.length + changes.length + transfers.length;
  return (
    <Panel title="Requests" aside={<span className="text-[12px] font-medium text-muted">{waiting > 0 ? `${waiting} waiting` : ""}</span>}>
      <div className="space-y-3">
        {waiting === 0 && history.length === 0 ? <p className="text-[14px] leading-[22px] text-ink-2">Nothing needs your approval.</p> : null}
        {transfers.map((r) => (
          <TransferApprovalCard key={`${r.remittanceId}-${r.version}`} remittanceId={r.remittanceId} data={data} />
        ))}
        {requests.filter((r) => r.proposedDebit).map((r) => (
          <ApprovalRequestCard
            key={`${r.planId}-${r.planVersion}`}
            variant="payer"
            title={`Tuition approval, plan version ${r.planVersion}`}
            subtitle={`Requested by ${student}`}
            amount={r.proposedDebit!}
            routeLine={plan?.version === r.planVersion ? routeText : `Route ${r.routeId ?? ""}`}
            status="WAITING_FOR_PAYER"
            payerName={firstName(data.people.payer)}
            ageText={r.requestedAt ? `Waiting ${formatDuration(minutesBetween(r.requestedAt, data.workspace.virtualNow))} of virtual time` : null}
            action={
              <Link
                href={`/w/${workspaceId}/approve/${r.planId}`}
                className="inline-flex h-11 items-center rounded-control bg-route px-4 md:h-10 text-[15px] font-semibold text-on-route transition-colors duration-fast hover:bg-route-hover"
              >
                Review and approve
              </Link>
            }
          />
        ))}
        {changes.map((c) => (
          <div key={c.changeId} className="rounded-control border border-line p-4">
            <p className="font-semibold text-ink">{c.kind === "POLICY_CHANGE" ? "Limit change prepared in the chat" : "Permission change prepared in the chat"}</p>
            <p className="text-[14px] leading-[22px] text-ink-2">Nothing changes until you confirm it on its own screen.</p>
            <Link href={`/w/${workspaceId}/payer/changes/${c.changeId}`} className="mt-3 inline-flex h-11 items-center rounded-control border border-line-strong px-4 md:h-10 text-[15px] font-semibold text-ink hover:border-ink">
              Review change
            </Link>
          </div>
        ))}
        {current.map((a) => (
          <ApprovalRequestCard
            key={a.approvalId}
            variant="payer"
            title={`Tuition approval, plan version ${a.planVersion}`}
            subtitle={`Requested by ${student}`}
            amount={route!.debit}
            routeLine={routeText}
            status={a.status === "INVALIDATED" ? "NO_LONGER_MATCHES" : a.status === "REVOKED" ? "REVOKED" : a.status === "EXPIRED" ? "EXPIRED" : "APPROVED"}
            payerName={firstName(data.people.payer)}
            fingerprint={a.status === "ACTIVE" || a.status === "CONSUMED" ? a.fingerprint : null}
            invalidated={a.status === "INVALIDATED" ? { title: "Approval no longer matches", detail: `The plan changed. ${firstName(data.people.payer)} needs to approve the new one.` } : null}
            secondary={
              a.status === "ACTIVE" ? (
                <Link href={`/w/${workspaceId}/approve/${plan?.planId ?? ""}`} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-route hover:underline md:min-h-0">
                  Review or revoke
                </Link>
              ) : null
            }
          />
        ))}
        {older.length > 0 ? (
          <ul className="divide-y divide-line border-t border-line text-[14px] leading-[22px]">
            {older.map((a) => (
              <li key={a.approvalId} className="flex items-center justify-between gap-3 py-2">
                <span className="text-ink-2">
                  Plan version {a.planVersion}
                  {a.invalidationReason ? <span className="text-muted">. Approval no longer matches</span> : null}
                </span>
                <StatusPill status={a.status === "INVALIDATED" ? "NO_LONGER_MATCHES" : a.status === "REVOKED" ? "REVOKED" : a.status === "EXPIRED" ? "EXPIRED" : "APPROVED"} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}

const isMoneyDTO = (v: unknown): v is MoneyDTO => typeof v === "object" && v !== null && typeof (v as MoneyDTO).minor === "string" && typeof (v as MoneyDTO).currency === "string";

function activityText(item: ActivityDTO, data: CaseViewDTO): string {
  const s = item.summary;
  const student = firstName(data.people.student);
  const version = typeof s.version === "number" ? s.version : typeof s.planVersion === "number" ? s.planVersion : null;
  switch (item.type) {
    case "APPROVAL_REQUESTED":
      return `${student} requested your approval${version ? ` for plan version ${version}` : ""}.`;
    case "APPROVAL_GRANTED":
      if (typeof s.remittanceId === "string") {
        return `You approved a transfer to ${student}'s local account${isMoneyDTO(s.debit) ? `, ${formatMoney(s.debit)}` : ""}.${typeof s.fingerprint === "string" ? ` Seal ${sealCode(s.fingerprint)}.` : ""}`;
      }
      return `You approved${version ? ` plan version ${version}` : " the plan"}.${typeof s.fingerprint === "string" ? ` Seal ${sealCode(s.fingerprint)}.` : ""}`;
    case "REMITTANCE_EXECUTED_UNDER_MANDATE":
      return `${student} sent ${isMoneyDTO(s.net) ? formatMoney(s.net) : "a transfer"} under your standing permission.${typeof s.routeId === "string" ? ` Route ${s.routeId}` : ""}${isMoneyDTO(s.debit) ? `, ${formatMoney(s.debit)}` : ""}.`;
    case "REMITTANCE_ESCALATED":
      return `${student} asked to send ${isMoneyDTO(s.net) ? formatMoney(s.net) : "a transfer"}${isMoneyDTO(s.debit) ? ` (${formatMoney(s.debit)})` : ""}. It is above your standing permission and needs your approval.`;
    case "REMITTANCE_DELIVERED":
      return `${data.localAccount.bankName ?? "The local bank"} delivered ${isMoneyDTO(s.net) ? formatMoney(s.net) : "the transfer"} to ${student}'s local account.`;
    case "REFUND_CLAIM_SUBMITTED":
      return `${student} requested a refund of ${isMoneyDTO(s.amount) ? formatMoney(s.amount) : "the verified overpayment"} to your account.`;
    case "REFUND_CLAIM_UPDATED":
      if (s.status === "REFUNDED") return `Refunded: ${isMoneyDTO(s.settlement) ? formatMoney(s.settlement) : "the refund"} returned to your account.`;
      return `Refund request ${typeof s.status === "string" ? s.status.toLowerCase().replace(/_/g, " ") : "updated"}.`;
    case "APPROVAL_INVALIDATED":
      return `Approval${version ? ` for plan version ${version}` : ""} no longer matches. The plan changed.`;
    case "APPROVAL_REVOKED":
      return "You revoked an approval.";
    case "POLICY_CHANGED":
      return "You changed your limits.";
    case "INSTITUTION_CREDITED":
      return `${data.tuition.institution} credited ${isMoneyDTO(s.net) ? formatMoney(s.net) : "the payment"}.${typeof s.receiptId === "string" ? ` Receipt ${s.receiptId}.` : ""}`;
    default: {
      const detail = eventDetail(item.type, s);
      return `${eventTitle(item.type)}${detail ? `. ${detail}` : ""}.`;
    }
  }
}

function ActivityPanel({ data }: { data: CaseViewDTO }) {
  const items = (data.payer?.activity ?? []).slice().reverse();
  return (
    <Panel title="Activity">
      {items.length === 0 ? (
        <p className="text-[14px] leading-[22px] text-ink-2">No activity yet.</p>
      ) : (
        <ol className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.seq} className={cn("flex gap-3 py-2 text-[14px] leading-[22px]", item.type === "SECURITY_BLOCK" ? "text-stop" : "text-ink")}>
              <span className="tabular min-w-[52px] shrink-0 text-muted">{formatWhen(item.at, data.workspace.virtualStart)}</span>
              <span>{activityText(item, data)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function PermissionsPanel({ data, refresh, workspaceId }: { data: CaseViewDTO; refresh: () => Promise<void>; workspaceId: string }) {
  const actions = useActionState(refresh);
  const funds = data.familyFunds;
  const mandate = data.mandate;
  const fingerprint = data.payer?.policyFingerprint ?? "";
  const ctx = reasonContext(data);

  const save = async (field: "maxDebitMinor" | "reserveMinor", minor: string) => {
    const result = await actions.run(field, () =>
      api<{ invalidatedApprovalIds: string[]; planStatus: string | null }>("/api/payer/policy", { role: "payer", body: { [field]: minor, fingerprint } }),
    );
    if (result) notify(field === "maxDebitMinor" ? "Tuition limit updated" : "Arrival reserve updated");
    return result !== null;
  };

  return (
    <Panel title="Permissions" aside={<span className="text-[13px] text-muted">Account ending {lastFour(funds.accountMasked)}, {formatMoney(funds.balance)}</span>}>
      <div className="divide-y divide-line">
        <EditableLimit
          label="Tuition limit"
          help="The most ArrivalGuard can debit for this tuition."
          value={funds.tuitionLimit}
          saveText="Save limit"
          busy={actions.busy === "maxDebitMinor"}
          onSave={(minor) => save("maxDebitMinor", minor)}
        />
        <EditableLimit
          label="Arrival reserve"
          help="Stays aside for the first weeks. Tuition never touches it."
          value={funds.arrivalReserve}
          saveText="Save reserve"
          busy={actions.busy === "reserveMinor"}
          onSave={(minor) => save("reserveMinor", minor)}
        />
        <div className="py-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-semibold text-ink">Standing permission for arrival transfers</p>
              <p className="text-[14px] leading-[22px] text-ink-2">
                {mandate ? `To ${firstName(data.people.student)}'s local account, ${data.localAccount.bankName ?? "local bank"} ending ${lastFour(mandate.recipientMasked)}.` : "No standing permission in this workspace."}
              </p>
            </div>
            {mandate ? (
              <p className="tabular text-right">
                <MoneyFigure money={mandate.periodMax} size="l" /> <span className="text-[13px] text-muted">per {mandate.periodDays} days</span>
              </p>
            ) : null}
          </div>
          {mandate ? (
            <div className="mt-3 space-y-3">
              {mandate.status === "ACTIVE" ? (
                <>
                  <PermissionMeter used={mandate.usedThisPeriod} max={mandate.periodMax} />
                  {data.remittances.some((r) => r.attempt) ? (
                    <ul className="divide-y divide-line border-y border-line text-[14px] leading-[22px]">
                      {data.remittances
                        .filter((r) => r.attempt)
                        .slice()
                        .reverse()
                        .map((r) => {
                          const st = remittanceStatus(r, firstName(data.people.payer));
                          return (
                            <li key={r.remittanceId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                              <span className="text-ink">
                                <MoneyFigure money={r.net} size="s" />
                                {r.debit ? <span className="text-ink-2"> for {formatMoney(r.debit)}</span> : null}
                                {r.authorization === "PAYER_APPROVAL" ? <span className="text-muted">, approved by you</span> : null}
                              </span>
                              <StatusPill status={st.pill} label={st.label} />
                            </li>
                          );
                        })}
                    </ul>
                  ) : null}
                  <Button
                    variant="danger"
                    loading={actions.busy === "revoke"}
                    loadingText="Revoking"
                    onClick={async () => {
                      const result = await actions.run("revoke", () => api("/api/permissions/revoke", { role: "payer", body: { mandateId: mandate.mandateId } }));
                      if (result) notify("Permission revoked");
                    }}
                  >
                    Revoke permission
                  </Button>
                </>
              ) : (
                <StatusPill status={mandate.status === "REVOKED" ? "REVOKED" : "EXPIRED"} />
              )}
            </div>
          ) : null}
        </div>
      </div>
      <ProblemNotice problem={actions.problem} ctx={ctx} />
      <p className="mt-3 text-[12px] leading-4 text-muted">
        Changes made here apply right away and are recorded in the evidence. Changes prepared in the chat wait for your confirmation on <Link className="underline" href={`/w/${workspaceId}?as=payer`}>this view</Link>.
      </p>
    </Panel>
  );
}

function EditableLimit({ label, help, value, saveText, busy, onSave }: { label: string; help: string; value: MoneyDTO; saveText: string; busy: boolean; onSave: (minor: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const id = `edit-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const minor = parseUsdToMinor(draft);
  return (
    <div className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-ink">{label}</p>
          <p className="text-[14px] leading-[22px] text-ink-2">{help}</p>
        </div>
        <div className="flex items-center gap-3">
          <MoneyFigure money={value} size="l" />
          {!editing ? (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${label.toLowerCase()}`}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <form
          className="mt-3 flex flex-col gap-3 md:flex-row md:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!minor) return;
            if (await onSave(minor)) {
              setEditing(false);
              setDraft("");
            }
          }}
        >
          <Field label={`New ${label.toLowerCase()} in USD`} htmlFor={id} error={draft && !minor ? "Enter an amount like 2,500.00" : null}>
            <Input id={id} inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={formatMoney(value).replace("USD ", "")} invalid={Boolean(draft) && !minor} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={busy} loadingText="Saving" disabled={!minor}>
              {saveText}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
