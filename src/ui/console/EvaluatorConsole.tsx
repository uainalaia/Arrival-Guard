"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useState } from "react";
import type { EventDTO } from "@/application/dto/CaseDTO";
import type { AiUsageDTO } from "@/application/mappers/AiUsageMapper";
import { formatMoney } from "@/interfaces/format/money";
import { PermissionMeter } from "@/ui/finance";
import { StopOctagon } from "@/ui/brand";
import { formatDuration, formatVirtual, formatWhen, minutesBetween } from "@/ui/format/time";
import { Button, Field, Input, Panel, Select, Switch, notify } from "@/ui/primitives";
import { api } from "@/ui/lib/api";
import { cn } from "@/ui/lib/cn";
import { useResource } from "@/ui/lib/useResource";
import { useActionState } from "@/ui/workspace/actions";
import { FAULT_OPTIONS, SCENARIO_OPTIONS, actorName, eventDetail, eventGroup, eventTitle, faultLabel, securityCategory, type EventGroup } from "@/ui/workspace/copy";
import { ProblemNotice } from "@/ui/workspace/ProblemNotice";
import { ScriptedTasks } from "./ScriptedTasks";

// Consola del evaluador (UI_UX 11.5, DESIGN_PLAN 5.6). Siempre en tema oscuro. Solo el evaluador avanza el reloj,
// activa fallas y cambia de escenario; el servidor lo exige por rol.

interface EventsResponse {
  readonly aiUsage?: AiUsageDTO;
  readonly virtualNow: string | null;
  readonly faults: Readonly<Record<string, unknown>>;
  readonly events: readonly EventDTO[];
}

const FILTERS: readonly { id: "all" | EventGroup; label: string }[] = [
  { id: "all", label: "All" },
  { id: "payments", label: "Payments" },
  { id: "approvals", label: "Approvals" },
  { id: "security", label: "Security" },
  { id: "clock", label: "Clock and faults" },
];

const ADVANCE = [
  { minutes: 60, label: "Advance 1 hour" },
  { minutes: 360, label: "6 hours" },
  { minutes: 1440, label: "24 hours" },
  { minutes: 4320, label: "72 hours" },
];

export function EvaluatorConsole({
  workspaceId,
  scenario,
  virtualStart,
  people,
  onClockChange,
}: {
  workspaceId: string;
  scenario: string;
  virtualStart: string | null;
  people: { student: string; payer: string };
  onClockChange: () => Promise<void>;
}) {
  const router = useRouter();
  const events = useResource((signal) => api<EventsResponse>("/api/evaluation/events", { role: "evaluator", signal }), [workspaceId], 4000, {
    cacheKey: `${workspaceId}:evaluator:events`,
  });
  const refresh = async () => {
    await events.refresh();
    await onClockChange();
  };
  const actions = useActionState(refresh);
  const [nextScenario, setNextScenario] = useState(scenario);
  const [custom, setCustom] = useState("");
  const [filter, setFilter] = useState<"all" | EventGroup>("all");

  // El tema oscuro distingue la consola de las vistas de usuarios; se restaura al salir. Antes de pintar, para que no
  // haya un cuadro en claro al entrar.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = "dark";
    return () => {
      if (previous) root.dataset.theme = previous;
      else delete root.dataset.theme;
    };
  }, []);

  const virtualNow = events.data?.virtualNow ?? null;
  const faults = events.data?.faults ?? {};
  const activeFaults = FAULT_OPTIONS.filter((f) => faults[f.id] === true);
  const list = useMemo(() => (events.data?.events ?? []).filter((e) => filter === "all" || eventGroup(e.type) === filter).slice().reverse(), [events.data, filter]);
  // Solo entran con un fundido los eventos que llegan mientras se mira la bitácora; lo que ya estaba al cargar o al
  // cambiar de filtro aparece sin animar (comparación con el render anterior, sin efectos).
  const newestSeq = list.reduce((max, e) => Math.max(max, e.seq), 0);
  const [baseline, setBaseline] = useState<{ filter: string; seq: number } | null>(null);
  if (events.data && (baseline === null || baseline.filter !== filter)) setBaseline({ filter, seq: newestSeq });
  const arrived = (seq: number) => baseline !== null && baseline.filter === filter && seq > baseline.seq;
  const current = SCENARIO_OPTIONS.find((s) => s.id === scenario);
  const customMinutes = /^\d{1,5}$/.test(custom) ? Number.parseInt(custom, 10) : null;

  const advance = async (minutes: number) => {
    const result = await actions.run(`advance-${minutes}`, () => api<{ virtualNow: string }>("/api/evaluation/advance-clock", { role: "evaluator", body: { minutes } }));
    if (result) notify(`Virtual time moved to ${formatVirtual(result.virtualNow)}`);
  };

  return (
    <div className="mx-auto w-full max-w-[1344px] px-4 pt-4 pb-8 md:px-8 md:pt-6">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-4 lg:col-span-5">
          <Panel title="Scenario">
            <p className="font-semibold text-ink">{current?.label ?? scenario}</p>
            <p className="text-[14px] leading-[22px] text-ink-2">{current?.description}</p>
            <form
              className="mt-4 flex flex-col gap-3 md:flex-row md:items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await actions.run("reset", () => api<{ next: string }>("/api/evaluation/reset", { role: "evaluator", body: { scenario: nextScenario } }));
                if (result) {
                  notify("New workspace ready");
                  router.push(result.next.replace("?as=student", "?as=evaluator"));
                }
              }}
            >
              <Field label="Scenario for the new workspace" htmlFor="console-scenario">
                <Select id="console-scenario" value={nextScenario} onChange={(e) => setNextScenario(e.target.value)}>
                  {SCENARIO_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secondary" loading={actions.busy === "reset"} loadingText="Starting">
                Start new workspace
              </Button>
            </form>
            <p className="mt-2 text-[12px] leading-4 text-muted">The current workspace is kept. Nothing is deleted.</p>
          </Panel>

          <Panel title="Virtual time">
            {virtualNow ? (
              <>
                <p className="tabular text-[40px] leading-[44px] font-semibold tracking-[-0.01em] text-ink">{formatVirtual(virtualNow)}</p>
                <p className="text-[14px] text-muted">{virtualStart ? `+${formatDuration(minutesBetween(virtualStart, virtualNow))} from start` : "virtual time"}</p>
              </>
            ) : (
              <p className="text-ink-2">Loading virtual time</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {ADVANCE.map((a) => (
                <Button key={a.minutes} variant="secondary" size="sm" loading={actions.busy === `advance-${a.minutes}`} onClick={() => advance(a.minutes)}>
                  {a.label}
                </Button>
              ))}
            </div>
            <form
              className="mt-3 flex items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (customMinutes && customMinutes >= 1 && customMinutes <= 10_080) await advance(customMinutes);
              }}
            >
              <Field label="Custom, in minutes (1 to 10,080)" htmlFor="console-custom">
                <Input id="console-custom" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="90" />
              </Field>
              <Button type="submit" variant="quiet" size="sm" disabled={!customMinutes || customMinutes > 10_080}>
                Advance
              </Button>
            </form>
            <p className="mt-2 text-[12px] leading-4 text-muted">Moving time also processes scheduled provider and university events. It never extends sessions.</p>
          </Panel>

          <Panel title="Faults" aside={<span className="text-[12px] font-medium text-muted">{activeFaults.length} active</span>}>
            <div className="space-y-3">
              {FAULT_OPTIONS.map((f) => (
                <Switch
                  key={f.id}
                  id={`fault-${f.id}`}
                  checked={faults[f.id] === true}
                  label={f.label}
                  description={f.consequence}
                  disabled={actions.busy === f.id}
                  onCheckedChange={async (enabled) => {
                    const result = await actions.run(f.id, () => api("/api/evaluation/faults", { role: "evaluator", body: { fault: f.id, enabled } }));
                    if (result) notify(enabled ? `${faultLabel(f.id)}: on` : `${faultLabel(f.id)}: off`);
                  }}
                />
              ))}
            </div>
          </Panel>
          <Panel title="AI usage">
            {events.data?.aiUsage ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[14px] leading-[22px] text-ink">
                    {formatMoney(events.data.aiUsage.workspace)} of {formatMoney(events.data.aiUsage.workspaceBudget)} for this workspace
                  </p>
                  <PermissionMeter used={events.data.aiUsage.workspace} max={events.data.aiUsage.workspaceBudget} />
                </div>
                <p className="text-[14px] leading-[22px] text-ink-2">
                  {formatMoney(events.data.aiUsage.daily)} of {formatMoney(events.data.aiUsage.dailyBudget)} today, across all workspaces
                </p>
                <p className="text-[12px] leading-4 text-muted">At either limit the assistant switches to structured controls. Nothing is lost.</p>
              </div>
            ) : (
              <p className="text-[14px] text-ink-2">Loading usage</p>
            )}
          </Panel>
          <ScriptedTasks actions={actions} />
          <ProblemNotice problem={actions.problem} />
        </div>

        <div className="min-w-0 lg:col-span-7">
          <Panel
            title="Event log"
            aside={
              <div role="group" aria-label="Filter events" className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn("h-11 rounded-full border px-3 md:h-8 text-[13px] font-medium", filter === f.id ? "border-route bg-route-tint text-ink" : "border-line text-ink-2 hover:text-ink")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            }
          >
            {list.length === 0 ? (
              <p className="text-[14px] text-ink-2">{events.loading ? "Loading events" : "No events for this filter yet."}</p>
            ) : (
              <div className="max-h-[70vh] overflow-auto" tabIndex={0} role="region" aria-label="Event log entries">
                <table className="w-full min-w-[560px] border-collapse font-mono text-[12px] leading-4">
                  <thead className="sticky top-0 bg-surface text-left text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Virtual time</th>
                      <th className="py-2 pr-3 font-medium">Actor</th>
                      <th className="py-2 pr-3 font-medium">Event</th>
                      <th className="py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((e) => {
                      const security = e.type === "SECURITY_BLOCK";
                      return (
                        <tr
                          key={e.seq}
                          className={cn(
                            "border-t border-line align-top",
                            security ? "text-stop" : e.type === "INSTITUTION_CREDITED" ? "text-arrive" : e.type === "PROVIDER_RESPONSE_LOST" || e.type === "ATTEMPT_UNKNOWN" ? "text-wait" : "text-ink",
                            arrived(e.seq) && "animate-ag-fade-in-base",
                          )}
                        >
                          <td className="tabular py-2 pr-3 whitespace-nowrap">{formatWhen(e.virtualAt, virtualStart)}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{actorName(e.actorRole, people)}</td>
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center gap-1">
                              {security ? <StopOctagon size={14} variant="outline" /> : null}
                              {eventTitle(e.type)}
                            </span>
                          </td>
                          <td className="py-2 text-ink-2">
                            {security && typeof e.payload.category === "string" ? <span className="mr-1 font-semibold text-stop">{securityCategory(e.payload.category)}.</span> : null}
                            {eventDetail(e.type, e.payload)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
