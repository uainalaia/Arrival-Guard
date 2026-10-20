"use client";

import { useEffect, useRef, useState } from "react";
import type { CaseViewDTO } from "@/application/dto/CaseDTO";
import type { ChatTurnDTO } from "@/application/dto/ChatDTO";
import { ThresholdMark } from "@/ui/brand";
import type { ReasonContext } from "@/ui/finance";
import { cn } from "@/ui/lib/cn";
import { prefersReducedMotion } from "@/ui/lib/motion";
import { ActivityChip } from "./ActivityChip";
import { AssistantText } from "./AssistantText";
import { ChatComponentCard } from "./ChatComponentCard";
import type { ChatRole } from "./labels";

// Hilo del chat (UI_UX 12): el agente sin burbuja con el símbolo a la izquierda, el usuario a la derecha sobre
// route-tint y las tarjetas del servidor a todo el ancho. El texto del modelo pasa por un markdown mínimo, sin HTML.

export interface ChatThreadProps {
  readonly turns: readonly ChatTurnDTO[];
  /** Mensaje enviado que todavía espera respuesta. */
  readonly pending?: string | null;
  readonly role: ChatRole;
  readonly workspaceId: string;
  readonly data: CaseViewDTO;
  readonly ctx?: ReasonContext;
  readonly className?: string;
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[68ch] rounded-control bg-route-tint px-3 py-2 text-[15px] leading-[22px] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        <span className="sr-only">You: </span>
        {text}
      </p>
    </div>
  );
}

function AgentRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-3", className)}>
      <span className="mt-0.5 shrink-0">
        <ThresholdMark size={20} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  );
}

const turnKey = (turn: ChatTurnDTO) => `${turn.conversationId}-${turn.turnIndex}`;

export function ChatThread({ turns, pending = null, role, workspaceId, data, ctx, className }: ChatThreadProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const scrolled = useRef(false);
  // El historial que llega al montar no anima; los turnos nuevos suben 4 px con un fundido (UI_UX 8).
  const [history] = useState(() => new Set(turns.map(turnKey)));

  // Al llegar un turno nuevo, el final del hilo queda a la vista (solo el hilo se desplaza, no la página). La primera
  // vez salta directo; después se desplaza suave, salvo con movimiento reducido.
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const smooth = scrolled.current && !prefersReducedMotion();
    scrolled.current = true;
    node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [turns.length, pending]);

  return (
    <div ref={box} role="log" aria-live="polite" aria-label="Conversation with ArrivalGuard" tabIndex={0} className={cn("space-y-4 overflow-y-auto", className)}>
      {turns.map((turn) => {
        // El mensaje de la persona ya estaba a la vista mientras esperaba; solo entra la respuesta.
        const enter = history.has(turnKey(turn)) ? undefined : "animate-ag-rise-in";
        return (
          <div key={turnKey(turn)} className="space-y-3">
            <UserMessage text={turn.userText} />
            <AgentRow className={enter}>
              {turn.activity.map((a, i) => (
                <ActivityChip key={`${a.tool}-${i}`} activity={a} ctx={ctx} />
              ))}
              {turn.text ? <AssistantText text={turn.text} /> : null}
              {turn.fallback ? <p className="max-w-[68ch] text-[14px] leading-[22px] text-ink-2">{turn.fallback.message}</p> : null}
            </AgentRow>
            {turn.components.map((component, i) => (
              <div key={`${component.kind}-${i}`} className={enter}>
                <ChatComponentCard component={component} role={role} workspaceId={workspaceId} data={data} ctx={ctx} />
              </div>
            ))}
          </div>
        );
      })}
      {pending ? (
        <div className="animate-ag-rise-in space-y-3">
          <UserMessage text={pending} />
          <AgentRow>
            <ActivityChip working />
          </AgentRow>
        </div>
      ) : null}
    </div>
  );
}
