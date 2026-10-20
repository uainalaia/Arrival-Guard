import { Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import { StopOctagon } from "@/ui/brand/StopOctagon";
import { cn } from "@/ui/lib/cn";
import { reasonCopy, securityCategoryLabel, type ReasonContext } from "./reasons";

export interface BlockedNoticeProps {
  readonly code: string;
  readonly ctx?: ReasonContext;
  /** Reemplazan el texto de `reasonCopy` cuando el servidor trae uno propio. */
  readonly title?: string;
  readonly detail?: string;
  /** Categoría oficial de seguridad (INDUCED_TRANSFER, …) o un texto ya redactado. */
  readonly category?: string | null;
  /** Una línea extra en `ink-2` (por ejemplo, cuánto costaría la transferencia). */
  readonly extra?: ReactNode;
  readonly nextStep?: ReactNode;
  /** `stop` para bloqueos; `wait` para límites que Carlos puede aprobar (DESIGN_PLAN 6.6). */
  readonly tone?: "stop" | "wait";
  /** `alert` solo si lo provocó el usuario en ese turno; si no, `status`. */
  readonly alert?: boolean;
  readonly className?: string;
}

/** Aviso de bloqueo (UI_UX 12): octágono, título de la razón, detalle, categoría y siguiente paso. Nunca una pared de texto. */
export function BlockedNotice({ code, ctx, title, detail, category, extra, nextStep, tone = "stop", alert = false, className }: BlockedNoticeProps) {
  const copy = reasonCopy(code, ctx);
  const reasonTitle = title ?? copy.title;
  const reasonDetail = detail ?? copy.detail;
  const heading = category ? securityCategoryLabel(category) : reasonTitle;
  const body = category ? `${reasonTitle}. ${reasonDetail}` : reasonDetail;
  return (
    <div role={alert ? "alert" : "status"} className={cn("flex gap-3 rounded-control p-4", tone === "stop" ? "bg-stop-tint" : "bg-wait-tint", className)}>
      {tone === "stop" ? <StopOctagon size={24} /> : <Hourglass aria-hidden className="size-6 shrink-0 text-wait" strokeWidth={1.75} />}
      <div className="flex min-w-0 flex-col gap-1">
        <p className={cn("text-[15px] font-semibold leading-[22px]", tone === "stop" ? "text-stop" : "text-wait")}>{heading}</p>
        <p className="text-[14px] leading-[22px] text-ink">{body}</p>
        {extra ? <p className="text-[14px] leading-[22px] text-ink-2">{extra}</p> : null}
        {nextStep ? <div className="mt-2 flex flex-wrap gap-2">{nextStep}</div> : null}
      </div>
    </div>
  );
}
