"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import type { JourneyStationDTO } from "@/application/dto/CaseDTO";
import { ConsentSeal } from "@/ui/brand/ConsentSeal";
import { StopOctagon } from "@/ui/brand/StopOctagon";
import { formatWhen } from "@/ui/format/time";
import { cn } from "@/ui/lib/cn";

export interface JourneyLineProps {
  readonly stations: readonly JourneyStationDTO[];
  readonly payerName?: string;
  readonly approvalFingerprint?: string | null;
  readonly orientation?: "horizontal" | "vertical" | "responsive";
  /** Inicio del espacio: si una estación es de otro día virtual, su hora lleva el día. */
  readonly referenceAt?: string | null;
  readonly className?: string;
}

const LABELS: Record<JourneyStationDTO["key"], string> = {
  PLANNED: "Planned",
  APPROVED: "Approved",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  UNIVERSITY: "University",
  CREDITED: "Credited",
};

// Firma 1 de UI_UX 8 (keyframes en src/ui/theme/motion.css): el tramo se rellena desde la estación anterior en 400 ms,
// la estación nueva aparece después y el tramo incierto se desplaza lento (2 s).

// Clases literales por orientación (Tailwind necesita verlas escritas).
const LAYOUT = {
  horizontal: {
    list: "grid grid-flow-col auto-cols-fr",
    item: "relative flex flex-col gap-2 pr-2",
    rail: "absolute left-[30px] right-[6px] top-[10.5px] h-[3px]",
    text: "flex flex-col",
    fill: "ag-journey-fill-x",
    drift: "ag-journey-drift-x",
  },
  vertical: {
    list: "flex flex-col",
    item: "relative flex flex-row gap-3 pb-6 last:pb-0",
    rail: "absolute bottom-[4px] left-[10.5px] top-[30px] w-[3px]",
    text: "flex flex-col pt-0.5",
    fill: "ag-journey-fill-y",
    drift: "ag-journey-drift-y",
  },
  responsive: {
    list: "flex flex-col md:grid md:grid-flow-col md:auto-cols-fr",
    item: "relative flex flex-row gap-3 pb-6 last:pb-0 md:flex-col md:gap-2 md:pb-0 md:pr-2",
    rail: "absolute bottom-[4px] left-[10.5px] top-[30px] w-[3px] md:bottom-auto md:left-[30px] md:right-[6px] md:top-[10.5px] md:h-[3px] md:w-auto",
    text: "flex flex-col pt-0.5 md:pt-0",
    fill: "ag-journey-fill-r",
    drift: "ag-journey-drift-r",
  },
} as const;

const filled = (s: JourneyStationDTO | undefined) => s?.state === "done" || s?.state === "current";

interface Changes {
  readonly segments: ReadonlySet<number>;
  readonly appeared: ReadonlySet<number>;
  readonly settled: ReadonlySet<number>;
}
const NO_CHANGES: Changes = { segments: new Set(), appeared: new Set(), settled: new Set() };

/**
 * Línea del pago estilo mapa de metro (UI_UX 12): hecho, actual, incierto (tramo punteado en `wait`), bloqueado
 * (octágono) y acreditado (relleno `arrive` con check). Bajo cada estación, hora virtual y procedencia.
 */
export function JourneyLine({ stations, payerName = "Carlos", approvalFingerprint, orientation = "responsive", referenceAt = null, className }: JourneyLineProps) {
  const layout = LAYOUT[orientation];
  const signature = stations.map((s) => s.state).join(",");
  const [previous, setPrevious] = useState(signature);
  const [changes, setChanges] = useState<Changes>(NO_CHANGES);

  // Patrón de React para comparar con el render anterior: solo se anima lo que cambió en vivo, nunca lo que ya estaba
  // al montar (por ejemplo, al cambiar de rol). Tramos recién llenos, estaciones que aparecen y estaciones que llegan.
  if (signature !== previous) {
    const before = previous.split(",");
    const segments = new Set<number>();
    const appeared = new Set<number>();
    const settled = new Set<number>();
    stations.forEach((s, i) => {
      const was = before[i];
      const reached = s.state === "done" || s.state === "current";
      const wasReached = was === "done" || was === "current";
      if (reached && !wasReached) {
        appeared.add(i);
        if (i > 0) segments.add(i - 1);
      }
      if (s.state === "done" && was !== "done") settled.add(i);
    });
    setPrevious(signature);
    setChanges({ segments, appeared, settled });
  }

  const current = stations.find((s) => s.state === "uncertain" || s.state === "blocked" || s.state === "current") ?? [...stations].reverse().find((s) => s.state === "done");
  const announcement = current ? `${stationLabel(current)}: ${subtitle(current, payerName, referenceAt) ?? stateWord(current)}` : "";

  return (
    <div className={className}>
      <p className="sr-only" aria-live="polite">
        Payment journey. {announcement}
      </p>
      <ol className={layout.list}>
        {stations.map((station, i) => {
          const next = stations[i + 1];
          const segment = next ? (next.state === "uncertain" ? "uncertain" : filled(next) ? "filled" : "empty") : null;
          const sub = subtitle(station, payerName, referenceAt);
          const isCurrent = station.state === "current" || station.state === "uncertain" || station.state === "blocked";
          return (
            <li key={station.key} className={layout.item} aria-current={isCurrent ? "step" : undefined}>
              {segment ? (
                <span
                  aria-hidden
                  className={cn(
                    layout.rail,
                    "rounded-full",
                    segment === "filled" && "bg-route",
                    segment === "filled" && changes.segments.has(i) && layout.fill,
                    segment === "uncertain" && layout.drift,
                    segment === "empty" && "bg-line",
                  )}
                />
              ) : null}
              <Dot station={station} appeared={changes.appeared.has(i)} />
              <span className={layout.text}>
                <span className={cn("text-[14px] font-semibold leading-5", station.state === "pending" ? "text-ink-2" : "text-ink")}>{stationLabel(station)}</span>
                {sub ? (
                  <span
                    className={cn(
                      "text-[12px] font-medium leading-4 tracking-[0.01em]",
                      station.state === "uncertain" ? "text-wait" : station.state === "blocked" ? "text-stop" : "text-muted",
                      changes.appeared.has(i) && "ag-station-text-in",
                    )}
                  >
                    {sub}
                  </span>
                ) : null}
                {station.key === "APPROVED" && station.state === "done" && approvalFingerprint ? (
                  <ConsentSeal fingerprint={approvalFingerprint} size={28} caption={false} className="mt-1.5" animate={changes.settled.has(i) ? "once" : false} />
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Dot({ station, appeared }: { station: JourneyStationDTO; appeared: boolean }) {
  const box = "relative z-[1] flex size-6 shrink-0 items-center justify-center";
  if (station.state === "blocked") {
    return (
      <span className={box}>
        <StopOctagon size={24} />
      </span>
    );
  }
  if (station.key === "CREDITED" && station.state === "done") {
    // Llegada en vivo: la estación se llena de `arrive` y después aparece el check. Si ya estaba acreditado al montar, nada.
    return (
      <span className={box}>
        <span className={cn("flex size-7 items-center justify-center rounded-full bg-arrive text-surface", appeared && "ag-journey-credit")}>
          <Check aria-hidden className={cn("size-4", appeared && "ag-journey-check")} strokeWidth={2.5} />
        </span>
      </span>
    );
  }
  const dot =
    station.state === "done"
      ? "size-4 rounded-full bg-route"
      : station.state === "current"
        ? "size-[18px] rounded-full border-[3px] border-route bg-surface"
        : station.state === "uncertain"
          ? "size-[18px] rounded-full border-[3px] border-dashed border-wait bg-surface"
          : "size-3 rounded-full border-2 border-line-strong bg-surface";
  return (
    <span className={box}>
      <span className={dot} />
    </span>
  );
}

function stationLabel(station: JourneyStationDTO): string {
  return station.key === "CREDITED" && station.state === "done" ? "Credited by the university" : LABELS[station.key];
}

function stateWord(station: JourneyStationDTO): string {
  return station.state === "done" ? "done" : station.state === "pending" ? "pending" : station.state;
}

const SOURCE: Record<NonNullable<JourneyStationDTO["source"]>, (payer: string) => string> = {
  SYSTEM: () => "ArrivalGuard",
  PAYER: (payer) => payer,
  PROVIDER: () => "Provider",
  UNIVERSITY: () => "University",
};

function subtitle(station: JourneyStationDTO, payer: string, referenceAt: string | null): string | null {
  if (station.state === "uncertain") return "Checking with the provider";
  if (station.state === "blocked") return "Blocked";
  if (station.at && (station.state === "done" || station.state === "current")) {
    const when = formatWhen(station.at, referenceAt);
    return station.source ? `${when}, ${SOURCE[station.source](payer)}` : when;
  }
  if (station.state === "current") {
    switch (station.key) {
      case "PLANNED":
        return "Next";
      case "APPROVED":
        return `Waiting for ${payer}`;
      case "SENT":
        return "Ready to send";
      case "ACCEPTED":
        return "Waiting for the provider";
      case "UNIVERSITY":
        return "Waiting for the university";
      default:
        return null;
    }
  }
  return null;
}
