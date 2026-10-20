"use client";

import Link from "next/link";
import type { CaseViewDTO, SessionDTO } from "@/application/dto/CaseDTO";
import { SimulationBand } from "@/ui/brand";
import { EvaluatorConsole } from "@/ui/console/EvaluatorConsole";
import { TopBar } from "@/ui/layout/TopBar";
import type { RoleOption } from "@/ui/layout/RoleSwitcher";
import { Panel, Skeleton } from "@/ui/primitives";
import { api, setWorkspaceScope, type ActorRole } from "@/ui/lib/api";
import { cn } from "@/ui/lib/cn";
import { useResource } from "@/ui/lib/useResource";
import { minutesBetween } from "@/ui/format/time";
import { firstName, scenarioLabel } from "./copy";
import { EvidenceButton } from "./EvidenceDrawer";
import { PayerView } from "./PayerView";
import { StudentView } from "./StudentView";

// Espacio de trabajo (UI_UX 10): un espacio, tres roles en el mismo navegador. El rol activo solo elige qué cookie de
// sesión manda el navegador; el servidor resuelve actor y espacio desde esa sesión.

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function WorkspaceApp({ workspaceId, role }: { workspaceId: string; role: ActorRole }) {
  setWorkspaceScope(workspaceId);
  // Al cambiar de rol, la vista se monta con lo último que se leyó para ese rol (resourceCache.ts), inerte hasta que
  // llega lo nuevo: así la línea del pago anima lo que cambió mientras tanto (UI_UX 8, DEC-022).
  const session = useResource((signal) => api<SessionDTO>("/api/session", { role, signal }), [role], 20000, { cacheKey: `${workspaceId}:${role}:session` });
  const usesCase = role !== "evaluator";
  const caseView = useResource((signal) => (usesCase ? api<CaseViewDTO>("/api/case", { role, signal }) : Promise.resolve(null)), [role], usesCase ? 8000 : 0, {
    cacheKey: usesCase ? `${workspaceId}:${role}:case` : undefined,
  });

  // Un error sin respuesta nueva en este montaje se muestra aunque haya algo guardado: lo guardado no es el estado actual.
  if (session.error && !session.fresh) return <SessionProblem status={session.error.status} message={session.error.message} />;
  const s = session.data;
  if (s && s.workspaceId !== workspaceId) {
    return (
      <CenteredNotice title="This workspace is not open in this browser">
        Your evaluation session belongs to another workspace.{" "}
        <Link className="font-semibold text-route underline" href={`/w/${s.workspaceId}?as=${role}`}>
          Open your workspace
        </Link>
        .
      </CenteredNotice>
    );
  }

  const data = caseView.data;
  const people = s?.people ?? (data ? data.people : { student: "Sofía Ramos", payer: "Carlos Ramos" });
  const virtualNow = data?.workspace.virtualNow ?? s?.virtualNow ?? null;
  const virtualStart = data?.workspace.virtualStart ?? s?.virtualStart ?? null;
  const elapsed = data?.workspace.elapsedMinutes ?? (virtualNow && virtualStart ? minutesBetween(virtualStart, virtualNow) : 0);
  const planStatus = data?.plan?.status;
  const roles: RoleOption[] = [
    { role: "student", name: firstName(people.student), suffix: ", student", initials: initials(people.student), pending: planStatus === "APPROVED" && !data?.payment.attempt },
    { role: "payer", name: firstName(people.payer), suffix: ", payer", initials: initials(people.payer), pending: planStatus === "APPROVAL_REQUESTED" || (data?.payer?.pendingChanges.length ?? 0) > 0 },
    { role: "evaluator", name: "Evaluator", suffix: "", initials: "EV" },
  ];

  const refreshAll = async () => {
    await Promise.all([caseView.refresh(), session.refresh()]);
  };

  const ready = role === "evaluator" ? Boolean(s) : Boolean(data) && !(caseView.error && !caseView.fresh);
  const stale = ready && !(role === "evaluator" ? session.fresh : caseView.fresh);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="sticky top-0 z-20">
        <TopBar
          workspaceId={workspaceId}
          role={role}
          scenarioLabel={data?.workspace.scenarioLabel ?? (s ? scenarioLabel(s.scenario) : "")}
          virtualNow={virtualNow}
          elapsedMinutes={elapsed}
          roles={roles}
          actions={<EvidenceButton role={role} />}
        />
        <SimulationBand />
      </div>
      {/* Mientras muestra lo guardado, la vista queda inerte y algo atenuada; al llegar lo nuevo vuelve en `base`. */}
      <main id="main" className={cn("flex-1 transition-opacity duration-base", stale && "opacity-70")}>
        {/* La vista entra con un fundido al pasar de cargando a lista. */}
        <div key={ready ? "ready" : "loading"} inert={stale || undefined} aria-busy={stale || undefined} className={cn(ready && "animate-ag-fade-in-base")}>
          {role === "evaluator" ? (
            s ? (
              <EvaluatorConsole workspaceId={workspaceId} scenario={s.scenario} virtualStart={virtualStart} people={people} onClockChange={session.refresh} />
            ) : (
              <LoadingPanels />
            )
          ) : caseView.error && !caseView.fresh ? (
            <SessionProblem status={caseView.error.status} message={caseView.error.message} />
          ) : !data ? (
            <LoadingPanels />
          ) : role === "student" ? (
            <StudentView data={data} refresh={refreshAll} />
          ) : (
            <PayerView data={data} refresh={refreshAll} workspaceId={workspaceId} />
          )}
        </div>
      </main>
    </div>
  );
}

function LoadingPanels() {
  return (
    <div className="mx-auto grid w-full max-w-[1344px] gap-6 px-4 pt-6 md:px-8 lg:grid-cols-12" aria-busy="true" aria-label="Loading the workspace">
      <Skeleton className="h-96 lg:col-span-5" />
      <div className="space-y-4 lg:col-span-7">
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

function CenteredNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SimulationBand />
      <main className="mx-auto w-full max-w-[560px] px-4 pt-16">
        <Panel title={title}>
          <p className="text-ink-2">{children}</p>
        </Panel>
      </main>
    </div>
  );
}

function SessionProblem({ status, message }: { status: number; message: string }) {
  if (status === 401) {
    return (
      <CenteredNotice title="Session ended">
        This workspace session has ended. Open a new workspace with the evaluation code.{" "}
        <Link className="font-semibold text-route underline" href="/#for-judges">
          Open the demo
        </Link>
      </CenteredNotice>
    );
  }
  if (status === 404) return <CenteredNotice title="Not found">This workspace is not available in this browser.</CenteredNotice>;
  return <CenteredNotice title="Couldn't load the workspace">{message}</CenteredNotice>;
}
