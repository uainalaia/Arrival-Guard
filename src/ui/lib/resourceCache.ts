// Última respuesta del servidor por espacio, rol y recurso, en memoria y solo en el cliente (DEC-022). Al cambiar de rol
// la vista aparece al instante con lo que ya se había leído, inerte hasta que llega lo nuevo; así la línea del pago puede
// animar lo que cambió en vez de montarse ya llegada. No persiste: al recargar la página se vacía. El servidor sigue
// siendo la única fuente de verdad y en el servidor esta caché nunca guarda ni devuelve nada (no se comparte entre
// solicitudes).

const MAX = 16;
const entries = new Map<string, unknown>();

const onClient = () => typeof window !== "undefined";

export function readCached<T>(key: string): T | null {
  if (!onClient() || !entries.has(key)) return null;
  return entries.get(key) as T;
}

export function writeCached<T>(key: string, value: T): void {
  if (!onClient()) return;
  entries.delete(key);
  entries.set(key, value);
  while (entries.size > MAX) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }
}
