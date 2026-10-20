"use client";

import { ChevronDown, MessageSquare, Route as RouteIcon, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import type { CashProjectionDTO, CaseViewDTO, PlanDTO, RemittanceDTO, RouteEvaluationDTO, RoutingDTO } from "@/application/dto/CaseDTO";
import { formatMoney } from "@/interfaces/format/money";
import {
  BlockedNotice,
  CashProjection,
  channelName,
  ConditionalIncomeCard,
  FundsBar,
  JourneyLine,
  MoneyFigure,
  PermissionMeter,
  RefundRequestCard,
  RouteBoard,
  StatusPill,
  TransferCard,
  type PillStatus,
  type ReasonContext,
} from "@/ui/finance";
import { formatClock, formatDuration, formatVirtual, minutesBetween, formatWhen } from "@/ui/format/time";
import { Button, Collapse, Field, Input, Panel, Skeleton, Switch, Tabs, notify, notifyWaiting } from "@/ui/primitives";
import { api } from "@/ui/lib/api";
import { cn } from "@/ui/lib/cn";
import { ConversationPanel } from "@/ui/chat";
import { studentApi, useActionKeys, useActionState, usePaymentKey, type ActionState } from "./actions";
import { decimalFromInput, firstName, parseUsdToMinor } from "./copy";
import { ProblemNotice } from "./ProblemNotice";

// Espacio de Sofía (UI_UX 11.2, DESIGN_PLAN 5.2). Zona A: conversación, con los controles estructurados como respaldo.
// Zona B: el estado verdadero del servidor, en el orden factura, viaje del pago, rutas, fondos, caja, transferencias y
// devolución.

export const lastFour = (masked: string) => masked.replace(/\D/g, "").slice(-4);

export function routeLine(route: RouteEvaluationDTO): string {
  return `Route ${route.routeId}, ${channelName(route.channel)}, arrives in about ${route.arrivalHours} h. University receives ${formatMoney(route.net)}.`;
}

export function planTargetHours(plan: PlanDTO): number | null {
  return plan.targetArrivalHours;
}

export function reasonContext(data: CaseViewDTO, targetHours?: number | null): ReasonContext {
  return {
    targetHours: targetHours ?? undefined,
    invoiceNet: data.tuition.netDue,
    limit: data.familyFunds.tuitionLimit,
    reserve: data.familyFunds.arrivalReserve,
    available: data.familyFunds.availableForTuition,
    payerName: firstName(data.people.payer),
    studentName: firstName(data.people.student),
    mandateUsed: data.mandate?.usedThisPeriod,
    mandateMax: data.mandate?.periodMax,
  };
}

type MobileTab = "chat" | "payment" | "funds";

export function StudentView({ data, refresh }: { data: CaseViewDTO; refresh: () => Promise<void> }) {
  const actions = useActionState(refresh);
  const paymentKey = usePaymentKey();
  const [tab, setTab] = useState<MobileTab>("payment");
  const plan = data.plan;
  const targetHours = plan ? planTargetHours(plan) : null;
  const ctx = reasonContext(data, targetHours);

  const send = async () => {
    if (!plan) return;
    // La clave va ligada a la aprobación vigente: tras una falla confirmada y una aprobación nueva, la clave es otra (VC7-2).
    const approvalId = plan.approvals.find((a) => a.planVersion === plan.version && a.status === "ACTIVE")?.approvalId ?? "none";
    const result = await actions.run("send", () => studentApi.send("student", plan.planId, paymentKey(plan.planId, plan.version, approvalId)));
    if (result) announceAttempt(result.attempt.status, result.replayed);
  };
  const check = async () => {
    const attemptId = data.payment.attempt?.attemptId;
    if (!attemptId) return;
    const result = await actions.run("check", () => studentApi.check("student", attemptId));
    if (result) announceAttempt(result.attempt.status, false, result.attempt.status === data.payment.attempt?.status);
  };

  // Conciliación periódica (BUILD_PROMPT 15.4): con un pago en vuelo, cada 10 s se consulta el MISMO intento.
  const inFlight = data.payment.attempt && ["SUBMITTING", "UNKNOWN", "PROVIDER_ACCEPTED", "PENDING_UNIVERSITY"].includes(data.payment.attempt.status) ? data.payment.attempt.attemptId : null;
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void studentApi
        .check("student", inFlight)
        .then(() => refresh())
        .catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [inFlight, refresh]);
  const requestApproval = async () => {
    if (!plan) return;
    const result = await actions.run("request", () => studentApi.requestApproval(plan.planId));
    if (result) notify(`Approval requested from ${firstName(data.people.payer)}`);
  };

  // En móvil la sección elegida entra con un fundido (UI_UX 8), solo después de que la persona toca las pestañas.
  const [switched, setSwitched] = useState(false);
  const section = (id: MobileTab) => (tab === id ? cn("block", switched && "max-lg:animate-ag-fade-in-base") : "hidden lg:block");

  return (
    <div className="mx-auto w-full max-w-[1344px] px-4 pt-4 pb-24 md:px-8 md:pt-6 lg:pb-8">
      <Tabs
        className="mb-4 lg:hidden"
        ariaLabel="Workspace sections"
        value={tab}
        onChange={(id) => {
          setSwitched(true);
          setTab(id as MobileTab);
        }}
        tabs={[
          { id: "chat", label: "Chat", icon: <MessageSquare aria-hidden className="size-4" strokeWidth={1.75} /> },
          { id: "payment", label: "Payment", icon: <RouteIcon aria-hidden className="size-4" strokeWidth={1.75} /> },
          { id: "funds", label: "Funds", icon: <Wallet aria-hidden className="size-4" strokeWidth={1.75} /> },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-12">
        <div id="panel-chat" role="tabpanel" aria-label="Chat" className={cn("min-w-0 lg:col-span-5", section("chat"))}>
          <Panel title="Conversation" className="lg:sticky lg:top-6">
            <ConversationPanel
              role="student"
              workspaceId={data.workspace.id}
              data={data}
              refresh={refresh}
              ctx={ctx}
              structured={<StructuredControls data={data} actions={actions} ctx={ctx} onSend={send} onCheck={check} onRequest={requestApproval} />}
            />
          </Panel>
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-7">
          <div id="panel-payment" role="tabpanel" aria-label="Payment" className={section("payment")}>
            <div className="space-y-4">
              <InvoicePanel data={data} />
              <JourneyPanel data={data} actions={actions} ctx={ctx} onSend={send} onCheck={check} onRequest={requestApproval} />
              {plan ? <RoutesPanel plan={plan} data={data} /> : null}
            </div>
          </div>
          <div id="panel-funds" role="tabpanel" aria-label="Funds" className={section("funds")}>
            <FundsPanels data={data} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoicePanel({ data }: { data: CaseViewDTO }) {
  const t = data.tuition;
  const dueIn = minutesBetween(data.workspace.virtualNow, t.dueAt);
  const credited = t.status === "CREDITED";
  return (
    <Panel title="Tuition invoice" aside={credited ? <StatusPill status="CREDITED" /> : null}>
      <MoneyFigure money={t.netDue} size="xl" />
      <p className="mt-2 text-[14px] leading-[22px] text-ink-2">
        {t.institution}, account ending {lastFour(t.receiverMasked)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[14px] leading-[22px]">
        <div>
          <dt className="text-[13px] font-semibold text-muted">Reference</dt>
          <dd className="text-ink">{t.reference}</dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold text-muted">Due</dt>
          <dd className="tabular text-ink">
            {formatVirtual(t.dueAt)} {!credited && dueIn > 0 ? <span className="text-muted">in {formatDuration(dueIn)}</span> : null}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

interface StepProps {
  data: CaseViewDTO;
  actions: ActionState;
  ctx: ReasonContext;
  onSend: () => Promise<void>;
  onCheck: () => Promise<void>;
  onRequest: () => Promise<void>;
}

function JourneyPanel({ data, actions, ctx, onSend, onCheck, onRequest }: StepProps) {
  const status = data.payment.visibleStatus as PillStatus;
  const approval = data.plan?.approvals.find((a) => a.planVersion === data.plan?.version && (a.status === "ACTIVE" || a.status === "CONSUMED"));
  return (
    <Panel title="Payment journey" aside={<StatusPill status={status} payerName={firstName(data.people.payer)} />}>
      <JourneyLine stations={data.payment.journey} payerName={firstName(data.people.payer)} approvalFingerprint={approval?.fingerprint ?? null} referenceAt={data.workspace.virtualStart} />
      <div className="mt-5 border-t border-line pt-4">
        <NextStep data={data} actions={actions} ctx={ctx} onSend={onSend} onCheck={onCheck} onRequest={onRequest} />
      </div>
    </Panel>
  );
}

function NextStep({ data, actions, ctx, onSend, onCheck, onRequest }: StepProps) {
  const plan = data.plan;
  const attempt = data.payment.attempt;
  const payer = firstName(data.people.payer);
  const invalidated = plan?.approvals.find((a) => a.status === "INVALIDATED" && a.planVersion < plan.version);
  const step = (title: string, detail: string, action?: React.ReactNode) => (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <p className="text-[14px] leading-[22px] text-ink-2">{detail}</p>
      </div>
      {action}
    </div>
  );
  let body: React.ReactNode;
  switch (data.payment.nextAction) {
    case "PLAN_PAYMENT":
      body = step("No payments yet.", "Ask ArrivalGuard to plan your tuition, or use Plan my payment.");
      break;
    case "REQUEST_APPROVAL":
      body = step(
        `Needs ${payer}'s approval`,
        `Send the request. ${payer} approves on his own screen.`,
        <Button onClick={onRequest} loading={actions.busy === "request"} loadingText="Requesting">
          Request approval
        </Button>,
      );
      break;
    case "WAIT_FOR_PAYER":
      body = step(`Approval requested from ${payer}`, `${payer} approves on his own screen.`);
      break;
    case "SEND_PAYMENT": {
      const route = plan?.selectedRoute;
      body = step(
        "Payment approved",
        route ? `Route ${route.routeId}, ${formatMoney(route.debit)}. Nothing moves until you send it.` : "Nothing moves until you send it.",
        <Button onClick={onSend} loading={actions.busy === "send"} loadingText="Sending">
          Send payment
        </Button>,
      );
      break;
    }
    case "CHECK_PAYMENT":
      if (data.payment.visibleStatus === "UNCERTAIN" || data.payment.visibleStatus === "SENDING") {
        body = step(
          "A payment is already on its way",
          "Check that payment instead of sending another.",
          <Button onClick={onCheck} loading={actions.busy === "check"} loadingText="Checking">
            Check this payment
          </Button>,
        );
      } else {
        body = step(
          "Still waiting for the university",
          attempt ? `Accepted by provider, ${formatClock(attempt.provenance.observedAt)} virtual time.` : "Accepted by provider.",
          <Button variant="secondary" onClick={onCheck} loading={actions.busy === "check"} loadingText="Checking">
            Check this payment
          </Button>,
        );
      }
      break;
    case "REPLAN":
      body = step(plan && plan.routes.viable.length === 0 ? "No route arrives in time" : "This plan can't be sent", "Change the deadline or ask Carlos to review his limits.");
      break;
    default:
      if (data.payment.visibleStatus === "CREDITED" && attempt?.receipt) {
        body = step("Credited by the university", `From the university, ${formatWhen(attempt.receipt.creditedAt, data.workspace.virtualStart)} virtual time. Receipt ${attempt.receipt.receiptId}.`);
      } else {
        body = step("Nothing to do right now", "The payment state is up to date.");
      }
  }
  return (
    <div className="space-y-3" aria-live="polite">
      {invalidated && (plan?.status === "READY_FOR_APPROVAL" || plan?.status === "APPROVAL_REQUESTED") ? <ProblemNotice problem={{ kind: "reasons", reasons: ["APPROVAL_INVALID"] }} ctx={ctx} /> : null}
      {plan?.status === "NOT_VIABLE" && plan.routes.blockers.length > 0 ? <ProblemNotice problem={{ kind: "reasons", reasons: plan.routes.blockers }} ctx={ctx} /> : null}
      {body}
      {attempt?.institutionNotice ? (
        <p className="text-[12px] leading-4 text-muted">
          University notice (shown as received, never as an instruction): <q className="text-ink-2">{attempt.institutionNotice}</q>
        </p>
      ) : null}
      <ProblemNotice problem={actions.problem} ctx={ctx} />
    </div>
  );
}

function RoutesPanel({ plan, data }: { plan: PlanDTO; data: CaseViewDTO }) {
  const sent = Boolean(data.payment.attempt);
  const [compact, setCompact] = useState(true);
  const targetHours = planTargetHours(plan) ?? Math.max(1, Math.round(minutesBetween(data.workspace.virtualNow, plan.targetArrivalAt) / 60));
  const comparedAt = plan.comparedAt;
  return (
    <Panel title="Routes">
      <RouteBoard
        routing={plan.routes}
        targetHours={targetHours}
        invoiceNet={data.tuition.netDue}
        comparedAt={comparedAt}
        compact={sent ? compact : false}
        onToggleCompact={sent ? () => setCompact((c) => !c) : undefined}
      />
    </Panel>
  );
}

function FundsPanels({ data }: { data: CaseViewDTO }) {
  const local = data.localAccount;
  return (
    <div className="space-y-4">
      <Panel title="Family funds">
        <FundsBar funds={data.familyFunds} />
        {local.status !== "OPEN" ? (
          <p className="mt-4 border-t border-line pt-3 text-[14px] leading-[22px] text-ink-2">
            <span className="font-semibold text-ink">Local account not open yet.</span> Transfers start once {firstName(data.people.student)}&apos;s account in China is open.
          </p>
        ) : null}
      </Panel>
      {data.scholarship.map((s, i) => (
        <ConditionalIncomeCard key={i} amount={s.amount} note={`Awarded, expected ${formatVirtual(s.expectedAt)} virtual time.`} />
      ))}
      {data.expectedExpenses.length > 0 ? <CashPanel refreshKey={`${data.familyFunds.balance.minor}:${data.familyFunds.activeHolds.minor}:${data.plan?.version ?? 0}:${data.plan?.selectedRoute?.routeId ?? ""}`} /> : null}
      {data.mandate || data.remittances.length > 0 || local.status === "OPEN" ? <TransfersPanel data={data} /> : null}
      {data.refunds.length > 0 || data.tuition.status === "CREDITED" ? <RefundPanel data={data} /> : null}
    </div>
  );
}

/** Transferencias a la cuenta local (T3): permiso permanente con su medidor y cada transferencia con su estado. */
function TransfersPanel({ data }: { data: CaseViewDTO }) {
  const mandate = data.mandate;
  const local = data.localAccount;
  const transfers = data.remittances.slice().reverse();
  const payer = firstName(data.people.payer);
  return (
    <Panel title={`Transfers to ${firstName(data.people.student)}'s local account`}>
      <div className="space-y-4">
        {mandate ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-ink">Standing permission for arrival transfers</p>
              <p className="tabular text-[14px] text-ink-2">
                <MoneyFigure money={mandate.periodMax} size="s" /> per {mandate.periodDays} days
              </p>
            </div>
            {mandate.status === "ACTIVE" ? (
              <PermissionMeter used={mandate.usedThisPeriod} max={mandate.periodMax} />
            ) : (
              <p className="text-[14px] leading-[22px] text-ink-2">This permission is {mandate.status === "REVOKED" ? "revoked" : "no longer active"}. Each transfer needs {payer}&apos;s approval.</p>
            )}
          </div>
        ) : (
          <p className="text-[14px] leading-[22px] text-ink-2">No standing permission. Each transfer needs {payer}&apos;s approval.</p>
        )}
        {local.status === "OPEN" ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
            <p className="text-[14px] text-ink-2">
              {local.bankName ?? "Local bank"}, account ending {lastFour(local.masked)}
            </p>
            <MoneyFigure money={local.balance} size="m" />
          </div>
        ) : (
          <p className="border-t border-line pt-3 text-[14px] leading-[22px] text-ink-2">
            <span className="font-semibold text-ink">Local account not open yet.</span> Transfers start once {firstName(data.people.student)}&apos;s account in China is open.
          </p>
        )}
        {transfers.length === 0 ? (
          <p className="text-[14px] leading-[22px] text-ink-2">No transfers yet. Use Send transfer to move money for rent or other arrival costs.</p>
        ) : (
          transfers.map((r) => <TransferCard key={r.remittanceId} remittance={r} recipientLabel={local.bankName ?? "the local bank"} payerName={payer} />)
        )}
      </div>
    </Panel>
  );
}

/** Devolución (T7): el reclamo con su exceso verificado, destino fijo y seguimiento. */
function RefundPanel({ data }: { data: CaseViewDTO }) {
  const claims = data.refunds.slice().reverse();
  return (
    <Panel title="Refund request">
      {claims.length === 0 ? (
        <p className="text-[14px] leading-[22px] text-ink-2">
          If the university received more than the invoice, you can request the verified difference back. Refunds return only to the paying account.
        </p>
      ) : (
        <div className="space-y-3">
          {claims.map((c) => (
            <RefundRequestCard key={c.claimId} claim={c} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Se vuelve a pedir cuando cambia el caso (saldo, retenciones, plan o ruta), y el veredicto es el del servidor (VC7). */
function CashPanel({ refreshKey }: { refreshKey: string }) {
  // `undefined` mientras carga la primera vez (barras de carga, sin salto de diseño); `null` si falló (no se muestra).
  const [projection, setProjection] = useState<CashProjectionDTO | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    api<CashProjectionDTO>("/api/cash-projection", { role: "student" })
      .then((p) => alive && setProjection(p))
      .catch(() => alive && setProjection(null));
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  if (projection === null) return null;
  if (projection === undefined) {
    return (
      <Panel title="Cash for the first weeks">
        <div aria-busy="true" className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 py-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className={i % 2 === 0 ? "w-full" : "w-4/5"} />
            ))}
          </div>
          <Skeleton className="h-6" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="Cash for the first weeks">
      <ProjectionRows projection={projection} />
    </Panel>
  );
}

/** Solo la moneda del veredicto del servidor lleva veredicto; no se inventa uno para las demás. */
export function ProjectionRows({ projection }: { projection: CashProjectionDTO }) {
  const row = projection.byCurrency.find((c) => c.currency === projection.verdict.margin.currency);
  return row ? <CashProjection row={row} verdict={projection.verdict} /> : null;
}

function announcePlan(status: string) {
  if (status === "NOT_VIABLE") notifyWaiting("No route meets every rule");
  else notify("Plan ready");
}

function announceAttempt(status: string, replayed: boolean, unchanged = false) {
  if (status === "FAILED_CONFIRMED") notifyWaiting("Failed, no money left the account");
  else if (status === "CREDITED") notify("Credited by the university");
  else if (replayed) notifyWaiting("This payment was already sent");
  else if (unchanged) notifyWaiting("Still waiting for the university");
  else notify(status === "SUBMITTING" || status === "UNKNOWN" ? "Payment sent. Checking with the provider" : "Payment sent");
}

function StructuredControls({ data, actions, ctx, onSend, onCheck, onRequest }: StepProps) {
  const due = Math.max(1, Math.floor(minutesBetween(data.workspace.virtualNow, data.tuition.dueAt) / 60));
  const [hours, setHours] = useState(String(due));
  const [compareHours, setCompareHours] = useState(String(due));
  const [compared, setCompared] = useState<RoutingDTO | null>(null);
  const [expenses, setExpenses] = useState("");
  const [projection, setProjection] = useState<CashProjectionDTO | null>(null);
  const [open, setOpen] = useState<string>("plan");
  const plan = data.plan;
  const attempt = data.payment.attempt;
  const hoursValue = /^\d{1,3}$/.test(hours) ? Math.max(1, Math.min(720, Number.parseInt(hours, 10))) : null;
  const compareValue = /^\d{1,3}$/.test(compareHours) ? Math.max(1, Math.min(720, Number.parseInt(compareHours, 10))) : null;

  const sectionHeader = (id: string, label: string) => (
    <button
      type="button"
      aria-expanded={open === id}
      onClick={() => setOpen(open === id ? "" : id)}
      className="flex h-12 w-full items-center justify-between px-4 text-left font-semibold text-ink"
    >
      {label}
      <ChevronDown aria-hidden strokeWidth={1.75} className={cn("size-5 text-ink-2 transition-transform duration-fast", open === id ? "rotate-180" : "")} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="divide-y divide-line overflow-hidden rounded-control border border-line-strong">
        <section>
          {sectionHeader("plan", "Plan my payment")}
          <Collapse open={open === "plan"}>
            <form
              className="space-y-4 px-4 pb-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!hoursValue) return;
                const result = await actions.run("plan", () => studentApi.plan(hoursValue));
                if (result) announcePlan(result.plan.status);
              }}
            >
              <Field label="Tuition invoice" htmlFor="plan-invoice">
                <Input id="plan-invoice" readOnly value={`${data.tuition.reference}, ${data.tuition.institution}, ${formatMoney(data.tuition.netDue)}`} />
              </Field>
              <Field
                label="Must arrive within (hours)"
                htmlFor="plan-hours"
                hint={`From ${formatVirtual(data.workspace.virtualNow)} virtual time. The invoice is due in ${formatDuration(minutesBetween(data.workspace.virtualNow, data.tuition.dueAt))}.`}
                error={hoursValue ? null : "Enter whole hours, from 1 to 720."}
              >
                <Input id="plan-hours" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} invalid={!hoursValue} />
              </Field>
              <Switch checked disabled onCheckedChange={() => undefined} label="Keep the arrival reserve" description={`${formatMoney(data.familyFunds.arrivalReserve)} stays aside for the first weeks.`} />
              {data.tuition.status !== "PENDING" ? <p className="text-[14px] leading-[22px] text-ink-2">This invoice is already paid. There is nothing to plan.</p> : null}
              <Button type="submit" loading={actions.busy === "plan"} loadingText="Planning" disabled={!hoursValue || data.tuition.status !== "PENDING"}>
                Plan my payment
              </Button>
            </form>
          </Collapse>
        </section>
        <section>
          {sectionHeader("compare", "Compare routes")}
          <Collapse open={open === "compare"}>
            <form
              className="space-y-4 px-4 pb-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!compareValue) return;
                const result = await actions.run("compare", () =>
                  api<{ routes: RoutingDTO }>(`/api/routes/compare?purpose=TUITION&targetArrivalHours=${compareValue}`, { role: "student" }),
                );
                if (result) setCompared(result.routes);
              }}
            >
              <Field label="Must arrive within (hours)" htmlFor="compare-hours" hint="Comparing changes nothing." error={compareValue ? null : "Enter whole hours, from 1 to 720."}>
                <Input id="compare-hours" inputMode="numeric" value={compareHours} onChange={(e) => setCompareHours(e.target.value)} invalid={!compareValue} />
              </Field>
              <Button type="submit" variant="secondary" loading={actions.busy === "compare"} loadingText="Comparing" disabled={!compareValue}>
                Compare routes
              </Button>
              {compared && compareValue ? <RouteBoard routing={compared} targetHours={compareValue} invoiceNet={data.tuition.netDue} comparedAt={data.workspace.virtualNow} /> : null}
            </form>
          </Collapse>
        </section>
        <section>
          {sectionHeader("request", "Request approval")}
          <Collapse open={open === "request"}>
            <div className="space-y-3 px-4 pb-4 text-[14px] leading-[22px] text-ink-2">
              {plan?.selectedRoute ? <p>{routeLine(plan.selectedRoute)}</p> : <p>Plan the payment first.</p>}
              <Button onClick={onRequest} loading={actions.busy === "request"} loadingText="Requesting" disabled={plan?.status !== "READY_FOR_APPROVAL"}>
                Request approval
              </Button>
            </div>
          </Collapse>
        </section>
        <section>
          {sectionHeader("send", "Send payment")}
          <Collapse open={open === "send"}>
            <div className="space-y-3 px-4 pb-4 text-[14px] leading-[22px] text-ink-2">
              <p>{plan?.status === "APPROVED" ? `Approved by ${firstName(data.people.payer)}. Nothing moves until you send it.` : `Sending needs ${firstName(data.people.payer)}'s approval of the current plan.`}</p>
              <Button onClick={onSend} loading={actions.busy === "send"} loadingText="Sending" disabled={plan?.status !== "APPROVED"}>
                Send payment
              </Button>
            </div>
          </Collapse>
        </section>
        <section>
          {sectionHeader("check", "Check this payment")}
          <Collapse open={open === "check"}>
            <div className="space-y-3 px-4 pb-4 text-[14px] leading-[22px] text-ink-2">
              <p>{attempt ? "Checks the same payment with the provider and the university. It never sends a new one." : "No payment has been sent yet."}</p>
              <Button variant="secondary" onClick={onCheck} loading={actions.busy === "check"} loadingText="Checking" disabled={!attempt}>
                Check this payment
              </Button>
            </div>
          </Collapse>
        </section>
        <section>
          {sectionHeader("project", "Project my funds")}
          <Collapse open={open === "project"}>
            <form
              className="space-y-4 px-4 pb-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const minor = expenses.trim() === "" ? null : parseUsdToMinor(expenses);
                if (expenses.trim() !== "" && !minor) return;
                const query = minor ? `?arrivalExpensesMinor=${minor}` : "";
                const result = await actions.run("project", () => api<CashProjectionDTO>(`/api/cash-projection${query}`, { role: "student" }));
                if (result) setProjection(result);
              }}
            >
              <Field label="Arrival expenses estimate in USD (optional)" htmlFor="project-expenses" hint="Leave empty to use the estimate on file.">
                <Input id="project-expenses" inputMode="decimal" value={expenses} onChange={(e) => setExpenses(e.target.value)} placeholder="2,500.00" />
              </Field>
              <Button type="submit" variant="secondary" loading={actions.busy === "project"} loadingText="Projecting">
                Project my funds
              </Button>
              {projection ? <ProjectionRows projection={projection} /> : null}
            </form>
          </Collapse>
        </section>
        <section>
          {sectionHeader("transfer", "Send transfer")}
          <Collapse open={open === "transfer"}><TransferControls data={data} actions={actions} ctx={ctx} /></Collapse>
        </section>
        <section>
          {sectionHeader("refund", "Submit refund request")}
          <Collapse open={open === "refund"}><RefundControls data={data} actions={actions} /></Collapse>
        </section>
      </div>
      <ProblemNotice problem={["plan", "compare", "project", "transfer", "refund"].includes(open) ? actions.problem : null} ctx={ctx} />
      <p className="sr-only" aria-live="polite">
        {actions.busy ? "Working" : ""}
      </p>
    </div>
  );
}

/** Send transfer (T3): primero prepara (ruta y permiso), después envía si quedó lista o aprobada. */
function TransferControls({ data, actions, ctx }: { data: CaseViewDTO; actions: ActionState; ctx: ReasonContext }) {
  const [amount, setAmount] = useState("2,000.00");
  const [hours, setHours] = useState("24");
  const [preparedId, setPreparedId] = useState<string | null>(null);
  const keyFor = useActionKeys();
  const net = decimalFromInput(amount);
  const hoursValue = /^\d{1,3}$/.test(hours) ? Math.max(1, Math.min(720, Number.parseInt(hours, 10))) : null;
  // El estado verdadero de la remesa preparada viene del caso; la respuesta solo se usa hasta el próximo refresco.
  const [lastPrepared, setLastPrepared] = useState<RemittanceDTO | null>(null);
  const prepared = data.remittances.find((r) => r.remittanceId === preparedId) ?? lastPrepared;
  const payer = firstName(data.people.payer);
  const sendable = prepared && (prepared.status === "READY" || prepared.status === "APPROVED");

  return (
    <div className="space-y-4 px-4 pb-4">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!net || !hoursValue) return;
          const result = await actions.run("transfer-prepare", () => studentApi.prepareRemittance(net, hoursValue));
          if (!result) return;
          setPreparedId(result.remittance.remittanceId);
          setLastPrepared(result.remittance);
          const status = result.remittance.status;
          if (status === "READY") notify("Transfer ready to send");
          else if (status === "APPROVAL_REQUESTED") notifyWaiting("Over this month's transfer limit");
          else notifyWaiting("Transfer blocked");
        }}
      >
        <Field label="Amount the local account receives, in CNY" htmlFor="transfer-amount" error={amount && !net ? "Enter an amount like 2,000.00" : null}>
          <Input id="transfer-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(amount) && !net} />
        </Field>
        <Field label="Must arrive within (hours)" htmlFor="transfer-hours" error={hoursValue ? null : "Enter whole hours, from 1 to 720."}>
          <Input id="transfer-hours" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} invalid={!hoursValue} />
        </Field>
        <p className="text-[14px] leading-[22px] text-ink-2">
          Goes only to {firstName(data.people.student)}&apos;s own local account. Within {payer}&apos;s standing permission it can be sent right away; above it, {payer} approves once.
        </p>
        <Button type="submit" variant="secondary" loading={actions.busy === "transfer-prepare"} loadingText="Checking" disabled={!net || !hoursValue}>
          Check this transfer
        </Button>
      </form>
      {prepared ? (
        <div className="space-y-3">
          <TransferCard remittance={prepared} recipientLabel={data.localAccount.bankName ?? "the local bank"} payerName={payer} />
          {prepared.status === "APPROVAL_REQUESTED"
            ? prepared.reasons.map((code) => <BlockedNotice key={code} code={code} ctx={ctx} tone="wait" extra={prepared.debit ? `This transfer costs ${formatMoney(prepared.debit)}.` : undefined} />)
            : null}
          {prepared.status === "BLOCKED" ? prepared.reasons.map((code) => <BlockedNotice key={code} code={code} ctx={ctx} />) : null}
          {sendable ? (
            <Button
              loading={actions.busy === "transfer-send"}
              loadingText="Sending"
              onClick={async () => {
                const result = await actions.run("transfer-send", () =>
                  studentApi.executeRemittance(prepared.remittanceId, keyFor(`remit:${prepared.remittanceId}:v${prepared.version}:${prepared.status}`)),
                );
                if (!result) return;
                setLastPrepared(result.remittance);
                if (result.outcome === "NEEDS_PAYER_APPROVAL") notifyWaiting("Over this month's transfer limit");
                else if (result.replayed) notifyWaiting("This transfer was already sent");
                else notify("Transfer sent");
              }}
            >
              Send transfer
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Submit refund request (T7): prepara el reclamo con el exceso verificado y lo envía al destino fijo. */
function RefundControls({ data, actions }: { data: CaseViewDTO; actions: ActionState }) {
  const keyFor = useActionKeys();
  const claim = data.refunds.filter((c) => c.status !== "REJECTED").at(-1) ?? null;
  return (
    <div className="space-y-3 px-4 pb-4 text-[14px] leading-[22px] text-ink-2">
      <p>The amount is the overpayment the university verified, and the money returns only to the paying account.</p>
      {claim ? <RefundRequestCard claim={claim} /> : null}
      {!claim ? (
        <Button
          variant="secondary"
          loading={actions.busy === "refund-prepare"}
          loadingText="Checking"
          onClick={async () => {
            const result = await actions.run("refund-prepare", () => studentApi.prepareRefund(data.tuition.obligationId));
            if (result) notify("Refund request ready to submit");
          }}
        >
          Check the overpayment
        </Button>
      ) : null}
      {claim?.status === "DRAFT" ? (
        <Button
          loading={actions.busy === "refund-submit"}
          loadingText="Submitting"
          onClick={async () => {
            const result = await actions.run("refund-submit", () => studentApi.submitRefund(claim.claimId, keyFor(`refund:${claim.claimId}`)));
            if (!result) return;
            if (result.replayed) notifyWaiting("This refund request was already submitted");
            else notify("Refund request submitted");
          }}
        >
          Submit refund request
        </Button>
      ) : null}
    </div>
  );
}
