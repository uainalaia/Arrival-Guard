"use client";

import {
  BadgeCheck,
  Check,
  CheckCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  Hourglass,
  Landmark,
  RefreshCw,
  Route,
  Send,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { VisibleStatus } from "@/domain/payment/VisibleStatus";
import { MiniSeal } from "@/ui/brand/MiniSeal";
import { StopOctagon } from "@/ui/brand/StopOctagon";
import type { CSSProperties } from "react";
import { cn } from "@/ui/lib/cn";
import { useChangedSinceMount } from "@/ui/lib/motion";

export type PillStatus =
  | VisibleStatus
  | "NO_LONGER_MATCHES"
  | "SELECTED"
  | "VIABLE"
  | "REFUND_REQUESTED"
  | "UNDER_REVIEW"
  | "REFUNDED"
  | "REFUND_DECLINED"
  | "EXPIRED"
  | "REVOKED";

type Tone = "route" | "wait" | "arrive" | "stop" | "neutral";

interface PillSpec {
  readonly tone: Tone;
  readonly icon: LucideIcon | "seal" | "octagon";
  readonly text: (payer: string) => string;
}

// UI_UX 9.4 y DESIGN_PLAN 7.3: un estado por píldora, siempre con ícono y texto.
const SPECS: Record<PillStatus, PillSpec> = {
  DETAILS_NEEDED: { tone: "neutral", icon: CircleDashed, text: () => "Details needed" },
  PLAN_READY: { tone: "route", icon: Route, text: () => "Plan ready" },
  WAITING_FOR_PAYER: { tone: "wait", icon: Hourglass, text: (payer) => `Waiting for ${payer}` },
  APPROVED: { tone: "route", icon: "seal", text: () => "Approved" },
  SENDING: { tone: "route", icon: Send, text: () => "Sending" },
  UNCERTAIN: { tone: "wait", icon: RefreshCw, text: () => "Checking with the provider" },
  PROVIDER_ACCEPTED: { tone: "route", icon: CheckCheck, text: () => "Accepted by provider" },
  WAITING_FOR_UNIVERSITY: { tone: "wait", icon: Landmark, text: () => "Waiting for the university" },
  CREDITED: { tone: "arrive", icon: BadgeCheck, text: () => "Credited by the university" },
  DELIVERED: { tone: "arrive", icon: BadgeCheck, text: () => "Delivered" },
  BLOCKED: { tone: "stop", icon: "octagon", text: () => "Blocked" },
  FAILED_NO_DEBIT: { tone: "neutral", icon: CircleSlash, text: () => "Failed, no money left the account" },
  NO_LONGER_MATCHES: { tone: "neutral", icon: CircleSlash, text: () => "No longer matches" },
  SELECTED: { tone: "route", icon: Route, text: () => "Selected" },
  VIABLE: { tone: "neutral", icon: Check, text: () => "Viable" },
  REFUND_REQUESTED: { tone: "route", icon: Undo2, text: () => "Refund requested" },
  UNDER_REVIEW: { tone: "wait", icon: Hourglass, text: () => "Under review" },
  REFUNDED: { tone: "arrive", icon: BadgeCheck, text: () => "Refunded" },
  REFUND_DECLINED: { tone: "stop", icon: "octagon", text: () => "Refund declined" },
  EXPIRED: { tone: "neutral", icon: Clock, text: () => "Expired" },
  REVOKED: { tone: "neutral", icon: CircleSlash, text: () => "Revoked" },
};

const TONES: Record<Tone, string> = {
  route: "bg-route-tint text-route",
  wait: "bg-wait-tint text-wait",
  arrive: "bg-arrive-tint text-arrive",
  stop: "bg-stop-tint text-stop",
  neutral: "bg-paper text-ink-2 ring-1 ring-inset ring-line",
};

export function pillText(status: PillStatus, payerName = "Carlos"): string {
  return SPECS[status].text(payerName);
}

export interface StatusPillProps {
  readonly status: PillStatus;
  readonly payerName?: string;
  /** Texto alternativo cuando el contexto lo pide; el ícono y el tono siguen al estado. */
  readonly label?: string;
  /** Tablero de la landing (UI_UX 11.1, P2): al cambiar de estado, cada letra gira con 30 ms de desfase. */
  readonly flap?: boolean;
  readonly className?: string;
}

export function StatusPill({ status, payerName = "Carlos", label, flap = false, className }: StatusPillProps) {
  const spec = SPECS[status];
  const text = label ?? spec.text(payerName);
  const Icon = spec.icon;
  // Cambio de estado en su sitio (UI_UX 8): el tono transiciona y el contenido nuevo se funde; el estado con el que se
  // montó no anima y nunca quedan dos copias del texto.
  const changed = useChangedSinceMount(status);
  const flapping = changed && flap;
  const icon = Icon === "seal" ? <MiniSeal /> : Icon === "octagon" ? <StopOctagon size={14} variant="outline" /> : <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />;
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold leading-[18px] transition-colors duration-base",
        TONES[spec.tone],
        className,
      )}
    >
      <span key={status} className={cn("inline-flex items-center gap-1.5", changed && !flap && "animate-ag-fade-in-base")}>
        {flapping ? <span className="ag-flap inline-flex">{icon}</span> : icon}
        {flapping ? (
          <span>
            <span className="sr-only">Status: {text}</span>
            <span aria-hidden>
              {[...text].map((char, i) => (
                <span key={i} className="ag-flap inline-block" style={{ "--ag-flap-i": i + 1 } as CSSProperties}>
                  {char === " " ? "\u00a0" : char}
                </span>
              ))}
            </span>
          </span>
        ) : (
          <span>
            <span className="sr-only">Status: </span>
            {text}
          </span>
        )}
      </span>
    </span>
  );
}
