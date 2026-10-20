import { CircleCheck, CircleSlash, Loader } from "lucide-react";
import type { ChatActivityDTO } from "@/application/dto/ChatDTO";
import { reasonCopy, type ReasonContext } from "@/ui/finance";
import { cn } from "@/ui/lib/cn";

/**
 * Etiqueta de actividad (UI_UX 12): la genera el servidor según la herramienta usada ("Checking quotes"). Nunca es
 * el razonamiento del modelo. Si la herramienta fue rechazada, muestra la razón con el texto de UI_UX 9.5.
 */
export function ActivityChip({ activity, working = false, ctx, className }: { activity?: ChatActivityDTO | null; working?: boolean; ctx?: ReasonContext; className?: string }) {
  if (working || !activity) {
    return (
      <p className={cn("flex items-center gap-2 text-[12px] leading-4 font-medium text-muted", className)} role="status">
        <Loader aria-hidden className="size-3.5 motion-safe:animate-spin" strokeWidth={1.75} />
        Working
      </p>
    );
  }
  const reason = !activity.ok && activity.reason ? reasonCopy(activity.reason, ctx) : null;
  const Icon = activity.ok ? CircleCheck : CircleSlash;
  return (
    <p className={cn("flex items-start gap-2 text-[12px] leading-4 font-medium text-muted", className)}>
      <Icon aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={1.75} />
      <span>
        {activity.label}
        {reason ? <span className="text-ink-2">. {reason.title}</span> : null}
      </span>
    </p>
  );
}
