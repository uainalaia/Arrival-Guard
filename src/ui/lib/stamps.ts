import { useSyncExternalStore } from "react";

// Registro de sellos ya estampados (UI_UX 8: el sello se estampa una sola vez por aprobación y nunca al volver a montar
// la vista). Vive en sessionStorage dentro de try/catch, con un Set en memoria por si el almacenamiento falla; solo
// decide si se anima, nunca qué se muestra.

const KEY = "ag-stamped";
const MAX = 64;
const memory = new Set<string>();
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function stored(): string[] {
  try {
    const raw = storage()?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function hasStamped(key: string): boolean {
  return memory.has(key) || stored().includes(key);
}

export function markStamped(key: string): void {
  const known = hasStamped(key);
  memory.add(key);
  if (!known) {
    try {
      storage()?.setItem(KEY, JSON.stringify([...stored(), key].slice(-MAX)));
    } catch {
      // Sin almacenamiento: queda en memoria para esta pestaña.
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** true si el sello de `key` ya se estampó; en el servidor siempre true (nunca se anima al renderizar allí). */
export function useStamped(key: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (key ? hasStamped(key) : true),
    () => true,
  );
}
