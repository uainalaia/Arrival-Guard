"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { StopOctagon } from "@/ui/brand";
import { formatVirtual } from "@/ui/format/time";
import { Button, Collapse, Sheet } from "@/ui/primitives";
import { ApiError, api, type ActorRole } from "@/ui/lib/api";
import { cn } from "@/ui/lib/cn";
import { eventDetail, eventGroup, eventTitle, securityCategory, type EventGroup } from "./copy";

// Expediente de evidencia (UI_UX 11.7, DESIGN_PLAN 5.8): línea de tiempo con hora virtual y real, actor, título y el
// JSON redactado que entrega el servidor. Se descarga en JSON o en Markdown.

interface EvidenceTimelineItem {
  readonly seq: number;
  readonly type: string;
  readonly actorRole: string;
  readonly virtualAt: string;
  readonly realAt: string;
  readonly payload: Record<string, unknown>;
}

interface EvidenceJSON {
  readonly workspace: { readonly scenarioLabel: string };
  readonly timeline: readonly EvidenceTimelineItem[];
}

const FILTERS: readonly { id: "all" | EventGroup; label: string }[] = [
  { id: "all", label: "All" },
  { id: "payments", label: "Payments" },
  { id: "approvals", label: "Approvals" },
  { id: "security", label: "Security" },
  { id: "clock", label: "Clock and faults" },
];

const ACTOR: Record<string, string> = { student: "Sofía", payer: "Carlos", evaluator: "Evaluator", system: "ArrivalGuard" };

async function download(role: ActorRole, format: "json" | "md"): Promise<void> {
  const response = await fetch(`/api/evidence${format === "md" ? "?format=md" : ""}`, { headers: { "x-ag-actor": role }, credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("download failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = format === "md" ? "arrivalguard-evidence.md" : "arrivalguard-evidence.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function EvidenceButton({ role }: { role: ActorRole }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<EvidenceJSON | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | EventGroup>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = async () => {
    setError(null);
    try {
      setData(await api<EvidenceJSON>("/api/evidence", { role }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load the evidence. Try again.");
    }
  };
  const items = (data?.timeline ?? []).filter((e) => filter === "all" || eventGroup(e.type) === filter).slice().reverse();

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        aria-label="Evidence"
        className="px-2.5 md:px-3"
      >
        <FileText aria-hidden className="size-4" strokeWidth={1.75} />
        {/* En móvil queda solo el ícono (con su nombre accesible) para que la barra no se desborde. */}
        <span className="hidden md:inline">Evidence</span>
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Evidence"
        subtitle={data ? `${data.workspace.scenarioLabel}, everything recorded by the server` : "Everything recorded by the server"}
        footer={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void download(role, "json").catch(() => setError("The download failed. Try again."))}>Download evidence (JSON)</Button>
            <Button variant="secondary" onClick={() => void download(role, "md").catch(() => setError("The download failed. Try again."))}>
              Download summary (Markdown)
            </Button>
          </div>
        }
      >
        <div role="group" aria-label="Filter evidence" className="mb-4 flex flex-wrap gap-1 border-b border-line pb-3">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn("h-11 rounded-full border px-3 text-[13px] font-medium md:h-8", filter === f.id ? "border-route bg-route-tint text-ink" : "border-line text-ink-2 hover:text-ink")}
            >
              {f.label}
            </button>
          ))}
        </div>
        {error ? <p className="text-[14px] text-wait">{error}</p> : null}
        {!data && !error ? <p className="text-[14px] text-ink-2">Loading the evidence</p> : null}
        <ol className="space-y-3">
          {items.map((e) => (
            <li key={e.seq} className="grid grid-cols-[64px_1fr] gap-3 border-b border-line pb-3">
              <span className="tabular text-[12px] leading-4 text-muted">
                {formatVirtual(e.virtualAt).split(", ")[1]}
                <span className="block">{new Date(e.realAt).toISOString().slice(11, 19)} real</span>
              </span>
              <div className="min-w-0">
                <p className={cn("flex items-center gap-1 font-semibold", e.type === "SECURITY_BLOCK" ? "text-stop" : "text-ink")}>
                  {e.type === "SECURITY_BLOCK" ? <StopOctagon size={16} variant="outline" /> : null}
                  {eventTitle(e.type)}
                </p>
                <p className="text-[14px] leading-[22px] text-ink-2">
                  {ACTOR[e.actorRole] ?? e.actorRole}.{" "}
                  {e.type === "SECURITY_BLOCK" && typeof e.payload.category === "string" ? `${securityCategory(e.payload.category)}. ` : ""}
                  {eventDetail(e.type, e.payload)}
                </p>
                <button type="button" aria-expanded={expanded === e.seq} onClick={() => setExpanded(expanded === e.seq ? null : e.seq)} className="mt-1 min-h-11 text-[13px] font-semibold text-route md:min-h-0">
                  {expanded === e.seq ? "Hide redacted detail" : "Show redacted detail"}
                </button>
                <Collapse open={expanded === e.seq}>
                  <pre className="mt-2 max-h-60 overflow-auto rounded-doc bg-paper p-2 font-mono text-[12px] leading-4 text-ink-2">{JSON.stringify(e.payload, null, 2)}</pre>
                </Collapse>
              </div>
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  );
}
