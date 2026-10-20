import type { ReactNode } from "react";
import Link from "next/link";
import { Logo, ThresholdMark } from "@/ui/brand";
import type { ActorRole } from "@/ui/lib/api";
import { cn } from "@/ui/lib/cn";
import { RoleSwitcher, type RoleOption } from "./RoleSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { VirtualClock } from "./VirtualClock";

// Barra superior del espacio (DESIGN_PLAN 5.0): el borde superior lleva el color del rol activo.
const ROLE_BORDER: Record<ActorRole, string> = {
  student: "border-t-line-strong",
  payer: "border-t-route",
  evaluator: "border-t-ink",
};

export function TopBar({
  workspaceId,
  role,
  scenarioLabel,
  virtualNow,
  elapsedMinutes,
  roles,
  actions,
}: {
  workspaceId: string;
  role: ActorRole;
  scenarioLabel: string;
  virtualNow: string | null;
  elapsedMinutes: number;
  roles: readonly RoleOption[];
  actions?: ReactNode;
}) {
  return (
    <header className={cn("flex h-14 items-center gap-3 border-t-[3px] border-b border-b-line bg-surface px-4 md:h-16 md:gap-5 md:px-8", ROLE_BORDER[role])}>
      <Link href="/" aria-label="ArrivalGuard home" className="shrink-0">
        <span className="hidden md:inline">
          <Logo size="md" />
        </span>
        <span className="md:hidden">
          <ThresholdMark size={28} title="ArrivalGuard" />
        </span>
      </Link>
      <span aria-hidden className="hidden h-6 w-px bg-line md:block" />
      <p className="hidden truncate text-[14px] text-ink-2 lg:block">{role === "evaluator" ? "Evaluator console" : scenarioLabel}</p>
      <div className="ml-auto flex items-center gap-2 md:gap-4">
        {virtualNow ? (
          <>
            <VirtualClock virtualNow={virtualNow} elapsedMinutes={elapsedMinutes} className="hidden xl:flex" />
            <VirtualClock virtualNow={virtualNow} elapsedMinutes={elapsedMinutes} compact className="xl:hidden" />
          </>
        ) : null}
        <RoleSwitcher workspaceId={workspaceId} current={role} options={roles} />
        {actions}
        {/* La consola del evaluador es siempre oscura (UI_UX 11.5): ahí no se ofrece cambiar el tema. */}
        {role === "evaluator" ? null : <ThemeToggle />}
      </div>
    </header>
  );
}
