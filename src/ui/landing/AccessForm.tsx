"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input } from "@/ui/primitives";
import { ApiError, api } from "@/ui/lib/api";
import { cn } from "@/ui/lib/cn";
import { SCENARIO_OPTIONS, type ScenarioOptionId } from "@/ui/workspace/copy";

// Acceso del jurado (A4): el código de evaluación abre un espacio nuevo con los tres roles en este navegador.

function accessError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Couldn't reach ArrivalGuard. Try again.";
  if (error.status === 401) return "That evaluation code doesn't match. Check the judging packet.";
  if (error.status === 429) return "Too many workspaces were opened from here. Try again later.";
  if (error.code === "NETWORK") return error.message;
  return "The workspace couldn't be opened. Try again.";
}

export function AccessForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [scenario, setScenario] = useState<ScenarioOptionId>("base");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code.trim()) {
          setError("Enter the evaluation code.");
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const result = await api<{ next: string }>("/api/evaluation/workspaces", { role: "guest", body: { accessCode: code.trim(), scenario } });
          router.push(result.next);
        } catch (err) {
          setError(accessError(err));
          setBusy(false);
        }
      }}
    >
      <Field label="Evaluation code" htmlFor="access-code" error={error}>
        <Input
          id="access-code"
          name="accessCode"
          autoComplete="off"
          spellCheck={false}
          placeholder="From the judging packet"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          invalid={Boolean(error)}
        />
      </Field>
      <fieldset>
        <legend className="mb-2 text-[13px] leading-[18px] font-semibold text-ink">Scenario</legend>
        <div className="grid gap-2">
          {SCENARIO_OPTIONS.map((s) => {
            const checked = scenario === s.id;
            return (
              <label
                key={s.id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-control border p-3 transition-colors duration-fast",
                  checked ? "border-route bg-route-tint ring-1 ring-route" : "border-line-strong bg-surface hover:border-ink-2",
                )}
              >
                <input type="radio" name="scenario" value={s.id} checked={checked} onChange={() => setScenario(s.id)} className="mt-1 size-4 accent-[var(--ag-route)]" />
                <span>
                  <span className="block font-semibold text-ink">{s.label}</span>
                  <span className="block text-[14px] leading-[22px] text-ink-2">{s.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Button type="submit" loading={busy} loadingText="Opening">
        Open the demo
      </Button>
    </form>
  );
}
