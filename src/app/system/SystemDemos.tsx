"use client";

import { MessageSquare, Route as RouteIcon, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { RouteBoard } from "@/ui/finance/RouteBoard";
import { Button } from "@/ui/primitives/Button";
import { Accordion, FilterChip, RadioCardGroup } from "@/ui/primitives/Choice";
import { Field, Input } from "@/ui/primitives/Input";
import { Switch } from "@/ui/primitives/Switch";
import { Tabs } from "@/ui/primitives/Tabs";
import { notify } from "@/ui/primitives/Toast";
import { COMPARED_AT, INVOICE_NET, ROUTING_48H } from "./fixtures";

// Demos con estado de la guía viva. Los componentes son los mismos de la app; los datos, del escenario base.

const TOKENS = ["paper", "surface", "ink", "ink-2", "muted", "line", "line-strong", "route", "route-tint", "arrive", "arrive-tint", "wait", "wait-tint", "stop", "stop-tint", "seal"] as const;
const USES: Record<(typeof TOKENS)[number], string> = {
  paper: "App background",
  surface: "Panels, documents, fields",
  ink: "Primary text, logo",
  "ink-2": "Secondary text",
  muted: "Help, provenance",
  line: "Non-essential dividers",
  "line-strong": "Field and control borders",
  route: "Press it, or the money's route",
  "route-tint": "Selection, user bubble",
  arrive: "Credited, delivered, refunded",
  "arrive-tint": "Arrival states",
  wait: "Waiting, uncertain, pending",
  "wait-tint": "Waiting states",
  stop: "Blocked, declined",
  "stop-tint": "Blocks",
  seal: "The consent seal only",
};

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function ratio(a: string, b: string): string {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return "n/a";
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return ((hi + 0.05) / (lo + 0.05)).toFixed(1);
}

/** Contraste calculado en vivo con la fórmula WCAG 2.x sobre `surface`, en el tema activo. */
export function ContrastTable() {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    const read = () => {
      const style = getComputedStyle(root);
      setValues(Object.fromEntries(TOKENS.map((t) => [t, style.getPropertyValue(`--ag-${t}`).trim()])));
    };
    read();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    return () => media.removeEventListener("change", read);
  }, [theme]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Theme for this page">
        {(["light", "dark", "system"] as const).map((t) => (
          <FilterChip key={t} pressed={theme === t} onClick={() => setTheme(t)}>
            {t === "light" ? "Light" : t === "dark" ? "Dark" : "System"}
          </FilterChip>
        ))}
      </div>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Color tokens with their contrast against surface</caption>
        <thead>
          <tr className="border-b border-line text-[13px] font-semibold leading-[18px] text-ink-2">
            <th scope="col" className="py-2 pr-3">Token</th>
            <th scope="col" className="px-3 py-2">Use</th>
            <th scope="col" className="px-3 py-2 text-right">On surface</th>
          </tr>
        </thead>
        <tbody>
          {TOKENS.map((t) => (
            <tr key={t} className="border-b border-line last:border-b-0">
              <td className="py-2 pr-3">
                <span className="flex items-center gap-3">
                  <span aria-hidden className="size-6 rounded-doc border border-line" style={{ background: `var(--ag-${t})` }} />
                  <span className="font-mono text-[13px] leading-[18px] text-ink">{t}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-[14px] leading-[22px] text-ink-2">{USES[t]}</td>
              <td className="tabular px-3 py-2 text-right text-[14px] leading-[22px] text-ink">
                {values ? (t === "line" || t.endsWith("tint") || t === "paper" || t === "surface" ? "Decorative or base" : `${ratio(values[t] ?? "", values.surface ?? "")}:1`) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ControlsDemo() {
  const [reserve, setReserve] = useState(true);
  const [fault, setFault] = useState(true);
  const [tab, setTab] = useState("chat");
  const [scenario, setScenario] = useState("base");
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Field label="Must arrive within" htmlFor="sys-arrive" hint="From Tue 20 Oct, 09:00 virtual time. The invoice is due in 48 h.">
          <Input id="sys-arrive" defaultValue="48 h" />
        </Field>
        <Field label="Tuition limit" htmlFor="sys-limit" error="Below the approved debit of USD 2,880.00">
          <Input id="sys-limit" defaultValue="USD 2,500.00" />
        </Field>
        <Field label="Pays to" htmlFor="sys-pays" hint="Fixed by the invoice">
          <Input id="sys-pays" readOnly defaultValue="Account ending 0098" />
        </Field>
      </div>
      <div className="flex flex-col gap-4">
        <Switch checked={reserve} onCheckedChange={setReserve} label="Keep the arrival reserve" description="USD 1,800.00 stays aside for the first weeks." />
        <Switch
          checked={fault}
          onCheckedChange={setFault}
          activeTone="wait"
          label="Lose the next provider response"
          description="The payment will show as uncertain until checked"
        />
        <Tabs
          ariaLabel="Workspace sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "chat", label: "Chat", icon: <MessageSquare className="size-5" strokeWidth={1.75} /> },
            { id: "payment", label: "Payment", icon: <RouteIcon className="size-5" strokeWidth={1.75} />, badge: true },
            { id: "funds", label: "Funds", icon: <Wallet className="size-5" strokeWidth={1.75} /> },
          ]}
        />
        <p id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="text-[14px] text-ink-2">
          Panel {tab}
        </p>
        <RadioCardGroup
          name="sys-scenario"
          ariaLabel="Scenario"
          value={scenario}
          onChange={setScenario}
          options={[
            { value: "base", title: "Base payment", description: "Pay tuition inside Carlos's limit, change the deadline and recover from a lost provider response." },
            { value: "arrival_remittance", title: "Arrival transfer", description: "Send rent under Carlos's standing permission, then reach the period limit." },
          ]}
        />
        <Button variant="secondary" onClick={() => notify("Payment approved")}>
          Show a toast
        </Button>
      </div>
      <Accordion
        className="md:col-span-2"
        items={[
          { id: "plan", title: "Plan my payment", content: <p className="text-[14px] leading-[22px] text-ink-2">The first action opens with its minimal form.</p> },
          { id: "compare", title: "Compare routes", content: <p className="text-[14px] leading-[22px] text-ink-2">Compare without side effects.</p> },
          { id: "check", title: "Check this payment", content: <p className="text-[14px] leading-[22px] text-ink-2">Checks the same payment by its key.</p> },
        ]}
      />
    </div>
  );
}

export function CompactRouteBoardDemo() {
  const [compact, setCompact] = useState(true);
  return <RouteBoard routing={ROUTING_48H} targetHours={48} invoiceNet={INVOICE_NET} comparedAt={COMPARED_AT} compact={compact} onToggleCompact={() => setCompact((c) => !c)} />;
}
