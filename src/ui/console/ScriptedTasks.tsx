"use client";

import { BadgeCheck, CircleDashed, CircleX, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button, Panel, notify } from "@/ui/primitives";
import { api } from "@/ui/lib/api";
import { cn } from "@/ui/lib/cn";
import type { ActionState } from "@/ui/workspace/actions";

// "Scripted tasks" de la consola (UI_UX 11.5, DESIGN_PLAN ScriptedTasks): un primario "Run T1 to T8" y la grilla de
// ocho resultados. El servidor corre cada tarea en un espacio nuevo y la juzga por su propio estado; aquí solo se
// muestra lo que devolvió.

interface TaskResult {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly passed: boolean;
  readonly checks: readonly { readonly check: string; readonly ok: boolean }[];
  readonly durationMs: number;
  readonly error: string | null;
}

interface RunResponse {
  readonly ranAt: string;
  readonly passed: number;
  readonly total: number;
  readonly tasks: readonly TaskResult[];
}

const TASKS: readonly { id: string; title: string }[] = [
  { id: "T1", title: "Pay tuition until credited" },
  { id: "T2", title: "Check a payment's status" },
  { id: "T3", title: "Arrival transfer under the permission" },
  { id: "T4", title: "Project cash" },
  { id: "T5", title: "Compare routes" },
  { id: "T6", title: "Change permissions" },
  { id: "T7", title: "Refund request" },
  { id: "T8", title: "Out of scope request" },
];

export function ScriptedTasks({ actions }: { actions: ActionState }) {
  const [run, setRun] = useState<RunResponse | null>(null);
  const running = actions.busy === "scripted-tasks";

  const start = async () => {
    const result = await actions.run("scripted-tasks", () => api<RunResponse>("/api/evaluation/scripted-tasks", { role: "evaluator", body: {} }));
    if (result) {
      setRun(result);
      notify(`Scripted tasks: ${result.passed} of ${result.total} passed`);
    }
  };

  return (
    <Panel title="Scripted tasks" aside={run ? <span className="text-[12px] font-medium text-muted">{`${run.passed} of ${run.total} passed`}</span> : null}>
      <p className="text-[14px] leading-[22px] text-ink-2">Runs T1 to T8, each in a new synthetic workspace, and checks the result on the server. This workspace only records the summary.</p>
      <Button className="mt-3" onClick={start} loading={running} loadingText="Running T1 to T8">
        Run T1 to T8
      </Button>
      <ul className="mt-4 divide-y divide-line" aria-live="polite" aria-busy={running}>
        {TASKS.map((task) => {
          const result = run?.tasks.find((t) => t.id === task.id);
          const state = running ? "running" : !result ? "idle" : result.passed ? "passed" : "failed";
          return (
            <li key={task.id} className="py-2">
              <div className="flex items-center gap-3">
                <span className="tabular w-7 font-mono text-[12px] font-semibold text-ink">{task.id}</span>
                <span className="min-w-0 flex-1 text-[14px] leading-5 text-ink">{task.title}</span>
                {/* El estado nuevo de cada tarea se funde (UI_UX 8); "Not run yet" del montaje no anima. */}
                <span
                  key={state}
                  className={cn(
                    "inline-flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap",
                    state === "passed" ? "text-arrive" : state === "failed" ? "text-stop" : "text-muted",
                    state !== "idle" && "animate-ag-fade-in",
                  )}
                >
                  {state === "running" ? <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" /> : state === "passed" ? <BadgeCheck aria-hidden className="size-4" /> : state === "failed" ? <CircleX aria-hidden className="size-4" /> : <CircleDashed aria-hidden className="size-4" />}
                  {state === "running" ? "Running" : state === "passed" ? "Passed" : state === "failed" ? "Failed" : "Not run yet"}
                </span>
              </div>
              {result ? (
                <details className="mt-1 pl-10 text-[12px] leading-4 text-ink-2">
                  <summary className="cursor-pointer py-1 text-muted">{`${result.checks.filter((c) => c.ok).length} of ${result.checks.length} checks · ${(result.durationMs / 1000).toFixed(1)} s`}</summary>
                  <ul className="mt-1 space-y-1">
                    {result.checks.map((c) => (
                      <li key={c.check} className={c.ok ? "text-ink-2" : "text-stop"}>
                        {c.ok ? "Met: " : "Not met: "}
                        {c.check}
                      </li>
                    ))}
                    {result.error ? <li className="text-stop">Error: {result.error}</li> : null}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
