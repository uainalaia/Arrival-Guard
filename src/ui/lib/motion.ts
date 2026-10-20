import { useCallback, useEffect, useState, useSyncExternalStore, type AnimationEvent } from "react";

// Ayudas de movimiento de marca (UI_UX 8, DEC-022). No tocan `window` al cargar el módulo: las pruebas en node importan
// componentes que las usan. Los tiempos y las curvas viven en tokens.css y motion.css, no aquí.

const REDUCED = "(prefers-reduced-motion: reduce)";

/** Para manejadores de eventos: la persona pidió menos movimiento. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches;
}

function subscribeReduced(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Movimiento reducido como estado de React; en el servidor se asume que no. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
}

/**
 * true desde el primer cambio de `value` después del montaje. Sirve para animar un cambio de estado y nunca el valor
 * con el que se montó (patrón de React para comparar con el render anterior, sin efectos).
 */
export function useChangedSinceMount<T>(value: T): boolean {
  const [initial] = useState(value);
  const [changed, setChanged] = useState(false);
  if (!changed && !Object.is(value, initial)) setChanged(true);
  return changed;
}

export type PresencePhase = "enter" | "idle" | "exit";

interface PresenceState {
  readonly open: boolean;
  readonly phase: PresencePhase;
  readonly mounted: boolean;
}

/**
 * Montaje con entrada y salida animadas para paneles, menús y bloques que se abren y cierran.
 * - Al montar abierto no anima (fase `idle`); abrir da `enter` y cerrar da `exit`.
 * - En `exit` el contenido sigue montado (una sola copia, sin ids duplicados) hasta `animationend` o un respaldo por
 *   tiempo; quien lo usa pone `inert` y `aria-hidden` mientras sale.
 */
export function usePresence(open: boolean, exitMs: number) {
  const [state, setState] = useState<PresenceState>(() => ({ open, phase: "idle", mounted: open }));
  if (state.open !== open) setState({ open, phase: open ? "enter" : "exit", mounted: true });

  const exiting = state.phase === "exit" && !open;

  // Respaldo por si `animationend` no llega (por ejemplo, un elemento oculto o una animación desactivada).
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => setState((s) => (s.phase === "exit" && !s.open ? { ...s, phase: "idle", mounted: false } : s)), exitMs + 80);
    return () => clearTimeout(timer);
  }, [exiting, exitMs]);

  const onAnimationEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    setState((s) => (s.phase === "exit" ? { ...s, phase: "idle", mounted: s.open } : s.phase === "enter" ? { ...s, phase: "idle" } : s));
  }, []);

  return { mounted: state.mounted || open, phase: state.phase, exiting, onAnimationEnd };
}
