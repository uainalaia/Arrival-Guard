"use client";

import { ChevronLeft, Hourglass } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CaseViewDTO } from "@/application/dto/CaseDTO";
import type { MoneyDTO } from "@/application/dto/MoneyDTO";
import { MoneyFigure } from "@/ui/finance";
import { Button, notify } from "@/ui/primitives";
import { api, setWorkspaceScope } from "@/ui/lib/api";
import { useResource } from "@/ui/lib/useResource";
import { useActionState } from "./actions";
import { sealCode } from "./copy";
import { ProblemNotice } from "./ProblemNotice";

// Confirmación fija de un cambio preparado en el chat (DESIGN_PLAN 5.5, T6). El cambio solo se aplica aquí, con la
// huella que calculó el servidor; el chat nunca cambia límites por sí solo.

interface ChangeResponse {
  readonly change: { changeId: string; kind: string; status: string; payload: Record<string, unknown>; fingerprint: string };
}

const isMoney = (v: unknown): v is MoneyDTO => typeof v === "object" && v !== null && typeof (v as MoneyDTO).minor === "string";

export function ChangeConfirmation({ workspaceId, changeId }: { workspaceId: string; changeId: string }) {
  setWorkspaceScope(workspaceId);
  const router = useRouter();
  const change = useResource((signal) => api<ChangeResponse>(`/api/payer/changes/${changeId}`, { role: "payer", signal }), [changeId], 0);
  const current = useResource((signal) => api<CaseViewDTO>("/api/case", { role: "payer", signal }), [], 0);
  const actions = useActionState(async () => {
    await change.refresh();
  });

  const c = change.data?.change;
  const data = current.data;
  const rows: { label: string; now: MoneyDTO | string | null; after: MoneyDTO | string }[] = [];
  if (c && data) {
    if (c.kind === "POLICY_CHANGE") {
      if (isMoney(c.payload.maxTuitionDebit)) rows.push({ label: "Tuition limit", now: data.familyFunds.tuitionLimit, after: c.payload.maxTuitionDebit });
      if (isMoney(c.payload.reserve)) rows.push({ label: "Arrival reserve", now: data.familyFunds.arrivalReserve, after: c.payload.reserve });
    } else {
      rows.push({
        label: "Standing permission for arrival transfers",
        now: data.mandate?.periodMax ?? null,
        after: c.payload.revoke === true ? "Revoked" : isMoney(c.payload.newPeriodMax) ? c.payload.newPeriodMax : "Unchanged",
      });
    }
  }
  const title = c?.kind === "POLICY_CHANGE" ? "Confirm limit change" : "Confirm permission change";
  const done = c && c.status !== "PENDING";
  const hasActiveApproval = Boolean(data?.plan?.approvals.some((a) => a.status === "ACTIVE"));

  return (
    <div className="relative mx-auto w-full max-w-[640px] px-4 pt-5 pb-12 md:px-0">
      <Link href={`/w/${workspaceId}?as=payer`} className="mb-3 inline-flex h-11 items-center gap-1 text-[15px] md:h-10 font-semibold text-route hover:underline xl:absolute xl:top-5 xl:-left-40">
        <ChevronLeft aria-hidden className="size-4" strokeWidth={1.75} />
        Permissions
      </Link>
      <article className="rounded-doc border border-line bg-surface px-5 py-6 md:px-12 md:py-8">
        {change.error ? (
          <p className="text-ink-2">{change.error.status === 404 ? "This change is not in your workspace." : change.error.message}</p>
        ) : !c || !data ? (
          <p className="text-ink-2">Loading the change</p>
        ) : (
          <>
            {done ? (
              <div role="status" className="-mx-5 -mt-6 mb-6 flex items-center gap-2 bg-wait-tint px-5 py-2 text-[14px] text-wait md:-mx-12 md:-mt-8 md:px-12">
                <Hourglass aria-hidden className="size-4" strokeWidth={1.75} />
                {c.status === "CONFIRMED" ? "This change was already applied." : "This change is no longer available."}
              </div>
            ) : null}
            <p className="text-[12px] leading-4 font-medium text-muted">Prepared in the chat. Nothing changes until you confirm.</p>
            <h1 className="mt-2 text-[28px] leading-[34px] font-bold tracking-[-0.015em] md:text-[36px] md:leading-[42px]">{title}</h1>
            <table className="mt-6 w-full border-collapse text-left">
              <thead>
                <tr className="text-[13px] text-muted">
                  <th className="py-2 font-semibold">Setting</th>
                  <th className="py-2 text-right font-semibold">Now</th>
                  <th className="py-2 text-right font-semibold">After</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-line">
                    <td className="py-3 pr-3 text-ink">{r.label}</td>
                    <td className="py-3 text-right">{r.now === null ? "None" : typeof r.now === "string" ? r.now : <MoneyFigure money={r.now} size="m" />}</td>
                    <td className="py-3 text-right font-semibold">{typeof r.after === "string" ? r.after : <MoneyFigure money={r.after} size="m" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasActiveApproval && c.kind === "POLICY_CHANGE" ? (
              <p className="mt-4 text-[14px] leading-[22px] text-ink-2">If the current plan no longer fits, its approval stops matching and it needs a new one.</p>
            ) : null}
            <p className="mt-4 font-mono text-[12px] leading-4 text-ink-2">Consent fingerprint {sealCode(c.fingerprint)}</p>
            <div className="mt-6 flex flex-col gap-2 md:flex-row">
              <Button
                loading={actions.busy === "confirm"}
                loadingText="Saving"
                disabled={Boolean(done)}
                onClick={async () => {
                  const result = await actions.run("confirm", () => api(`/api/payer/changes/${changeId}/confirm`, { role: "payer", body: { fingerprint: c.fingerprint } }));
                  if (result) {
                    notify(c.kind === "POLICY_CHANGE" ? "Tuition limit updated" : c.payload.revoke === true ? "Permission revoked" : "Permission updated");
                    router.push(`/w/${workspaceId}?as=payer`);
                  }
                }}
              >
                {c.kind === "POLICY_CHANGE" ? "Save limit" : c.payload.revoke === true ? "Revoke permission" : "Save permission"}
              </Button>
              <Button variant="secondary" onClick={() => router.push(`/w/${workspaceId}?as=payer`)}>
                {c.kind === "POLICY_CHANGE" ? "Keep current limit" : "Keep current permission"}
              </Button>
            </div>
            <div className="mt-4">
              <ProblemNotice problem={actions.problem} />
            </div>
          </>
        )}
      </article>
    </div>
  );
}
