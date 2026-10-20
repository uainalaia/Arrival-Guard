import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ConsentSeal } from "@/ui/brand/ConsentSeal";
import { Logo } from "@/ui/brand/Logo";
import { MiniSeal } from "@/ui/brand/MiniSeal";
import { SimulationBand } from "@/ui/brand/SimulationBand";
import { ThemeToggle } from "@/ui/layout/ThemeToggle";
import { StopOctagon } from "@/ui/brand/StopOctagon";
import { ThresholdMark } from "@/ui/brand/ThresholdMark";
import { ApprovalRequestCard } from "@/ui/finance/ApprovalRequestCard";
import { BlockedNotice } from "@/ui/finance/BlockedNotice";
import { CashProjection } from "@/ui/finance/CashProjection";
import { ConditionalIncomeCard } from "@/ui/finance/ConditionalIncomeCard";
import { FundsBar } from "@/ui/finance/FundsBar";
import { JourneyLine } from "@/ui/finance/JourneyLine";
import { MoneyFigure } from "@/ui/finance/MoneyFigure";
import { PermissionMeter } from "@/ui/finance/PermissionMeter";
import { RouteBoard } from "@/ui/finance/RouteBoard";
import { StatusPill, type PillStatus } from "@/ui/finance/StatusPill";
import { Button } from "@/ui/primitives/Button";
import { Panel, Skeleton } from "@/ui/primitives/Panel";
import { CASH_COVERED, CASH_DEFICIT, COMPARED_AT, FINGERPRINTS, FUNDS_BEFORE, FUNDS_HELD, INVOICE_NET, JOURNEYS, ROUTING_1H, ROUTING_48H, ROUTING_6H, SAMPLE } from "./fixtures";
import { CompactRouteBoardDemo, ContrastTable, ControlsDemo } from "./SystemDemos";

export const metadata: Metadata = {
  title: "System",
  description: "ArrivalGuard brand and design system, with synthetic data from the base scenario.",
  robots: { index: false, follow: false },
};

const PILLS: PillStatus[] = [
  "DETAILS_NEEDED",
  "PLAN_READY",
  "WAITING_FOR_PAYER",
  "APPROVED",
  "SENDING",
  "UNCERTAIN",
  "PROVIDER_ACCEPTED",
  "WAITING_FOR_UNIVERSITY",
  "CREDITED",
  "DELIVERED",
  "BLOCKED",
  "FAILED_NO_DEBIT",
  "REFUND_REQUESTED",
  "UNDER_REVIEW",
  "REFUNDED",
  "REFUND_DECLINED",
  "SELECTED",
  "NO_LONGER_MATCHES",
];

const TYPE_SCALE = [
  { role: "Display", spec: "56/60, 700, −2%", className: "text-[40px] leading-[44px] font-bold tracking-[-0.02em] md:text-[56px] md:leading-[60px]", sample: "Tuition that arrives." },
  { role: "H1", spec: "36/42, 700, −1.5%", className: "text-[36px] leading-[42px] font-bold tracking-[-0.015em]", sample: "Payment approval" },
  { role: "H2", spec: "26/32, 650, −1%", className: "text-[26px] leading-8 font-[650] tracking-[-0.01em]", sample: "Payment journey" },
  { role: "H3", spec: "20/26, 650, −0.5%", className: "text-[20px] leading-[26px] font-[650] tracking-[-0.005em]", sample: "Family funds" },
  { role: "Body", spec: "16/26, 400", className: "text-[16px] leading-[26px]", sample: "Takes 72 h. You need it within 48 h." },
  { role: "Body S", spec: "14/22, 400", className: "text-[14px] leading-[22px]", sample: "University receives" },
  { role: "Label", spec: "13/18, 600, +0.5%", className: "text-[13px] leading-[18px] font-semibold tracking-[0.005em]", sample: "Proposed debit" },
  { role: "Caption", spec: "12/16, 500, +1%", className: "text-[12px] leading-4 font-medium tracking-[0.01em] text-muted", sample: "From the university, 11:14 virtual time" },
  { role: "Serif clause", spec: "17/28, Source Serif 4", className: "font-serif text-[17px] leading-7", sample: "I approve a single tuition payment from my account ending 4821." },
  { role: "Mono", spec: "13/18, Overpass Mono", className: "font-mono text-[13px] leading-[18px]", sample: "Consent fingerprint 3F9A 21C7" },
];

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6 border-t border-line py-12 md:grid-cols-12">
      <div className="md:col-span-3">
        <h2 id={id} className="text-[26px] font-[650] leading-8 tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {intro ? <p className="mt-2 text-[14px] leading-[22px] text-ink-2">{intro}</p> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-6 md:col-span-9">{children}</div>
    </section>
  );
}

export default function SystemPage() {
  return (
    <>
      <SimulationBand />
      <main className="mx-auto max-w-[1344px] px-4 pb-24 pt-12 sm:px-8">
        <header className="flex flex-col gap-6 pb-12">
          <div className="flex items-center justify-between gap-4">
            <Logo size="lg" />
            <ThemeToggle />
          </div>
          <h1 className="max-w-3xl text-[40px] font-bold leading-[44px] tracking-[-0.02em] text-ink md:text-[56px] md:leading-[60px]">Tuition that arrives. Savings that stay.</h1>
          <div className="max-w-2xl">
            <p className="text-[20px] font-[650] leading-[26px] text-ink">Brand and design system</p>
            <p className="mt-2 text-ink-2">
              Wayfinding for money in transit. A tuition payment leaves Lima, crosses currencies and intermediaries, and has to arrive at a university in Shenzhen. The interface
              borrows the language of transit signage so a family under pressure always knows where the money is and what comes next.
            </p>
            <p className="mt-2 text-[12px] font-medium leading-4 text-muted">FinTechathon 2026 International Track. Version 1.0, Oct 2026. All data on this page is synthetic.</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Legible", "Clear hierarchy, tabular numbers, one state per element, the user's own language."],
              ["Binding", "Consent shows exactly what it covers and leaves a visible mark."],
              ["Calm under uncertainty", "“We don't know yet” is shown calmly with the next step, never as an error or a success."],
              ["Honest", "The simulation is always visible and the system's limits are named."],
            ].map(([title, text]) => (
              <li key={title} className="rounded-panel border border-line bg-surface p-5">
                <p className="text-[15px] font-semibold leading-[22px] text-ink">{title}</p>
                <p className="mt-1 text-[14px] leading-[22px] text-ink-2">{text}</p>
              </li>
            ))}
          </ul>
        </header>

        <Section id="mark" title="The Threshold mark" intro="An arched doorway on a threshold, with a dot that has already passed through: the payment that arrived and was kept safe. Built on a 32 × 32 grid.">
          <div className="flex flex-wrap items-end gap-8">
            {[20, 32, 48, 112].map((size) => (
              <figure key={size} className="flex flex-col items-start gap-2">
                <ThresholdMark size={size} />
                <figcaption className="text-[12px] font-medium leading-4 text-muted">{size === 20 ? "20 px, minimum" : `${size} px`}</figcaption>
              </figure>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Logo size="sm" />
            <Logo size="md" />
            <Logo size="lg" />
          </div>
          <div className="flex flex-wrap gap-4">
            <span className="flex items-center gap-3 rounded-panel border border-line bg-surface p-5">
              <ThresholdMark size={48} mono />
              <span className="text-[14px] leading-[22px] text-ink-2">One color, ink</span>
            </span>
            <span className="flex items-center gap-3 rounded-panel bg-ink p-5">
              <ThresholdMark size={48} tone="paper" />
              <span className="text-[14px] leading-[22px] text-paper">One color, paper on dark</span>
            </span>
            <span className="flex items-center gap-3 rounded-panel bg-ink p-5">
              <Logo size="md" tone="paper" />
            </span>
          </div>
        </Section>

        <Section
          id="seal"
          title="The consent seal"
          intro="When Carlos approves, the document receives a square seal generated from the fingerprint of that exact approval. The seal is a picture of the fingerprint; the server's check is what makes it binding."
        >
          <div className="flex flex-wrap gap-8">
            {FINGERPRINTS.map((f) => (
              <figure key={f.value} className="flex flex-col gap-2">
                <ConsentSeal fingerprint={f.value} size={96} />
                <figcaption className="text-[12px] font-medium leading-4 text-muted">
                  {f.label}
                  <br />
                  {f.time}
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="flex flex-wrap items-start gap-8">
            <ConsentSeal fingerprint={FINGERPRINTS[0].value} size={144} />
            <figure className="flex flex-col gap-2">
              <ConsentSeal fingerprint={null} size={96} state="placeholder" />
              <figcaption className="text-[14px] leading-[22px] text-ink-2">The seal appears when Carlos approves.</figcaption>
            </figure>
            <figure className="flex flex-col gap-2">
              <ConsentSeal fingerprint={FINGERPRINTS[0].value} size={96} state="invalidated" />
              <figcaption className="text-[14px] leading-[22px] text-ink-2">Approval no longer matches</figcaption>
            </figure>
            <div className="flex items-end gap-4">
              <ConsentSeal fingerprint={FINGERPRINTS[1].value} size={56} />
              <ConsentSeal fingerprint={FINGERPRINTS[1].value} size={40} />
              <ConsentSeal fingerprint={FINGERPRINTS[1].value} size={28} />
            </div>
          </div>
          <p className="text-[12px] font-medium leading-4 text-muted">Example fingerprints. The app shows the real SHA-256 that the server computes for each approval.</p>
        </Section>

        <Section id="color" title="Color" intro="If something is blue, you can press it or it is the money's route. State colors always travel with an icon and text. Normal debits are never red; red means blocked.">
          <ContrastTable />
        </Section>

        <Section id="type" title="Typography" intro="Overpass carries the whole interface. Source Serif 4 is reserved for approval clauses. Overpass Mono is reserved for fingerprints, the event log and technical identifiers.">
          <dl className="flex flex-col">
            {TYPE_SCALE.map((t) => (
              <div key={t.role} className="grid gap-1 border-b border-line py-3 md:grid-cols-[160px_1fr]">
                <dt className="text-[13px] font-semibold leading-[18px] text-ink-2">
                  {t.role}
                  <span className="block text-[12px] font-medium leading-4 text-muted">{t.spec}</span>
                </dt>
                <dd className={`text-ink ${t.className}`}>{t.sample}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col items-start gap-1">
            <p className="text-[13px] font-semibold leading-[18px] text-ink-2">Tabular figures: both amounts must measure the same</p>
            <MoneyFigure money={SAMPLE.usd("111111")} size="l" />
            <MoneyFigure money={SAMPLE.usd("888888")} size="l" />
          </div>
        </Section>

        <Section id="components" title="Buttons and fields" intro="40 px high, 44 on touch. One primary per area. No arrows. Danger is used only for revoking an approval or a permission.">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Send payment</Button>
            <Button loading loadingText="Sending">
              Send payment
            </Button>
            <Button disabled>Send payment</Button>
            <Button variant="secondary">Review or revoke</Button>
            <Button variant="secondary" loading loadingText="Checking">
              Check this payment
            </Button>
            <Button variant="quiet">Watch the video</Button>
            <Button variant="danger">Revoke approval</Button>
          </div>
          <ControlsDemo />
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="w-2/3" />
            <Skeleton className="w-1/2" />
            <Skeleton className="w-3/4" />
          </div>
        </Section>

        <Section id="status" title="Status" intro="One state per pill: icon, text and tint, always together.">
          <div className="flex flex-wrap gap-2">
            {PILLS.map((p) => (
              <StatusPill key={p} status={p} />
            ))}
          </div>
          <div className="flex flex-wrap items-baseline gap-6">
            <MoneyFigure money={SAMPLE.cny("2000000")} size="xl" />
            <MoneyFigure money={SAMPLE.usd("286000")} size="l" />
            <MoneyFigure money={SAMPLE.usd("288000")} size="m" debit />
            <MoneyFigure money={SAMPLE.usd("28800")} size="s" />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[14px] leading-[22px] text-ink-2">
            <span className="flex items-center gap-2">
              <StopOctagon size={24} /> Octagon, filled
            </span>
            <span className="flex items-center gap-2 text-stop">
              <StopOctagon size={16} variant="outline" /> Octagon, 16 px outline
            </span>
            <span className="flex items-center gap-2">
              <MiniSeal /> Mini seal
            </span>
          </div>
        </Section>

        <Section id="routes" title="Route board" intro="An arrivals board. Selected first, then other viable routes, then rejected routes with the reason in the row.">
          <Panel title="Routes" aside="Within 48 h">
            <RouteBoard routing={ROUTING_48H} targetHours={48} invoiceNet={INVOICE_NET} comparedAt={COMPARED_AT} />
          </Panel>
          <Panel title="Routes" aside="Within 6 h">
            <RouteBoard routing={ROUTING_6H} targetHours={6} invoiceNet={INVOICE_NET} comparedAt="2026-10-20T09:09:00.000Z" />
          </Panel>
          <Panel title="Routes" aside="After sending">
            <CompactRouteBoardDemo />
          </Panel>
          <Panel title="Routes" aside="Impossible deadline">
            <RouteBoard routing={ROUTING_1H} targetHours={1} invoiceNet={INVOICE_NET} comparedAt={COMPARED_AT} />
          </Panel>
        </Section>

        <Section id="journey" title="Payment journey" intro="Stations joined like a metro line. The line fills from station to station; the uncertain segment drifts slowly and stays still with reduced motion.">
          {JOURNEYS.map((j) => (
            <Panel key={j.label} title={j.label}>
              <JourneyLine stations={j.stations} approvalFingerprint={FINGERPRINTS[1].value} />
            </Panel>
          ))}
          <Panel title="Vertical, as on mobile">
            <JourneyLine stations={JOURNEYS[2]!.stations} approvalFingerprint={FINGERPRINTS[1].value} orientation="vertical" />
          </Panel>
        </Section>

        <Section id="funds" title="Family funds and cash" intro="Direct labels, no legend. Conditional income stays apart and is never added to real money.">
          <Panel title="Family funds">
            <FundsBar funds={FUNDS_BEFORE} />
          </Panel>
          <Panel title="Family funds" aside="Payment in progress">
            <FundsBar funds={FUNDS_HELD} />
            <ConditionalIncomeCard className="mt-4" amount={SAMPLE.cny("2000000")} note="Awarded, expected in about 60 days." />
          </Panel>
          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="Cash for the first weeks" aside="USD">
              <CashProjection row={CASH_DEFICIT} />
            </Panel>
            <Panel title="Cash for the first weeks" aside="USD">
              <CashProjection row={CASH_COVERED} />
            </Panel>
          </div>
          <Panel title="Standing permission for arrival transfers" aside="USD 600.00 per 30 days">
            <PermissionMeter used={SAMPLE.usd("28800")} max={SAMPLE.usd("60000")} daysLeft={30} />
            <PermissionMeter className="mt-6" used={SAMPLE.usd("28800")} held={SAMPLE.usd("43200")} max={SAMPLE.usd("60000")} daysLeft={30} />
          </Panel>
        </Section>

        <Section id="notices" title="Requests and blocks" intro="Stop for blocks, wait for limits. The action on a request changes with the role.">
          <BlockedNotice
            code="RECEIVER_NOT_ALLOWED"
            category="INDUCED_TRANSFER"
            detail="Payments go only to the account on the invoice, and approvals happen on Carlos's screen."
            nextStep={<Button variant="secondary">Show the current plan</Button>}
          />
          <BlockedNotice
            code="EXCEEDS_MANDATE_PERIOD_LIMIT"
            tone="wait"
            ctx={{ mandateUsed: SAMPLE.usd("28800"), mandateMax: SAMPLE.usd("60000") }}
            extra="This transfer costs USD 432.00 and would bring the period to USD 720.00."
            nextStep={<Button variant="secondary">Request approval</Button>}
          />
          <BlockedNotice code="BREAKS_RESERVE" ctx={{ reserve: SAMPLE.usd("180000") }} />
          <div className="grid gap-4 md:grid-cols-3">
            <ApprovalRequestCard
              variant="student"
              title="Tuition payment, plan version 1"
              amount={SAMPLE.usd("286000")}
              routeLine="Route B, Edu Pay Partner, arrives in about 24 h. University receives CNY 20,000.00."
              status="PLAN_READY"
              action={<Button>Request approval</Button>}
            />
            <ApprovalRequestCard
              variant="payer"
              title="Tuition approval, plan version 2"
              subtitle="Requested by Sofía Ramos"
              amount={SAMPLE.usd("288000")}
              routeLine="Route D, Express Edu, arrives in about 2 h"
              status="APPROVED"
              fingerprint={FINGERPRINTS[1].value}
              secondary={<Button variant="secondary">Review or revoke</Button>}
            />
            <ApprovalRequestCard
              variant="payer"
              title="Tuition approval, plan version 1"
              subtitle="Requested by Sofía Ramos"
              amount={SAMPLE.usd("286000")}
              routeLine="Route B, Edu Pay Partner, arrives in about 24 h"
              status="APPROVED"
              fingerprint={FINGERPRINTS[0].value}
              invalidated={{ title: "Approval no longer matches", detail: "The plan changed. Carlos needs to approve the new one." }}
            />
          </div>
        </Section>
      </main>
    </>
  );
}
