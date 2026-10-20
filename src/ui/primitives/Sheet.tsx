"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/ui/lib/cn";
import { usePresence } from "@/ui/lib/motion";

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Ancho de la hoja; por defecto 560 px o el 90% del ancho, lo que sea menor (DESIGN_PLAN 5.8). */
  readonly widthClass?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hoja lateral con velo, foco atrapado, `Esc` para cerrar y foco devuelto al disparador (DESIGN_PLAN 5.8). Entra desde
 * la derecha en `base` y sale en `fast` con la curva de salida (UI_UX 8); mientras sale queda inerte.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, widthClass }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  const { mounted, phase, exiting, onAnimationEnd } = usePresence(open, 120);
  if (!mounted) return null;
  return (
    // `overflow-hidden`: el desplazamiento de entrada no crea scroll horizontal.
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden" inert={exiting || undefined} aria-hidden={exiting || undefined}>
      <div
        aria-hidden
        className={cn("absolute inset-0 bg-[var(--ag-scrim)]", phase === "enter" && "animate-ag-fade-in-base", exiting && "animate-ag-fade-out")}
        onClick={onClose}
      />
      <div
        ref={panel}
        onAnimationEnd={onAnimationEnd}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full flex-col bg-surface shadow-float outline-none sm:rounded-l-panel",
          widthClass ?? "sm:w-[min(560px,90vw)]",
          phase === "enter" && "animate-ag-sheet-in",
          exiting && "animate-ag-sheet-out",
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[26px] font-[650] leading-8 tracking-[-0.01em] text-ink">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-[14px] leading-[22px] text-ink-2">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-paper hover:text-ink pointer-coarse:size-11"
          >
            <X aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <footer className="flex flex-wrap gap-3 border-t border-line px-6 py-4">{footer}</footer> : null}
      </div>
    </div>
  );
}
