"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/ui/lib/cn";

export interface TabItem {
  readonly id: string;
  readonly label: string;
  /** Punto de cambios en una pestaña que no se está viendo. */
  readonly badge?: boolean;
  readonly icon?: ReactNode;
}

export interface TabsProps {
  readonly tabs: readonly TabItem[];
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly ariaLabel: string;
  readonly className?: string;
}

/** Pestañas con `role="tablist"`, foco itinerante y flechas (UI_UX 12). El panel lo pinta quien las usa. */
export function Tabs({ tabs, value, onChange, ariaLabel, className }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex items-stretch gap-1 border-b border-line", className)}>
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative -mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-[15px] font-semibold transition-colors duration-fast",
              selected ? "border-route text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {tab.icon ? <span aria-hidden>{tab.icon}</span> : null}
            {tab.label}
            {tab.badge && !selected ? (
              <>
                <span aria-hidden className="size-[7px] rounded-full bg-route" />
                <span className="sr-only">, has changes</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
