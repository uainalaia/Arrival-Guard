"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/ui/lib/cn";
import { Collapse } from "./Collapse";

export interface RadioCardOption {
  readonly value: string;
  readonly title: string;
  readonly description?: string;
}

export interface RadioCardGroupProps {
  readonly name: string;
  readonly options: readonly RadioCardOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly ariaLabel: string;
  readonly className?: string;
}

/** Opciones con radio, título y descripción (DESIGN_PLAN 6.4): landing y consola. Radios nativos, flechas incluidas. */
export function RadioCardGroup({ name, options, value, onChange, ariaLabel, className }: RadioCardGroupProps) {
  const base = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-col gap-2", className)}>
      {options.map((option) => {
        const id = `${base}-${option.value}`;
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3 transition-colors duration-fast",
              checked ? "border-route bg-route-tint ring-1 ring-route" : "border-line-strong bg-surface hover:border-ink",
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="mt-1 size-4 shrink-0 accent-[var(--ag-route)]"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold leading-5 text-ink">{option.title}</span>
              {option.description ? <span className="text-[14px] leading-[22px] text-ink-2">{option.description}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export interface FilterChipProps {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

/** Filtro con `aria-pressed` (expediente y consola). 40 px de alto. */
export function FilterChip({ pressed, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center rounded-control border px-3 text-[14px] font-semibold transition-colors duration-fast pointer-coarse:h-11",
        pressed ? "border-route bg-route-tint text-route ring-1 ring-route" : "border-line-strong bg-surface text-ink-2 hover:border-ink hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export interface AccordionItem {
  readonly id: string;
  readonly title: string;
  readonly content: ReactNode;
}

/** Filas de 48 px con `aria-expanded` (modo estructurado, DESIGN_PLAN 5.7). Una abierta a la vez. */
export function Accordion({ items, defaultOpen, className }: { readonly items: readonly AccordionItem[]; readonly defaultOpen?: string | null; readonly className?: string }) {
  const [open, setOpen] = useState<string | null>(defaultOpen ?? items[0]?.id ?? null);
  const base = useId();
  return (
    <div className={cn("divide-y divide-line overflow-hidden rounded-control border border-line-strong bg-surface", className)}>
      {items.map((item) => {
        const expanded = open === item.id;
        const panelId = `${base}-${item.id}`;
        return (
          <div key={item.id}>
            <h4>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : item.id)}
                className="flex h-12 w-full items-center justify-between gap-3 px-4 text-left text-[15px] font-semibold text-ink hover:bg-paper"
              >
                {item.title}
                <ChevronDown aria-hidden strokeWidth={1.75} className={cn("size-5 text-ink-2 transition-transform duration-fast", expanded && "rotate-180")} />
              </button>
            </h4>
            <Collapse open={expanded} id={panelId} className="px-4 pb-4 pt-1">
              {item.content}
            </Collapse>
          </div>
        );
      })}
    </div>
  );
}
