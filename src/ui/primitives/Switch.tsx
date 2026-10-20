"use client";

import { useId } from "react";
import { cn } from "@/ui/lib/cn";

export interface SwitchProps {
  readonly checked: boolean;
  readonly onCheckedChange: (value: boolean) => void;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  /** Consecuencia en `wait` cuando está activo (fallas de la consola). */
  readonly activeTone?: "default" | "wait";
  readonly className?: string;
}

/** Interruptor con `role="switch"`: pista 36 × 20, perilla 16 y objetivo táctil de 44 (DESIGN_PLAN 6.4). */
export function Switch({ checked, onCheckedChange, label, description, disabled = false, id, activeTone = "default", className }: SwitchProps) {
  const auto = useId();
  const switchId = id ?? `switch-${auto}`;
  const descId = description ? `${switchId}-desc` : undefined;
  return (
    <div className={cn("flex min-h-11 items-start gap-3 py-1", className)}>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-fast",
          "before:absolute before:-inset-3 before:content-[''] disabled:cursor-not-allowed",
          disabled ? "bg-line" : checked ? "bg-route" : "bg-line-strong",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-4 rounded-full bg-surface transition-transform duration-fast ease-standard",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
      <span className="flex min-w-0 flex-col">
        <label htmlFor={switchId} className={cn("text-[14px] font-semibold leading-5", disabled ? "text-muted" : "text-ink")}>
          {label}
        </label>
        {description ? (
          <span id={descId} className={cn("text-[12px] leading-4", checked && activeTone === "wait" ? "text-wait" : "text-muted")}>
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}
