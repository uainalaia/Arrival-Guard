"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { prefersReducedMotion } from "@/ui/lib/motion";
import { THEME_STORAGE_KEY as KEY } from "@/ui/theme/themeScript";

// Claro, oscuro o sistema (UI_UX 15). La elección se guarda en localStorage dentro de try/catch; THEME_INIT_SCRIPT
// (src/ui/theme/themeScript.ts) la aplica antes de pintar.

export type ThemeChoice = "light" | "dark" | "system";
const ORDER: readonly ThemeChoice[] = ["system", "light", "dark"];
const LABELS: Record<ThemeChoice, string> = { light: "Light", dark: "Dark", system: "System" };

function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

let shiftTimer: number | undefined;
/** Al cambiar el tema con el botón, los colores pasan en `base` (motion.css, `[data-theme-shift]`) y no de golpe. */
function markThemeShift(): void {
  if (prefersReducedMotion()) return;
  const root = document.documentElement;
  root.dataset.themeShift = "";
  window.clearTimeout(shiftTimer);
  shiftTimer = window.setTimeout(() => delete root.dataset.themeShift, 260);
}

export function ThemeToggle() {
  // La elección vive en localStorage; en el servidor se asume "system" y el cliente la lee al hidratar.
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => {
        markThemeShift();
        applyTheme(next);
        try {
          if (next === "system") window.localStorage.removeItem(KEY);
          else window.localStorage.setItem(KEY, next);
        } catch {
          // Sin almacenamiento: el tema vale solo para esta pestaña.
        }
        listeners.forEach((l) => l());
      }}
      aria-label={`Theme: ${LABELS[choice]}. Switch to ${LABELS[next]}`}
      title={`Theme: ${LABELS[choice]}`}
      className="inline-flex size-11 items-center md:size-10 justify-center rounded-control border border-line text-ink-2 transition-colors duration-fast hover:border-line-strong hover:text-ink"
    >
      <Icon aria-hidden className="size-5" strokeWidth={1.75} />
    </button>
  );
}
